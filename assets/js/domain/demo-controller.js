import { AppError } from '../utils/errors.js';

export class DemoController {
  constructor({ demoApi, onState = () => {}, hasAccess = () => false, hasCancelAccess = hasAccess }) {
    this.demoApi = demoApi;
    this.onState = onState;
    this.hasAccess = hasAccess;
    this.hasCancelAccess = hasCancelAccess;
    this.cancelRequested = false;
    this.eventReceived = false;
    this.demos = [];
    this.selectedId = null;
    this.active = false;
    this.starting = false;
    this.cancelling = false;
    this.activeDemoId = null;
    this.total = 0;
    this.currentOrder = 0;
  }

  isActive() { return this.active || this.starting || this.cancelling; }

  async load() {
    const data = await this.demoApi.getDemos();
    if (!Array.isArray(data)) throw new AppError('La API no devolvió una lista válida de DEMO.', { code: 'INVALID_DEMOS' });
    this.demos = data.filter((item) => item && Number.isInteger(Number(item.id_demo)) && typeof item.nombre === 'string' && item.activo === true);
    this.selectedId = this.demos[0] ? Number(this.demos[0].id_demo) : null;
    this.onState({ state: 'loaded', demos: this.demos, selectedId: this.selectedId });
    return this.demos;
  }

  select(id) {
    if (this.isActive()) return;
    const demo = this.demos.find((item) => Number(item.id_demo) === Number(id));
    this.selectedId = demo ? Number(demo.id_demo) : null;
    this.onState({ state: 'selected', demos: this.demos, selectedId: this.selectedId });
  }

  async start() {
    if (!this.hasAccess()) throw new AppError('Habilita el control con tu clave API.', { code: 'CONTROL_LOCKED' });
    if (this.isActive()) throw new AppError('Ya hay una DEMO iniciada o pendiente para este vehículo.', { code: 'DEMO_ALREADY_ACTIVE' });
    if (!this.selectedId) throw new AppError('Selecciona una DEMO activa del catálogo.', { code: 'DEMO_NOT_SELECTED' });
    this.active = true;
    this.starting = true;
    this.cancelRequested = false;
    this.eventReceived = false;
    this.activeDemoId = this.selectedId;
    this.total = 0;
    this.currentOrder = 0;
    this.onState({ state: 'starting', demoId: this.activeDemoId });
    let response;
    try {
      response = await this.demoApi.startDemo(this.activeDemoId);
    } catch (error) {
      this.starting = false;
      // Un error de red/timeout no demuestra que el servidor rechazó el POST.
      // Mantener estado incierto permite que el operador intente cancelar, sin repetir inicio.
      const outcomeUnknown = !error.status || error.status >= 500 || error.code === 'REQUEST_TIMEOUT';
      if (outcomeUnknown) {
        this.active = true;
        if (this.cancelRequested) {
          try { await this.#performCancel(); } catch { /* Se conserva el estado incierto para permitir otro intento de cancelación. */ }
        } else {
          this.cancelling = false;
          this.onState({ state: 'uncertain', error, demoId: this.activeDemoId });
        }
      } else if (!this.eventReceived) {
        this.active = false;
        this.cancelling = false;
        this.activeDemoId = null;
        this.cancelRequested = false;
        this.onState({ state: 'error', error });
      }
      throw error;
    }
    this.starting = false;
    this.total = Number(response?.total_movimientos) || this.total;
    if (this.cancelRequested) {
      this.onState({ state: 'cancelling', demoId: this.activeDemoId });
      await this.#performCancel();
    } else if (!this.eventReceived) {
      this.onState({ state: 'accepted', response, demoId: this.activeDemoId });
    }
    return response;
  }

  async cancel() {
    if (!this.hasCancelAccess()) throw new AppError('Introduce la clave de control para solicitar la cancelación.', { code: 'CONTROL_LOCKED' });
    if (this.cancelling) return { duplicate: true };
    this.cancelRequested = true;
    this.cancelling = true;
    this.onState({ state: 'cancelling', demoId: this.activeDemoId });
    // Si el POST de inicio aún no termina, espera su respuesta antes de cancelar.
    // Así no se adelanta la cancelación al inicio en el servidor.
    if (this.starting) return { queued: true };
    return this.#performCancel();
  }

  async #performCancel() {
    try {
      const response = await this.demoApi.cancelDemo();
      this.active = false;
      this.starting = false;
      this.cancelling = false;
      this.cancelRequested = false;
      this.activeDemoId = null;
      this.onState({ state: 'cancelled', response });
      return response;
    } catch (error) {
      this.cancelling = false;
      this.cancelRequested = false;
      if (error.status === 404) {
        this.active = false;
        this.starting = false;
        this.activeDemoId = null;
      }
      this.onState({ state: 'error', error });
      throw error;
    }
  }

  handleEvent(message) {
    if (!message || typeof message.tipo !== 'string') return;
    switch (message.tipo) {
      case 'demo_inicio':
        this.eventReceived = true;
        this.active = true;
        this.starting = false;
        this.cancelling = false;
        this.activeDemoId = Number(message.id_demo) || this.activeDemoId;
        this.total = Number(message.total_movimientos) || 0;
        this.currentOrder = 0;
        this.onState({ state: 'running', message });
        break;
      case 'demo_movimiento':
        this.eventReceived = true;
        this.active = true;
        this.starting = false;
        this.currentOrder = Number(message.orden) || this.currentOrder;
        this.total = Number(message.total_movimientos) || this.total;
        this.onState({ state: 'step', message, currentOrder: this.currentOrder, total: this.total });
        break;
      case 'demo_fin':
        this.eventReceived = true;
        this.#finish('finished', message);
        break;
      case 'demo_cancelada':
        this.eventReceived = true;
        this.#finish('cancelled', message);
        break;
      case 'demo_error':
        this.eventReceived = true;
        this.#finish('error', message);
        break;
      default:
        break;
    }
  }

  #finish(state, message) {
    this.active = false;
    this.starting = false;
    this.cancelling = false;
    this.activeDemoId = null;
    this.cancelRequested = false;
    this.onState({ state, message, currentOrder: this.currentOrder, total: this.total });
  }
}
