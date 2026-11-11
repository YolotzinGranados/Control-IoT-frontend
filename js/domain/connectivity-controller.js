export class ConnectivityController {
  constructor({ healthApi, websocketClient, onState = () => {}, intervalMs = 30000 }) {
    this.healthApi = healthApi;
    this.websocketClient = websocketClient;
    this.onState = onState;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.state = { websocket: 'checking', api: 'checking', rds: 'unknown' };
  }

  start() {
    this.websocketClient.start();
    this.checkHealth();
    this.timer = window.setInterval(() => this.checkHealth(), this.intervalMs);
  }

  stop() {
    window.clearInterval(this.timer);
    this.websocketClient.stop();
  }

  setWebSocketState(value) {
    this.state.websocket = value;
    this.#publish();
  }

  async checkHealth() {
    this.state.api = 'checking';
    this.#publish();
    try {
      const result = await this.healthApi.check();
      this.state.api = result.status >= 500 && result.status !== 503 ? 'offline' : 'online';
      if (result.status === 200 && result.data?.estado === 'ok' && result.data?.base_datos === 'conectada') {
        this.state.rds = 'online';
        this.state.healthMessage = 'API respondió y /health confirmó la conexión a RDS.';
      } else if (result.status === 503) {
        this.state.api = 'online';
        this.state.rds = 'offline';
        this.state.healthMessage = 'FastAPI respondió, pero /health informó que la base de datos no está disponible.';
      } else {
        this.state.rds = 'unknown';
        this.state.healthMessage = result.status >= 500 ? 'FastAPI respondió con un error interno; RDS no se pudo verificar.' : 'FastAPI respondió, pero la respuesta no permite verificar RDS.';
      }
    } catch (error) {
      this.state.api = 'offline';
      this.state.rds = 'unknown';
      this.state.healthMessage = error.message;
    }
    this.#publish();
  }

  #publish() { this.onState({ ...this.state }); }
}
