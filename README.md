# Control IoT — Control y monitoreo de vehículos

Repositorio de la aplicación web y del backend FastAPI para consultar, controlar y monitorear vehículos IoT.

## Estructura

- `frontend/`: interfaz HTML/CSS/JavaScript publicada en GitHub Pages.
- `backend/`: API FastAPI, acceso a Amazon RDS, autenticación y WebSocket.
- `tests/`: pruebas automatizadas de lógica del frontend.
- `REVISION_TECNICA.md`: alcance, correcciones y verificación de la fase 1.3.

## Arquitectura y contrato

- REST sobre HTTPS para autenticación, consultas y comandos.
- WSS para estado inicial, eventos de movimientos y secuencias DEMO.
- Amazon RDS MySQL almacena usuarios, asignaciones, vehículos, comandos, estado e historial.
- El evento recibido por WSS confirma una notificación del backend; no demuestra por sí solo que el hardware ejecutó físicamente el movimiento.

El frontend usa JWT Bearer para REST. En el handshake WSS envía el JWT mediante los subprotocolos `['bearer', accessToken]`; no se expone en la URL. El servidor valida la cuenta y la asignación activa del vehículo.

## Seguridad por perfil

- `admin`: acceso al inventario no asignado.
- `user`: acceso únicamente a vehículos con asignación activa propia.
- `guest`: registro habilitado; las sesiones temporales de exhibición siguen pendientes.
- El acceso de soporte a unidades vendidas requiere un permiso explícito aún no implementado.

Las API keys heredadas están desactivadas por defecto (`ENABLE_LEGACY_API_KEYS=false`). No habilitarlas en producción.

## Configuración

1. Configura `backend/.env` usando `backend/.env.example`.
2. Genera un `AUTH_SECRET_KEY` aleatorio de al menos 32 caracteres.
3. Verifica que el esquema RDS incluya `auth_vehiculo_asignaciones` y los campos consultados por `AuthRepository`.
4. Configura en `frontend/assets/js/config/app-config.js` la URL real de API y WSS.
5. Confirma certificado TLS, CORS y credenciales de cookies en el dominio desplegado.

No subas `.env`, tokens, contraseñas ni credenciales de RDS al repositorio.

## Pruebas

Backend, desde `backend/`:

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

Frontend, desde `frontend/`:

```powershell
npm test
npm run check
```

Las pruebas backend usan `FakeRDS`; no sustituyen la validación de la instancia AWS.

## Cliente WSS independiente

Desde `backend/`:

```powershell
python -m scripts.ws_probe
```

El script solicita la URL WSS y el JWT de forma oculta, recibe `estado_inicial`, prueba el heartbeat `ping/pong` y escucha los eventos del vehículo.

Consulta `frontend/docs/API_CONTRACT.md`, `frontend/docs/AUTHENTICATION_INTEGRATION.md` y `REVISION_TECNICA.md` para el contrato completo y las limitaciones conocidas.
