import { $, createElement, setText } from '../utils/dom.js';

export class DemoView {
  constructor({ onSelect, onStart, onCancel }) {
    this.select = $('#demo-select');
    this.startButton = $('#demo-start');
    this.cancelButton = $('#demo-cancel');
    this.status = $('#demo-status-label');
    this.progressText = $('#demo-progress-text');
    this.progressBar = $('#demo-progress-bar');
    this.progress = this.progressBar.parentElement;
    this.step = $('#demo-current-step');
    this.onSelect = onSelect;
    this.onStart = onStart;
    this.onCancel = onCancel;
    this.select.addEventListener('change', () => this.onSelect(this.select.value));
    this.startButton.addEventListener('click', () => this.onStart());
    this.cancelButton.addEventListener('click', () => this.onCancel());
  }

  renderDemos(demos) {
    this.select.replaceChildren();
    if (!demos.length) {
      const option = createElement('option', '', 'No hay DEMO activas disponibles');
      option.value = '';
      this.select.append(option);
      this.select.disabled = true;
      return;
    }
    const placeholder = createElement('option', '', 'Selecciona una DEMO');
    placeholder.value = '';
    this.select.append(placeholder);
    for (const demo of demos) {
      const option = createElement('option', '', demo.nombre);
      option.value = String(demo.id_demo);
      option.title = demo.descripcion || demo.nombre;
      this.select.append(option);
    }
    this.select.disabled = false;
    this.select.value = '';
  }

  setSelected(id) { this.select.value = id ? String(id) : ''; }

  setAvailability({ enabled, cancelEnabled = enabled, active = false }) {
    this.startButton.disabled = !enabled || active || !this.select.value;
    this.select.disabled = active || !this.select.options.length || (!this.select.options[0].value && this.select.options.length === 1);
    this.cancelButton.disabled = !cancelEnabled;
  }

  renderState(payload) {
    const { state, message, currentOrder, total } = payload;
    const config = {
      idle: ['Estado de DEMO no consultable', 'idle'],
      loaded: ['DEMO disponibles', 'idle'],
      selected: ['DEMO seleccionada', 'idle'],
      starting: ['Solicitando inicio…', 'starting'],
      accepted: ['Solicitud aceptada · esperando eventos WSS', 'starting'],
      uncertain: ['Resultado incierto · no repitas el inicio', 'error'],
      running: ['DEMO en ejecución según WSS', 'running'],
      step: ['DEMO en ejecución según WSS', 'running'],
      cancelling: ['Solicitando cancelación…', 'cancelling'],
      cancelled: ['DEMO cancelada', 'idle'],
      finished: ['DEMO finalizada', 'idle'],
      error: ['Error de DEMO', 'error'],
    };
    const [label, style] = config[state] || config.idle;
    this.status.dataset.state = style;
    setText(this.status, label);
    if (state === 'step') {
      const order = Number(currentOrder || message?.orden || 0);
      const count = Number(total || message?.total_movimientos || 0);
      const percent = count > 0 ? Math.min(100, Math.round(order / count * 100)) : 0;
      this.progressBar.style.width = `${percent}%`;
      this.progress.setAttribute('aria-valuenow', String(percent));
      setText(this.progressText, count ? `${order} / ${count}` : `Paso ${order}`);
      setText(this.step, `Movimiento ${order}: ${message?.comando || 'Comando recibido'} · código ${message?.codigo ?? '—'} · duración ${message?.duracion_ms ?? '—'} ms · pausa ${message?.pausa_ms ?? '—'} ms.`);
    } else if (state === 'running') {
      const count = Number(message?.total_movimientos || 0);
      this.progressBar.style.width = '0%';
      this.progress.setAttribute('aria-valuenow', '0');
      setText(this.progressText, count ? `0 / ${count}` : 'Iniciada');
      setText(this.step, `DEMO ${message?.demo || message?.id_demo || ''} iniciada. Esperando movimientos enviados por el servidor.`);
    } else if (state === 'accepted') {
      const count = Number(total || payload.response?.total_movimientos || 0);
      setText(this.progressText, count ? `0 / ${count}` : 'En espera');
      setText(this.step, 'FastAPI aceptó la solicitud. El avance solo se mostrará al recibir eventos WSS.');
    } else if (state === 'uncertain') {
      setText(this.progressText, 'Sin confirmación');
      setText(this.step, payload.error?.message || 'No se recibió una respuesta concluyente. No repitas el inicio; puedes intentar cancelar la DEMO.');
    } else if (state === 'cancelled') {
      this.progressBar.style.width = '0%';
      this.progress.setAttribute('aria-valuenow', '0');
      setText(this.progressText, 'Cancelada');
      setText(this.step, message?.accion ? `Cancelación confirmada. Acción final del servidor: ${message.accion}.` : 'La API confirmó la cancelación de la DEMO.');
    } else if (state === 'finished') {
      this.progressBar.style.width = '100%';
      this.progress.setAttribute('aria-valuenow', '100');
      setText(this.progressText, 'Finalizada');
      setText(this.step, `La DEMO ${message?.demo || ''} terminó según el evento del servidor.`);
    } else if (state === 'error') {
      setText(this.progressText, 'Error');
      setText(this.step, message?.mensaje || message?.error?.message || message?.error?.mensaje || payload.error?.message || 'No fue posible completar la DEMO.');
    } else if (state === 'cancelling') {
      setText(this.progressText, 'Cancelando');
      setText(this.step, 'Se solicitó al backend detener la secuencia.');
    } else if (state === 'starting') {
      setText(this.progressText, 'Iniciando');
      setText(this.step, 'Esperando respuesta HTTP y eventos del WebSocket.');
    } else {
      this.progressBar.style.width = '0%';
      this.progress.setAttribute('aria-valuenow', '0');
      setText(this.progressText, '—');
      setText(this.step, 'El backend no expone una consulta de ejecución activa. Si ya había una DEMO en curso, puedes intentar cancelarla desde aquí.');
    }
  }
}
