# Contrato REST y WSS — Control IoT 1.3

Este contrato se deriva del código incluido en esta versión del repositorio. La conectividad real con AWS RDS y el hardware debe validarse en el entorno desplegado; las pruebas automatizadas usan `FakeRDS`.

## Configuración

- API REST: `https://44.196.22.143:8000`
- WSS: `wss://44.196.22.143:8000/ws/vehiculos/{id_vehiculo}`
- Frontend publicado: `https://yolotzingranados.github.io/Control-IoT-frontend/`
- Origen permitido para navegador: `https://yolotzingranados.github.io`

## Autenticación REST

Las rutas protegidas reciben:

```http
Authorization: Bearer <access_token>
```

El access token se conserva en memoria en el frontend. El refresh token se conserva en cookie `HttpOnly`, `Secure`, `SameSite=None`; las operaciones `/auth/refresh` y `/auth/logout` requieren `X-CSRF-Token`.

Rutas de autenticación:

| Método | Ruta | Función |
|---|---|---|
| POST | `/auth/registro-invitado` | Crea cuenta con perfil `guest` |
| POST | `/auth/login` | Inicia sesión |
| GET | `/auth/csrf` | Recupera el token CSRF para restaurar sesión cross-origin |
| POST | `/auth/refresh` | Rota refresh token y emite access token nuevo |
| POST | `/auth/logout` | Revoca refresh token y limpia cookies |
| GET | `/auth/me` | Devuelve la identidad autenticada |

## Roles y acceso por vehículo

- `admin`: puede operar y listar únicamente el inventario sin asignación activa; las unidades vendidas quedan fuera del listado. No obtiene acceso automático a vehículos asignados a compradores.
- `user`: solo puede consultar/controlar vehículos con asignación propia en estado `activa` y `fecha_revocacion IS NULL` en `auth_vehiculo_asignaciones`.
- `guest`: puede registrarse, pero todavía no tiene acceso WSS ni sesiones temporales de exhibición.
- El acceso de soporte administrativo a un vehículo vendido requiere un permiso explícito que aún no está implementado.

Las API keys heredadas solo se aceptan cuando `ENABLE_LEGACY_API_KEYS=true`. El valor predeterminado es `false`; no deben habilitarse en producción.

## REST principal

| Método | Ruta | Uso |
|---|---|---|
| GET | `/health` | Comprueba FastAPI y `db.ping()` |
| GET | `/vehiculos` | Inventario administrativo |
| GET | `/vehiculos/{id}` | Detalle de vehículo autorizado |
| GET | `/vehiculos/{id}/comandos` | Catálogo autorizado |
| GET | `/vehiculos/{id}/estado` | Último estado |
| GET | `/vehiculos/{id}/historial` | Últimos 10 movimientos individuales |
| POST | `/vehiculos/{id}/movimientos` | Registra movimiento y notifica WSS después del COMMIT |
| GET | `/vehiculos/{id}/demos` | Lista DEMO autorizadas |
| POST | `/vehiculos/{id}/demos/{id_demo}/iniciar` | Inicia DEMO; responde 202 |
| POST | `/vehiculos/{id}/demos/cancelar` | Cancela DEMO activa |

Las operaciones administrativas de creación/actualización/eliminación requieren perfil `admin` y autorización sobre la unidad.

## Handshake WSS autenticado

El navegador no permite establecer libremente una cabecera `Authorization` en `new WebSocket()`. El frontend envía el JWT como subprotocolo:

```js
new WebSocket(url, ["bearer", accessToken]);
```

El servidor valida el JWT, consulta de nuevo la cuenta y sus roles en RDS, valida la asignación del vehículo y negocia únicamente el subprotocolo `bearer`. El token nunca se coloca en la URL ni se devuelve en la respuesta del handshake.

Códigos de cierre usados por la ruta:

| Código | Significado | Acción del frontend |
|---|---|---|
| 4401 | JWT ausente, inválido o expirado | Intenta renovar sesión y reconectar |
| 4403 | Origen o permiso de vehículo rechazado | Detiene reconexión automática |
| 4404 | Vehículo inexistente | Detiene reconexión automática |
| 1011 | Error interno | Informa y aplica reconexión normal |

Los clientes independientes pueden omitir `Origin`, pero siguen obligados a presentar JWT. Si el navegador envía `Origin`, debe coincidir con el origen permitido.

## Suscripción, mensajes y filtros

La suscripción se determina por el ID en la ruta: una conexión observa un solo vehículo. El gestor mantiene conjuntos independientes por `id_vehiculo`; no hay mensaje adicional de suscripción. El frontend descarta cualquier evento cuyo `id_vehiculo` no coincida con la unidad seleccionada.

Heartbeat:

- Cliente → servidor: texto `ping`.
- Servidor → cliente: JSON con `tipo: "pong"` y `marca_temporal`.

Eventos emitidos:

- `estado_inicial`
- `movimiento`
- `demo_inicio`
- `demo_movimiento`
- `demo_fin`
- `demo_cancelada`
- `demo_error`
- `error`
- `pong`

Campos comunes: `tipo`, `id_vehiculo`, `comando`, `codigo`, `marca_temporal`. `marca_temporal` se genera en UTC como ISO-8601. `fecha_actualizacion` del estado inicial procede de la base de datos y conserva la zona horaria que entregue el driver; si es naive, no se le inventa una zona.

Los eventos `movimiento` y `demo_movimiento` incluyen `event_id` único. Los eventos de DEMO incluyen datos adicionales como `id_demo`, `orden`, `total_movimientos`, `duracion_ms` y `pausa_ms` cuando corresponde.

## Reconexión

El frontend aplica backoff exponencial limitado. Si el servidor cierra por 4401, el cliente llama `/auth/refresh`, actualiza el token en memoria y vuelve a conectar. Para 4403/4404 detiene el ciclo y muestra el error. Al recuperar WSS, vuelve a consultar estado e historial por REST.

## Cliente independiente

Desde `backend/`:

```powershell
python -m scripts.ws_probe
```

El script solicita API/WSS y permite iniciar sesión con correo/contraseña (ocultando la contraseña) o pegar un JWT existente de forma oculta. Conecta con el subprotocolo `bearer`, recibe `estado_inicial`, envía `ping` y queda escuchando eventos. Si inicia sesión, intenta revocar la sesión refresh al terminar. Para probar eventos, mantén el script conectado y ejecuta una acción autorizada desde el frontend o REST.

## Límites

- La autenticación del WSS es para clientes de usuario. Si el firmware ESP8266/ESP32 utiliza esta misma ruta, necesita un mecanismo separado de identidad de dispositivo; no debe reutilizar tokens de usuario.
- El evento WSS confirma una notificación del backend, no la ejecución física del motor.
- La suite automatizada no se conecta a AWS ni al hardware real.
