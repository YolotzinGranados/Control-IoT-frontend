
import { APP_CONFIG } from './config/app-config.js';
import { HttpClient } from './api/http-client.js';

const http = new HttpClient(
  APP_CONFIG.API_BASE_URL,
  APP_CONFIG.REQUEST_TIMEOUT_MS
);

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function loadStylesheet() {
  if (document.getElementById('user-dashboard-styles')) return;

  const link = document.createElement('link');
  link.id = 'user-dashboard-styles';
  link.rel = 'stylesheet';
  link.href = new URL(
    './assets/css/user-dashboard.css',
    document.baseURI
  ).href;

  document.head.appendChild(link);
}

function vehicleCard(vehicle, selectedId) {
  const id = Number(vehicle.id_vehiculo);
  const selected = id === Number(selectedId);
  const active = vehicle.activo === true;

  const model = [
    vehicle.modelo,
    vehicle.microcontrolador
  ].filter(Boolean).map(escapeHTML).join(' · ');

  return `
    <article class="ud-vehicle-card ${selected ? 'is-selected' : ''}">
      <div class="ud-vehicle-card-top">
        <span class="ud-vehicle-icon">
          <i class="bi bi-truck-front-fill"></i>
        </span>

        <span class="ud-status-pill ${active ? 'is-active' : 'is-inactive'}">
          ${active ? 'Asignado' : 'Inactivo'}
        </span>
      </div>

      <div class="ud-vehicle-copy">
        <span class="ud-overline">UNIDAD #${id}</span>
        <h3>${escapeHTML(vehicle.nombre || `Vehículo ${id}`)}</h3>
        <p>${model || 'Modelo no especificado'}</p>
        <small>
          ${escapeHTML(vehicle.descripcion || 'Vehículo asignado a tu cuenta.')}
        </small>
      </div>

      <div class="ud-vehicle-actions">
        <button
          class="ud-button ud-button-secondary"
          type="button"
          data-action="select-vehicle"
          data-id="${id}"
          ${selected ? 'disabled' : ''}
        >
          ${selected ? 'Seleccionado' : 'Seleccionar'}
        </button>

        <button
          class="ud-button ud-button-primary"
          type="button"
          data-action="open-control"
          data-id="${id}"
          ${active ? '' : 'disabled'}
        >
          Controlar <i class="bi bi-arrow-up-right"></i>
        </button>
      </div>
    </article>
  `;
}

export async function mountUserDashboard({
  container,
  user,
  onLogout = () => {},
  onOpenVehicle = async () => {},
}) {
  if (!container) {
    throw new Error('No se encontró el contenedor del perfil Usuario.');
  }

  loadStylesheet();

  container.classList.add('user-dashboard-host');
  container.hidden = false;

  let vehicles = [];
  let selectedVehicleId = null;
  let activeView = 'dashboard';

  container.innerHTML = `
    <div class="ud-shell">

      <aside class="ud-sidebar">

        <div class="ud-brand">
          <span class="ud-brand-mark">
            <i class="bi bi-cpu-fill"></i>
          </span>

          <span class="ud-brand-copy">
            <strong>CONTROL <b>IoT</b></strong>
            <small>PORTAL DE CLIENTE</small>
          </span>
        </div>

        <div class="ud-nav-caption">MENÚ PRINCIPAL</div>

        <nav class="ud-nav" aria-label="Navegación del usuario">

          <button type="button" class="is-active" data-view="dashboard">
            <i class="bi bi-grid-1x2-fill"></i>
            <span>Dashboard</span>
          </button>

          <button type="button" data-view="vehicles">
            <i class="bi bi-truck-front"></i>
            <span>Mis vehículos</span>
          </button>

          <button type="button" data-view="control">
            <i class="bi bi-controller"></i>
            <span>Control</span>
          </button>

          <button type="button" data-view="monitor">
            <i class="bi bi-activity"></i>
            <span>Monitoreo</span>
          </button>

          <button type="button" data-view="history">
            <i class="bi bi-clock-history"></i>
            <span>Historial</span>
          </button>

          <button type="button" data-view="account">
            <i class="bi bi-person-circle"></i>
            <span>Mi cuenta</span>
          </button>

        </nav>

        <div class="ud-sidebar-bottom">

          <div class="ud-sidebar-user">
            <span class="ud-avatar">
              <i class="bi bi-person-fill"></i>
            </span>

            <span>
              <strong>${escapeHTML(user?.nombre || 'Usuario')}</strong>
              <small>Cuenta de comprador</small>
            </span>
          </div>

          <button id="ud-logout" class="ud-logout" type="button">
            <i class="bi bi-box-arrow-left"></i>
            Cerrar sesión
          </button>

        </div>
      </aside>

      <main class="ud-main">

        <header class="ud-topbar">

          <div>
            <span class="ud-overline">ÁREA PERSONAL</span>
            <h1 id="ud-page-title">Dashboard</h1>
          </div>

          <div class="ud-topbar-user">
            <span class="ud-topbar-avatar">
              <i class="bi bi-person-fill"></i>
            </span>

            <span>
              <strong>${escapeHTML(user?.nombre || 'Usuario')}</strong>
              <small>${escapeHTML(user?.email || '')}</small>
            </span>
          </div>

        </header>

        <div id="ud-page" class="ud-page">

          <div class="ud-loading">
            <span class="ud-spinner"></span>
            <span>Cargando tus vehículos asignados…</span>
          </div>

        </div>

        <footer class="ud-footer">
          <span>CONTROL IoT · YOLO</span>
          <span>Portal de usuario · 2026</span>
        </footer>

      </main>
    </div>
  `;

  const page = container.querySelector('#ud-page');
  const title = container.querySelector('#ud-page-title');

  function selectedVehicle() {
    return vehicles.find(
      item => Number(item.id_vehiculo) === Number(selectedVehicleId)
    ) || null;
  }

  function setActiveNav(view) {
    container.querySelectorAll('.ud-nav [data-view]').forEach(button => {
      button.classList.toggle(
        'is-active',
        button.dataset.view === view
      );
    });
  }

  function emptyVehicles() {
    return `
      <div class="ud-empty">

        <span><i class="bi bi-truck"></i></span>

        <h3>Aún no tienes vehículos asignados</h3>

        <p>
          Cuando el administrador vincule una unidad con tu cuenta,
          aparecerá en esta sección.
        </p>

      </div>
    `;
  }

  function renderDashboard() {
    const chosen = selectedVehicle();

    const firstName = String(user?.nombre || 'Usuario')
      .trim()
      .split(/\s+/)[0];

    page.innerHTML = `

      <section class="ud-welcome">

        <div class="ud-welcome-copy">

          <span class="ud-overline">PANEL DE CLIENTE</span>

          <h2>Bienvenido, ${escapeHTML(firstName)}</h2>

          <p>
            Administra y monitorea los vehículos
            que tienes asignados.
          </p>

          <button
            class="ud-button ud-button-primary"
            type="button"
            data-view="vehicles"
          >
            Ver mis vehículos
            <i class="bi bi-arrow-right"></i>
          </button>

        </div>

        <div class="ud-welcome-art" aria-hidden="true">
          <i class="bi bi-cpu-fill"></i>
          <span></span>
        </div>

      </section>

      <section class="ud-stat-grid">

        <article class="ud-stat-card">
          <span class="ud-stat-icon">
            <i class="bi bi-truck-front"></i>
          </span>

          <span class="ud-stat-label">VEHÍCULOS ASIGNADOS</span>

          <strong>${vehicles.length}</strong>

          <small>Unidades vinculadas a tu cuenta</small>
        </article>

        <article class="ud-stat-card">
          <span class="ud-stat-icon">
            <i class="bi bi-shield-check"></i>
          </span>

          <span class="ud-stat-label">ESTADO DE CUENTA</span>

          <strong>${user?.activo ? 'Activa' : 'Revisar'}</strong>

          <small>Acceso de comprador</small>
        </article>

        <article class="ud-stat-card">
          <span class="ud-stat-icon">
            <i class="bi bi-broadcast"></i>
          </span>

          <span class="ud-stat-label">TELEMETRÍA</span>

          <strong>Sin verificar</strong>

          <small>Se comprueba al abrir monitoreo</small>
        </article>

      </section>

      <section class="ud-section">

        <div class="ud-section-heading">

          <div>
            <span class="ud-overline">TU INVENTARIO</span>
            <h2>Mis vehículos</h2>
            <p>Solo aparecen unidades asignadas a tu cuenta.</p>
          </div>

          <button
            class="ud-link-button"
            type="button"
            data-view="vehicles"
          >
            Ver todos <i class="bi bi-arrow-right"></i>
          </button>

        </div>

        ${
          vehicles.length
            ? `<div class="ud-vehicle-grid">
                ${vehicles.slice(0, 3)
                  .map(item => vehicleCard(item, selectedVehicleId))
                  .join('')}
               </div>`
            : emptyVehicles()
        }

      </section>

      ${
        chosen
          ? `
            <section class="ud-selected-strip">

              <span class="ud-selected-icon">
                <i class="bi bi-check2-circle"></i>
              </span>

              <span>
                <small>VEHÍCULO SELECCIONADO</small>
                <strong>
                  ${escapeHTML(chosen.nombre)}
                  · #${Number(chosen.id_vehiculo)}
                </strong>
              </span>

              <button
                class="ud-button ud-button-primary"
                type="button"
                data-action="open-control"
                data-id="${Number(chosen.id_vehiculo)}"
              >
                Abrir control
              </button>

            </section>
          `
          : ''
      }

    `;
  }

  function renderVehicles() {
    page.innerHTML = `
      <section class="ud-section ud-section-first">

        <div class="ud-section-heading">

          <div>
            <span class="ud-overline">INVENTARIO PERSONAL</span>
            <h2>Mis vehículos</h2>

            <p>
              Selecciona una unidad para abrir sus herramientas
              de control y monitoreo.
            </p>
          </div>

          <span class="ud-count-badge">
            ${vehicles.length}
            ${vehicles.length === 1 ? 'unidad' : 'unidades'}
          </span>

        </div>

        ${
          vehicles.length
            ? `<div class="ud-vehicle-grid">
                ${vehicles
                  .map(item => vehicleCard(item, selectedVehicleId))
                  .join('')}
               </div>`
            : emptyVehicles()
        }

      </section>
    `;
  }

  function renderAccount() {
    page.innerHTML = `
      <section class="ud-section ud-section-first">

        <div class="ud-section-heading">
          <div>
            <span class="ud-overline">PERFIL</span>
            <h2>Mi cuenta</h2>
            <p>Información de tu sesión y cuenta de comprador.</p>
          </div>
        </div>

        <article class="ud-account-card">

          <span class="ud-account-avatar">
            <i class="bi bi-person-fill"></i>
          </span>

          <div class="ud-account-details">

            <span class="ud-overline">DATOS DEL USUARIO</span>

            <h3>${escapeHTML(user?.nombre || 'Usuario')}</h3>

            <p>${escapeHTML(user?.email || 'Correo no disponible')}</p>

            <span class="ud-status-pill ${user?.activo ? 'is-active' : 'is-inactive'}">
              ${user?.activo ? 'Cuenta activa' : 'Cuenta inactiva'}
            </span>

          </div>

          <div class="ud-account-meta">

            <small>ID DE USUARIO</small>
            <strong>${Number(user?.id_usuario || 0) || '—'}</strong>

            <small>PERFIL</small>
            <strong>Comprador</strong>

          </div>

        </article>

      </section>
    `;
  }

  function render() {
    const titles = {
      dashboard: 'Dashboard',
      vehicles: 'Mis vehículos',
      account: 'Mi cuenta',
    };

    title.textContent = titles[activeView] || 'Dashboard';

    setActiveNav(activeView);

    if (activeView === 'vehicles') {
      renderVehicles();
    } else if (activeView === 'account') {
      renderAccount();
    } else {
      renderDashboard();
    }
  }

  async function openVehicle(id, tab) {
    const vehicle = vehicles.find(
      item => Number(item.id_vehiculo) === Number(id)
    );

    if (!vehicle) {
      throw new Error('El vehículo no pertenece a tus asignaciones.');
    }

    if (vehicle.activo !== true) {
      throw new Error('El vehículo está inactivo y no puede abrirse.');
    }

    selectedVehicleId = Number(vehicle.id_vehiculo);

    await onOpenVehicle({
      vehicle,
      tab,
      vehicleIds: vehicles.map(
        item => Number(item.id_vehiculo)
      ),
    });
  }

  container.querySelector('#ud-logout')
    .addEventListener('click', onLogout);

  container.onclick = async (event) => {

    const navButton = event.target.closest('[data-view]');

    if (navButton) {
      const view = navButton.dataset.view;

      if (['control', 'monitor', 'history'].includes(view)) {
        const chosen = selectedVehicle() || vehicles[0];

        if (!chosen) {
          activeView = 'vehicles';
          renderVehicles();
          setActiveNav('vehicles');
          return;
        }

        try {
          await openVehicle(
            chosen.id_vehiculo,
            view === 'control' ? 'control' : 'monitor'
          );
        } catch (error) {
          page.insertAdjacentHTML(
            'afterbegin',
            `<div class="ud-inline-error">${escapeHTML(error.message)}</div>`
          );
        }

        return;
      }

      activeView = view;
      render();
      return;
    }

    const actionButton = event.target.closest('[data-action]');

    if (!actionButton) return;

    const id = Number(actionButton.dataset.id);

    if (actionButton.dataset.action === 'select-vehicle') {
      selectedVehicleId = id;
      render();
      return;
    }

    if (actionButton.dataset.action === 'open-control') {
      try {
        await openVehicle(id, 'control');
      } catch (error) {
        page.insertAdjacentHTML(
          'afterbegin',
          `<div class="ud-inline-error">${escapeHTML(error.message)}</div>`
        );
      }
    }
  };

  async function loadVehicles() {
    const result = await http.get('/auth/me/vehiculos');

    if (!Array.isArray(result)) {
      throw new Error(
        'La API devolvió un formato inesperado al consultar tus vehículos.'
      );
    }

    vehicles = result.filter(
      vehicle => Number.isSafeInteger(Number(vehicle.id_vehiculo))
    );

    selectedVehicleId = vehicles.length
      ? Number(vehicles[0].id_vehiculo)
      : null;

    render();
  }

  try {
    await loadVehicles();
  } catch (error) {
    page.innerHTML = `
      <div class="ud-load-error">

        <i class="bi bi-exclamation-triangle"></i>

        <h2>No se pudieron cargar tus vehículos</h2>

        <p>${escapeHTML(error.message)}</p>

        <button
          class="ud-button ud-button-secondary"
          type="button"
          id="ud-retry"
        >
          Reintentar
        </button>

      </div>
    `;

    page.querySelector('#ud-retry')
      ?.addEventListener('click', async () => {
        page.innerHTML = `
          <div class="ud-loading">
            <span class="ud-spinner"></span>
            <span>Consultando asignaciones…</span>
          </div>
        `;

        try {
          await loadVehicles();
        } catch (retryError) {
          page.innerHTML = `
            <div class="ud-load-error">
              <i class="bi bi-exclamation-triangle"></i>
              <h2>No se pudieron cargar tus vehículos</h2>
              <p>${escapeHTML(retryError.message)}</p>
            </div>
          `;
        }
      });
  }
}
