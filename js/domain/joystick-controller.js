export class JoystickController {
  constructor({ dispatcher, onDirection = () => {} }) {
    this.dispatcher = dispatcher;
    this.onDirection = onDirection;
    this.directions = {};
    this.currentDirection = 'neutral';
    this.enabled = false;
  }

  setCatalog(directions) { this.directions = directions || {}; }
  setEnabled(enabled) { this.enabled = Boolean(enabled); if (!this.enabled) this.setDirection('neutral'); }

  setDirection(direction) {
    if (direction === this.currentDirection) return;
    const previous = this.currentDirection;
    this.currentDirection = direction;
    this.onDirection(direction);
    if (!this.enabled) return;
    if (direction === 'neutral') {
      if (previous !== 'neutral') this.dispatcher.stop().catch(() => {});
      return;
    }
    const command = this.directions[direction];
    if (command) this.dispatcher.send(command, { source: 'joystick' }).catch(() => {});
    else if (previous !== 'neutral') this.dispatcher.stop().catch(() => {});
  }
}
