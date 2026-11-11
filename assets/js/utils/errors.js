export class AppError extends Error {
  constructor(message, { code = 'APP_ERROR', status = 0, cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}

export function friendlyError(error) {
  if (error instanceof AppError) return error.message;
  if (error?.name === 'AbortError') return 'La solicitud superó el tiempo de espera.';
  if (error instanceof TypeError) return 'No se pudo acceder al servidor. Verifica HTTPS, certificado de OpenSSL, CORS y conexión de red.';
  return error?.message || 'Ocurrió un error inesperado.';
}
