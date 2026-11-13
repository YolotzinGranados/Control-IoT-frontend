import { $, setText } from '../utils/dom.js';

export function dateParts(value) {
  if (!value) {
    return ['—', '—'];
  }

  const raw = String(value);

  // Conserva las fechas de MySQL que no incluyen zona horaria.
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
    date.toLocaleDateString('es-MX'),
    date.toLocaleTimeString('es-MX', {
      hour12: false,
    }),
  ];
}

export class MonitorView {
  constructor({ http, vehicleId }) {
    this.http = http;
    this.vehicleId = vehicleId;
    this.generation = 0;
    this.busy = false;
    this.pending = false;
    this.eventVersion = 0;
  }

  setVehicle(id) {
    this.vehicleId = id;
    this.generation++;
    this.busy = false;
    this.pending = false;

    this.renderLatest({});
    this.renderHistory([]);
    this.refresh();
  }

  renderLatest(state) {
    const icons = {
      AVANZAR: '↑',
      RETROCEDER: '↓',
      IZQUIERDA: '←',
      DERECHA: '→',
      SUBIR_PALA: '↥',
      BAJAR_PALA: '↧',
      PALA_IZQUIERDA: '↤',
      PALA_DERECHA: '↦',
      DETENER: '■',
      LUCES: '☀',
    };

    setText(
      $('#monitor-command'),
      state.comando || 'Sin movimientos'
    );

    setText(
      $('#monitor-symbol'),
      state.comando
        ? icons[state.comando] || '●'
        : '—'
    );

    const [date, time] = dateParts(
      state.fecha_actualizacion || state.marca_temporal
    );

    setText($('#monitor-date'), `Fecha: ${date}`);
    setText($('#monitor-time'), `Hora: ${time}`);
  }

  renderHistory(rows) {
    const body = $('#monitor-history');
    body.replaceChildren();

    rows.slice(0, 10).forEach((row, index) => {
      const tr = document.createElement('tr');

      const values = [
        index + 1,
        row.comando || 'Comando eliminado',
        ...dateParts(row.fecha_hora),
      ];

      for (const value of values) {
        const td = document.createElement('td');
        td.textContent = value;
        tr.append(td);
      }

      body.append(tr);
    });

    if (!rows.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');

      td.colSpan = 4;
      td.textContent =
        'Este vehículo aún no tiene movimientos registrados.';

      tr.append(td);
      body.append(tr);
    }

    setText(
      $('#monitor-count'),
      `${Math.min(rows.length, 10)} / 10`
    );
  }

  handleEvent(message) {
    if (
      Number(message.id_vehiculo) !== Number(this.vehicleId)
    ) {
      return;
    }

    if (![
      'estado_inicial',
      'movimiento',
      'demo_movimiento',
      'demo_fin',
      'demo_cancelada',
    ].includes(message.tipo)) {
      return;
    }

    this.eventVersion++;

    if (message.comando) {
      this.renderLatest(message);
    }

    this.refresh();
  }

  async refresh() {
    if (this.busy) {
      this.pending = true;
      return;
    }

    const generation = this.generation;
    const version = this.eventVersion;
    const id = this.vehicleId;

    this.busy = true;

    $('#view-monitor').setAttribute('aria-busy', 'true');

    setText(
      $('#monitor-feedback'),
      `Consultando vehículo ${id}…`
    );

    const results = await Promise.allSettled([
      this.http.get(`/vehiculos/${id}/estado`),
      this.http.get(`/vehiculos/${id}/historial`),
    ]);

    // Descarta respuestas de un vehículo seleccionado anteriormente.
    if (generation !== this.generation) {
      return;
    }

    const [state, history] = results;
    let failed = false;

    if (
      state.status === 'fulfilled'
      && Number(state.value.id_vehiculo) === Number(id)
    ) {
      if (version === this.eventVersion) {
        this.renderLatest(state.value);
      }
    } else {
      failed = true;
    }

    if (
      history.status === 'fulfilled'
      && Number(history.value.id_vehiculo) === Number(id)
      && Array.isArray(history.value.movimientos)
    ) {
      this.renderHistory(history.value.movimientos);
    } else {
      failed = true;
    }

    setText(
      $('#monitor-feedback'),
      failed
        ? 'No se pudo actualizar toda la información. Los datos visibles pueden estar desactualizados. Pulsa Actualizar para reintentar.'
        : `Vehículo ${id} · Actualizado a las ${new Date().toLocaleTimeString('es-MX')} · Consulta completada.`
    );

    this.busy = false;

    $('#view-monitor').setAttribute('aria-busy', 'false');

    if (this.pending) {
      this.pending = false;
      this.refresh();
    }
  }
}