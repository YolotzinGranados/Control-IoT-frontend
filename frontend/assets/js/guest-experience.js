import { APP_CONFIG } from './config/app-config.js';

import { HttpClient, getAccessToken } from './api/http-client.js';

import { WebSocketClient } from './websocket/websocket-client.js';

const http = new HttpClient(

  APP_CONFIG.API_BASE_URL,

  APP_CONFIG.REQUEST_TIMEOUT_MS,

);

function escapeHTML(value) {

  return String(value ?? '').replace(/[&<>"']/g, (char) => ({

    '&': '&amp;',

    '<': '&lt;',

    '>': '&gt;',

    '"': '&quot;',

    "'": '&#39;',

  })[char]);

}

function vehicleSocketUrl(id) {

  return new URL(String(id), APP_CONFIG.WS_VEHICLES_URL).href;

}

export class GuestExperience {

  constructor(root) {

    this.root = root;

    this.catalog = [];

    this.socket = null;

    this.socketVehicleId = null;

    this.socketOnline = false;

    this.running = false;

    this.finishedEventReceived = false;

    this.currentDemo = null;

    this.currentOrder = 0;

    this.total = 0;

    this.connectionPromise = null;

    this.connectionResolve = null;

    this.connectionReject = null;

    this.connectionTimeout = null;

    this.grid = this.root.querySelector('#guest-catalog-grid');

    this.feedback = this.root.querySelector('#guest-feedback');

    this.progressPanel = this.root.querySelector('#guest-demo-panel');

    this.progressBar = this.root.querySelector('#guest-progress-bar');

    this.progressLabel = this.root.querySelector('#guest-progress-label');

    this.progressText = this.root.querySelector('#guest-progress-text');

    this.progressDetail = this.root.querySelector('#guest-progress-detail');

    this.connectionLabel = this.root.querySelector('#guest-ws-status');

    this.grid?.addEventListener('click', (event) => this.handleGridClick(event));

    this.root.querySelector('#guest-refresh')?.addEventListener('click', () => this.loadCatalog());

  }

  async mount() {

    await this.loadCatalog();

  }

  destroy() {

    this.socket?.stop();

    this.socket = null;

    this.socketVehicleId = null;

    this.socketOnline = false;

    window.clearTimeout(this.connectionTimeout);

    this.connectionTimeout = null;

    this.connectionReject?.(new Error('La experiencia de invitado se cerró.'));

    this.connectionResolve = null;

    this.connectionReject = null;

  }

  setFeedback(message, tone = 'neutral') {

    if (!this.feedback) return;

    this.feedback.textContent = message;

    this.feedback.dataset.tone = tone;

  }

  async loadCatalog() {

    const refreshButton = this.root.querySelector('#guest-refresh');

    if (refreshButton) refreshButton.disabled = true;

    this.setFeedback('Consultando vehículos habilitados para exhibición…');

    this.grid.innerHTML = `

      <div class="guest-empty-state">

        <span class="guest-loader" aria-hidden="true"></span>

        <p>Cargando catálogo de exhibición…</p>

      </div>

    `;

    try {

      const data = await http.get('/invitado/catalogo');

      if (!Array.isArray(data)) {

        throw new Error('La API no devolvió un catálogo válido.');

      }

      this.catalog = data;

      this.renderCatalog();

      this.setFeedback(

        data.length

          ? `${data.length} vehículo(s) disponible(s) para demostración.`

          : 'No hay vehículos con DEMOs listas para exhibición.',

        data.length ? 'success' : 'warning',

      );

    } catch (error) {

      this.catalog = [];

      this.grid.innerHTML = `

        <div class="guest-empty-state guest-empty-error">

          <i class="bi bi-exclamation-triangle" aria-hidden="true"></i>

          <h3>No se pudo cargar el catálogo</h3>

          <p>${escapeHTML(error.message || 'Error de conexión con la API.')}</p>

          <button class="auth-secondary" type="button" id="guest-retry">Intentar nuevamente</button>

        </div>

      `;

      this.grid.querySelector('#guest-retry')?.addEventListener('click', () => this.loadCatalog());

      this.setFeedback('Comprueba la conexión HTTPS con el servidor.', 'error');

    } finally {

      if (refreshButton) refreshButton.disabled = false;

    }

  }

  renderCatalog() {

    if (!this.catalog.length) {

      this.grid.innerHTML = `

        <div class="guest-empty-state">

          <i class="bi bi-car-front" aria-hidden="true"></i>

          <h3>No hay demostraciones disponibles</h3>

          <p>Administración debe habilitar un vehículo para exhibición y contar con al menos una DEMO activa que tenga movimientos configurados.</p>

        </div>

      `;

      return;

    }

    this.grid.innerHTML = this.catalog.map((vehicle) => {

      const demos = Array.isArray(vehicle.demos) ? vehicle.demos : [];

      const demoMarkup = demos.length

        ? demos.map((demo) => `

            <div class="guest-demo-row">

              <div class="guest-demo-copy">

                <strong>${escapeHTML(demo.nombre)}</strong>

                <span>${escapeHTML(demo.descripcion || 'Secuencia automática de exhibición')}</span>

              </div>

              <button

                class="guest-demo-button"

                type="button"

                data-guest-demo

                data-vehicle-id="${Number(vehicle.id_vehiculo)}"

                data-demo-id="${Number(demo.id_demo)}"

                ${this.running ? 'disabled' : ''}

              >

                <i class="bi bi-play-fill" aria-hidden="true"></i>

                <span>Iniciar DEMO</span>

              </button>

            </div>

          `).join('')

        : '<p class="guest-no-demos">Este vehículo todavía no tiene demostraciones activas.</p>';

      return `

        <article class="guest-vehicle-card">

          <div class="guest-vehicle-art" aria-hidden="true">

            <i class="bi bi-truck-front-fill"></i>

            <span>YOLO · IoT</span>

          </div>

          <div class="guest-vehicle-body">

            <div class="guest-vehicle-heading">

              <div>

                <p class="guest-overline">VEHÍCULO DE EXHIBICIÓN · #${Number(vehicle.id_vehiculo)}</p>

                <h3>${escapeHTML(vehicle.nombre)}</h3>

              </div>

              <span class="guest-available"><i></i> Disponible</span>

            </div>

            <p class="guest-vehicle-model">${escapeHTML(vehicle.modelo || 'Modelo no especificado')}</p>

            <p class="guest-vehicle-description">${escapeHTML(vehicle.descripcion || 'Vehículo IoT de demostración.')}</p>

            <div class="guest-specs">

              <span><i class="bi bi-cpu"></i> ${escapeHTML(vehicle.microcontrolador || 'Microcontrolador no especificado')}</span>

              <span><i class="bi bi-broadcast"></i> Monitoreo WSS</span>

            </div>

            <div class="guest-demo-list">

              <div class="guest-demo-list-heading">

                <strong>Demostraciones disponibles</strong>

                <span>${demos.length}</span>

              </div>

              ${demoMarkup}

            </div>

          </div>

        </article>

      `;

    }).join('');

  }

  async handleGridClick(event) {

    const button = event.target.closest('[data-guest-demo]');

    if (!button || button.disabled || this.running) return;

    const vehicleId = Number(button.dataset.vehicleId);

    const demoId = Number(button.dataset.demoId);

    const vehicle = this.catalog.find((item) => Number(item.id_vehiculo) === vehicleId);

    const demo = vehicle?.demos?.find((item) => Number(item.id_demo) === demoId);

    if (!vehicle || !demo) return;

    await this.startDemo(vehicle, demo, button);

  }

  async connectToVehicle(vehicleId) {

    if (this.socket && this.socketVehicleId === vehicleId && this.socketOnline) {

      if (this.connectionLabel) this.connectionLabel.textContent = 'Conectado';

      return;

    }

    this.socket?.stop();

    this.socketOnline = false;

    this.socket = null;

    this.socketVehicleId = vehicleId;
this.connectionPromise = new Promise((resolve, reject) => {

      this.connectionResolve = resolve;

      this.connectionReject = reject;

      this.connectionTimeout = window.setTimeout(() => {

        this.connectionReject?.(new Error('No se pudo establecer la conexión WSS.'));

      }, 10000);

      this.socket = new WebSocketClient(vehicleSocketUrl(vehicleId), {
        getProtocols: () => {
          const token = getAccessToken();
          return token ? ['bearer', token] : [];
        },
        reconnectBaseMs: APP_CONFIG.WS_RECONNECT_BASE_MS,

        reconnectMaxMs: APP_CONFIG.WS_RECONNECT_MAX_MS,

        pingIntervalMs: APP_CONFIG.WS_PING_INTERVAL_MS,

        pongTimeoutMs: APP_CONFIG.WS_PONG_TIMEOUT_MS,

        onState: (state) => {

          if (this.connectionLabel) {

            this.connectionLabel.textContent = ({

              connecting: 'Conectando…',

              reconnecting: 'Reconectando…',

              online: 'Conectado',

              offline: 'Desconectado',

            })[state] || state;

          }

          this.socketOnline = state === 'online';

          if (state === 'online') {

            window.clearTimeout(this.connectionTimeout);

            this.connectionResolve?.();

            this.connectionResolve = null;

            this.connectionReject = null;

          }

        },

        onError: (error) => {

          if (this.connectionReject) {

            window.clearTimeout(this.connectionTimeout);

            this.connectionReject(error instanceof Error ? error : new Error('Error de conexión WSS.'));

            this.connectionResolve = null;

            this.connectionReject = null;

          }

        },

        onMessage: (message) => this.handleSocketMessage(message),

      });

      this.socket.start();

    });

    try {

      await this.connectionPromise;

    } catch (error) {

      this.socket?.stop();

      this.socket = null;

      this.socketVehicleId = null;

      this.socketOnline = false;

      throw error;

    } finally {

      this.connectionPromise = null;

    }

  }

  async startDemo(vehicle, demo, button) {

    this.running = true;

    this.currentDemo = { vehicle, demo };

    this.currentOrder = 0;

    this.total = 0;

    this.finishedEventReceived = false;

    this.progressPanel.hidden = false;

    this.updateProgress(0, 'Preparando demostración', 'Conectando al canal seguro del vehículo…');

    this.setButtonsDisabled(true);

    button?.classList.add('is-loading');

    try {

      await this.connectToVehicle(Number(vehicle.id_vehiculo));

      this.updateProgress(0, 'Iniciando demostración', 'Solicitando al servidor la ejecución temporal…');

      const result = await http.post(

        `/invitado/vehiculos/${Number(vehicle.id_vehiculo)}/demos/${Number(demo.id_demo)}/iniciar`,

        undefined,

        { timeoutMs: 12000 },

      );

      this.total = Number(result.total_movimientos) || this.total;

      if (!this.finishedEventReceived) {

        this.updateProgress(

          this.currentOrder,

          'DEMO aceptada',

          `${result.demo || demo.nombre} · esperando eventos de avance por WSS.`,

        );

      }

      this.setFeedback('La demostración fue aceptada por FastAPI. El avance se actualizará en tiempo real.', 'success');

    } catch (error) {

      this.running = false;

      this.currentDemo = null;

      this.setButtonsDisabled(false);

      this.updateProgress(0, 'No se pudo iniciar la DEMO', error.message || 'Error al iniciar la demostración.');

      this.setFeedback(error.message || 'No se pudo iniciar la demostración.', 'error');

    } finally {

      button?.classList.remove('is-loading');

    }

  }

  setButtonsDisabled(disabled) {

    this.grid.querySelectorAll('[data-guest-demo]').forEach((button) => {

      button.disabled = disabled;

    });

  }

  handleSocketMessage(message) {

    if (!message || Number(message.id_vehiculo) !== Number(this.socketVehicleId)) return;

    if (message.tipo === 'estado_inicial') {

      this.setFeedback('Canal WSS conectado. El servidor entregó el estado inicial del vehículo.', 'success');

      return;

    }

    if (message.tipo === 'demo_inicio') {

      this.running = true;

      this.total = Number(message.total_movimientos) || this.total;

      this.currentOrder = 0;

      this.updateProgress(0, 'Demostración en ejecución', `${message.demo || 'DEMO'} · secuencia recibida desde el servidor.`);

      return;

    }

    if (message.tipo === 'demo_movimiento') {

      this.running = true;

      this.currentOrder = Number(message.orden) || this.currentOrder;

      this.total = Number(message.total_movimientos) || this.total;

      this.updateProgress(

        this.currentOrder,

        `Movimiento ${this.currentOrder} de ${this.total || '?'}`,

        `${message.comando || 'Movimiento'} · duración ${Number(message.duracion_ms) || 0} ms. El evento WSS no confirma por sí solo la ejecución física.`,

      );

      return;

    }

    if (message.tipo === 'demo_fin') {

      this.finishedEventReceived = true;

      this.running = false;

      this.updateProgress(this.total || this.currentOrder, 'Demostración finalizada', 'El servidor notificó demo_fin. La secuencia terminó según el backend.');

      this.setButtonsDisabled(false);

      this.setFeedback('La demostración terminó correctamente en el servidor.', 'success');

      return;

    }

    if (message.tipo === 'demo_cancelada') {

      this.finishedEventReceived = true;

      this.running = false;

      this.updateProgress(

        this.currentOrder,

        'Demostración cancelada',

        message.accion

          ? `La demostración fue cancelada. Acción de seguridad: ${message.accion}.`

          : 'La demostración fue cancelada desde el servidor.',

      );

      this.setButtonsDisabled(false);

      this.setFeedback('La demostración fue cancelada desde el servidor.', 'warning');

      return;

    }

    if (message.tipo === 'demo_error' || message.tipo === 'error') {

      this.finishedEventReceived = true;

      this.running = false;

      this.updateProgress(this.currentOrder, 'Demostración detenida', message.mensaje || 'El servidor reportó un error durante la DEMO.');

      this.setButtonsDisabled(false);

      this.setFeedback(message.mensaje || 'La demostración se detuvo por un error.', 'error');

    }

  }

  updateProgress(order, label, detail) {

    const percent = this.total > 0

      ? Math.min(100, Math.round((Number(order) / this.total) * 100))

      : 0;

    if (this.progressBar) this.progressBar.style.width = `${percent}%`;

    const progress = this.progressBar?.parentElement;

    progress?.setAttribute('aria-valuenow', String(percent));

    if (this.progressLabel) this.progressLabel.textContent = label;

    if (this.progressText) {

      this.progressText.textContent = this.total > 0

        ? `${Number(order) || 0} / ${this.total} movimientos · ${percent}%`

        : 'Esperando secuencia';

    }

    if (this.progressDetail) this.progressDetail.textContent = detail;

  }

}
