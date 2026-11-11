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
import { activeCommands, findStopCommand, getSecondaryCommands, resolveDirections } from './domain/command-catalog.js';
import { DashboardView } from './ui/dashboard-view.js';
import { ConnectivityView } from './ui/connectivity-view.js';
import { JoystickView } from './ui/joystick-view.js';
import { ControlsView } from './ui/controls-view.js';
import { DemoView } from './ui/demo-view.js';
import { NotificationsView } from './ui/notifications-view.js';
import { $, setText } from './utils/dom.js';
import { friendlyError } from './utils/errors.js';
import { expectArray, validateCommand } from './utils/validation.js';

const http = new HttpClient(APP_CONFIG.API_BASE_URL, APP_CONFIG.REQUEST_TIMEOUT_MS);
const vehicleApi = new VehicleApi(http, APP_CONFIG.VEHICLE_ID);
const commandApi = new CommandApi(http, APP_CONFIG.VEHICLE_ID, APP_CONFIG.MOVEMENT_ORIGIN);
const demoApi = new DemoApi(http, APP_CONFIG.VEHICLE_ID);
const healthApi = new HealthApi(http, APP_CONFIG.HEALTH_PATH);

const dashboardView = new DashboardView();
const connectivityView = new ConnectivityView();
const notifications = new NotificationsView();
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

function hasApiControlAccess() { return http.hasApiKey() && apiReady && rdsReady && vehicleActive; }
function hasControlAccess() { return hasApiControlAccess() && Boolean(stopCommand); }

function updateControlAvailability() {
  const enabled = hasControlAccess();
  const demoActive = demoController?.isActive() || false;
  const stopAccess = http.hasApiKey() && vehicleActive && (Boolean(stopCommand) || demoActive);
  const joystickEnabled = enabled && Object.values(directionCommands).some(Boolean);
  joystickController?.setEnabled(joystickEnabled);
  joystickView?.setEnabled(joystickEnabled);
  controlsView?.setEnabled(enabled && !demoActive);
  demoView?.setAvailability({ enabled: hasApiControlAccess(), cancelEnabled: http.hasApiKey() && vehicleActive, active: demoActive });
  const canStop = stopAccess && (demoActive || Boolean(stopCommand));
  controlsView?.setStopEnabled(canStop, demoActive
    ? 'DETENER prioriza la cancelación de la DEMO activa.'
    : stopCommand
      ? 'La orden DETENER se enviará con prioridad sobre movimientos pendientes.'
      : 'El catálogo no contiene un comando DETENER activo; no se enviará una orden inventada.');
}

function handleCommandState(payload) {
  if (payload.isStop || payload.state === 'stopping') controlsView?.setStopState(payload.state === 'error' ? 'error' : payload.state === 'stopped' ? 'accepted' : 'sending');
  else if (payload.source === 'joystick' && ['sending', 'accepted', 'error'].includes(payload.state)) joystickView?.setCommandState(payload.state);
  const commandName = payload.command?.nombre || 'Comando';
  if (payload.state === 'sending') notifications.show('Enviando comando', `${commandName}: solicitud POST enviada a FastAPI.`, 'warning');
  if (payload.state === 'accepted') notifications.show('Comando registrado', `${payload.response.comando} fue registrado por RDS. Clientes WebSocket notificados: ${payload.response.clientes_notificados}. Esto no confirma ejecución física.`, 'success');
  if (payload.state === 'stopped') notifications.show('DETENER registrado', 'La API confirmó el registro del comando DETENER. La ejecución física no está confirmada por esta respuesta.', 'success');
  if (payload.state === 'stopping') notifications.show('Prioridad de detención', payload.message, 'warning');
  if (payload.state === 'error') {
    notifications.show('No se pudo confirmar el comando', friendlyError(payload.error), 'error');
    if (payload.error?.status === 401 || payload.error?.status === 403) clearAccess('La API rechazó la clave de control. Introdúcela nuevamente.');
  }
}

const websocketClient = new WebSocketClient(APP_CONFIG.WS_URL, {
  reconnectBaseMs: APP_CONFIG.WS_RECONNECT_BASE_MS,
  reconnectMaxMs: APP_CONFIG.WS_RECONNECT_MAX_MS,
  pingIntervalMs: APP_CONFIG.WS_PING_INTERVAL_MS,
  pongTimeoutMs: APP_CONFIG.WS_PONG_TIMEOUT_MS,
  onState: (state) => connectivityController.setWebSocketState(state),
  onError: () => notifications.show('Problema con WebSocket', 'No se pudo mantener la sesión WSS. Comprueba la confianza del certificado OpenSSL, el puerto 8000 y la conectividad.', 'warning'),
  onMessage: handleWebSocketMessage,
});

const connectivityController = new ConnectivityController({
  healthApi,
  websocketClient,
  intervalMs: APP_CONFIG.HEALTH_INTERVAL_MS,
  onState: (state) => {
    connectivityView.render(state);
    apiReady = state.api === 'online';
    rdsReady = state.rds === 'online';
    updateControlAvailability();
    if (state.api === 'offline') dashboardView.showGlobalAlert(`No se pudo verificar la API AWS: ${state.healthMessage || 'sin respuesta'}`);
    else dashboardView.showGlobalAlert('');
  },
});

const dispatcher = new CommandDispatcher({
  commandApi,
  hasAccess: hasControlAccess,
  hasStopAccess: () => http.hasApiKey() && vehicleActive && Boolean(stopCommand),
  isDemoActive: () => demoController?.isActive() || false,
  cancelDemo: () => demoController.cancel(),
  onState: handleCommandState,
});

joystickController = new JoystickController({
  dispatcher,
  onDirection: (direction) => {
    const labels = { up: 'Avanzar', down: 'Retroceder', left: 'Izquierda', right: 'Derecha', neutral: 'Zona neutral' };
    setText($('#joystick-status'), `● ${labels[direction] || 'Zona neutral'}`);
  },
});
joystickView = new JoystickView({ joystickController });

controlsView = new ControlsView({
  onCommand: async (command, button) => {
    controlsView.setButtonState(button, 'sending');
    try {
      await dispatcher.send(command, { source: 'button' });
      controlsView.setButtonState(button, 'accepted');
    } catch (error) {
      controlsView.setButtonState(button, 'error');
      notifications.show('Acción no enviada', friendlyError(error), 'error');
    }
  },
  onStop: async () => {
    joystickView.forceNeutral({ sendStop: false });
    controlsView.setStopState('sending');
    try { await dispatcher.stop(); controlsView.setStopState('accepted'); }
    catch (error) { controlsView.setStopState('error'); notifications.show('No se pudo detener', friendlyError(error), 'error'); }
  },
});

demoController = new DemoController({
  demoApi,
  hasAccess: hasApiControlAccess,
  hasCancelAccess: () => http.hasApiKey() && vehicleActive,
  onState: (payload) => {
    demoView?.renderState(payload);
    if (payload.state === 'error') controlsView?.setStopState('error');
    if (payload.state === 'error' && (payload.error?.status === 401 || payload.error?.status === 403)) clearAccess('La API rechazó la clave de control. Introdúcela nuevamente.');
    updateControlAvailability();
    if (payload.state === 'starting') notifications.show('Iniciando DEMO', 'La solicitud fue enviada al backend. El navegador no reproduce la secuencia.', 'warning');
    if (payload.state === 'accepted') notifications.show('DEMO aceptada', 'FastAPI aceptó la ejecución. Esperando eventos de avance por WSS.', 'success');
    if (payload.state === 'uncertain') notifications.show('Resultado incierto de DEMO', 'No repitas el inicio. El servidor podría haber aceptado la solicitud; utiliza Cancelar DEMO activa para intentar detenerla.', 'warning');
    if (payload.state === 'step') notifications.show('Movimiento de DEMO recibido', `${payload.message.comando} · paso ${payload.currentOrder} de ${payload.total || '?'}.`, 'neutral');
    if (payload.state === 'finished') notifications.show('DEMO finalizada', 'El servidor notificó demo_fin.', 'success');
    if (payload.state === 'cancelled') {
      controlsView?.setStopState('accepted');
      notifications.show('DEMO cancelada', 'El servidor confirmó la cancelación.', 'warning');
    }
    if (payload.state === 'error') notifications.show('Error en DEMO', payload.message?.mensaje || friendlyError(payload.error), 'error');
  },
});

demoView = new DemoView({
  onSelect: (id) => { demoController.select(id); updateControlAvailability(); },
  onStart: async () => {
    if (joystickController.currentDirection !== 'neutral' || dispatcher.isBusy()) {
      notifications.show('Control ocupado', 'Suelta el joystick y espera a que termine la orden pendiente antes de iniciar una DEMO.', 'warning');
      return;
    }
    try { await demoController.start(); }
    catch (error) {
      notifications.show('No se pudo iniciar la DEMO', friendlyError(error), 'error');
    }
  },
  onCancel: async () => {
    const demoWasAlreadyActive = demoController.isActive();
    const manualControlNeedsStop = !demoWasAlreadyActive && (joystickController.currentDirection !== 'neutral' || dispatcher.isBusy());
    if (manualControlNeedsStop) {
      joystickView.forceNeutral({ sendStop: false });
      try { await dispatcher.stop(); }
      catch (error) { notifications.show('No se pudo detener el movimiento manual', friendlyError(error), 'error'); return; }
    }
    try { await demoController.cancel(); }
    catch (error) { notifications.show('No se pudo cancelar la DEMO', friendlyError(error), 'error'); }
  },
});

function handleWebSocketMessage(message) {
  if (!message || typeof message.tipo !== 'string') return;
  demoController.handleEvent(message);
  if (message.tipo === 'estado_inicial') {
    dashboardView.setPhysicalState();
    if (message.comando) notifications.show('Estado inicial recibido', `Último comando registrado: ${message.comando}.`, 'neutral');
  } else if (message.tipo === 'movimiento') {
    notifications.show('Evento de movimiento recibido', `${message.comando || 'Comando'} · código ${message.codigo ?? '—'} · vehículo ${message.id_vehiculo}. Notificación WSS recibida; no confirma ejecución física.`, 'success');
  } else if (message.tipo === 'error') {
    notifications.show('Error reportado por WSS', message.mensaje || 'El servidor reportó un error.', 'error');
  }
}

async function clearAccess(message = 'Clave eliminada de la memoria de esta pestaña.', { stopFirst = false } = {}) {
  if (stopFirst && http.hasApiKey() && vehicleActive && (stopCommand || demoController?.isActive())) {
    joystickView?.forceNeutral({ sendStop: false });
    try { await dispatcher.stop(); } catch { /* Se informa al usuario al intentar detener; no se conserva la clave por ello. */ }
  }
  http.clearApiKey();
  $('#api-key-input').value = '';
  $('#auth-feedback').dataset.state = 'error';
  setText($('#auth-feedback'), message);
  $('#auth-clear').hidden = true;
  updateControlAvailability();
}

function bindAuthentication() {
  $('#auth-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const value = $('#api-key-input').value.trim();
    if (!value) {
      $('#auth-feedback').dataset.state = 'error';
      setText($('#auth-feedback'), 'Escribe la clave de control. No se enviará ni almacenará vacía.');
      return;
    }
    http.setApiKey(value);
    $('#auth-feedback').dataset.state = 'ready';
    setText($('#auth-feedback'), 'Clave cargada en memoria. El backend la validará al enviar la primera operación protegida.');
    $('#auth-clear').hidden = false;
    notifications.show('Clave cargada', 'La clave permanece solo en memoria y se enviará en X-API-Key al ejecutar operaciones.', 'success');
    updateControlAvailability();
  });
  $('#auth-clear').addEventListener('click', () => clearAccess(undefined, { stopFirst: true }));
}

async function loadInitialData() {
  const results = await Promise.allSettled([
    vehicleApi.getVehicle(),
    commandApi.getCommands(),
    demoController.load(),
  ]);
  const [vehicleResult, commandsResult, demosResult] = results;

  if (vehicleResult.status === 'fulfilled') {
    const vehicle = vehicleResult.value;
    vehicleActive = vehicle.activo === true;
    dashboardView.renderVehicle(vehicle);
  } else {
    dashboardView.showGlobalAlert(`No se pudo consultar el vehículo: ${friendlyError(vehicleResult.reason)}`);
    setText($('#vehicle-name'), 'Vehículo no disponible');
  }

  if (commandsResult.status === 'fulfilled') {
    const received = expectArray(commandsResult.value, 'comandos');
    const valid = received.filter(validateCommand);
    const catalog = activeCommands(valid);
    directionCommands = resolveDirections(catalog);
    stopCommand = findStopCommand(catalog);
    dispatcher.setStopCommand(stopCommand);
    joystickController.setCatalog(directionCommands);
    joystickView.renderAvailability(directionCommands);
    controlsView.render(getSecondaryCommands(catalog));
    if (!stopCommand) {
      controlsView.setStopEnabled(false, 'El catálogo activo no contiene DETENER. No se puede enviar una orden de parada inexistente.');
      notifications.show('Falta comando DETENER', 'El catálogo real no contiene un comando DETENER activo. El botón permanecerá deshabilitado.', 'warning');
    }
  } else {
    controlsView.render([]);
    joystickView.renderAvailability({});
    notifications.show('No se pudo cargar el catálogo', friendlyError(commandsResult.reason), 'error');
  }

  if (demosResult.status === 'fulfilled') {
    demoView.renderDemos(demoController.demos);
    demoView.setSelected(demoController.selectedId);
    demoView.renderState({ state: 'idle' });
  } else {
    demoView.renderDemos([]);
    notifications.show('No se pudieron cargar las DEMO', friendlyError(demosResult.reason), 'error');
  }
  updateControlAvailability();
}

function bindEmergencyEvents() {
  // Si la pestaña se oculta o pierde foco, neutraliza el joystick y solicita detener.
  window.addEventListener('pagehide', () => joystickController.setDirection('neutral'));
  window.addEventListener('blur', () => joystickController.setDirection('neutral'));
}

async function init() {
  bindAuthentication();
  bindEmergencyEvents();
  connectivityController.start();
  await loadInitialData();
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    notifications.show('Origen no seguro', 'La publicación debe utilizar HTTPS para conectarse a WSS y evitar contenido mixto.', 'error');
  }
  if (location.protocol === 'https:' && !APP_CONFIG.API_BASE_URL.startsWith('https://')) {
    notifications.show('Configuración HTTPS requerida', 'La API debe usar HTTPS desde esta página GitHub Pages.', 'error');
  }
}

init().catch((error) => {
  dashboardView.showGlobalAlert(`Error al iniciar la interfaz: ${friendlyError(error)}`);
  notifications.show('No se pudo iniciar la aplicación', friendlyError(error), 'error');
});
