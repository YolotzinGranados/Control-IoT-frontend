import { AppError } from './errors.js';

export function expectArray(value, label) {
  if (!Array.isArray(value)) throw new AppError(`La API devolvió un formato inesperado al consultar ${label}.`, { code: 'INVALID_RESPONSE' });
  return value;
}

export function validateVehicle(value) {
  if (!value || typeof value !== 'object' || !Number.isInteger(Number(value.id_vehiculo)) || typeof value.nombre !== 'string') {
    throw new AppError('La respuesta del vehículo no contiene id_vehiculo y nombre válidos.', { code: 'INVALID_VEHICLE' });
  }
  return value;
}

export function validateCommand(value) {
  return value && Number.isInteger(Number(value.id_comando)) && Number.isInteger(Number(value.codigo))
    && typeof value.nombre === 'string' && typeof value.activo === 'boolean';
}

export function validateDemo(value) {
  return value && Number.isInteger(Number(value.id_demo)) && typeof value.nombre === 'string' && typeof value.activo === 'boolean';
}

export function validateMovementResponse(value) {
  if (!value || typeof value !== 'object' || !Number.isInteger(Number(value.id_comando)) || typeof value.comando !== 'string') {
    throw new AppError('La API no devolvió la confirmación esperada del movimiento.', { code: 'INVALID_MOVEMENT_RESPONSE' });
  }
  return value;
}
