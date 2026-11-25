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

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function renderLogin(message = '') {
  authRoot.innerHTML = `
    <section class="auth-card">
      <div class="auth-brand"><span class="auth-symbol">◈</span><div><p>YOLO · INTERNET OF THINGS</p><h1>CONTROL <span>IoT</span></h1></div></div>
      <h2>Iniciar sesión</h2><p class="auth-muted">Accede a tu cuenta para utilizar la plataforma.</p>
      <form id="login-form">
        <label for="login-email">Correo electrónico</label><input id="login-email" type="email" autocomplete="username" required maxlength="254">
        <label for="login-password">Contraseña</label><input id="login-password" type="password" autocomplete="current-password" required>
        <button type="submit" class="auth-primary">Iniciar sesión</button>
      </form>
      <button id="show-register" class="auth-secondary">Crear cuenta de invitado</button>
      <p id="auth-message" role="status" aria-live="polite">${escapeHTML(message)}</p>
    </section>`;
  document.getElementById('login-form').addEventListener('submit', login);
  document.getElementById('show-register').addEventListener('click', renderRegister);
}

function renderRegister(message = '') {
  authRoot.innerHTML = `
    <section class="auth-card">
      <div class="auth-brand"><span class="auth-symbol">◈</span><div><p>YOLO · INTERNET OF THINGS</p><h1>CONTROL <span>IoT</span></h1></div></div>
      <h2>Registro de invitado</h2><p class="auth-muted">Crea una cuenta para conocer nuestros vehículos.</p>
      <form id="register-form">
        <label for="guest-name">Nombre</label><input id="guest-name" required minlength="2" maxlength="120">
        <label for="guest-email">Correo electrónico</label><input id="guest-email" type="email" autocomplete="email" required maxlength="254">
        <label for="guest-password">Contraseña</label><input id="guest-password" type="password" autocomplete="new-password" minlength="12" required>
        <button type="submit" class="auth-primary">Crear cuenta</button>
      </form>
      <button id="show-login" class="auth-secondary">Volver al inicio de sesión</button>
      <p id="auth-message" role="status" aria-live="polite">${escapeHTML(message)}</p>
    </section>`;
  document.getElementById('register-form').addEventListener('submit', registerGuest);
  document.getElementById('show-login').addEventListener('click', () => renderLogin());
}

async function postAuth(path, body) {
  const response = await fetch(`${APP_CONFIG.API_BASE_URL}/auth/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body), mode: 'cors', credentials: 'include', cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.mensaje || data?.detail || data?.mensaje || `Error HTTP ${response.status}`);
  return data;
}

async function login(event) {
  event.preventDefault();
  const button = event.submitter;
  const message = document.getElementById('auth-message');
  button.disabled = true; message.textContent = 'Verificando credenciales…';
  try {
    const result = await postAuth('login', {
      email: document.getElementById('login-email').value.trim(),
      password: document.getElementById('login-password').value,
    });
    await openSession(result);
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
}

async function registerGuest(event) {
  event.preventDefault();
  const button = event.submitter;
  const message = document.getElementById('auth-message');
  button.disabled = true; message.textContent = 'Creando cuenta…';
  try {
    const result = await postAuth('registro-invitado', {
      nombre: document.getElementById('guest-name').value.trim(),
      email: document.getElementById('guest-email').value.trim(),
      password: document.getElementById('guest-password').value,
    });
    await openSession(result);
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
}

async function openSession(result) {
  if (!result.access_token || !result.usuario) throw new Error('La API no devolvió una sesión válida.');
  currentUser = result.usuario;
  currentAccessToken = result.access_token;
  setAccessToken(result.access_token);
  const roles = currentUser.roles || [];
  if (roles.includes('admin')) { renderAdmin(); return; }
  if (roles.includes('user')) { await openUserApplication(); return; }
  if (roles.includes('guest')) { renderGuest(); return; }
  clearAccessToken(); currentAccessToken = null;
  throw new Error('La cuenta no tiene un perfil autorizado.');
}

function apiFetch(path, options = {}) {
  if (!currentAccessToken) throw new Error('La sesión no tiene un token de acceso. Inicia sesión nuevamente.');
  const method = options.method || 'GET';
  return fetch(`${APP_CONFIG.API_BASE_URL}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${currentAccessToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    mode: 'cors', credentials: 'omit', cache: 'no-store',
  }).then(async response => {
    const raw = await response.text();
    const data = raw ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : null;
    if (!response.ok) {
      const detail = data?.error?.mensaje || data?.detail || data?.mensaje || `Error HTTP ${response.status}`;
      throw new Error(detail);
    }
    return data;
  });
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
  authRoot.innerHTML = `
    <div class="admin-layout">
      <aside class="admin-sidebar">
        <div class="admin-brand"><span class="admin-brand-icon">◈</span><div><strong>CONTROL IoT</strong><small>PLATAFORMA EMPRESARIAL</small></div></div>
        <div class="admin-user"><div class="admin-avatar">A</div><div><strong>${escapeHTML(currentUser?.nombre || currentUser?.email || 'Administrador')}</strong><small>Administrador</small></div></div>
        <nav class="admin-navigation">
          <span class="admin-nav-label">PRINCIPAL</span>
          <button class="admin-nav-item ${active === 'inicio' ? 'active' : ''}" data-page="inicio"><span>⌂</span>Resumen general</button>
          <span class="admin-nav-label">GESTIÓN</span>
          ${modules.map(([id, icon, label]) => `<button class="admin-nav-item ${active === id ? 'active' : ''}" data-page="${id}"><span>${icon}</span>${label}</button>`).join('')}
        </nav>
        <button id="logout-button" class="admin-logout">↪ Cerrar sesión</button>
      </aside>
      <main class="admin-main">
        <header class="admin-topbar"><div><span class="admin-breadcrumb">CONTROL IoT / ADMINISTRACIÓN</span><h1>${escapeHTML(title)}</h1></div><button class="admin-icon-button" data-page="mensajes" title="Mensajes">✉</button></header>
        <section class="admin-content">${content}</section>
      </main>
    </div>`;
  document.getElementById('logout-button')?.addEventListener('click', logout);
  authRoot.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => openAdminPage(button.dataset.page)));
}

function renderAdmin() {
  const cards = modules.map(([id, icon, label, description]) => `
    <button class="admin-module-card" data-page="${id}"><span class="admin-module-icon">${icon}</span><span class="admin-module-arrow">↗</span><strong>${label}</strong><small>${description}</small></button>`).join('');
  adminShell('Resumen general', 'inicio', `
    <div class="admin-welcome"><div><span class="admin-eyebrow">CENTRO DE OPERACIONES</span><h2>Bienvenido, ${escapeHTML(currentUser?.nombre || 'Administrador')}</h2><p>Administra los recursos y operaciones de tu empresa.</p></div><div class="admin-welcome-symbol">◈</div></div>
    <div class="admin-section-heading"><div><h2>Módulos de gestión</h2><p>Selecciona el área que deseas administrar.</p></div></div>
    <div class="admin-module-grid">${cards}</div>
    <div class="admin-information"><span>●</span><div><strong>Plataforma conectada</strong><p>Las consultas y operaciones disponibles se realizan contra el backend.</p></div></div>`);
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
  adminShell(title, page, `<div class="admin-section-heading"><div><h2>${title}</h2><p>Registros almacenados en la base de datos.</p></div><button class="admin-action" id="new-vehicle">+ Registrar vehículo</button></div><div id="admin-data" class="admin-data-panel">Cargando vehículos…</div>`);
  document.getElementById('new-vehicle')?.addEventListener('click', showVehicleForm);
  await loadVehicles();
}

async function loadVehicles() {
  const target = document.getElementById('admin-data');
  if (!target) return;
  target.textContent = 'Consultando vehículos…';
  try {
    const vehicles = await apiFetch('/vehiculos?incluir_detalle=false');
    if (!Array.isArray(vehicles) || !vehicles.length) {
      target.innerHTML = '<p>No hay vehículos registrados. Utiliza “Registrar vehículo” para agregar el primero.</p>';
      return;
    }
    target.innerHTML = `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>ID</th><th>Nombre</th><th>Modelo</th><th>Microcontrolador</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${vehicles.map(v => `<tr><td>${escapeHTML(v.id_vehiculo)}</td><td>${escapeHTML(v.nombre)}</td><td>${escapeHTML(v.modelo || '—')}</td><td>${escapeHTML(v.microcontrolador || '—')}</td><td>${v.activo ? 'Activo' : 'Inactivo'}</td><td><button class="admin-action" data-edit="${Number(v.id_vehiculo)}">Editar</button> <button class="admin-danger" data-delete="${Number(v.id_vehiculo)}">Eliminar</button></td></tr>`).join('')}</tbody></table></div>`;
    target.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => showVehicleForm(vehicles.find(v => v.id_vehiculo === Number(btn.dataset.edit)))));
    target.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', () => deleteVehicle(Number(btn.dataset.delete))));
  } catch (error) { target.innerHTML = `<div class="admin-error"><strong>No se pudo consultar el inventario.</strong><p>${escapeHTML(error.message)}</p></div>`; }
}

function showVehicleForm(vehicle = null) {
  const target = document.getElementById('admin-data');
  if (!target) return;
  target.innerHTML = `<form id="vehicle-form" class="admin-form"><h3>${vehicle ? 'Editar vehículo' : 'Registrar vehículo'}</h3><label>Nombre<input name="nombre" required maxlength="80" value="${escapeHTML(vehicle?.nombre || '')}"></label><label>Modelo<input name="modelo" maxlength="80" value="${escapeHTML(vehicle?.modelo || '')}"></label><label>Descripción<input name="descripcion" maxlength="255" value="${escapeHTML(vehicle?.descripcion || '')}"></label><label>Microcontrolador<input name="microcontrolador" maxlength="50" value="${escapeHTML(vehicle?.microcontrolador || 'ESP8266')}"></label>${vehicle ? `<label class="admin-check"><input name="activo" type="checkbox" ${vehicle.activo ? 'checked' : ''}> Vehículo activo</label>` : ''}<div class="admin-form-actions"><button class="admin-action" type="submit">${vehicle ? 'Guardar cambios' : 'Crear vehículo'}</button><button class="admin-secondary" type="button" id="cancel-form">Cancelar</button></div><p id="vehicle-form-message" role="status"></p></form>`;
  document.getElementById('cancel-form').addEventListener('click', loadVehicles);
  document.getElementById('vehicle-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = document.getElementById('vehicle-form-message');
    const fd = new FormData(form);
    const body = { nombre: fd.get('nombre').trim(), modelo: fd.get('modelo').trim() || null, descripcion: fd.get('descripcion').trim() || null, microcontrolador: fd.get('microcontrolador').trim() || null };
    if (vehicle) body.activo = fd.get('activo') === 'on';
    try {
      await apiFetch(vehicle ? `/vehiculos/${vehicle.id_vehiculo}/actualizar` : '/vehiculos', { method: 'POST', body });
      await loadVehicles();
    } catch (error) { message.textContent = error.message; }
  });
}

async function deleteVehicle(id) {
  if (!confirm(`¿Eliminar el vehículo ${id}? Esta operación puede borrar sus datos relacionados.`)) return;
  try { await apiFetch(`/vehiculos/${id}/eliminar`, { method: 'POST', body: {} }); await loadVehicles(); }
  catch (error) { alert(`No se pudo eliminar: ${error.message}`); }
}

async function renderDemos() {
  adminShell('DEMO de empresa', 'demos', `<div class="admin-section-heading"><div><h2>Demostraciones por vehículo</h2><p>Consulta las secuencias registradas.</p></div></div><div id="admin-data" class="admin-data-panel">Cargando…</div>`);
  const target = document.getElementById('admin-data');
  try {
    const vehicles = await apiFetch('/vehiculos?incluir_detalle=false');
    if (!vehicles.length) { target.textContent = 'No hay vehículos registrados.'; return; }
    const rows = await Promise.all(vehicles.map(async v => ({ vehicle: v, demos: await apiFetch(`/vehiculos/${v.id_vehiculo}/demos`) })));
    target.innerHTML = rows.map(({vehicle, demos}) => `<div class="admin-list-item"><div><strong>${escapeHTML(vehicle.nombre)}</strong><small>${demos.length} DEMO registradas</small>${demos.map(d => `<p>${escapeHTML(d.nombre || `DEMO ${d.id_demo}`)}</p>`).join('')}</div></div>`).join('');
  } catch (error) { target.textContent = error.message; }
}

async function renderAudit() {
  adminShell('Auditoría y soporte', 'auditoria', `<div class="admin-section-heading"><div><h2>Historial por vehículo</h2><p>Consulta los últimos movimientos individuales registrados.</p></div></div><div id="admin-data" class="admin-data-panel">Cargando…</div>`);
  const target = document.getElementById('admin-data');
  try {
    const vehicles = await apiFetch('/vehiculos?incluir_detalle=false');
    target.innerHTML = vehicles.map(v => `<div class="admin-list-item"><div><strong>${escapeHTML(v.nombre)}</strong><small>Vehículo ${v.id_vehiculo}</small></div><button class="admin-action" data-history="${Number(v.id_vehiculo)}">Ver historial</button></div>`).join('');
    target.querySelectorAll('[data-history]').forEach(btn => btn.addEventListener('click', async () => {
      try { const data = await apiFetch(`/vehiculos/${btn.dataset.history}/historial`); target.innerHTML = `<button class="admin-secondary" id="history-back">← Volver</button><pre class="admin-json">${escapeHTML(JSON.stringify(data, null, 2))}</pre>`; document.getElementById('history-back').addEventListener('click', renderAudit); }
      catch (error) { alert(error.message); }
    }));
  } catch (error) { target.textContent = error.message; }
}

function renderUnavailable(page) {
  const info = {
    clientes: ['Gestión de clientes', 'El backend todavía no cuenta con endpoints CRUD de clientes.'],
    asignaciones: ['Asignaciones', 'El backend todavía no cuenta con endpoints para asignar vehículos a clientes.'],
    mensajes: ['Centro de mensajes', 'El backend todavía no cuenta con almacenamiento ni endpoints de mensajería.'],
  }[page];
  adminShell(info[0], page, `<div class="admin-empty-state"><div class="admin-empty-icon">${page === 'mensajes' ? '✉' : '◈'}</div><h2>${info[0]}</h2><p>${info[1]}</p><p class="admin-muted">No se muestran datos ficticios. Este módulo se habilitará cuando se implemente su API y su tabla correspondiente.</p></div>`);
}

function renderHeader(title, description) {
  return `<header class="profile-header"><div><p>CONTROL IoT · PLATAFORMA</p><h1>${escapeHTML(title)}</h1><span>${escapeHTML(description)}</span></div><button id="logout-button" class="auth-secondary">Cerrar sesión</button></header>`;
}

function renderGuest() {
  authRoot.innerHTML = `${renderHeader('CATÁLOGO', 'Bienvenido a la experiencia de vehículos IoT')}<section class="guest-welcome"><div class="guest-icon">◈</div><h2>Conoce nuestros vehículos</h2><p>Explora las características de nuestros modelos y solicita una demostración con una unidad de exhibición.</p><div class="profile-notice">La reserva y el control temporal se habilitarán cuando esté implementado el servicio de sesiones exclusivas de exhibición.</div></section>`;
  bindLogout();
}

async function openUserApplication() {
  authRoot.hidden = true;
  if (appRoot) appRoot.hidden = false;
  try { await import('./app.js'); }
  catch (error) { authRoot.hidden = false; if (appRoot) appRoot.hidden = true; renderLogin(`No se pudo iniciar la aplicación: ${error.message}`); }
}

function bindLogout() { document.getElementById('logout-button')?.addEventListener('click', logout); }

async function logout() {
  try { await postAuth('logout', {}); } catch { /* La limpieza local se mantiene aunque falle la revocación remota. */ }
  clearAccessToken(); currentAccessToken = null; currentUser = null;
  if (appRoot) appRoot.hidden = true;
  renderLogin('Sesión cerrada.');
}

renderLogin();
