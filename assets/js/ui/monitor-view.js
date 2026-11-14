import { $, setText } from '../utils/dom.js';
import { dateParts } from '../utils/monitor-date.js';

import {
  normalizeHistory,
  validEvent,
} from '../domain/monitor-data.js';

export { dateParts };

export class MonitorView {
  constructor({ http, vehicleId }) {
    this.http = http;
    this.vehicleId = vehicleId;

    this.generation = 0;
    this.busy = false;
    this.pending = false;
    this.eventVersion = 0;

    this.rows = new Map();
    this.seen = new Set();
    this.lastEventTime = -Infinity;

    const panel = document.createElement('article');
    panel.className = 'panel-card ws-event';

    const title = document.createElement('h3');
    title.textContent = 'Información WebSocket';

    this.connection = document.createElement('p');
    this.connection.textContent = 'Conectando…';

    this.eventLabel = document.createElement('p');
    this.eventLabel.textContent =
      'Esperando eventos del vehículo seleccionado.';

    this.eventJson = document.createElement('pre');

    panel.append(
      title,
      this.connection,
      this.eventLabel,
      this.eventJson
    );

    $('#view-monitor').append(panel);
  }

  setVehicle(id) {
    this.vehicleId = id;
    this.generation++;

    this.lastEventTime = -Infinity;
    this.seen.clear();
    this.eventVersion++;

    this.eventLabel.textContent =
      'Esperando eventos del vehículo seleccionado.';

    this.eventJson.textContent = '';

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

  setConnection(state) {
    const labels = {
      online: 'En línea',
      connecting: 'Conectando…',
      checking: 'Conectando…',
      reconnecting:
        'Reconectando… Los datos pueden estar desactualizados.',
      offline:
        'Desconectado. Los datos pueden estar desactualizados.',
    };

    this.connection.textContent =
      `Sesión WSS del navegador: ${labels[state] || 'Sin verificar'}`;
  }

  renderHistory(rows) {
    const body = $('#monitor-history');
    const ids = new Set(rows.map((row) => row.id_historial));

    for (const [id, tr] of this.rows) {
      if (!ids.has(id)) {
        tr.remove();
        this.rows.delete(id);
      }
    }

    body.querySelector('[data-empty]')?.remove();

    if (!this.rows.size) {
      body.replaceChildren();
    }

    rows.forEach((row, index) => {
      let tr = this.rows.get(row.id_historial);

      if (!tr) {
        tr = document.createElement('tr');

        for (let i = 0; i < 4; i++) {
          tr.append(document.createElement('td'));
        }

        this.rows.set(row.id_historial, tr);
      }

      const values = [
        index + 1,
        row.comando || 'Comando eliminado',
        ...dateParts(row.fecha_hora),
      ];

      values.forEach((value, i) => {
        if (tr.children[i].textContent !== String(value)) {
          tr.children[i].textContent = String(value);
        }
      });

      if (body.children[index] !== tr) {
        body.insertBefore(
          tr,
          body.children[index] || null
        );
      }
    });

    if (!rows.length) {
      const tr = document.createElement('tr');
      tr.dataset.empty = 'true';

      const td = document.createElement('td');
      td.colSpan = 4;

      td.textContent =
        'Sin registros. Este vehículo aún no tiene movimientos individuales.';

      tr.append(td);
      body.append(tr);
    }

    setText($('#monitor-count'), `${rows.length} / 10`);
  }

  handleEvent(message) {
    if (!validEvent(message, this.vehicleId)) {
      return;
    }

    const time = Date.parse(message.marca_temporal);

    if (time < this.lastEventTime) {
      return;
    }

    if (typeof message.event_id === 'string') {
      if (this.seen.has(message.event_id)) {
        return;
      }

      this.seen.add(message.event_id);

      if (this.seen.size > 200) {
        this.seen.delete(this.seen.values().next().value);
      }
    }

    this.lastEventTime = time;
    this.eventVersion++;

    const labels = {
      demo_inicio: 'DEMO iniciada',
      demo_movimiento: 'Paso de DEMO',
      demo_fin: 'DEMO finalizada',
      demo_cancelada: 'DEMO cancelada',
      demo_error: 'Error de DEMO',
      movimiento: 'Movimiento publicado por WSS',
      estado_inicial: 'Estado inicial recibido',
    };

    this.eventLabel.textContent =
      `${labels[message.tipo]}. No confirma ejecución física.`;

    // textContent evita interpretar el mensaje como HTML.
    this.eventJson.textContent = JSON.stringify(message, null, 2);

    if (message.comando) {
      this.renderLatest(message);
    }

    // Los pasos de DEMO actualizan la tarjeta, no crean historial.
    if (message.tipo !== 'demo_movimiento') {
      this.refresh();
    }
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

    // Descarta respuestas correspondientes a otro vehículo.
    if (generation !== this.generation) {
      return;
    }

    const [state, history] = results;
    let failed = false;

    if (
      state.status === 'fulfilled'
      && state.value
      && Number(state.value.id_vehiculo) === Number(id)
    ) {
      // Una consulta anterior no reemplaza un evento nuevo.
      if (version === this.eventVersion) {
        this.renderLatest(state.value);
      }
    } else {
      failed = true;
    }

    try {
      if (history.status !== 'fulfilled') {
        throw history.reason;
      }

      if (version === this.eventVersion) {
        this.renderHistory(
          normalizeHistory(history.value, id)
        );
      } else {
        this.pending = true;
      }
    } catch {
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