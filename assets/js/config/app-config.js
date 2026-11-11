/*
 * Configuración pública del frontend.
 * No colocar aquí X-API-Key, contraseñas, llaves privadas ni datos de RDS.
 * API_BASE_URL asume que FastAPI sirve HTTPS en el mismo host y puerto del WSS.
 */
export const APP_CONFIG = Object.freeze({
  API_BASE_URL: 'https://44.196.22.143:8000',
  VEHICLE_ID: 1,
  WS_URL: 'wss://44.196.22.143:8000/ws/vehiculos/1',
  HEALTH_PATH: '/health',
  REQUEST_TIMEOUT_MS: 12000,
  HEALTH_INTERVAL_MS: 30000,
  WS_RECONNECT_BASE_MS: 1200,
  WS_RECONNECT_MAX_MS: 30000,
  WS_PING_INTERVAL_MS: 20000,
  WS_PONG_TIMEOUT_MS: 50000,
  MOVEMENT_ORIGIN: 'WEB',
});
