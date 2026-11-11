import { AppError } from '../utils/errors.js';

export class CommandDispatcher {
  constructor({ commandApi, onState = () => {}, hasAccess = () => false, hasStopAccess = hasAccess, isDemoActive = () => false, cancelDemo = null }) {
    this.commandApi = commandApi;
    this.onState = onState;
    this.hasAccess = hasAccess;
    this.hasStopAccess = hasStopAccess;
    this.isDemoActive = isDemoActive;
    this.cancelDemo = cancelDemo;
    this.stopCommand = null;
    this.busy = false;
    this.stopRequested = false;
    this.pendingJoystickCommand = null;
    this.pendingSource = null;
    this.activeCommandId = null;
    this.lastAcceptedCommandId = null;
    this.drainPromise = null;
  }

  setStopCommand(command) { this.stopCommand = command || null; }
  isBusy() { return this.busy || this.stopRequested || Boolean(this.pendingJoystickCommand); }

  send(command, { source = 'button' } = {}) {
    if (!command) return Promise.reject(new AppError('El comando no está disponible en el catálogo.', { code: 'COMMAND_NOT_FOUND' }));
    if (!this.hasAccess()) return Promise.reject(new AppError('Habilita el control con tu clave API antes de enviar comandos.', { code: 'CONTROL_LOCKED' }));
    if (this.isDemoActive()) return Promise.reject(new AppError('Hay una DEMO activa. Cancélala antes de enviar movimientos manuales.', { code: 'DEMO_ACTIVE' }));
    if (this.stopRequested) return Promise.resolve({ queued: false, ignored: true });
    const id = Number(command.id_comando);
    if (id === this.activeCommandId) {
      if (source === 'joystick') { this.pendingJoystickCommand = null; this.pendingSource = null; }
      return Promise.resolve({ duplicate: true });
    }
    if (this.busy) {
      if (source !== 'joystick') return Promise.reject(new AppError('Hay otra orden pendiente. Espera a que termine antes de enviar otra acción.', { code: 'COMMAND_BUSY' }));
      this.pendingJoystickCommand = command;
      this.pendingSource = source;
      return this.drainPromise || Promise.resolve({ queued: true });
    }
    this.pendingJoystickCommand = command;
    this.pendingSource = source;
    return this.#drain();
  }

  stop() {
    if (this.isDemoActive()) {
      if (!this.cancelDemo) return Promise.reject(new AppError('No está disponible la operación de cancelación de DEMO.', { code: 'DEMO_CANCEL_UNAVAILABLE' }));
      this.pendingJoystickCommand = null;
      this.pendingSource = null;
      return this.cancelDemo();
    }
    if (!this.hasStopAccess()) return Promise.reject(new AppError('Introduce la clave de control para solicitar DETENER.', { code: 'CONTROL_LOCKED' }));
    if (!this.stopCommand) return Promise.reject(new AppError('El catálogo activo no contiene un comando DETENER. No se enviará una orden inventada.', { code: 'STOP_NOT_IN_CATALOG' }));
    if (this.stopRequested || this.activeCommandId === Number(this.stopCommand.id_comando)) {
      return this.drainPromise || Promise.resolve({ queued: true, duplicate: true });
    }
    if (this.lastAcceptedCommandId === Number(this.stopCommand.id_comando) && !this.busy && !this.pendingJoystickCommand) {
      return Promise.resolve({ alreadyStopped: true });
    }
    this.pendingJoystickCommand = null;
    this.pendingSource = null;
    this.stopRequested = true;
    this.onState({ state: 'stopping', command: this.stopCommand, isStop: true, message: 'DETENER tiene prioridad y se enviará después de resolver la solicitud pendiente.' });
    return this.#drain();
  }

  #drain() {
    if (this.drainPromise) return this.drainPromise;
    this.drainPromise = this.#processQueue().finally(() => {
      this.drainPromise = null;
      if (this.stopRequested || this.pendingJoystickCommand) queueMicrotask(() => this.#drain().catch(() => {}));
    });
    return this.drainPromise;
  }

  async #processQueue() {
    this.busy = true;
    let lastResult = null;
    try {
      while (this.stopRequested || this.pendingJoystickCommand) {
        let command;
        let isStop = false;
        let source = 'stop';
        if (this.stopRequested) {
          this.stopRequested = false;
          command = this.stopCommand;
          isStop = true;
        } else {
          command = this.pendingJoystickCommand;
          source = this.pendingSource || 'button';
          this.pendingJoystickCommand = null;
          this.pendingSource = null;
        }
        if (!command) continue;
        this.activeCommandId = Number(command.id_comando);
        this.onState({ state: 'sending', command, isStop, source });
        try {
          const response = await this.commandApi.executeMovement(command.id_comando);
          this.lastAcceptedCommandId = Number(command.id_comando);
          lastResult = response;
          this.onState({ state: isStop ? 'stopped' : 'accepted', command, response, isStop, source });
        } catch (error) {
          this.onState({ state: 'error', command, error, isStop, source });
          this.pendingJoystickCommand = null;
          this.pendingSource = null;
          if (isStop || !this.stopRequested) throw error;
          // Si se pidió detener durante una orden que falló, continúa con DETENER.
          // No se reintenta el movimiento: el servidor pudo haber confirmado COMMIT.
        } finally {
          this.activeCommandId = null;
        }
      }
      return lastResult || { completed: true };
    } finally {
      this.busy = false;
    }
  }
}
