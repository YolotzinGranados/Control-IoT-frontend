
import { AppError } from '../utils/errors.js';

let accessToken = null;

export function setAccessToken(token) {
  accessToken = token || null;
}

export function clearAccessToken() {
  accessToken = null;
}

export function getAccessToken() {
  return accessToken;
}

export class HttpClient {
  #baseUrl;

  constructor(baseUrl, timeoutMs = 12000) {
    this.#baseUrl = String(baseUrl).replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
  }

  async request(path, {
    method = 'GET',
    body,
    timeoutMs = this.timeoutMs,
    allowHttpErrors = false,
  } = {}) {
    const normalizedMethod = String(method).toUpperCase();

    if (!['GET', 'POST'].includes(normalizedMethod)) {
      throw new AppError(
        `Método HTTP no permitido: ${normalizedMethod}`,
        { code: 'METHOD_NOT_ALLOWED' }
      );
    }

    const controller = new AbortController();

    const timeoutId = window.setTimeout(
      () => controller.abort(),
      timeoutMs
    );

    const headers = new Headers({
      Accept: 'application/json',
    });

    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    if (body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }

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
        try {
          data = JSON.parse(raw);
        } catch (cause) {
          throw new AppError(
            'El servidor respondió con JSON inválido.',
            {
              code: 'INVALID_JSON',
              status: response.status,
              cause,
            }
          );
        }
      }

      const result = {
        ok: response.ok,
        status: response.status,
        data,
      };

      if (!response.ok && !allowHttpErrors) {
        const detail = data?.error?.mensaje
          || data?.detail
          || data?.mensaje
          || `Error HTTP ${response.status}`;

        throw new AppError(String(detail), {
          code: data?.error?.codigo || `HTTP_${response.status}`,
          status: response.status,
        });
      }

      return result;
    } catch (error) {
      if (error instanceof AppError) throw error;

      if (error?.name === 'AbortError') {
        throw new AppError('Tiempo de espera agotado.', {
          code: 'REQUEST_TIMEOUT',
          cause: error,
        });
      }

      throw new AppError(
        'No se pudo conectar con la API. Comprueba HTTPS y CORS.',
        {
          code: 'NETWORK_OR_CORS',
          cause: error,
        }
      );
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async get(path, options = {}) {
    const result = await this.request(path, {
      ...options,
      method: 'GET',
    });
    return result.data;
  }

  async getResult(path, options = {}) {
    return this.request(path, {
      ...options,
      method: 'GET',
      allowHttpErrors: true,
    });
  }

  async post(path, body, options = {}) {
    const result = await this.request(path, {
      ...options,
      method: 'POST',
      body,
    });
    return result.data;
  }
}
