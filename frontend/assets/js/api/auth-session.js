import { clearAccessToken, setAccessToken } from './http-client.js';

let refreshInFlight = null;
let csrfTokenInMemory = null;

export function setCsrfToken(token) {
  csrfTokenInMemory = token || null;
}

export function clearCsrfToken() {
  csrfTokenInMemory = null;
}

export async function getCsrfToken(apiBaseUrl) {
  if (csrfTokenInMemory) return csrfTokenInMemory;

  const baseUrl = String(apiBaseUrl).replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/auth/csrf`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    mode: 'cors',
    credentials: 'include',
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.csrf_token) {
    throw new Error('No se pudo preparar la protección CSRF de la sesión.');
  }

  csrfTokenInMemory = data.csrf_token;
  return csrfTokenInMemory;
}

export async function refreshAccessToken(apiBaseUrl) {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const csrfToken = await getCsrfToken(apiBaseUrl);
    const baseUrl = String(apiBaseUrl).replace(/\/+$/, '');

    let response;
    try {
      response = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        mode: 'cors',
        credentials: 'include',
        cache: 'no-store',
      });
    } catch {
      throw new Error('No se pudo renovar la sesión. Comprueba la conexión con la API.');
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
      clearAccessToken();
      clearCsrfToken();
      throw new Error(
        data?.error?.mensaje
        || data?.detail
        || 'La sesión expiró. Inicia sesión nuevamente.'
      );
    }

    setAccessToken(data.access_token);
    setCsrfToken(data.csrf_token);
    return data;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}
