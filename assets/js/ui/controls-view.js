import { $, createElement, setDisabled } from '../utils/dom.js';
import { displayCommandName } from '../domain/command-catalog.js';

const iconFor = (name) => {
  const value = String(name || '').toUpperCase();
  if (value.includes('BRAZO') || value.includes('PALA')) return 'bi-tools';
  if (value.includes('LUZ')) return 'bi-lightbulb';
  if (value.includes('VELOC')) return 'bi-speedometer2';
  if (value.includes('MUTE') || value.includes('SONIDO')) return 'bi-volume-mute';
  return 'bi-gear';
};

export class ControlsView {
  constructor({ onCommand, onStop }) {
    this.root = $('#command-buttons');
    this.stopButton = $('#stop-button');
    this.stopHelp = $('#stop-help');
    this.onCommand = onCommand;
    this.onStop = onStop;
    this.buttons = new Map();
    this.stopButton.addEventListener('click', () => this.onStop());
  }

  render(commands) {
    this.root.replaceChildren();
    this.buttons.clear();
    if (!commands.length) {
      const empty = createElement('div', 'empty-state');
      empty.append(createElement('i', 'bi bi-info-circle'), createElement('span', '', 'No hay comandos secundarios activos en el catálogo del vehículo.'));
      this.root.append(empty);
      return;
    }
    for (const command of commands) {
      const button = createElement('button', 'command-button');
      button.type = 'button';
      button.dataset.state = 'normal';
      button.disabled = true;
      const icon = createElement('span', 'command-icon');
      icon.append(createElement('i', `bi ${iconFor(command.nombre)}`));
      const copy = createElement('span', 'command-copy');
      copy.append(createElement('strong', '', displayCommandName(command)));
      copy.append(createElement('small', '', `Código ${command.codigo} · ID ${command.id_comando}`));
      const stateIcon = createElement('i', 'bi bi-arrow-up-right command-state-icon');
      button.append(icon, copy, stateIcon);
      button.addEventListener('pointerdown', () => { if (!button.disabled) button.dataset.state = 'pressed'; });
      button.addEventListener('pointerup', () => { if (button.dataset.state === 'pressed') button.dataset.state = 'normal'; });
      button.addEventListener('pointerleave', () => { if (button.dataset.state === 'pressed') button.dataset.state = 'normal'; });
      button.addEventListener('click', () => this.onCommand(command, button));
      this.root.append(button);
      this.buttons.set(Number(command.id_comando), button);
    }
  }

  setEnabled(enabled) {
    for (const button of this.buttons.values()) {
      button.disabled = !enabled;
      if (!enabled) button.dataset.state = 'disabled';
      else if (button.dataset.state === 'disabled') button.dataset.state = 'normal';
    }
  }

  setButtonState(button, state) {
    if (!button) return;
    button.dataset.state = state;
    const icon = button.querySelector('.command-state-icon');
    if (icon) icon.className = `bi ${state === 'sending' ? 'bi-arrow-repeat' : state === 'accepted' ? 'bi-check-circle' : state === 'error' ? 'bi-exclamation-circle' : 'bi-arrow-up-right'} command-state-icon`;
  }

  setStopEnabled(enabled, reason = '') {
    setDisabled(this.stopButton, !enabled);
    if (!enabled) this.stopButton.dataset.state = 'disabled';
    else if (this.stopButton.dataset.state === 'disabled') this.stopButton.dataset.state = 'normal';
    this.stopHelp.textContent = reason || (enabled ? 'La orden DETENER se enviará con prioridad sobre movimientos pendientes.' : 'Introduce tu clave y verifica que el catálogo tenga un comando DETENER.');
  }

  setStopState(state) { this.stopButton.dataset.state = state; }
}
