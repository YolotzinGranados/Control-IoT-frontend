const normalize = (value) => String(value || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[ -]+/g, '_');

// Alias tomados del firmware compartido del proyecto. Solo se activan si el
// nombre correspondiente existe como comando activo en el catálogo REST.
const DIRECTION_NAMES = Object.freeze({
  up: ['AVANZAR'],
  down: ['RETROCEDER'],
  left: ['IZQUIERDA', 'GIRAR_IZQUIERDA'],
  right: ['DERECHA', 'GIRAR_DERECHA'],
});

export function activeCommands(commands) {
  return (Array.isArray(commands) ? commands : []).filter((item) => item && item.activo === true && Number.isInteger(Number(item.id_comando)));
}

export function findStopCommand(commands) {
  return activeCommands(commands).find((item) => normalize(item.nombre) === 'DETENER') || null;
}

export function resolveDirections(commands) {
  const available = activeCommands(commands);
  const result = {};
  for (const [direction, names] of Object.entries(DIRECTION_NAMES)) {
    result[direction] = available.find((item) => names.includes(normalize(item.nombre))) || null;
  }
  return result;
}

export function getSecondaryCommands(commands) {
  const directions = new Set(Object.values(DIRECTION_NAMES).flat());
  return activeCommands(commands).filter((item) => !directions.has(normalize(item.nombre)) && normalize(item.nombre) !== 'DETENER');
}

export function displayCommandName(command) { return String(command?.nombre || 'Comando').replaceAll('_', ' '); }
export function normalizeCommandName(value) { return normalize(value); }
