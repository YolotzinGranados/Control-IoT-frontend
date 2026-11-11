import { $, setText } from '../utils/dom.js';

const DIRECTION_KEYS = new Map([
  ['ArrowUp', 'up'], ['w', 'up'], ['W', 'up'],
  ['ArrowDown', 'down'], ['s', 'down'], ['S', 'down'],
  ['ArrowLeft', 'left'], ['a', 'left'], ['A', 'left'],
  ['ArrowRight', 'right'], ['d', 'right'], ['D', 'right'],
]);

export class JoystickView {
  constructor({ joystickController }) {
    this.controller = joystickController;
    this.root = $('#joystick');
    this.status = $('#joystick-status');
    this.availability = $('#joystick-availability');
    this.directionTags = $('#direction-availability');
    this.pointerId = null;
    this.enabled = false;
    this.activeKeys = new Set();
    this.#bind();
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.root.setAttribute('aria-disabled', String(!this.enabled));
    this.root.dataset.state = this.enabled ? 'normal' : 'disabled';
    if (!this.enabled) this.#cancelGesture();
  }

  forceNeutral({ sendStop = true } = {}) {
    this.#cancelGesture({ sendStop });
  }

  setCommandState(state) {
    if (this.enabled) this.root.dataset.state = state;
  }

  renderAvailability(directions) {
    this.directionTags.replaceChildren();
    const labels = { up: 'Avanzar', down: 'Retroceder', left: 'Izquierda', right: 'Derecha' };
    const available = Object.entries(directions).filter(([, command]) => Boolean(command)).length;
    for (const [direction, label] of Object.entries(labels)) {
      const tag = document.createElement('span');
      tag.className = `direction-tag${directions[direction] ? ' is-available' : ''}`;
      tag.textContent = `${label}: ${directions[direction] ? 'disponible' : 'no está en catálogo'}`;
      this.directionTags.append(tag);
    }
    setText(this.availability, `${available}/4 direcciones disponibles`);
  }

  #bind() {
    this.root.addEventListener('pointerdown', (event) => {
      if (!this.enabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      this.pointerId = event.pointerId;
      this.root.setPointerCapture(event.pointerId);
      this.root.classList.add('is-active');
      this.#updateFromPointer(event);
    });
    this.root.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.pointerId) return;
      event.preventDefault();
      this.#updateFromPointer(event);
    });
    this.root.addEventListener('pointerup', (event) => {
      if (event.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.root.classList.remove('is-active');
      this.#neutralize();
    });
    this.root.addEventListener('pointercancel', () => this.#cancelGesture());
    this.root.addEventListener('lostpointercapture', () => {
      if (this.pointerId !== null) this.#cancelGesture();
    });
    this.root.addEventListener('keydown', (event) => {
      const direction = DIRECTION_KEYS.get(event.key);
      if (!direction || !this.enabled) return;
      event.preventDefault();
      this.activeKeys.add(event.key);
      this.#setDirection(direction);
    });
    this.root.addEventListener('keyup', (event) => {
      if (!DIRECTION_KEYS.has(event.key)) return;
      this.activeKeys.delete(event.key);
      if (this.activeKeys.size === 0) this.#neutralize();
    });
    window.addEventListener('blur', () => this.#cancelGesture());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.#cancelGesture(); });
  }

  #updateFromPointer(event) {
    const rect = this.root.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let dx = event.clientX - centerX;
    let dy = event.clientY - centerY;
    const maxRadius = rect.width * .34;
    const distance = Math.hypot(dx, dy);
    if (distance > maxRadius) {
      const scale = maxRadius / distance;
      dx *= scale;
      dy *= scale;
    }
    this.root.style.setProperty('--knob-x', `${dx}px`);
    this.root.style.setProperty('--knob-y', `${dy}px`);
    const normalizedDistance = Math.hypot(dx, dy) / maxRadius;
    if (normalizedDistance < .23) { this.#setDirection('neutral'); return; }
    this.#setDirection(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'));
  }

  #setDirection(direction) {
    this.controller.setDirection(direction);
    if (this.enabled) this.root.dataset.state = direction === 'neutral' ? 'normal' : 'pressed';
    const labels = { up: 'Avanzando', down: 'Retrocediendo', left: 'Girando a la izquierda', right: 'Girando a la derecha', neutral: 'Zona neutral' };
    setText(this.status, `● ${labels[direction] || 'Zona neutral'}`);
  }

  #neutralize(sendStop = true) {
    this.root.style.setProperty('--knob-x', '0px');
    this.root.style.setProperty('--knob-y', '0px');
    this.activeKeys.clear();
    if (sendStop) this.#setDirection('neutral');
    else {
      this.controller.currentDirection = 'neutral';
      this.controller.onDirection('neutral');
      this.root.dataset.state = this.enabled ? 'normal' : 'disabled';
      setText(this.status, '● Zona neutral');
    }
  }

  #cancelGesture({ sendStop = true } = {}) {
    const pointerId = this.pointerId;
    this.pointerId = null;
    if (pointerId !== null) {
      try { if (this.root.hasPointerCapture(pointerId)) this.root.releasePointerCapture(pointerId); } catch { /* El puntero pudo perderse */ }
    }
    this.root.classList.remove('is-active');
    this.#neutralize(sendStop);
  }
}
