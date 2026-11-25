# Integración de autenticación — Control IoT 1.3

## Flujo implementado

1. El usuario inicia sesión en `POST /auth/login` o se registra mediante `POST /auth/registro-invitado`.
2. FastAPI devuelve el access token y el token CSRF en el cuerpo; establece refresh token `HttpOnly` y cookie CSRF `Secure`, `SameSite=None`.
3. El frontend conserva el access token y el CSRF token solo en memoria. No utiliza `localStorage` ni `sessionStorage`.
4. Las peticiones REST protegidas incluyen `Authorization: Bearer <access_token>`.
5. WSS envía el JWT en los subprotocolos `['bearer', accessToken]`; no lo añade a la URL.
6. Antes de expirar el access token, el frontend intenta rotarlo mediante `/auth/refresh`.
7. Al restaurar la página, el frontend solicita `/auth/csrf` con `credentials: include`, renueva la sesión y consulta `/auth/me`.
8. El cierre de sesión envía `X-CSRF-Token`, revoca la sesión y limpia el estado local.

## CSRF cross-origin

GitHub Pages y la API están en orígenes distintos. JavaScript del frontend no puede leer una cookie que pertenece al dominio de la API. Por eso `/auth/csrf` devuelve el valor asociado a la cookie CSRF mediante una respuesta CORS con credenciales. Después se envía como `X-CSRF-Token` a refresh y logout.

## Roles

- `admin`: inventario no asignado.
- `user`: vehículos con asignación activa a su cuenta.
- `guest`: registro habilitado; las sesiones de exhibición y el acceso WSS de invitado siguen pendientes.

La autorización se vuelve a validar en el backend. Ocultar botones en el frontend no sustituye el control del servidor.

## Cookies y navegadores

Las cookies de refresh requieren HTTPS, `Secure`, `SameSite=None` y `credentials: include`. Algunos navegadores/configuraciones bloquean cookies de terceros. Si se bloquean, la restauración automática no funcionará y el usuario tendrá que iniciar sesión de nuevo. La solución estructural es publicar frontend y API bajo el mismo sitio o usar un dominio propio.
