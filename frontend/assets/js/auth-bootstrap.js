import { APP_CONFIG } from './config/app-config.js';
import { setAccessToken, clearAccessToken } from './api/http-client.js';

const appRoot = document.querySelector('.app-shell');
if (appRoot) appRoot.hidden = true;

const authRoot = document.createElement('main');
authRoot.id = 'auth-root';
authRoot.className = 'auth-shell';
document.body.prepend(authRoot);

let currentUser = null;
let currentAccessToken = null;
let csrfToken = null;
let refreshTimer = null;
let guestExpiryTimer = null;
let guestExperience = null;

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function stopSessionTimers() {
  window.clearTimeout(refreshTimer);
  window.clearTimeout(guestExpiryTimer);
  refreshTimer = null;
  guestExpiryTimer = null;
}

function clearLocalSession() {
  stopSessionTimers();
  guestExperience?.destroy();
  guestExperience = null;
  clearAccessToken();
  currentAccessToken = null;
  csrfToken = null;
  currentUser = null;
  if (appRoot) appRoot.hidden = true;
  authRoot.hidden = false;
}

function renderLogin(message = '') {
  authRoot.hidden = false;
  authRoot.innerHTML = `
    <section class="auth-card">
      <div class="auth-brand">
        <span class="auth-symbol">◈</span>
        <div>
          <p>YOLO · INTERNET OF THINGS</p>
          <h1>CONTROL <span>IoT</span></h1>
        </div>
      </div>
      <h2>Iniciar sesión</h2>
      <p class="auth-muted">Accede a tu cuenta para utilizar la plataforma.</p>
      <form id="login-form">
        <label for="login-email">Correo electrónico</label>
        <input id="login-email" type="email" autocomplete="username" required maxlength="254">
        <label for="login-password">Contraseña</label>
        <input id="login-password" type="password" autocomplete="current-password" required>
        <button type="submit" class="auth-primary">Iniciar sesión</button>
      </form>
      <button id="show-register" class="auth-secondary" type="button">Crear cuenta de invitado</button>
      <p id="auth-message" role="status" aria-live="polite">${escapeHTML(message)}</p>
    </section>`;

  document.getElementById('login-form')?.addEventListener('submit', login);
  document.getElementById('show-register')?.addEventListener('click', () => renderRegister());
}

function renderRegister(message = '') {
  authRoot.hidden = false;
  authRoot.innerHTML = `
    <section class="auth-card">
      <div class="auth-brand">
        <span class="auth-symbol">◈</span>
        <div>
          <p>YOLO · INTERNET OF THINGS</p>
          <h1>CONTROL <span>IoT</span></h1>
        </div>
      </div>
      <h2>Registro de invitado</h2>
      <p class="auth-muted">Crea una cuenta para conocer nuestros vehículos.</p>
      <form id="register-form">
        <label for="guest-name">Nombre</label>
        <input id="guest-name" required minlength="2" maxlength="120">
        <label for="guest-email">Correo electrónico</label>
        <input id="guest-email" type="email" autocomplete="email" required maxlength="254">
        <label for="guest-password">Contraseña</label>
        <input id="guest-password" type="password" autocomplete="new-password" minlength="12" required>
        <button type="submit" class="auth-primary">Crear cuenta</button>
      </form>
      <button id="show-login" class="auth-secondary" type="button">Volver al inicio de sesión</button>
      <p id="auth-message" role="status" aria-live="polite">${escapeHTML(message)}</p>
    </section>`;

  document.getElementById('register-form')?.addEventListener('submit', registerGuest);
  document.getElementById('show-login')?.addEventListener('click', () => renderLogin());
}

async function postAuth(path, body = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (csrfToken && (path === 'refresh' || path === 'logout')) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  const response = await fetch(`${APP_CONFIG.API_BASE_URL}/auth/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    mode: 'cors',
    credentials: 'include',
    cache: 'no-store',
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.error?.mensaje ||
      data?.detail ||
      data?.mensaje ||
      `Error HTTP ${response.status}`
    );
  }

  if (data.csrf_token) csrfToken = data.csrf_token;
  return data;
}

async function login(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  const message = document.getElementById('auth-message');

  button.disabled = true;
  message.textContent = 'Verificando credenciales…';

  try {
    const result = await postAuth('login', {
      email: document.getElementById('login-email').value.trim(),
      password: document.getElementById('login-password').value,
    });

    await openSession(result);
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function registerGuest(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  const message = document.getElementById('auth-message');

  button.disabled = true;
  message.textContent = 'Creando cuenta…';

  try {
    const result = await postAuth('registro-invitado', {
      nombre: document.getElementById('guest-name').value.trim(),
      email: document.getElementById('guest-email').value.trim(),
      password: document.getElementById('guest-password').value,
    });

    await openSession(result);
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function refreshAccessToken() {
  const result = await postAuth('refresh', {});

  if (!result.access_token) {
    throw new Error('El servidor no devolvió un nuevo token de acceso.');
  }

  currentAccessToken = result.access_token;
  setAccessToken(result.access_token);
  return result;
}

function scheduleRefresh(expiresIn) {
  window.clearTimeout(refreshTimer);

  const seconds = Number(expiresIn);
  if (!Number.isFinite(seconds) || seconds <= 0) return;

  const delay = Math.max(1000, (seconds - 60) * 1000);

  refreshTimer = window.setTimeout(async () => {
    try {
      const tokens = await refreshAccessToken();
      scheduleRefresh(tokens.expires_in);
    } catch (error) {
      clearLocalSession();
      renderLogin(`La sesión expiró: ${error.message}`);
    }
  }, delay);
}

async function openSession(result) {
  if (!result?.access_token || !result?.usuario) {
    throw new Error('La API no devolvió una sesión válida.');
  }

  stopSessionTimers();
  currentUser = result.usuario;
  currentAccessToken = result.access_token;
  csrfToken = result.csrf_token || null;
  setAccessToken(result.access_token);

  const roles = Array.isArray(currentUser.roles) ? currentUser.roles : [];

  if (roles.includes('guest')) {
    const expiresIn = Math.max(1, Number(result.expires_in) || 900);
    guestExpiryTimer = window.setTimeout(expireGuestSession, expiresIn * 1000);
    await renderGuest(Math.ceil(expiresIn / 60));
    return;
  }

  if (roles.includes('admin')) {
    scheduleRefresh(result.expires_in);
    renderAdmin();
    return;
  }

  if (roles.includes('user')) {
    scheduleRefresh(result.expires_in);
    await openUserApplication();
    return;
  }

  clearLocalSession();
  renderLogin('La cuenta no tiene un perfil autorizado.');
}

async function apiFetch(path, options = {}) {
  if (!currentAccessToken) {
    throw new Error('La sesión no tiene un token de acceso. Inicia sesión nuevamente.');
  }

  const method = options.method || 'GET';
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${currentAccessToken}`,
  };

  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${APP_CONFIG.API_BASE_URL}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-store',
  });

  const raw = await response.text();
  let data = null;

  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
  }

  if (!response.ok) {
    const detail = data?.error?.mensaje || data?.detail || data?.mensaje || `Error HTTP ${response.status}`;
    throw new Error(detail);
  }

  return data;
}

const modules = [
  ['modelos', '▱', 'Modelos', 'Catálogo comercial de vehículos'],
  ['inventario', '▦', 'Inventario', 'Registro y disponibilidad de unidades'],
  ['clientes', '♙', 'Clientes', 'Gestión de compradores'],
  ['asignaciones', '⇄', 'Asignaciones', 'Relación entre clientes y vehículos'],
  ['demos', '▶', 'DEMO de empresa', 'Secuencias comerciales de exhibición'],
  ['auditoria', '⬡', 'Auditoría y soporte', 'Operaciones y registros'],
  ['mensajes', '✉', 'Mensajes', 'Comunicación con clientes e invitados'],
];

function adminShell(title, active, content) {
  authRoot.hidden = false;
  authRoot.innerHTML = `
    <div class="admin-layout">
      <aside class="admin-sidebar">
        <div class="admin-brand">
          <span class="admin-brand-icon">◈</span>
          <div><strong>CONTROL IoT</strong><small>PLATAFORMA EMPRESARIAL</small></div>
        </div>
        <div class="admin-user">
          <div class="admin-avatar">A</div>
          <div>
            <strong>${escapeHTML(currentUser?.nombre || currentUser?.email || 'Administrador')}</strong>
            <small>Administrador</small>
          </div>
        </div>
        <nav class="admin-navigation">
          <span class="admin-nav-label">PRINCIPAL</span>
          <button class="admin-nav-item ${active === 'inicio' ? 'active' : ''}" data-page="inicio"><span>⌂</span>Resumen general</button>
          <span class="admin-nav-label">GESTIÓN</span>
          ${modules.map(([id, icon, label]) => `
            <button class="admin-nav-item ${active === id ? 'active' : ''}" data-page="${id}">
              <span>${icon}</span>${label}
            </button>`).join('')}
        </nav>
        <button id="logout-button" class="admin-logout" type="button">↪ Cerrar sesión</button>
      </aside>
      <main class="admin-main">
        <header class="admin-topbar">
          <div>
            <span class="admin-breadcrumb">CONTROL IoT / ADMINISTRACIÓN</span>
            <h1>${escapeHTML(title)}</h1>
          </div>
          <button class="admin-icon-button" data-page="mensajes" title="Mensajes" type="button">✉</button>
        </header>
        <section class="admin-content">${content}</section>
      </main>
    </div>`;

  document.getElementById('logout-button')?.addEventListener('click', logout);
  authRoot.querySelectorAll('[data-page]').forEach((button) => {
    button.addEventListener('click', () => openAdminPage(button.dataset.page));
  });
}

function renderAdmin() {
  const cards = modules.map(([id, icon, label, description]) => `
    <button class="admin-module-card" data-page="${id}" type="button">
      <span class="admin-module-icon">${icon}</span>
      <span class="admin-module-arrow">↗</span>
      <strong>${label}</strong>
      <small>${description}</small>
    </button>`).join('');

  adminShell('Resumen general', 'inicio', `
    <div class="admin-welcome">
      <div>
        <span class="admin-eyebrow">CENTRO DE OPERACIONES</span>
        <h2>Bienvenido, ${escapeHTML(currentUser?.nombre || 'Administrador')}</h2>
        <p>Administra los recursos y operaciones de tu empresa.</p>
      </div>
      <div class="admin-welcome-symbol">◈</div>
    </div>
    <div class="admin-section-heading">
      <div><h2>Módulos de gestión</h2><p>Selecciona el área que deseas administrar.</p></div>
    </div>
    <div class="admin-module-grid">${cards}</div>
    <div class="admin-information">
      <span>●</span>
      <div><strong>Plataforma conectada</strong><p>Las consultas y operaciones disponibles se realizan contra el backend.</p></div>
    </div>`);
}

async function openAdminPage(page) {
  if (page === 'inicio') return renderAdmin();
  if (page === 'modelos' || page === 'inventario') return renderVehicles(page);
  if (page === 'demos') return renderDemos();
  if (page === 'auditoria') return renderAudit();
  if (['clientes', 'asignaciones', 'mensajes'].includes(page)) return renderUnavailable(page);
}

async function renderVehicles(page) {
  const title = page === 'modelos' ? 'Catálogo de modelos' : 'Inventario de vehículos';

  adminShell(title, page, `
    <div class="admin-section-heading">
      <div><h2>${title}</h2><p>Registros almacenados en la base de datos.</p></div>
      <button class="admin-action" id="new-vehicle" type="button">+ Registrar vehículo</button>
    </div>
    <div id="admin-data" class="admin-data-panel">Cargando vehículos…</div>`);

  document.getElementById('new-vehicle')?.addEventListener('click', () => showVehicleForm());
  await loadVehicles();
}

async function loadVehicles() {
  const target = document.getElementById('admin-data');
  if (!target) return;

  target.textContent = 'Consultando vehículos…';

  try {
    const vehicles = await apiFetch('/vehiculos?incluir_detalle=false');

    if (!Array.isArray(vehicles) || vehicles.length === 0) {
      target.innerHTML = '<p>No hay vehículos registrados. Utiliza “Registrar vehículo” para agregar el primero.</p>';
      return;
    }

    target.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr>
            <th>ID</th><th>Nombre</th><th>Modelo</th><th>Microcontrolador</th><th>Estado</th><th>Acciones</th>
          </tr></thead>
          <tbody>
            ${vehicles.map((vehicle) => `
              <tr>
                <td>${escapeHTML(vehicle.id_vehiculo)}</td>
                <td>${escapeHTML(vehicle.nombre)}</td>
                <td>${escapeHTML(vehicle.modelo || '—')}</td>
                <td>${escapeHTML(vehicle.microcontrolador || '—')}</td>
                <td>${vehicle.activo ? 'Activo' : 'Inactivo'}</td>
                <td>
                  <button class="admin-action" data-edit="${Number(vehicle.id_vehiculo)}" type="button">Editar</button>
                  <button class="admin-danger" data-delete="${Number(vehicle.id_vehiculo)}" type="button">Eliminar</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    target.querySelectorAll('[data-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        const vehicle = vehicles.find((item) => Number(item.id_vehiculo) === Number(button.dataset.edit));
        if (vehicle) showVehicleForm(vehicle);
      });
    });

    target.querySelectorAll('[data-delete]').forEach((button) => {
      button.addEventListener('click', () => deleteVehicle(Number(button.dataset.delete)));
    });
  } catch (error) {
    target.innerHTML = `
      <div class="admin-error">
        <strong>No se pudo consultar el inventario.</strong>
        <p>${escapeHTML(error.message)}</p>
      </div>`;
  }
}

function showVehicleForm(vehicle = null) {
  const target = document.getElementById('admin-data');
  if (!target) return;

  target.innerHTML = `
    <form id="vehicle-form" class="admin-form">
      <h3>${vehicle ? 'Editar vehículo' : 'Registrar vehículo'}</h3>
      <label>Nombre<input name="nombre" required maxlength="80" value="${escapeHTML(vehicle?.nombre || '')}"></label>
      <label>Modelo<input name="modelo" maxlength="80" value="${escapeHTML(vehicle?.modelo || '')}"></label>
      <label>Descripción<input name="descripcion" maxlength="255" value="${escapeHTML(vehicle?.descripcion || '')}"></label>
      <label>Microcontrolador<input name="microcontrolador" maxlength="50" value="${escapeHTML(vehicle?.microcontrolador || 'ESP8266')}"></label>
      ${vehicle ? `<label class="admin-check"><input name="activo" type="checkbox" ${vehicle.activo ? 'checked' : ''}> Vehículo activo</label>` : ''}
      <div class="admin-form-actions">
        <button class="admin-action" type="submit">${vehicle ? 'Guardar cambios' : 'Crear vehículo'}</button>
        <button class="admin-secondary" type="button" id="cancel-form">Cancelar</button>
      </div>
      <p id="vehicle-form-message" role="status"></p>
    </form>`;

  document.getElementById('cancel-form')?.addEventListener('click', loadVehicles);

  document.getElementById('vehicle-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const message = document.getElementById('vehicle-form-message');
    const submitButton = form.querySelector('[type="submit"]');
    const formData = new FormData(form);

    const body = {
      nombre: String(formData.get('nombre') || '').trim(),
      modelo: String(formData.get('modelo') || '').trim() || null,
      descripcion: String(formData.get('descripcion') || '').trim() || null,
      microcontrolador: String(formData.get('microcontrolador') || '').trim() || null,
    };

    if (vehicle) body.activo = formData.get('activo') === 'on';

    submitButton.disabled = true;
    message.textContent = 'Guardando…';

    try {
      await apiFetch(
        vehicle ? `/vehiculos/${vehicle.id_vehiculo}/actualizar` : '/vehiculos',
        { method: 'POST', body }
      );
      await loadVehicles();
    } catch (error) {
      message.textContent = error.message;
      submitButton.disabled = false;
    }
  });
}

async function deleteVehicle(id) {
  if (!Number.isInteger(id) || id <= 0) return;

  if (!confirm(`¿Eliminar el vehículo ${id}? Esta operación puede afectar datos relacionados.`)) return;

  try {
    await apiFetch(`/vehiculos/${id}/eliminar`, { method: 'POST', body: {} });
    await loadVehicles();
  } catch (error) {
    alert(`No se pudo eliminar: ${error.message}`);
  }
}

async function renderDemos() {
  adminShell('DEMO de empresa', 'demos', `
    <div class="admin-section-heading">
      <div><h2>Demostraciones por vehículo</h2><p>Consulta las secuencias registradas.</p></div>
    </div>
    <div id="admin-data" class="admin-data-panel">Cargando…</div>`);

  const target = document.getElementById('admin-data');

  try {
    const vehicles = await apiFetch('/vehiculos?incluir_detalle=false');

    if (!Array.isArray(vehicles) || vehicles.length === 0) {
      target.textContent = 'No hay vehículos registrados.';
      return;
    }

    const rows = await Promise.all(vehicles.map(async (vehicle) => {
      try {
        return { vehicle, demos: await apiFetch(`/vehiculos/${vehicle.id_vehiculo}/demos`) };
      } catch (error) {
        return { vehicle, error };
      }
    }));

    target.innerHTML = rows.map(({ vehicle, demos, error }) => `
      <div class="admin-list-item">
        <div>
          <strong>${escapeHTML(vehicle.nombre || `Vehículo ${vehicle.id_vehiculo}`)}</strong>
          <small>${error ? escapeHTML(error.message) : `${Array.isArray(demos) ? demos.length : 0} DEMO registradas`}</small>
          ${Array.isArray(demos) ? demos.map((demo) => `<p>${escapeHTML(demo.nombre || `DEMO ${demo.id_demo}`)}</p>`).join('') : ''}
        </div>
      </div>`).join('');
  } catch (error) {
    target.textContent = error.message;
  }
}

async function renderAudit() {
  adminShell('Auditoría y soporte', 'auditoria', `
    <div class="admin-section-heading">
      <div><h2>Historial por vehículo</h2><p>Consulta los últimos movimientos individuales registrados.</p></div>
    </div>
    <div id="admin-data" class="admin-data-panel">Cargando…</div>`);

  const target = document.getElementById('admin-data');

  try {
    const vehicles = await apiFetch('/vehiculos?incluir_detalle=false');

    if (!Array.isArray(vehicles) || vehicles.length === 0) {
      target.textContent = 'No hay vehículos registrados.';
      return;
    }

    target.innerHTML = vehicles.map((vehicle) => `
      <div class="admin-list-item">
        <div>
          <strong>${escapeHTML(vehicle.nombre || `Vehículo ${vehicle.id_vehiculo}`)}</strong>
          <small>Vehículo ${escapeHTML(vehicle.id_vehiculo)}</small>
        </div>
        <button class="admin-action" data-history="${Number(vehicle.id_vehiculo)}" type="button">Ver historial</button>
      </div>`).join('');

    target.querySelectorAll('[data-history]').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          const data = await apiFetch(`/vehiculos/${button.dataset.history}/historial`);
          target.innerHTML = `
            <button class="admin-secondary" id="history-back" type="button">← Volver</button>
            <pre class="admin-json">${escapeHTML(JSON.stringify(data, null, 2))}</pre>`;
          document.getElementById('history-back')?.addEventListener('click', renderAudit);
        } catch (error) {
          alert(error.message);
        }
      });
    });
  } catch (error) {
    target.textContent = error.message;
  }
}

function renderUnavailable(page) {
  const info = {
    clientes: ['Gestión de clientes', 'El backend todavía no cuenta con endpoints CRUD de clientes.'],
    asignaciones: ['Asignaciones', 'El backend todavía no cuenta con endpoints para asignar vehículos a clientes.'],
    mensajes: ['Centro de mensajes', 'El backend todavía no cuenta con almacenamiento ni endpoints de mensajería.'],
  }[page];

  if (!info) return;

  adminShell(info[0], page, `
    <div class="admin-empty-state">
      <div class="admin-empty-icon">${page === 'mensajes' ? '✉' : '◈'}</div>
      <h2>${info[0]}</h2>
      <p>${info[1]}</p>
      <p class="admin-muted">No se muestran datos ficticios. Este módulo se habilitará cuando se implemente su API y su tabla correspondiente.</p>
    </div>`);
}

function renderHeader(title, description) {
  return `
    <header class="profile-header">
      <div>
        <p>CONTROL IoT · PLATAFORMA</p>
        <h1>${escapeHTML(title)}</h1>
        <span>${escapeHTML(description)}</span>
      </div>
      <button id="logout-button" class="auth-secondary" type="button">Cerrar sesión</button>
    </header>`;
}

async function renderGuest(sessionMinutes = 15) {
  guestExperience?.destroy();
  guestExperience = null;
  authRoot.hidden = false;

  authRoot.innerHTML = `
    ${renderHeader('MODO INVITADO', 'Experiencia temporal de exhibición de vehículos IoT')}
    <section class="guest-hero">
      <div class="guest-hero-copy">
        <p class="guest-overline">YOLO · INTERNET OF THINGS</p>
        <h2>Explora la tecnología en movimiento.</h2>
        <p>Consulta los vehículos disponibles y observa demostraciones automáticas en tiempo real.</p>
        <div class="guest-session-pill"><i class="bi bi-clock-history" aria-hidden="true"></i> Sesión temporal · ${Math.max(1, Number(sessionMinutes) || 15)} minutos</div>
      </div>
      <div class="guest-hero-art" aria-hidden="true"><i class="bi bi-truck-front-fill"></i><span>IoT</span></div>
    </section>
    <section class="guest-catalog-section" aria-labelledby="guest-catalog-title">
      <div class="guest-section-heading">
        <div>
          <p class="guest-overline">CATÁLOGO DISPONIBLE</p>
          <h2 id="guest-catalog-title">Vehículos de exhibición</h2>
          <p>Solo aparecen unidades que administración habilitó para demostraciones.</p>
        </div>
        <button id="guest-refresh" class="auth-secondary" type="button"><i class="bi bi-arrow-clockwise" aria-hidden="true"></i> Actualizar</button>
      </div>
      <p id="guest-feedback" class="guest-feedback" role="status" aria-live="polite">Preparando catálogo…</p>
      <div id="guest-catalog-grid" class="guest-catalog-grid">
        <div class="guest-empty-state"><span class="guest-loader" aria-hidden="true"></span><p>Cargando catálogo…</p></div>
      </div>
    </section>
    <section id="guest-demo-panel" class="guest-progress-panel" hidden aria-live="polite">
      <div class="guest-progress-header">
        <div><p class="guest-overline">SEGUIMIENTO EN TIEMPO REAL</p><h2>Demostración del vehículo</h2></div>
        <span class="guest-ws-chip"><i class="bi bi-broadcast" aria-hidden="true"></i> <span id="guest-ws-status">Desconectado</span></span>
      </div>
      <div class="guest-progress-state">
        <strong id="guest-progress-label">Preparando demostración</strong>
        <span id="guest-progress-text">Esperando secuencia</span>
      </div>
      <div class="guest-progress-track" role="progressbar" aria-label="Avance de la demostración" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div id="guest-progress-bar"></div>
      </div>
      <p id="guest-progress-detail" class="guest-progress-detail">Los eventos enviados por WSS aparecerán aquí.</p>
      <p class="guest-safety-note"><i class="bi bi-shield-check" aria-hidden="true"></i> El invitado no tiene acceso a controles manuales, comandos ni historial privado.</p>
    </section>
    <footer class="guest-footer">CONTROL IoT · Experiencia de exhibición</footer>`;

  bindLogout();

  try {
    const { GuestExperience } = await import('./guest-experience.js');
    guestExperience = new GuestExperience(authRoot);
    await guestExperience.mount();
  } catch (error) {
    const feedback = document.getElementById('guest-feedback');
    if (feedback) feedback.textContent = `No se pudo cargar la experiencia de invitado: ${error.message}`;
  }
}

function expireGuestSession() {
  guestExpiryTimer = null;
  guestExperience?.destroy();
  guestExperience = null;
  clearLocalSession();
  renderLogin('La sesión temporal de invitado terminó. Inicia sesión nuevamente para continuar.');
}

async function openUserApplication() {
  authRoot.hidden = true;
  if (appRoot) appRoot.hidden = false;

  try {
    await import('./app.js');
  } catch (error) {
    if (appRoot) appRoot.hidden = true;
    authRoot.hidden = false;
    renderLogin(`No se pudo iniciar la aplicación: ${error.message}`);
  }
}

function bindLogout() {
  document.getElementById('logout-button')?.addEventListener('click', logout);
}

async function logout() {
  stopSessionTimers();
  guestExperience?.destroy();
  guestExperience = null;

  try {
    await postAuth('logout', {});
  } catch (error) {
    // La limpieza local se mantiene aunque falle la revocación remota.
    console.warn('No se pudo revocar la sesión en el servidor:', error.message);
  }

  clearLocalSession();
  renderLogin('Sesión cerrada.');
}

renderLogin();
