export function dateParts(value) {
  if (!value) {
    return ['—', '—'];
  }

  const raw = String(value);

  // No convierte fechas SQL cuya zona horaria no está indicada.
  const plain = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.\d+)?$/
  );

  if (plain) {
    return [
      `${plain[3]}/${plain[2]}/${plain[1]}`,
      plain[4],
    ];
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return ['—', '—'];
  }

  return [
    date.toLocaleDateString('es-MX', {
      timeZone: 'America/Mexico_City',
    }),
    date.toLocaleTimeString('es-MX', {
      hour12: false,
      timeZone: 'America/Mexico_City',
    }),
  ];
}