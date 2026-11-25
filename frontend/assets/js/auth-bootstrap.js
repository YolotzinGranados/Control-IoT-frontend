
import { APP_CONFIG } from './config/app-config.js';
import { setAccessToken, clearAccessToken } from './api/http-client.js';
import { clearCsrfToken, getCsrfToken, refreshAccessToken, setCsrfToken } from './api/auth-session.js';

const root = document.querySelector('.app-shell');

if (root) root.hidden = true;

const authRoot = document.createElement('main');
authRoot.id = 'auth-root';
authRoot.className = 'auth-shell';
document.body.prepend(authRoot);

let currentUser = null;
let refreshTimer = null;

function scheduleRefresh(expiresIn) {
  window.clearTimeout(refreshTimer);
  if (!Number.isFinite(Number(expiresIn)) || Number(expiresIn) <= 0) return;

  const delay = Math.max(1000, (Number(expiresIn) - 60) * 1000);
  refreshTimer = window.setTimeout(async () => {
    try {
      const tokens = await refreshAccessToken(APP_CONFIG.API_BASE_URL);
      scheduleRefresh(tokens.expires_in);
    } catch (error) {
      clearAccessToken();
      currentUser = null;
      if (root) root.hidden = true;
      renderLogin(error.message);
    }
  }, delay);
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function renderLogin(message = '') {
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
      <p class="auth-muted">
        Accede a tu cuenta para utilizar la plataforma.
      </p>

      <form id="login-form">
        <label for="login-email">Correo electrónico</label>
        <input id="login-email" type="email"
          autocomplete="username" required maxlength="254">

        <label for="login-password">Contraseña</label>
        <input id="login-password" type="password"
          autocomplete="current-password" required>

        <button type="submit" class="auth-primary">
          Iniciar sesión
        </button>
      </form>

      <button id="show-register" class="auth-secondary">
        Crear cuenta de invitado
      </button>

      <p id="auth-message" role="status" aria-live="polite">
        ${escapeHTML(message)}
      </p>
    </section>
  `;

  document.getElementById('login-form').addEventListener('submit', login);

  document.getElementById('show-register').addEventListener(
    'click',
    renderRegister
  );
}

function renderRegister(message = '') {
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
      <p class="auth-muted">
        Crea una cuenta para conocer nuestros vehículos.
      </p>

      <form id="register-form">
        <label for="guest-name">Nombre</label>
        <input id="guest-name" required minlength="2" maxlength="120">

        <label for="guest-email">Correo electrónico</label>
        <input id="guest-email" type="email"
          autocomplete="email" required maxlength="254">

        <label for="guest-password">Contraseña</label>
        <input id="guest-password" type="password"
          autocomplete="new-password" minlength="12" required>

        <button type="submit" class="auth-primary">
          Crear cuenta
        </button>
      </form>

      <button id="show-login" class="auth-secondary">
        Volver al inicio de sesión
      </button>

      <p id="auth-message" role="status" aria-live="polite">
        ${escapeHTML(message)}
      </p>
    </section>
  `;

  document.getElementById('register-form')
    .addEventListener('submit', registerGuest);

  document.getElementById('show-login')
    .addEventListener('click', () => renderLogin());
}

async function postAuth(path, body) {
  const csrfToken = path === 'logout'
    ? await getCsrfToken(APP_CONFIG.API_BASE_URL).catch(() => null)
    : null;
  const response = await fetch(
    `${APP_CONFIG.API_BASE_URL}/auth/${path}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
      body: JSON.stringify(body),
      mode: 'cors',
      credentials: 'include',
      cache: 'no-store',
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.error?.mensaje
      || data?.detail
      || data?.mensaje
      || `Error HTTP ${response.status}`
    );
  }

  return data;
}

async function login(event) {
  event.preventDefault();

  const button = event.submitter;
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

  const button = event.submitter;
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

async function openSession(result) {
  if (!result.access_token || !result.usuario) {
    throw new Error('La API no devolvió una sesión válida.');
  }

  currentUser = result.usuario;
  setAccessToken(result.access_token);
  setCsrfToken(result.csrf_token);
  scheduleRefresh(result.expires_in);

  const roles = currentUser.roles || [];

  if (roles.includes('admin')) {
    renderAdmin();
    return;
  }

  if (roles.includes('user')) {
    await openUserApplication();
    return;
  }

  if (roles.includes('guest')) {
    renderGuest();
    return;
  }

  clearAccessToken();
  throw new Error('La cuenta no tiene un perfil autorizado.');
}

function renderHeader(title, description) {
  return `
    <header class="profile-header">
      <div>
        <p>CONTROL IoT · PLATAFORMA</p>
        <h1>${escapeHTML(title)}</h1>
        <span>${escapeHTML(description)}</span>
      </div>
      <button id="logout-button" class="auth-secondary">
        Cerrar sesión
      </button>
    </header>
  `;
}

function renderAdmin() {
  authRoot.innerHTML = `
    ${renderHeader('ADMINISTRACIÓN', 'Panel de gestión de la empresa')}

    <section class="profile-grid">
      <article class="profile-tile">
        <span>01</span>
        <h2>Modelos</h2>
        <p>Catálogo comercial de vehículos.</p>
      </article>

      <article class="profile-tile">
        <span>02</span>
        <h2>Inventario</h2>
        <p>Registro y disponibilidad de unidades.</p>
      </article>

      <article class="profile-tile">
        <span>03</span>
        <h2>Clientes</h2>
        <p>Gestión de compradores.</p>
      </article>

      <article class="profile-tile">
        <span>04</span>
        <h2>Asignaciones</h2>
        <p>Relación entre clientes y vehículos.</p>
      </article>

      <article class="profile-tile">
        <span>05</span>
        <h2>DEMO de empresa</h2>
        <p>Secuencias comerciales de exhibición.</p>
      </article>

      <article class="profile-tile">
        <span>06</span>
        <h2>Auditoría y soporte</h2>
        <p>Operaciones autorizadas y registradas.</p>
      </article>
    </section>

    <p class="profile-notice">
      La interfaz administrativa está creada como estructura inicial.
      Los módulos de inventario, clientes y asignaciones requieren
      sus respectivos endpoints y permisos de backend.
    </p>
  `;

  bindLogout();
}

function renderGuest() {
  authRoot.innerHTML = `
    ${renderHeader('CATÁLOGO', 'Bienvenido a la experiencia de vehículos IoT')}

    <section class="guest-welcome">
      <div class="guest-icon">◈</div>
      <h2>Conoce nuestros vehículos</h2>
      <p>
        Explora las características de nuestros modelos y solicita
        una demostración con una unidad de exhibición.
      </p>
      <div class="profile-notice">
        La reserva y el control temporal se habilitarán cuando esté
        implementado el servicio de sesiones exclusivas de exhibición.
      </div>
    </section>
  `;

  bindLogout();
}

async function openUserApplication() {
  authRoot.hidden = true;

  if (root) root.hidden = false;

  try {
    await import('./app.js');
  } catch (error) {
    authRoot.hidden = false;
    if (root) root.hidden = true;
    renderLogin(`No se pudo iniciar la aplicación: ${error.message}`);
  }
}

function bindLogout() {
  document.getElementById('logout-button')
    ?.addEventListener('click', logout);
}

async function logout() {
  window.clearTimeout(refreshTimer);
  refreshTimer = null;
  try {
    await postAuth('logout', {});
  } catch {
    // La limpieza local se realiza aunque falle la revocación remota.
  }

  clearAccessToken();
  clearCsrfToken();
  currentUser = null;

  if (root) root.hidden = true;

  renderLogin('Sesión cerrada.');
}

async function restoreSession() {
  renderLogin('Comprobando sesión…');
  try {
    const tokens = await refreshAccessToken(APP_CONFIG.API_BASE_URL);
    const response = await fetch(`${APP_CONFIG.API_BASE_URL}/auth/me`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${tokens.access_token}`,
      },
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
    });
    const user = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(user?.error?.mensaje || user?.detail || 'No se pudo recuperar la sesión.');
    }
    await openSession({ ...tokens, usuario: user });
  } catch {
    clearAccessToken();
    clearCsrfToken();
    window.clearTimeout(refreshTimer);
    refreshTimer = null;
    renderLogin();
  }
}

restoreSession();
