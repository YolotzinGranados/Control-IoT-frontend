import { AppError } from '../utils/errors.js';

export class HttpClient {
  #baseUrl;
  #apiKey = '';

  constructor(baseUrl, timeoutMs = 12000) {
    this.#baseUrl = String(baseUrl).replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
  }

  setApiKey(value) { this.#apiKey = String(value || '').trim(); }
  clearApiKey() { this.#apiKey = ''; }
  hasApiKey() { return this.#apiKey.length > 0; }

  async request(path, { method = 'GET', body, auth = false, timeoutMs = this.timeoutMs, allowHttpErrors = false } = {}) {
    const normalizedMethod = String(method).toUpperCase();
    if (!['GET', 'POST'].includes(normalizedMethod)) {
      throw new AppError(`Método HTTP no permitido por este cliente: ${normalizedMethod}`, { code: 'METHOD_NOT_ALLOWED' });
    }
    if (auth && !this.hasApiKey()) throw new AppError('Introduce la clave de control antes de enviar operaciones.', { code: 'MISSING_API_KEY' });

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    const headers = new Headers({ Accept: 'application/json' });
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    if (auth) headers.set('X-API-Key', this.#apiKey);

    try {
      const response = await fetch(`${this.#baseUrl}${path}`, {
        method: normalizedMethod,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        cache: 'no-store',
        mode: 'cors',
        credentials: 'omit',
        redirect: 'error',
      });
      const raw = await response.text();
      let data = null;
      if (raw) {
        try { data = JSON.parse(raw); }
        catch (cause) { throw new AppError('El servidor respondió con contenido que no es JSON válido.', { code: 'INVALID_JSON', status: response.status, cause }); }
      }
      const result = { ok: response.ok, status: response.status, data };
      if (!response.ok && !allowHttpErrors) {
        const detail = data?.error?.mensaje || data?.detail || data?.mensaje || `El servidor respondió HTTP ${response.status}.`;
        const code = data?.error?.codigo || `HTTP_${response.status}`;
        throw new AppError(String(detail), { code, status: response.status });
      }
      return result;
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error?.name === 'AbortError') throw new AppError(`Tiempo de espera agotado (${timeoutMs} ms). La operación podría haber llegado al servidor; no la repitas automáticamente.`, { code: 'REQUEST_TIMEOUT', cause: error });
      if (error instanceof TypeError) throw new AppError('No se pudo completar la conexión HTTPS. Revisa certificado OpenSSL confiable, CORS y disponibilidad de AWS.', { code: 'NETWORK_OR_CORS', cause: error });
      throw new AppError('No se pudo completar la solicitud.', { code: 'REQUEST_FAILED', cause: error });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async get(path, options = {}) {
    const result = await this.request(path, { ...options, method: 'GET' });
    return result.data;
  }

  async getResult(path, options = {}) {
    return this.request(path, { ...options, method: 'GET', allowHttpErrors: true });
  }

  async post(path, body, options = {}) {
    const result = await this.request(path, { ...options, method: 'POST', body });
    return result.data;
  }
}
