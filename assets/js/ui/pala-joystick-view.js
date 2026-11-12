import { JoystickController } from '../domain/joystick-controller.js';

export class PalaJoystickView {
  constructor({ root, knob, dispatcher }) {
    this.root = root;
    this.knob = knob;
    this.enabled = false;
    this.pointerId = null;
    this.originX = 0;
    this.originY = 0;
    this.maxDistance = 1;

    this.controller = new JoystickController({
      dispatcher,
    });

    this.knob.removeAttribute('aria-hidden');
    this.knob.setAttribute('role', 'group');
    this.knob.setAttribute(
      'aria-label',
      'Palanca de pala. Arrastra o usa las flechas. Suelta para detener.'
    );
    this.knob.setAttribute('aria-disabled', 'true');
    this.knob.tabIndex = 0;

    this.bindEvents();
  }

  get currentDirection() {
    return this.controller.currentDirection;
  }

  setCatalog(directions) {
    this.forceNeutral();
    this.controller.setCatalog(directions);
  }

  setEnabled(enabled) {
    const hasDirections = Object.values(
      this.controller.directions
    ).some(Boolean);

    const nextEnabled = Boolean(enabled && hasDirections);

    if (!nextEnabled && this.enabled) {
      this.forceNeutral();
    }

    this.enabled = nextEnabled;
    this.controller.setEnabled(nextEnabled);

    this.knob.setAttribute(
      'aria-disabled',
      String(!nextEnabled)
    );
  }

  forceNeutral({ sendStop = true } = {}) {
    const pointerId = this.pointerId;
    this.pointerId = null;

    this.knob.style.removeProperty('--pala-x');
    this.knob.style.removeProperty('--pala-y');
    this.knob.classList.remove('is-dragging');

    if (sendStop) {
      this.controller.setDirection('neutral');
    } else {
      this.controller.currentDirection = 'neutral';
    }

    if (
      pointerId !== null
      && this.knob.hasPointerCapture(pointerId)
    ) {
      this.knob.releasePointerCapture(pointerId);
    }
  }

  updatePointer(event) {
    let dx = event.clientX - this.originX;
    let dy = event.clientY - this.originY;

    const distance = Math.hypot(dx, dy);

    if (distance > this.maxDistance) {
      const scale = this.maxDistance / distance;
      dx *= scale;
      dy *= scale;
    }

    this.knob.style.setProperty('--pala-x', `${dx}px`);
    this.knob.style.setProperty('--pala-y', `${dy}px`);

    if (Math.hypot(dx, dy) < this.maxDistance * 0.23) {
      this.controller.setDirection('neutral');
      return;
    }

    let direction;

    if (Math.abs(dx) > Math.abs(dy)) {
      direction = dx < 0 ? 'left' : 'right';
    } else {
      direction = dy < 0 ? 'up' : 'down';
    }

    this.controller.setDirection(direction);
  }

  bindEvents() {
    this.knob.addEventListener('pointerdown', (event) => {
      if (!this.enabled || this.pointerId !== null) return;

      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }

      event.preventDefault();

      this.pointerId = event.pointerId;
      this.originX = event.clientX;
      this.originY = event.clientY;
      this.maxDistance = Math.max(
        1,
        this.root.getBoundingClientRect().width * 0.22
      );

      this.knob.focus({ preventScroll: true });
      this.knob.setPointerCapture(event.pointerId);
      this.knob.classList.add('is-dragging');
    });

    this.knob.addEventListener('pointermove', (event) => {
      if (
        !this.enabled
        || event.pointerId !== this.pointerId
      ) {
        return;
      }

      event.preventDefault();
      this.updatePointer(event);
    });

    this.knob.addEventListener('pointerup', (event) => {
      if (event.pointerId === this.pointerId) {
        this.forceNeutral();
      }
    });

    this.knob.addEventListener('pointercancel', (event) => {
      if (event.pointerId === this.pointerId) {
        this.forceNeutral();
      }
    });

    this.knob.addEventListener('lostpointercapture', () => {
      if (this.pointerId !== null) {
        this.forceNeutral();
      }
    });

    const keys = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
    };

    this.knob.addEventListener('keydown', (event) => {
      const direction = keys[event.key];

      if (!direction || !this.enabled) return;

      event.preventDefault();

      if (this.pointerId === null) {
        this.controller.setDirection(direction);
      }
    });

    this.knob.addEventListener('keyup', (event) => {
      if (!keys[event.key]) return;

      event.preventDefault();

      if (
        this.pointerId === null
        && this.currentDirection === keys[event.key]
      ) {
        this.controller.setDirection('neutral');
      }
    });

    this.knob.addEventListener('blur', () => {
      this.forceNeutral();
    });

    window.addEventListener('blur', () => {
      this.forceNeutral();
    });

    window.addEventListener('pagehide', () => {
      this.forceNeutral();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.forceNeutral();
      }
    });
  }
}