import {
  $,
  createElement,
  setDisabled,
} from '../utils/dom.js';

import {
  displayCommandName,
  normalizeCommandName,
} from '../domain/command-catalog.js';

// Deben coincidir con los nombres recibidos desde la API.
const PALA_NAMES = {
  up: [
    'SUBIR_PALA',
    'PALA_ARRIBA',
    'SUBIR_BRAZO',
  ],
  down: [
    'BAJAR_PALA',
    'PALA_ABAJO',
    'BAJAR_BRAZO',
  ],
  left: [
    'PALA_IZQUIERDA',
    'MOVER_PALA_IZQUIERDA',
    'GIRAR_PALA_IZQUIERDA',
    'BRAZO_IZQUIERDA',
    'GIRAR_BRAZO_IZQUIERDA',
  ],
  right: [
    'PALA_DERECHA',
    'MOVER_PALA_DERECHA',
    'GIRAR_PALA_DERECHA',
    'BRAZO_DERECHA',
    'GIRAR_BRAZO_DERECHA',
  ],
};

const PALA_BUTTONS = [
  {
    direction: 'up',
    label: 'Subir pala',
    icon: 'bi-chevron-up',
  },
  {
    direction: 'left',
    label: 'Pala izquierda',
    icon: 'bi-chevron-left',
  },
  {
    direction: 'right',
    label: 'Pala derecha',
    icon: 'bi-chevron-right',
  },
  {
    direction: 'down',
    label: 'Bajar pala',
    icon: 'bi-chevron-down',
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

  if (value.includes('BRAZO') || value.includes('PALA')) {
    return 'bi-tools';
  }

  return 'bi-gear';
}

export class ControlsView {
  constructor({ onCommand, onStop }) {
    this.root = $('#command-buttons');
    this.stopButton = $('#stop-button');
    this.stopHelp = $('#stop-help');

    this.onCommand = onCommand;
    this.onStop = onStop;

    this.buttons = new Map();

    this.buildRemoteLayout();

    this.stopButton.addEventListener('click', () => {
      this.onStop();
    });
  }

  buildRemoteLayout() {
    const joystickCard = $('.joystick-card');
    const operationsCard = $('.operations-card');
    const stopZone = this.stopButton.closest('.stop-zone');

    const remote = createElement(
      'section',
      'remote-controller'
    );
    remote.setAttribute('aria-label', 'Control remoto del carrito');

    const heading = createElement('div', 'remote-heading');

    heading.append(
      createElement('i', 'bi bi-controller'),
      createElement('h3', '', 'Control remoto')
    );

    const body = createElement('div', 'remote-body');

    joystickCard.before(remote);
    remote.append(heading, body);

    // Conserva el joystick existente y sus eventos.
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

    const palaTitle = createElement('h3', '', 'Pala');
    palaTitle.id = 'pala-title';

    const palaDescription = createElement(
      'p',
      'panel-description',
      'Pulsa una dirección para enviar una orden.'
    );

    this.palaRoot = createElement('div', 'pala-pad');

    this.palaCenter = createElement('div', 'pala-center');
    this.palaCenter.setAttribute('aria-hidden', 'true');

    this.palaCenter.append(
      createElement('i', 'bi bi-tools')
    );

    this.palaFeedback = createElement('p', 'pala-feedback');
    this.palaFeedback.setAttribute('role', 'status');

    palaSection.append(
      palaTitle,
      palaDescription,
      this.palaRoot,
      this.palaFeedback
    );

    body.append(
      joystickCard,
      operationsCard,
      palaSection
    );

    stopZone.classList.add('remote-stop');
    remote.append(stopZone);

    this.render([]);
  }

  render(commands) {
    this.root.replaceChildren();
    this.palaRoot.replaceChildren();
    this.buttons.clear();

    this.palaRoot.append(this.palaCenter);

    const assignedIds = new Set();
    let available = 0;

    // Cuatro botones de la pala.
    for (const definition of PALA_BUTTONS) {
      const names = PALA_NAMES[definition.direction];

      const command = commands.find((item) => {
        return names.includes(normalizeCommandName(item.nombre))
          && !assignedIds.has(Number(item.id_comando));
      });

      const button = this.createButton({
        command,
        label: definition.label,
        icon: definition.icon,
        className: `pala-button pala-${definition.direction}`,
      });

      this.palaRoot.append(button);

      if (command) {
        assignedIds.add(Number(command.id_comando));
        available += 1;
      }
    }

    this.palaFeedback.textContent =
      `${available}/4 movimientos de pala disponibles`;

    const secondaryCommands = commands.filter((command) => {
      return !assignedIds.has(Number(command.id_comando));
    });

    // Botones visibles mientras no hay comandos secundarios.
    if (!secondaryCommands.length) {
      const placeholders = [
        { label: 'Luces', icon: 'bi-lightbulb' },
        { label: 'Sonido', icon: 'bi-volume-mute' },
        { label: 'Velocidad', icon: 'bi-speedometer2' },
        { label: 'Aleatorio', icon: 'bi-shuffle' },
      ];

      for (const item of placeholders) {
        const button = this.createButton({
          command: null,
          label: item.label,
          icon: item.icon,
          className: 'remote-function-button',
        });

        button.title =
          `${item.label}: esperando un comando disponible en la API.`;

        this.root.append(button);
      }

      return;
    }

    // Este bloque faltaba: crea los botones con los comandos reales.
    for (const command of secondaryCommands) {
      const button = this.createButton({
        command,
        label: displayCommandName(command),
        icon: iconFor(command.nombre),
        className: 'remote-function-button',
      });

      this.root.append(button);
    }
  }

  createButton({ command, label, icon, className }) {
    const button = createElement(
      'button',
      `command-button ${className}`
    );

    button.type = 'button';
    button.disabled = true;
    button.dataset.state = 'disabled';

    const symbol = createElement('i', `bi ${icon}`);
    symbol.setAttribute('aria-hidden', 'true');

    const text = createElement(
      'span',
      'remote-button-label',
      label
    );

    const stateIcon = createElement(
      'i',
      'bi bi-arrow-up-right command-state-icon'
    );
    stateIcon.setAttribute('aria-hidden', 'true');

    button.append(symbol, text, stateIcon);

    if (!command) {
      button.title =
        `${label}: comando no disponible en el catálogo.`;
      return button;
    }

    button.title = displayCommandName(command);

    button.addEventListener('click', () => {
      this.onCommand(command, button);
    });

    this.buttons.set(
      Number(command.id_comando),
      button
    );

    return button;
  }

  setEnabled(enabled) {
    // Los botones sin comando real permanecen deshabilitados.
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
        : 'Introduce tu clave y verifica los comandos del carrito.'
    );
  }

  setStopState(state) {
    this.stopButton.dataset.state = state;
  }
}