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
  try { window.__CONTROL_IOT_SHUTDOWN__?.(); } catch { /* cierre local seguro */ }
  window.__CONTROL_IOT_SHUTDOWN__ = undefined;
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
  ['modelos', '▱', 'Modelos', 'Catálogo de modelos registrados'],
  ['inventario', '▦', 'Inventario', 'Vehículos, disponibilidad y exhibición'],
  ['clientes', '♙', 'Clientes', 'Cuentas de compradores'],
  ['asignaciones', '⇄', 'Asignaciones', 'Vehículos asignados a clientes'],
  ['demos', '▶', 'Demostraciones', 'Secuencias de operación y exhibición'],
  ['auditoria', '◷', 'Actividad', 'Historial y trazabilidad del sistema'],
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
          <div class="admin-avatar">${escapeHTML((currentUser?.nombre || 'A').slice(0, 1).toUpperCase())}</div>
          <div>
            <strong>${escapeHTML(currentUser?.nombre || currentUser?.email || 'Administrador')}</strong>
            <small>Administrador</small>
          </div>
        </div>
        <nav class="admin-navigation" aria-label="Navegación administrativa">
          <span class="admin-nav-label">OVERVIEW</span>
          <button class="admin-nav-item ${active === 'inicio' ? 'active' : ''}" data-page="inicio" type="button"><span>⌂</span>Dashboard</button>
          <span class="admin-nav-label">MANAGEMENT</span>
          ${modules.map(([id, icon, label]) => `
            <button class="admin-nav-item ${active === id ? 'active' : ''}" data-page="${id}" type="button">
              <span>${icon}</span>${label}
            </button>`).join('')}
        </nav>
        <button id="logout-button" class="admin-logout" type="button">↪ Cerrar sesión</button>
      </aside>
      <main class="admin-main">
        <header class="admin-topbar">
          <div class="admin-search-placeholder"><span>⌕</span> CONTROL IoT / ADMINISTRACIÓN</div>
          <div class="admin-top-actions">
            <span class="admin-top-role">ADMIN</span>
            <span class="admin-top-avatar">${escapeHTML((currentUser?.nombre || 'A').slice(0, 1).toUpperCase())}</span>
          </div>
        </header>
        <section class="admin-content">
          <div class="admin-page-heading">
            <div><p class="admin-breadcrumb">PANEL DE CONTROL</p><h1>${escapeHTML(title)}</h1></div>
            ${active !== 'inicio' ? '<button class="admin-secondary" data-page="inicio" type="button">← Dashboard</button>' : ''}
          </div>
          ${content}
        </section>
      </main>
    </div>`;

  document.getElementById('logout-button')?.addEventListener('click', logout);
  authRoot.querySelectorAll('[data-page]').forEach((button) => {
    button.addEventListener('click', () => openAdminPage(button.dataset.page));
  });
}

async function renderAdmin() {
  const cards = modules.map(([id, icon, label, description]) => `
    <button class="admin-module-card" data-page="${id}" type="button">
      <span class="admin-module-icon">${icon}</span>
      <span class="admin-module-arrow">↗</span>
      <strong>${label}</strong>
      <small>${description}</small>
    </button>`).join('');

  adminShell('Dashboard', 'inicio', `
    <div class="admin-welcome">
      <div>
        <span class="admin-eyebrow">CENTRO DE OPERACIONES</span>
        <h2>Buenos días, ${escapeHTML(currentUser?.nombre || 'Administrador')}</h2>
        <p>Resumen de vehículos, clientes y actividad de la plataforma.</p>
      </div>
      <div class="admin-welcome-symbol">◈</div>
    </div>
    <div id="admin-dashboard-data">
      <div class="admin-loading">Consultando indicadores de RDS…</div>
    </div>
    <div class="admin-section-heading">
      <div><h2>Gestión de la plataforma</h2><p>Accede a los módulos administrativos.</p></div>
    </div>
    <div class="admin-module-grid">${cards}</div>`);

  try {
    const stats = await apiFetch('/admin/dashboard');
    const target = document.getElementById('admin-dashboard-data');
    if (!target) return;
    const unassigned = Math.max(0, Number(stats.vehiculos_activos || 0) - Number(stats.asignaciones_activas || 0));
    const assignedPct = Number(stats.vehiculos_activos || 0)
      ? Math.round((Number(stats.asignaciones_activas || 0) / Number(stats.vehiculos_activos)) * 100)
      : 0;

    target.innerHTML = `
      <div class="admin-stat-grid">
        <article class="admin-stat-card"><span class="admin-stat-icon">▣</span><small>Vehículos activos</small><strong>${Number(stats.vehiculos_activos || 0).toLocaleString('es-MX')}</strong><em>Inventario registrado: ${Number(stats.vehiculos_total || 0)}</em></article>
        <article class="admin-stat-card"><span class="admin-stat-icon">♙</span><small>Clientes activos</small><strong>${Number(stats.clientes_activos || 0).toLocaleString('es-MX')}</strong><em>Cuentas con perfil usuario</em></article>
        <article class="admin-stat-card"><span class="admin-stat-icon">⇄</span><small>Asignaciones activas</small><strong>${Number(stats.asignaciones_activas || 0).toLocaleString('es-MX')}</strong><em>Vehículos vinculados a clientes</em></article>
        <article class="admin-stat-card"><span class="admin-stat-icon">▶</span><small>DEMO disponibles</small><strong>${Number(stats.demos_activas || 0).toLocaleString('es-MX')}</strong><em>Secuencias habilitadas</em></article>
      </div>
      <div class="admin-dashboard-grid">
        <article class="admin-dashboard-panel">
          <div class="admin-panel-heading"><div><p class="admin-eyebrow">INVENTARIO</p><h3>Disponibilidad de vehículos</h3></div><button class="admin-text-action" data-page="inventario" type="button">Ver inventario →</button></div>
          <div class="admin-inventory-total"><strong>${Number(stats.vehiculos_activos || 0)}</strong><span>vehículos activos</span></div>
          <div class="admin-progress-track"><span style="width:${assignedPct}%"></span></div>
          <div class="admin-progress-legend"><span><i class="admin-dot assigned"></i> Asignados <b>${Number(stats.asignaciones_activas || 0)}</b></span><span><i class="admin-dot available"></i> Sin asignar <b>${unassigned}</b></span></div>
        </article>
        <article class="admin-dashboard-panel admin-status-panel">
          <div class="admin-panel-heading"><div><p class="admin-eyebrow">ACCESOS</p><h3>Perfiles registrados</h3></div></div>
          <div class="admin-profile-row"><span class="admin-profile-symbol">♙</span><div><strong>Clientes</strong><small>Control de vehículos asignados</small></div><b>${Number(stats.clientes_activos || 0)}</b></div>
          <div class="admin-profile-row"><span class="admin-profile-symbol">◎</span><div><strong>Invitados</strong><small>Sesiones de exhibición</small></div><b>${Number(stats.invitados_activos || 0)}</b></div>
          <div class="admin-profile-row"><span class="admin-profile-symbol">◈</span><div><strong>Administrador</strong><small>Gestión de la plataforma</small></div><b>Activo</b></div>
        </article>
      </div>`;
    target.querySelectorAll('[data-page]').forEach((button) => {
      button.addEventListener('click', () => openAdminPage(button.dataset.page));
    });
  } catch (error) {
    const target = document.getElementById('admin-dashboard-data');
    if (target) target.innerHTML = `<div class="admin-error"><strong>No se pudieron cargar los indicadores.</strong><p>${escapeHTML(error.message)}</p><button class="admin-action" id="dashboard-retry" type="button">Reintentar</button></div>`;
    document.getElementById('dashboard-retry')?.addEventListener('click', renderAdmin);
  }
}

async function openAdminPage(page) {
  if (page === 'inicio') return renderAdmin();
  if (page === 'modelos') return renderVehicles('modelos');
  if (page === 'inventario') return renderVehicles('inventario');
  if (page === 'clientes') return renderClients();
  if (page === 'asignaciones') return renderAssignments();
  if (page === 'demos') return renderDemos();
  if (page === 'auditoria') return renderAudit();
}

let adminVehiclePage = 'inventario';

async function renderVehicles(page) {
  adminVehiclePage = page;
  const title = page === 'modelos' ? 'Catálogo de modelos' : 'Inventario de vehículos';
  adminShell(title, page, `
    <div class="admin-section-heading">
      <div><h2>${title}</h2><p>${page === 'modelos' ? 'Resumen agrupado de los modelos registrados.' : 'Controla disponibilidad, asignaciones y unidades de exhibición.'}</p></div>
      ${page === 'inventario' ? '<button class="admin-action" id="new-vehicle" type="button">+ Registrar vehículo</button>' : ''}
    </div>
    <div id="admin-data" class="admin-data-panel">Cargando inventario…</div>`);

  document.getElementById('new-vehicle')?.addEventListener('click', () => showVehicleForm());
  await loadVehicles();
}

async function loadVehicles() {
  const target = document.getElementById('admin-data');
  if (!target) return;

  target.textContent = 'Consultando inventario…';

  try {
    const vehicles = await apiFetch('/admin/vehiculos');

    if (!Array.isArray(vehicles) || vehicles.length === 0) {
      target.innerHTML = '<p>No hay vehículos registrados. Utiliza “Registrar vehículo” para agregar el primero.</p>';
      return;
    }

    if (adminVehiclePage === 'modelos') {
      const grouped = new Map();
      vehicles.forEach((vehicle) => {
        const model = vehicle.modelo || 'Modelo sin especificar';
        grouped.set(model, [...(grouped.get(model) || []), vehicle]);
      });
      target.innerHTML = `
        <div class="admin-model-grid">
          ${[...grouped.entries()].map(([model, rows]) => `
            <article class="admin-model-card">
              <span class="admin-module-icon">▱</span>
              <strong>${escapeHTML(model)}</strong>
              <small>${rows.length} vehículo(s)</small>
              <p>${rows.map((item) => escapeHTML(item.nombre)).join(' · ')}</p>
            </article>`).join('')}
        </div>`;
      return;
    }

    target.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr>
            <th>ID</th><th>Nombre</th><th>Modelo</th><th>Microcontrolador</th><th>Asignación</th><th>Exhibición</th><th>Estado</th><th>Acciones</th>
          </tr></thead>
          <tbody>
            ${vehicles.map((vehicle) => `
              <tr>
                <td>#${escapeHTML(vehicle.id_vehiculo)}</td>
                <td><strong>${escapeHTML(vehicle.nombre)}</strong></td>
                <td>${escapeHTML(vehicle.modelo || '—')}</td>
                <td>${escapeHTML(vehicle.microcontrolador || '—')}</td>
                <td>${vehicle.asignado ? `Asignado a ${escapeHTML(vehicle.cliente || 'cliente')}` : 'Disponible'}</td>
                <td><span class="admin-status-pill ${vehicle.es_exhibicion ? 'is-enabled' : ''}">${vehicle.es_exhibicion ? 'Habilitada' : 'Desactivada'}</span></td>
                <td>${vehicle.activo ? 'Activo' : 'Inactivo'}</td>
                <td class="admin-actions-cell">
                  ${!vehicle.asignado ? `<button class="admin-action" data-edit="${Number(vehicle.id_vehiculo)}" type="button">Editar</button>
                  <button class="admin-secondary" data-exhibition="${Number(vehicle.id_vehiculo)}" data-enabled="${vehicle.es_exhibicion ? '1' : '0'}" type="button">${vehicle.es_exhibicion ? 'Quitar DEMO' : 'Habilitar DEMO'}</button>
                  <button class="admin-danger" data-delete="${Number(vehicle.id_vehiculo)}" type="button">Eliminar</button>` : '<span class="admin-muted">Protegido por asignación</span>'}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    target.querySelectorAll('[data-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        const vehicle = vehicles.find((item) => Number(item.id_vehiculo) === Number(button.dataset.edit));
        if (vehicle && !vehicle.asignado) showVehicleForm(vehicle);
      });
    });

    target.querySelectorAll('[data-exhibition]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = Number(button.dataset.exhibition);
        const enabled = button.dataset.enabled !== '1';
        button.disabled = true;
        try {
          await apiFetch(`/admin/vehiculos/${id}/exhibicion`, {
            method: 'POST',
            body: { es_exhibicion: enabled },
          });
          await loadVehicles();
        } catch (error) {
          alert(error.message);
          button.disabled = false;
        }
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
      <div>
        <h2>Demostraciones por vehículo</h2>
        <p>Revisa las secuencias y detecta demostraciones sin movimientos configurados.</p>
      </div>
    </div>
    <div id="admin-data" class="admin-data-panel">
      <div class="admin-loading">Consultando demostraciones y movimientos…</div>
    </div>`);

  const target = document.getElementById('admin-data');

  try {
    const vehicles = await apiFetch('/vehiculos?incluir_detalle=false');

    if (!Array.isArray(vehicles) || vehicles.length === 0) {
      target.innerHTML = `
        <div class="admin-demo-empty">
          <i>▣</i>
          <strong>No hay vehículos registrados</strong>
          <span>Registra un vehículo para consultar sus demostraciones.</span>
        </div>`;
      return;
    }

    const rows = await Promise.all(vehicles.map(async (vehicle) => {
      const vehicleId = Number(vehicle.id_vehiculo);

      try {
        const demos = await apiFetch(`/vehiculos/${vehicleId}/demos`);

        const inspectedDemos = await Promise.all(
          (Array.isArray(demos) ? demos : []).map(async (demo) => {
            const demoId = Number(demo.id_demo);

            try {
              const movements = await apiFetch(
                `/vehiculos/${vehicleId}/demos/${demoId}/movimientos`
              );

              return {
                demo,
                movementCount: Array.isArray(movements)
                  ? movements.length
                  : null,
                error: Array.isArray(movements)
                  ? null
                  : 'La API no devolvió una lista de movimientos.',
              };
            } catch (error) {
              return {
                demo,
                movementCount: null,
                error: error.message
              };
            }
          })
        );

        return {
          vehicle,
          demos: inspectedDemos,
          error: null
        };
      } catch (error) {
        return {
          vehicle,
          demos: [],
          error: error.message
        };
      }
    }));

    const allDemos = rows.flatMap((row) =>
      row.demos.map((item) => ({
        vehicleId: Number(row.vehicle.id_vehiculo),
        vehicleName: row.vehicle.nombre || `Vehículo ${row.vehicle.id_vehiculo}`,
        demoId: Number(item.demo.id_demo),
        demoName: item.demo.nombre || `DEMO ${item.demo.id_demo}`,
        movementCount: item.movementCount,
        error: item.error,
      }))
    );

    // Clasificación de demostraciones
    const emptyDemos = allDemos.filter(
      item => item.movementCount === 0 && !item.error
    );

    const readyDemos = allDemos.filter(
      item => Number.isInteger(item.movementCount) &&
              item.movementCount > 0
    );

    const unverifiedDemos = allDemos.filter(
      item => item.movementCount === null
    );

    // Interfaz
    target.innerHTML = `
      <div class="admin-demo-overview">

        <article class="admin-demo-stat">
          <span class="admin-demo-stat-icon">▤</span>
          <span>
            <small>DEMO registradas</small>
            <strong>${allDemos.length}</strong>
          </span>
        </article>

        <article class="admin-demo-stat">
          <span class="admin-demo-stat-icon">✓</span>
          <span>
            <small>Con movimientos</small>
            <strong>${readyDemos.length}</strong>
          </span>
        </article>

        <article class="admin-demo-stat">
          <span class="admin-demo-stat-icon">!</span>
          <span>
            <small>Sin movimientos</small>
            <strong>${emptyDemos.length}</strong>
          </span>
        </article>

      </div>

      <div class="admin-demo-toolbar">
        <div>
          <strong>Limpieza de demostraciones vacías</strong>
          <p>
            Solo se eliminarán las DEMOs confirmadas con cero movimientos.
            Las demás se conservarán.
          </p>
        </div>

        <button
          class="admin-danger"
          id="cleanup-empty-demos"
          type="button"
          ${emptyDemos.length ? '' : 'disabled'}
        >
          <i class="bi bi-trash3" aria-hidden="true"></i>
          Eliminar DEMOs vacías (${emptyDemos.length})
        </button>
      </div>

      <div
        id="admin-demo-feedback"
        class="admin-demo-feedback"
        role="status"
        aria-live="polite">
      </div>

      ${rows.map(({ vehicle, demos, error }) => {

        const vehicleId = Number(vehicle.id_vehiculo);
        const vehicleName = vehicle.nombre || `Vehículo ${vehicleId}`;

        if (error) {
          return `
            <article class="admin-demo-vehicle">
              <div class="admin-demo-vehicle-header">
                <div>
                  <small>VEHÍCULO #${vehicleId}</small>
                  <h3>${escapeHTML(vehicleName)}</h3>
                </div>
                <span class="admin-demo-status is-error">
                  Error de consulta
                </span>
              </div>
              <p class="admin-muted">${escapeHTML(error)}</p>
            </article>`;
        }

        if (!demos.length) {
          return `
            <article class="admin-demo-vehicle">
              <div class="admin-demo-vehicle-header">
                <div>
                  <small>VEHÍCULO #${vehicleId}</small>
                  <h3>${escapeHTML(vehicleName)}</h3>
                </div>
                <span class="admin-status-pill">0 DEMOs</span>
              </div>
              <p class="admin-muted">
                Este vehículo todavía no tiene demostraciones registradas.
              </p>
            </article>`;
        }

        return `
          <article class="admin-demo-vehicle">

            <div class="admin-demo-vehicle-header">
              <div>
                <small>VEHÍCULO #${vehicleId}</small>
                <h3>${escapeHTML(vehicleName)}</h3>
              </div>

              <span class="admin-status-pill">
                ${demos.length} DEMO${demos.length === 1 ? '' : 's'}
              </span>
            </div>

            <div class="admin-demo-grid">

              ${demos.map(({ demo, movementCount, error: movementError }) => {

                const isEmpty = movementCount === 0 && !movementError;
                const isUnknown = movementCount === null;

                const statusClass = isEmpty
                  ? 'is-empty'
                  : isUnknown
                    ? 'is-error'
                    : '';

                const statusText = isEmpty
                  ? 'Sin movimientos'
                  : isUnknown
                    ? 'No verificada'
                    : `${movementCount} movimiento${movementCount === 1 ? '' : 's'}`;

                return `
                  <div class="admin-demo-item">

                    <div class="admin-demo-item-copy">
                      <span class="admin-demo-item-icon">
                        <i class="bi bi-play-circle" aria-hidden="true"></i>
                      </span>

                      <span>
                        <strong>
                          ${escapeHTML(demo.nombre || `DEMO ${demo.id_demo}`)}
                        </strong>
                        <small>
                          ${movementError
                            ? escapeHTML(movementError)
                            : `ID de DEMO: ${Number(demo.id_demo)}`}
                        </small>
                      </span>
                    </div>

                    <span class="admin-demo-status ${statusClass}">
                      ${statusText}
                    </span>

                  </div>`;
              }).join('')}

            </div>
          </article>`;
      }).join('')}
    `;

    // Botón para eliminar demostraciones vacías
    const cleanupButton = document.getElementById(
      'cleanup-empty-demos'
    );

    cleanupButton?.addEventListener('click', async () => {

      if (!emptyDemos.length || cleanupButton.disabled) return;

      const accepted = confirm(
        `Se eliminarán ${emptyDemos.length} DEMO(s) que no tienen movimientos registrados. ` +
        'La operación es permanente. Las DEMOs con movimientos no se modificarán. ¿Deseas continuar?'
      );

      if (!accepted) return;

      cleanupButton.disabled = true;
      cleanupButton.textContent = 'Eliminando…';

      let deleted = 0;
      const failures = [];

      for (const item of emptyDemos) {

        try {
          await apiFetch(
            `/vehiculos/${item.vehicleId}/demos/${item.demoId}/eliminar`,
            {
              method: 'POST',
              body: {}
            }
          );

          deleted++;

        } catch (error) {

          failures.push(
            `${item.demoName} (vehículo ${item.vehicleId}): ${error.message}`
          );

        }
      }

      // Actualizar la interfaz después de eliminar
      await renderDemos();

      const feedback = document.getElementById(
        'admin-demo-feedback'
      );

      if (feedback) {

        if (failures.length) {

          feedback.className = 'admin-demo-feedback is-error';

          feedback.textContent =
            `Limpieza terminada: ${deleted} DEMO(s) eliminadas; ` +
            `${failures.length} no se pudieron eliminar. ` +
            failures.slice(0, 3).join(' | ');

        } else {

          feedback.className = 'admin-demo-feedback is-success';

          feedback.textContent =
            (deleted
              ? `Limpieza completada. Se eliminaron ${deleted} DEMO(s) sin movimientos.`
              : 'No había demostraciones vacías pendientes de eliminar.') +
            (unverifiedDemos.length
              ? ` ${unverifiedDemos.length} DEMO(s) no pudieron verificarse y se conservaron.`
              : '');
        }
      }
    });

    if (unverifiedDemos.length) {

      const feedback = document.getElementById(
        'admin-demo-feedback'
      );

      if (feedback) {
        feedback.className = 'admin-demo-feedback is-error';

        feedback.textContent =
          `${unverifiedDemos.length} DEMO(s) no pudieron verificarse. ` +
          'Se conservaron y no se incluirán en la limpieza.';
      }
    }

  } catch (error) {

    target.innerHTML = `
      <div class="admin-error">
        <strong>No se pudieron consultar las demostraciones.</strong>
        <p>${escapeHTML(error.message)}</p>
      </div>`;
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

async function renderClients() {
  adminShell('Clientes', 'clientes', `
    <div class="admin-section-heading">
      <div><h2>Directorio de clientes</h2><p>Crea cuentas con perfil Usuario. La contraseña inicial la define el administrador y debe compartirse de forma segura.</p></div>
      <button class="admin-action" id="new-client" type="button">+ Nuevo cliente</button>
    </div>
    <div id="admin-data" class="admin-data-panel">Cargando clientes…</div>`);
  document.getElementById('new-client')?.addEventListener('click', showCustomerForm);
  await loadClients();
}

async function loadClients() {
  const target = document.getElementById('admin-data');
  if (!target) return;
  target.textContent = 'Consultando clientes…';
  try {
    const clients = await apiFetch('/admin/clientes');
    if (!Array.isArray(clients) || !clients.length) {
      target.innerHTML = '<p>Aún no hay clientes registrados. Crea el primer cliente para poder asignarle un vehículo.</p>';
      return;
    }
    target.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>ID</th><th>Cliente</th><th>Usuario</th><th>Correo</th><th>Vehículos</th><th>Estado</th></tr></thead>
          <tbody>${clients.map((client) => `
            <tr>
              <td>#${Number(client.id_usuario)}</td>
              <td><strong>${escapeHTML(client.nombre)}</strong></td>
              <td>${escapeHTML(client.username || '—')}</td>
              <td>${escapeHTML(client.email || '—')}</td>
              <td>${Number(client.vehiculos_asignados || 0)}</td>
              <td><span class="admin-status-pill ${client.activo ? 'is-enabled' : ''}">${client.activo ? 'Activo' : 'Inactivo'}</span></td>
            </tr>`).join('')}</tbody>
        </table>
      </div>`;
  } catch (error) {
    target.innerHTML = `<div class="admin-error"><strong>No se pudieron consultar los clientes.</strong><p>${escapeHTML(error.message)}</p></div>`;
  }
}

function showCustomerForm() {
  const target = document.getElementById('admin-data');
  if (!target) return;
  target.innerHTML = `
    <form id="customer-form" class="admin-form admin-form-wide">
      <div><p class="admin-eyebrow">NUEVA CUENTA</p><h3>Registrar cliente</h3><p class="admin-muted">Se creará con el perfil <strong>user</strong>. Después podrás asignarle uno o más vehículos.</p></div>
      <div class="admin-form-grid">
        <label>Nombre completo<input name="nombre" required minlength="2" maxlength="120" autocomplete="name"></label>
        <label>Nombre de usuario<input name="username" requiredminlength="3" maxlength="80" pattern="[A-Za-z0-9_.\-]+"autocomplete="username"></label>
        <label>Correo electrónico<input name="email" type="email" required maxlength="254" autocomplete="email"></label>
        <label>Contraseña inicial<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"><small>Mínimo 12 caracteres, con mayúsculas, minúsculas y números.</small></label>
      </div>
      <div class="admin-form-actions">
        <button class="admin-action" type="submit">Crear cuenta de cliente</button>
        <button class="admin-secondary" id="cancel-client" type="button">Cancelar</button>
      </div>
      <p id="customer-form-message" class="admin-form-message" role="status"></p>
    </form>`;
  document.getElementById('cancel-client')?.addEventListener('click', loadClients);
  document.getElementById('customer-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    const message = document.getElementById('customer-form-message');
    const values = new FormData(form);
    const body = {
      nombre: String(values.get('nombre') || '').trim(),
      username: String(values.get('username') || '').trim(),
      email: String(values.get('email') || '').trim(),
      password: String(values.get('password') || ''),
    };
    button.disabled = true;
    message.textContent = 'Creando cuenta…';
    try {
      const result = await apiFetch('/admin/clientes', { method: 'POST', body });
      await loadClients();
      const targetNow = document.getElementById('admin-data');
      if (targetNow) {
        const notice = document.createElement('p');
        notice.className = 'admin-success-note';
        notice.textContent = `Cliente creado correctamente. ID ${result.id_usuario}. La contraseña no se volverá a mostrar.`;
        targetNow.prepend(notice);
      }
    } catch (error) {
      message.textContent = error.message;
      button.disabled = false;
    }
  });
}

async function renderAssignments() {
  adminShell('Asignaciones', 'asignaciones', `
    <div class="admin-section-heading">
      <div><h2>Asignación de vehículos</h2><p>Vincula una unidad disponible con una cuenta de cliente. Cada vehículo solo puede tener una asignación activa.</p></div>
    </div>
    <div id="assignment-form-host"></div>
    <div id="admin-data" class="admin-data-panel">Cargando asignaciones…</div>`);
  await loadAssignments();
}

async function loadAssignments() {
  const target = document.getElementById('admin-data');
  const formHost = document.getElementById('assignment-form-host');
  if (!target || !formHost) return;
  target.textContent = 'Consultando asignaciones…';
  formHost.textContent = 'Preparando formulario…';
  try {
    const [assignments, clients, inventory] = await Promise.all([
      apiFetch('/admin/asignaciones'),
      apiFetch('/admin/clientes'),
      apiFetch('/admin/vehiculos'),
    ]);
    const availableVehicles = inventory.filter((vehicle) => vehicle.activo && !vehicle.asignado);
    const activeClients = clients.filter((client) => client.activo);
    formHost.innerHTML = `
      <form id="assignment-form" class="admin-assignment-form">
        <label>Cliente<select name="id_usuario" required ${activeClients.length ? '' : 'disabled'}>
          <option value="">Selecciona un cliente</option>
          ${activeClients.map((client) => `<option value="${Number(client.id_usuario)}">${escapeHTML(client.nombre)} · ${escapeHTML(client.email)}</option>`).join('')}
        </select></label>
        <label>Vehículo disponible<select name="id_vehiculo" required ${availableVehicles.length ? '' : 'disabled'}>
          <option value="">Selecciona un vehículo</option>
          ${availableVehicles.map((vehicle) => `<option value="${Number(vehicle.id_vehiculo)}">${escapeHTML(vehicle.nombre)} · #${Number(vehicle.id_vehiculo)}</option>`).join('')}
        </select></label>
        <button class="admin-action" type="submit" ${activeClients.length && availableVehicles.length ? '' : 'disabled'}>Asignar vehículo</button>
      </form>
      ${!activeClients.length ? '<p class="admin-muted">Primero registra un cliente activo.</p>' : ''}
      ${!availableVehicles.length ? '<p class="admin-muted">No hay vehículos activos sin asignar.</p>' : ''}`;
    document.getElementById('assignment-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('[type="submit"]');
      const values = new FormData(form);
      button.disabled = true;
      try {
        await apiFetch('/admin/asignaciones', {
          method: 'POST',
          body: {
            id_usuario: Number(values.get('id_usuario')),
            id_vehiculo: Number(values.get('id_vehiculo')),
          },
        });
        await loadAssignments();
      } catch (error) {
        alert(error.message);
        button.disabled = false;
      }
    });

    if (!Array.isArray(assignments) || !assignments.length) {
      target.innerHTML = '<p>No hay asignaciones registradas todavía.</p>';
      return;
    }
    target.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>ID</th><th>Cliente</th><th>Correo</th><th>Vehículo</th><th>Fecha</th><th>Estado</th><th>Acción</th></tr></thead>
          <tbody>${assignments.map((item) => {
            const active = item.estado === 'activa' && !item.fecha_revocacion;
            const date = item.fecha_asignacion ? new Date(item.fecha_asignacion).toLocaleDateString('es-MX') : '—';
            return `<tr>
              <td>#${Number(item.id_asignacion)}</td>
              <td><strong>${escapeHTML(item.cliente || '—')}</strong></td>
              <td>${escapeHTML(item.email || '—')}</td>
              <td>${escapeHTML(item.vehiculo || '—')} · #${Number(item.id_vehiculo)}</td>
              <td>${escapeHTML(date)}</td>
              <td><span class="admin-status-pill ${active ? 'is-enabled' : ''}">${active ? 'Activa' : 'Revocada'}</span></td>
              <td>${active ? `<button class="admin-danger" data-revoke="${Number(item.id_asignacion)}" type="button">Revocar</button>` : '—'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
    target.querySelectorAll('[data-revoke]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = Number(button.dataset.revoke);
        if (!confirm(`¿Revocar la asignación ${id}? El cliente perderá acceso al vehículo.`)) return;
        button.disabled = true;
        try {
          await apiFetch(`/admin/asignaciones/${id}/revocar`, { method: 'POST', body: {} });
          await loadAssignments();
        } catch (error) {
          alert(error.message);
          button.disabled = false;
        }
      });
    });
  } catch (error) {
    formHost.innerHTML = `<div class="admin-error">${escapeHTML(error.message)}</div>`;
    target.innerHTML = `<div class="admin-error"><strong>No se pudieron consultar las asignaciones.</strong><p>${escapeHTML(error.message)}</p></div>`;
  }
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

function renderUserAccessNotice(message, title = 'Tu espacio de usuario') {
  if (appRoot) appRoot.hidden = true;
  authRoot.hidden = false;
  authRoot.innerHTML = `
    <section class="user-access-card">
      <div class="auth-brand">
        <span class="auth-symbol">◈</span>
        <div><p>YOLO · INTERNET OF THINGS</p><h1>CONTROL <span>IoT</span></h1></div>
      </div>
      <p class="admin-eyebrow">PERFIL USUARIO</p>
      <h2>${escapeHTML(title)}</h2>
      <p>${escapeHTML(message)}</p>
      <div class="user-access-details"><strong>${escapeHTML(currentUser?.nombre || currentUser?.email || 'Usuario')}</strong><span>${escapeHTML(currentUser?.email || '')}</span></div>
      <button id="logout-button" class="auth-secondary" type="button">Cerrar sesión</button>
    </section>`;
  bindLogout();
}

async function openUserApplication() {
  try {
    const vehicles = await apiFetch('/auth/me/vehiculos');
    if (!Array.isArray(vehicles) || vehicles.length === 0) {
      renderUserAccessNotice(
        'Tu cuenta está activa, pero todavía no tiene un vehículo asignado. Solicita al administrador que realice la asignación.',
        'Aún no tienes un vehículo asignado'
      );
      return;
    }

    window.__CONTROL_IOT_ALLOWED_VEHICLES__ = vehicles;
    window.__CONTROL_IOT_VEHICLE_ID__ = Number(vehicles[0].id_vehiculo);

    const selector = document.getElementById('vehicle-id');
    if (selector) {
      selector.innerHTML = vehicles.map((vehicle) => `
        <option value="${Number(vehicle.id_vehiculo)}">
          ${escapeHTML(vehicle.nombre || `Vehículo ${vehicle.id_vehiculo}`)} · #${Number(vehicle.id_vehiculo)}
        </option>`).join('');
      selector.value = String(window.__CONTROL_IOT_VEHICLE_ID__);
    }

    if (appRoot) {
      let sessionBar = appRoot.querySelector('.user-session-bar');
      if (!sessionBar) {
        sessionBar = document.createElement('div');
        sessionBar.className = 'user-session-bar';
        appRoot.prepend(sessionBar);
      }
      sessionBar.innerHTML = `
        <div><span class="user-session-mark">◈</span><span><strong>${escapeHTML(currentUser?.nombre || 'Usuario')}</strong><small>PERFIL USUARIO · CONTROL DE VEHÍCULO ASIGNADO</small></span></div>
        <button id="user-logout-button" type="button">Cerrar sesión <span>↗</span></button>`;
      sessionBar.querySelector('#user-logout-button')?.addEventListener('click', logout);
      appRoot.hidden = false;
    }
    authRoot.hidden = true;
    await import('./app.js');
  } catch (error) {
    renderUserAccessNotice(
      `No se pudo consultar tu vehículo asignado. ${error.message}`,
      'No se pudo cargar tu espacio'
    );
  }
}

function bindLogout() {
  document.getElementById('logout-button')?.addEventListener('click', logout);
}

async function logout() {
  stopSessionTimers();
  try { window.__CONTROL_IOT_SHUTDOWN__?.(); } catch { /* cierre local seguro */ }
  window.__CONTROL_IOT_SHUTDOWN__ = undefined;
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

async function restoreSession() {
  renderLogin('Comprobando sesión activa…');
  try {
    const csrfResponse = await fetch(`${APP_CONFIG.API_BASE_URL}/auth/csrf`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      mode: 'cors',
      credentials: 'include',
      cache: 'no-store',
    });
    const csrfData = await csrfResponse.json().catch(() => ({}));
    if (!csrfResponse.ok || !csrfData.csrf_token) {
      throw new Error('No hay una sesión renovable.');
    }

    csrfToken = csrfData.csrf_token;
    const tokens = await postAuth('refresh', {});
    if (!tokens.access_token) throw new Error('La sesión no pudo renovarse.');

    currentAccessToken = tokens.access_token;
    setAccessToken(tokens.access_token);
    const user = await apiFetch('/auth/me');
    await openSession({
      usuario: user,
      access_token: tokens.access_token,
      expires_in: tokens.expires_in,
      csrf_token: tokens.csrf_token,
    });
  } catch {
    clearLocalSession();
    renderLogin();
  }
}

restoreSession();