import { APP_CONFIG } from './config/app-config.js';
import { HttpClient } from './api/http-client.js';
import { VehicleApi } from './api/vehicle-api.js';
import { CommandApi } from './api/command-api.js';
import { DemoApi } from './api/demo-api.js';
import { HealthApi } from './api/health-api.js';
import { WebSocketClient } from './websocket/websocket-client.js';

import { CommandDispatcher } from './domain/command-dispatcher.js';
import { JoystickController } from './domain/joystick-controller.js';
import { DemoController } from './domain/demo-controller.js';
import { ConnectivityController } from './domain/connectivity-controller.js';

import {
  activeCommands,
  findStopCommand,
  getSecondaryCommands,
  resolveDirections,
} from './domain/command-catalog.js';

import { DashboardView } from './ui/dashboard-view.js';
import { ConnectivityView } from './ui/connectivity-view.js';
import { JoystickView } from './ui/joystick-view.js';
import { ControlsView } from './ui/controls-view.js';
import { DemoView } from './ui/demo-view.js';
import { NotificationsView } from './ui/notifications-view.js';

import { $, setText } from './utils/dom.js';
import { friendlyError } from './utils/errors.js';
import { expectArray, validateCommand } from './utils/validation.js';

const http = new HttpClient(
  APP_CONFIG.API_BASE_URL,
  APP_CONFIG.REQUEST_TIMEOUT_MS
);

const vehicleApi = new VehicleApi(http, APP_CONFIG.VEHICLE_ID);

const commandApi = new CommandApi(
  http,
  APP_CONFIG.VEHICLE_ID,
  APP_CONFIG.MOVEMENT_ORIGIN
);

const demoApi = new DemoApi(http, APP_CONFIG.VEHICLE_ID);
const healthApi = new HealthApi(http, APP_CONFIG.HEALTH_PATH);

const dashboardView = new DashboardView();
const connectivityView = new ConnectivityView();
const notifications = new NotificationsView();

let vehicleId = APP_CONFIG.VEHICLE_ID;
let switchingVehicle = false;
let demoRequests = 0;

let apiReady = false;
let rdsReady = false;
let vehicleActive = false;

let directionCommands = {};
let stopCommand = null;

let demoController;
let joystickController;
let joystickView;
let controlsView;
let demoView;

function hasApiControlAccess() {
  return !switchingVehicle
    && apiReady
    && rdsReady
    && vehicleActive;
}

function hasControlAccess() {
  return hasApiControlAccess() && Boolean(stopCommand);
}

function manualControlActive() {
  return joystickController.currentDirection !== 'neutral'
    || controlsView.palaJoystick.currentDirection !== 'neutral';
}

function neutralizeBoth(sendStop = true) {
  joystickView?.forceNeutral({ sendStop });
  controlsView?.palaJoystick?.forceNeutral({ sendStop });
}

function updateControlAvailability() {
  const demoActive = demoController?.isActive() || false;
  const enabled = hasControlAccess() && !demoActive;

  const movementEnabled = enabled
    && Object.values(directionCommands).some(Boolean);

  // Neutraliza antes de deshabilitar para solicitar DETENER
  // si había movimiento.
  if (!movementEnabled) {
    joystickView?.forceNeutral();
  }

  joystickController?.setEnabled(movementEnabled);
  joystickView?.setEnabled(movementEnabled);
  controlsView?.setEnabled(enabled);

  demoView?.setAvailability({
    enabled: hasApiControlAccess(),
    cancelEnabled: !switchingVehicle && vehicleActive,
    active: demoActive,
  });

  const canStop = !switchingVehicle
    && vehicleActive
    && (Boolean(stopCommand) || demoActive);

  const help = demoActive
    ? 'DETENER prioriza la cancelación de la DEMO activa.'
    : stopCommand
      ? 'DETENER tiene prioridad sobre movimientos pendientes.'
      : 'El catálogo debe contener un comando DETENER activo.';

  controlsView?.setStopEnabled(canStop, help);
}

function showError(title, error) {
  notifications.show(title, friendlyError(error), 'error');
}

function handleCommandState(payload) {
  if (payload.isStop || payload.state === 'stopping') {
    controlsView?.setStopState(
      payload.state === 'error'
        ? 'error'
        : payload.state === 'stopped'
          ? 'accepted'
          : 'sending'
    );
  } else if (payload.source === 'joystick') {
    joystickView?.setCommandState(payload.state);
  }

  if (payload.state === 'sending') {
    notifications.show(
      'Enviando comando',
      payload.command?.nombre || 'Comando',
      'warning'
    );
  } else if (payload.state === 'accepted') {
    notifications.show(
      'Comando registrado',
      `${payload.response.comando} registrado. Clientes notificados: ${payload.response.clientes_notificados}. La ejecución física no está confirmada.`,
      'success'
    );
  } else if (payload.state === 'stopped') {
    notifications.show(
      'DETENER registrado',
      'La API confirmó el registro de DETENER.',
      'success'
    );
  } else if (payload.state === 'stopping') {
    notifications.show(
      'Prioridad de detención',
      payload.message,
      'warning'
    );
  } else if (payload.state === 'error') {
    showError(
      'No se pudo confirmar el comando',
      payload.error
    );
  }
}

function socketUrl(id) {
  return new URL(
    String(id),
    APP_CONFIG.WS_VEHICLES_URL
  ).href;
}

const websocketClient = new WebSocketClient(socketUrl(vehicleId), {
  reconnectBaseMs: APP_CONFIG.WS_RECONNECT_BASE_MS,
  reconnectMaxMs: APP_CONFIG.WS_RECONNECT_MAX_MS,
  pingIntervalMs: APP_CONFIG.WS_PING_INTERVAL_MS,
  pongTimeoutMs: APP_CONFIG.WS_PONG_TIMEOUT_MS,

  onState: (state) => {
    connectivityController.setWebSocketState(state);
  },

  onError: () => {
    notifications.show(
      'Problema con WebSocket',
      'Comprueba la conexión WSS y el certificado del servidor.',
      'warning'
    );
  },

  onMessage: handleWebSocketMessage,
});

const connectivityController = new ConnectivityController({
  healthApi,
  websocketClient,
  intervalMs: APP_CONFIG.HEALTH_INTERVAL_MS,

  onState: (state) => {
    connectivityView.render(state);

    // Una comprobación periódica pendiente conserva
    // el último resultado y no interrumpe el arrastre.
    if (state.api !== 'checking') {
      apiReady = state.api === 'online';
      rdsReady = state.rds === 'online';
    }

    updateControlAvailability();

    dashboardView.showGlobalAlert(
      state.api === 'offline'
        ? `No se pudo verificar AWS: ${state.healthMessage || 'sin respuesta'}`
        : ''
    );
  },
});

async function runDemoRequest(action) {
  demoRequests += 1;

  try {
    return await action();
  } finally {
    demoRequests -= 1;
  }
}

const dispatcher = new CommandDispatcher({
  commandApi,
  hasAccess: hasControlAccess,

  hasStopAccess: () => {
    return !switchingVehicle
      && vehicleActive
      && Boolean(stopCommand);
  },

  isDemoActive: () => demoController?.isActive() || false,

  cancelDemo: () => {
    return runDemoRequest(() => demoController.cancel());
  },

  onState: handleCommandState,
});

joystickController = new JoystickController({
  dispatcher,

  onDirection: (direction) => {
    const labels = {
      up: 'Avanzar',
      down: 'Retroceder',
      left: 'Izquierda',
      right: 'Derecha',
      neutral: 'Zona neutral',
    };

    setText(
      $('#joystick-status'),
      `● ${labels[direction] || 'Zona neutral'}`
    );
  },
});

joystickView = new JoystickView({
  joystickController,
});

controlsView = new ControlsView({
  dispatcher,

  onCommand: async (command, button) => {
    controlsView.setButtonState(button, 'sending');

    try {
      const result = await dispatcher.send(command, {
        source: 'button',
      });

      controlsView.setButtonState(
        button,
        result?.ignored ? 'normal' : 'accepted'
      );
    } catch (error) {
      controlsView.setButtonState(button, 'error');
      showError('Acción no enviada', error);
    }
  },

  onStop: async () => {
    neutralizeBoth(false);
    controlsView.setStopState('sending');

    try {
      await dispatcher.stop();
      controlsView.setStopState('accepted');
    } catch (error) {
      controlsView.setStopState('error');
      showError('No se pudo detener', error);
    }
  },
});

function createDemoController() {
  return new DemoController({
    demoApi,
    hasAccess: hasApiControlAccess,

    hasCancelAccess: () => {
      return !switchingVehicle && vehicleActive;
    },

    onState: (payload) => {
      demoView?.renderState(payload);

      if (payload.state === 'error') {
        controlsView?.setStopState('error');
      }

      if (payload.state === 'cancelled') {
        controlsView?.setStopState('accepted');
      }

      updateControlAvailability();

      const messages = {
        starting: [
          'Iniciando DEMO',
          'Solicitud enviada al servidor.',
          'warning',
        ],
        accepted: [
          'DEMO aceptada',
          'Esperando eventos de avance por WSS.',
          'success',
        ],
        uncertain: [
          'Resultado incierto',
          'No repitas el inicio. Puedes intentar cancelar la DEMO.',
          'warning',
        ],
        finished: [
          'DEMO finalizada',
          'El servidor notificó demo_fin.',
          'success',
        ],
        cancelled: [
          'DEMO cancelada',
          'El servidor confirmó la cancelación.',
          'warning',
        ],
      };

      if (messages[payload.state]) {
        notifications.show(...messages[payload.state]);
      }

      if (payload.state === 'step') {
        notifications.show(
          'Movimiento de DEMO',
          `${payload.message.comando} · paso ${payload.currentOrder} de ${payload.total || '?'}.`,
          'neutral'
        );
      }

      if (payload.state === 'error') {
        notifications.show(
          'Error en DEMO',
          payload.message?.mensaje || friendlyError(payload.error),
          'error'
        );
      }
    },
  });
}

demoController = createDemoController();

demoView = new DemoView({
  onSelect: (id) => {
    demoController.select(id);
    updateControlAvailability();
  },

  onStart: async () => {
    if (manualControlActive() || dispatcher.isBusy()) {
      notifications.show(
        'Control ocupado',
        'Suelta ambas palancas y espera la orden pendiente.',
        'warning'
      );
      return;
    }

    try {
      await runDemoRequest(() => demoController.start());
    } catch (error) {
      showError('No se pudo iniciar la DEMO', error);
    }
  },

  onCancel: async () => {
    try {
      if (
        !demoController.isActive()
        && (manualControlActive() || dispatcher.isBusy())
      ) {
        neutralizeBoth(false);
        await dispatcher.stop();
      }

      await runDemoRequest(() => demoController.cancel());
    } catch (error) {
      showError('No se pudo cancelar la DEMO', error);
    }
  },
});

function handleWebSocketMessage(message) {
  if (!message || typeof message.tipo !== 'string') {
    return;
  }

  if (
    message.id_vehiculo != null
    && Number(message.id_vehiculo) !== Number(vehicleId)
  ) {
    return;
  }

  demoController.handleEvent(message);

  if (message.tipo === 'estado_inicial') {
    dashboardView.setPhysicalState();

    if (message.comando) {
      notifications.show(
        'Estado inicial recibido',
        `Último comando registrado: ${message.comando}.`,
        'neutral'
      );
    }
  } else if (message.tipo === 'movimiento') {
    notifications.show(
      'Evento de movimiento',
      `${message.comando || 'Comando'} · vehículo ${message.id_vehiculo}. WSS no confirma ejecución física.`,
      'success'
    );
  } else if (message.tipo === 'error') {
    notifications.show(
      'Error reportado por WSS',
      message.mensaje || 'Error del servidor.',
      'error'
    );
  }
}

async function loadInitialData() {
  const [
    vehicleResult,
    commandsResult,
    demosResult,
  ] = await Promise.allSettled([
    vehicleApi.getVehicle(),
    commandApi.getCommands(),
    demoController.load(),
  ]);

  vehicleActive = false;

  if (vehicleResult.status === 'fulfilled') {
    vehicleActive = vehicleResult.value.activo === true;
    dashboardView.renderVehicle(vehicleResult.value);
  } else {
    dashboardView.showGlobalAlert(
      `No se pudo consultar el vehículo: ${friendlyError(vehicleResult.reason)}`
    );

    setText($('#vehicle-name'), 'Carrito no disponible');

    setText(
      $('#vehicle-feedback'),
      friendlyError(vehicleResult.reason)
    );
  }

  try {
    if (commandsResult.status === 'rejected') {
      throw commandsResult.reason;
    }

    const catalog = activeCommands(
      expectArray(commandsResult.value, 'comandos')
        .filter(validateCommand)
    );

    directionCommands = resolveDirections(catalog);
    stopCommand = findStopCommand(catalog);

    dispatcher.setStopCommand(stopCommand);
    joystickController.setCatalog(directionCommands);
    joystickView.renderAvailability(directionCommands);
    controlsView.render(getSecondaryCommands(catalog));

    if (!stopCommand) {
      notifications.show(
        'Falta DETENER',
        'El catálogo debe incluir DETENER para habilitar movimientos manuales.',
        'warning'
      );
    }
  } catch (error) {
    directionCommands = {};
    stopCommand = null;

    dispatcher.setStopCommand(null);
    joystickController.setCatalog({});
    joystickView.renderAvailability({});
    controlsView.render([]);

    showError('No se pudo cargar el catálogo', error);
  }

  if (demosResult.status === 'fulfilled') {
    demoView.renderDemos(demoController.demos);
    demoView.setSelected(demoController.selectedId);

    if (!demoController.isActive()) {
      demoView.renderState({ state: 'idle' });
    }
  } else {
    demoView.renderDemos([]);

    showError(
      'No se pudieron cargar las DEMO',
      demosResult.reason
    );
  }

  updateControlAvailability();
}

function bindVehicleSelection() {
  const input = $('#vehicle-id');
  const submit = $('#vehicle-submit');
  const feedback = $('#vehicle-feedback');

  input.value = vehicleId;
  input.disabled = false;
  submit.disabled = false;

  $('#vehicle-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    const id = input.valueAsNumber;

    if (
      switchingVehicle
      || !Number.isSafeInteger(id)
      || id < 1
    ) {
      return;
    }

    if (
      dispatcher.isBusy()
      || demoRequests
      || demoController.isActive()
      || manualControlActive()
    ) {
      setText(
        feedback,
        'Suelta ambas palancas, cancela la DEMO y espera las órdenes pendientes.'
      );
      return;
    }

    switchingVehicle = true;
    input.disabled = true;
    submit.disabled = true;

    neutralizeBoth(false);

    vehicleActive = false;
    directionCommands = {};
    stopCommand = null;

    dispatcher.resetVehicle();
    joystickController.setCatalog({});
    joystickView.renderAvailability({});
    controlsView.render([]);
    controlsView.setStopState('idle');

    demoController = createDemoController();

    demoView.renderDemos([]);
    demoView.renderState({ state: 'idle' });

    updateControlAvailability();
    websocketClient.stop();

    vehicleId = id;
    vehicleApi.vehicleId = id;
    commandApi.vehicleId = id;
    demoApi.vehicleId = id;

    websocketClient.url = socketUrl(id);

    setText($('#vehicle-name'), 'Consultando carrito…');
    setText($('#vehicle-meta'), `ID ${id}`);
    setText(feedback, `Consultando carrito ${id}…`);

    try {
      await loadInitialData();

      if (vehicleActive) {
        websocketClient.start();
        setText(feedback, `Carrito ${id} seleccionado.`);
      } else if (
        $('#vehicle-name').textContent !== 'Carrito no disponible'
      ) {
        setText(feedback, `El carrito ${id} está inactivo.`);
      }
    } catch (error) {
      vehicleActive = false;
      setText(feedback, friendlyError(error));
    } finally {
      switchingVehicle = false;
      input.disabled = false;
      submit.disabled = false;

      updateControlAvailability();
    }
  });
}

async function init() {
  window.addEventListener('pagehide', () => {
    neutralizeBoth();
  });

  connectivityController.start();

  setText($('#vehicle-meta'), `ID ${vehicleId}`);

  try {
    await loadInitialData();
  } finally {
    bindVehicleSelection();
  }

  if (
    location.protocol === 'https:'
    && !APP_CONFIG.API_BASE_URL.startsWith('https://')
  ) {
    notifications.show(
      'Configuración HTTPS requerida',
      'La API debe usar HTTPS desde GitHub Pages.',
      'error'
    );
  }
}

init().catch((error) => {
  dashboardView.showGlobalAlert(
    `Error al iniciar: ${friendlyError(error)}`
  );

  showError('No se pudo iniciar la aplicación', error);
});