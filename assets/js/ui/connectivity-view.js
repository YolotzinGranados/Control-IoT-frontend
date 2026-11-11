import { $, setText } from '../utils/dom.js';

const LABELS = {
  websocket: { online: 'En línea', checking: 'Conectando…', reconnecting: 'Reconectando…', offline: 'Desconectado', unknown: 'Sin verificar' },
  api: { online: 'Disponible', checking: 'Comprobando…', offline: 'No disponible', unknown: 'Sin verificar' },
  rds: { online: 'Disponible', checking: 'Comprobando…', offline: 'No disponible', unknown: 'Sin verificar' },
};

export class ConnectivityView {
  constructor() {
    this.items = {
      websocket: { root: $('#ws-connectivity'), text: $('#ws-status-text') },
      api: { root: $('#api-connectivity'), text: $('#api-status-text') },
      rds: { root: $('#rds-connectivity'), text: $('#rds-status-text') },
    };
  }

  render(state) {
    for (const [key, item] of Object.entries(this.items)) {
      const value = state[key] || 'unknown';
      item.root.dataset.state = value;
      setText(item.text, LABELS[key]?.[value] || 'Sin verificar');
      item.root.title = key === 'websocket'
        ? 'Estado de la conexión WSS de esta pestaña, no del microcontrolador.'
        : key === 'api'
          ? 'Disponibilidad del servicio FastAPI comprobada mediante /health; no valida individualmente todas las rutas REST ni los 21 Stored Procedures.'
          : 'Estado inferido únicamente de la respuesta de /health. No existe una comprobación RDS independiente.';
    }
  }
}
