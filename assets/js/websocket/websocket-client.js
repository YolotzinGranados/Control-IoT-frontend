export class WebSocketClient {
  constructor(url, { onState = () => {}, onMessage = () => {}, onError = () => {}, reconnectBaseMs = 1200, reconnectMaxMs = 30000, pingIntervalMs = 20000, pongTimeoutMs = 50000 } = {}) {
    this.url = url;
    this.onState = onState;
    this.onMessage = onMessage;
    this.onError = onError;
    this.reconnectBaseMs = reconnectBaseMs;
    this.reconnectMaxMs = reconnectMaxMs;
    this.pingIntervalMs = pingIntervalMs;
    this.pongTimeoutMs = pongTimeoutMs;
    this.socket = null;
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.attempt = 0;
    this.started = false;
    this.lastPongAt = 0;
    this.connectionId = 0;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.#connect();
  }

  stop() {
  this.started = false;
  this.connectionId += 1;
  this.attempt = 0;

  window.clearTimeout(this.reconnectTimer);
  window.clearInterval(this.pingTimer);

  this.reconnectTimer = null;
  this.pingTimer = null;

  const socket = this.socket;
  this.socket = null;

  if (socket && socket.readyState < WebSocket.CLOSING) {
    socket.close(1000, 'Cierre solicitado por la aplicación');
  }

  this.onState('offline');
}

  send(value) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(value);
    return true;
  }

  #connect() {
    if (!this.started) return;
    const currentId = ++this.connectionId;
    this.onState(this.attempt === 0 ? 'connecting' : 'reconnecting');
    let socket;
    try { socket = new WebSocket(this.url); }
    catch (error) {
      this.onError(error);
      this.onState('reconnecting');
      this.#scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.addEventListener('open', () => {
      if (currentId !== this.connectionId) return;
      this.attempt = 0;
      this.lastPongAt = Date.now();
      this.onState('online');
      this.#startHeartbeat(currentId);
    });

    socket.addEventListener('message', (event) => {
      if (currentId !== this.connectionId) return;
      let message;
      try { message = JSON.parse(event.data); }
      catch {
        this.onError(new Error('El WebSocket recibió un mensaje que no es JSON válido.'));
        return;
      }
      if (message?.tipo === 'pong') this.lastPongAt = Date.now();
      this.onMessage(message);
    });

    socket.addEventListener('error', (event) => {
      if (currentId !== this.connectionId) return;
      this.onError(event);
      if (socket.readyState < WebSocket.CLOSING) socket.close();
    });

    socket.addEventListener('close', () => {
      if (currentId !== this.connectionId) return;
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
      this.socket = null;
      if (!this.started) { this.onState('offline'); return; }
      this.onState('reconnecting');
      this.#scheduleReconnect();
    });
  }

  #startHeartbeat(currentId) {
    window.clearInterval(this.pingTimer);
    this.pingTimer = window.setInterval(() => {
      if (currentId !== this.connectionId || this.socket?.readyState !== WebSocket.OPEN) return;
      if (Date.now() - this.lastPongAt > this.pongTimeoutMs) {
        this.onError(new Error('No se recibió pong dentro del tiempo esperado.'));
        this.socket.close(4000, 'Tiempo de espera del heartbeat agotado');
        return;
      }
      this.socket.send('ping');
    }, this.pingIntervalMs);
  }

  #scheduleReconnect() {
    if (!this.started || this.reconnectTimer) return;
    const delay = Math.min(this.reconnectBaseMs * (2 ** Math.min(this.attempt, 6)), this.reconnectMaxMs);
    this.attempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.#connect();
    }, delay);
  }
}
