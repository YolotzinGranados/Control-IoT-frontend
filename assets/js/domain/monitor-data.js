const types = new Set([
  'estado_inicial',
  'movimiento',
  'demo_inicio',
  'demo_movimiento',
  'demo_fin',
  'demo_cancelada',
  'demo_error',
]);

export function validEvent(message, vehicleId) {
  if (
    !message
    || !types.has(message.tipo)
    || !Number.isSafeInteger(message.id_vehiculo)
    || message.id_vehiculo !== Number(vehicleId)
  ) {
    return false;
  }

  if (!Number.isFinite(Date.parse(message.marca_temporal))) {
    return false;
  }

  if (['movimiento', 'demo_movimiento'].includes(message.tipo)) {
    return typeof message.comando === 'string'
      && message.comando.length > 0
      && Number.isInteger(message.codigo);
  }

  return true;
}

export function normalizeHistory(data, vehicleId) {
  if (
    !data
    || data.id_vehiculo !== Number(vehicleId)
    || !Array.isArray(data.movimientos)
  ) {
    throw new Error('Respuesta de historial inválida');
  }

  const unique = new Map();

  for (const row of data.movimientos) {
    if (
      !Number.isSafeInteger(row.id_historial)
      || row.id_historial < 1
      || row.id_vehiculo !== Number(vehicleId)
      || !Number.isFinite(Date.parse(row.fecha_hora))
      || !(
        row.comando === null
        || typeof row.comando === 'string'
      )
    ) {
      throw new Error('Registro de historial inválido');
    }

    unique.set(row.id_historial, row);
  }

  return [...unique.values()]
    .sort((a, b) => {
      return Date.parse(b.fecha_hora) - Date.parse(a.fecha_hora)
        || b.id_historial - a.id_historial;
    })
    .slice(0, 10);
}