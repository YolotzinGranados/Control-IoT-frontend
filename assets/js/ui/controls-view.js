import {
  $,
  createElement,
  setDisabled,
} from '../utils/dom.js';

import {
  displayCommandName,
  normalizeCommandName,
} from '../domain/command-catalog.js';

import {
  PalaJoystickView,
} from './pala-joystick-view.js';

const PALA_DIRECTIONS = [
  {
    direction: 'up',
    label: 'SUBIR PALA',
    icon: 'bi-chevron-up',
    names: ['SUBIR_PALA', 'PALA_ARRIBA', 'SUBIR_BRAZO'],
  },
  {
    direction: 'down',
    label: 'BAJAR PALA',
    icon: 'bi-chevron-down',
    names: ['BAJAR_PALA', 'PALA_ABAJO', 'BAJAR_BRAZO'],
  },
  {
    direction: 'left',
    label: 'ABRIR PALA',
    icon: 'bi-chevron-left',
    names: ['ABRIR_PALA'],
  },
  {
    direction: 'right',
    label: 'CERRAR PALA',
    icon: 'bi-chevron-right',
    names: ['CERRAR_PALA'],
  },
];

function iconFor(name) {
  const value = normalizeCommandName(name);

  if (value.includes('LUZ') || value.includes('LUCES')) {
    return 'bi-lightbulb';
  }

  if (value.includes('VELOC')) {
    return 'bi-speedometer2';
  }

  if (value.includes('MUTE') || value.includes('SONIDO')) {
    return 'bi-volume-mute';
  }

  if (value.includes('ALEATORIO')) {
    return 'bi-shuffle';
  }

  if (value.includes('PALA') || value.includes('BRAZO')) {
    return 'bi-tools';
  }

  return 'bi-gear';
}

export class ControlsView {
  constructor({ dispatcher, onCommand, onStop }) {
    this.root = $('#command-buttons');
    this.stopButton = $('#stop-button');
    this.stopHelp = $('#stop-help');

    this.onCommand = onCommand;
    this.onStop = onStop;
    this.buttons = new Map();

    this.buildRemoteLayout();

    this.palaJoystick = new PalaJoystickView({
      root: this.palaRoot,
      knob: this.palaCenter,
      dispatcher,
    });

    this.render([]);

    this.stopButton.addEventListener('click', () => {
      this.onStop();
    });
  }

  buildRemoteLayout() {
    const joystickCard = $('.joystick-card');
    const operationsCard = $('.operations-card');
    const stopZone = this.stopButton.closest('.stop-zone');

    const remote = createElement('section', 'remote-controller');
    remote.setAttribute('aria-label', 'Control remoto del carrito');

    const heading = createElement('div', 'remote-heading');

    heading.append(
      createElement('i', 'bi bi-controller'),
      createElement('h3', '', 'Control remoto')
    );

    const body = createElement('div', 'remote-body');

    joystickCard.before(remote);
    remote.append(heading, body);

    joystickCard.classList.add('remote-movement');
    $('#joystick-title').textContent = 'Movimiento';

    operationsCard.classList.add('remote-functions');
    $('#operations-title').textContent = 'Funciones';

    const description = operationsCard.querySelector(
      '.panel-description'
    );

    if (description) {
      description.textContent = 'Acciones del carrito seleccionado.';
    }

    for (const card of [joystickCard, operationsCard]) {
      card.querySelector('.panel-index')?.remove();
      card.querySelector('.panel-heading .eyebrow')?.remove();
    }

    const palaSection = createElement('section', 'remote-pala');
    palaSection.setAttribute('aria-labelledby', 'pala-title');

    const title = createElement('h3', '', 'Pala');
    title.id = 'pala-title';

    // Base de la palanca. Las direcciones son etiquetas,
    // no botones.
    this.palaRoot = createElement('div', 'pala-pad pala-stick');

    this.palaCenter = createElement('div', 'pala-center');
    this.palaCenter.title =
      'Arrastra para controlar la pala. Suelta para detener.';

    const knobRing = createElement('span', 'pala-knob-ring');
    knobRing.setAttribute('aria-hidden', 'true');

    knobRing.append(
      createElement('i', 'bi bi-arrows-move')
    );

    this.palaCenter.append(knobRing);
    this.palaRoot.append(this.palaCenter);

    this.palaFeedback = createElement('p', 'pala-feedback');
    this.palaFeedback.setAttribute('role', 'status');

    const instructions = createElement(
      'p',
      'pala-stick-help',
      'Arrastra la palanca amarilla. Suelta para detener.'
    );

    instructions.id = 'pala-stick-help';
    this.palaCenter.setAttribute(
      'aria-describedby',
      'pala-stick-help'
    );

    palaSection.append(
      title,
      this.palaRoot,
      this.palaFeedback,
      instructions
    );

    body.append(
      joystickCard,
      operationsCard,
      palaSection
    );

    stopZone.classList.add('remote-stop');
    remote.append(stopZone);
  }

  render(commands) {
    // Conserva el elemento de la palanca y sus eventos.
    this.palaJoystick.forceNeutral();
    this.root.replaceChildren();
    this.buttons.clear();

    for (const label of this.palaRoot.querySelectorAll(
      '.pala-direction-label'
    )) {
      label.remove();
    }

    const assignedIds = new Set();
    const directions = {};

    for (const definition of PALA_DIRECTIONS) {
      const command = commands.find((item) => {
        return definition.names.includes(
          normalizeCommandName(item.nombre)
        ) && !assignedIds.has(Number(item.id_comando));
      });

      if (command) {
        directions[definition.direction] = command;
        assignedIds.add(Number(command.id_comando));
      }

      const label = createElement(
        'div',
        `pala-direction-label pala-label-${definition.direction}`
      );

      label.dataset.available = String(Boolean(command));

      const icon = createElement('i', `bi ${definition.icon}`);
      icon.setAttribute('aria-hidden', 'true');

      label.append(
        icon,
        createElement('span', '', definition.label)
      );

      label.title = command
        ? `${definition.label}: disponible`
        : `${definition.label}: no está en el catálogo`;

      this.palaRoot.append(label);
    }

    this.palaJoystick.setCatalog(directions);

    this.palaFeedback.textContent =
      `${Object.keys(directions).length}/4 movimientos de pala disponibles`;

    const secondaryCommands = commands.filter((command) => {
      return !assignedIds.has(Number(command.id_comando));
    });

    if (!secondaryCommands.length) {
      this.root.append(
        createElement(
          'p',
          'remote-empty',
          'Sin funciones adicionales disponibles.'
        )
      );

      return;
    }

    for (const command of secondaryCommands) {
      this.root.append(this.createButton(command));
    }
  }

  createButton(command) {
    const button = createElement(
      'button',
      'command-button remote-function-button'
    );

    button.type = 'button';
    button.disabled = true;
    button.dataset.state = 'disabled';
    button.title = displayCommandName(command);

    const icon = createElement(
      'i',
      `bi ${iconFor(command.nombre)}`
    );

    icon.setAttribute('aria-hidden', 'true');

    const label = createElement(
      'span',
      'remote-button-label',
      displayCommandName(command)
    );

    const stateIcon = createElement(
      'i',
      'bi bi-arrow-up-right command-state-icon'
    );

    stateIcon.setAttribute('aria-hidden', 'true');

    button.append(icon, label, stateIcon);

    button.addEventListener('click', () => {
      this.onCommand(command, button);
    });

    this.buttons.set(Number(command.id_comando), button);

    return button;
  }

  setEnabled(enabled) {
    this.palaJoystick.setEnabled(enabled);

    for (const button of this.buttons.values()) {
      button.disabled = !enabled;

      if (!enabled) {
        button.dataset.state = 'disabled';
      } else if (button.dataset.state === 'disabled') {
        button.dataset.state = 'normal';
      }
    }
  }

  setButtonState(button, state) {
    if (!button) return;

    button.dataset.state = state;

    const icon = button.querySelector('.command-state-icon');
    if (!icon) return;

    const icons = {
      sending: 'bi-arrow-repeat',
      accepted: 'bi-check-circle',
      error: 'bi-exclamation-circle',
    };

    icon.className =
      `bi ${icons[state] || 'bi-arrow-up-right'} command-state-icon`;
  }

  setStopEnabled(enabled, reason = '') {
    setDisabled(this.stopButton, !enabled);

    if (!enabled) {
      this.stopButton.dataset.state = 'disabled';
    } else if (this.stopButton.dataset.state === 'disabled') {
      this.stopButton.dataset.state = 'normal';
    }

    this.stopHelp.textContent = reason || (
      enabled
        ? 'DETENER tiene prioridad sobre movimientos pendientes.'
        : 'Verifica la conexión y los comandos del carrito.'
    );
  }

  setStopState(state) {
    this.stopButton.dataset.state = state;
  }
}