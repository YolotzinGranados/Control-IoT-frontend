# Revisión técnica — Control-IoT-frontend — Fase 1.3

## Base de trabajo

Se trabajó sobre el ZIP completo `Control-IoT-frontend-main (1)(1).zip` que contiene la estructura `backend/`, `frontend/` y `tests/`. Se integraron además los archivos de alineación de RDS y creación de administrador que se habían entregado por separado el 25 de noviembre.

## Correcciones aplicadas

### Backend y seguridad

- WSS ahora exige JWT Bearer en el subprotocolo `bearer`; no acepta conexiones anónimas ni tokens en query string.
- El servidor vuelve a consultar el usuario y sus roles en RDS; no confía en los roles declarados por el navegador.
- WSS valida el acceso al vehículo antes de suscribir al cliente.
- La autorización consulta `auth_vehiculo_asignaciones`: `user` requiere asignación `activa` y `fecha_revocacion IS NULL`; `admin` solo accede a unidades sin asignación activa y el listado de inventario las filtra; `guest` queda denegado.
- El servidor valida `Origin` cuando está presente. Clientes independientes sin `Origin` siguen obligados a presentar JWT.
- La sesión WSS se cierra al expirar el access token. El frontend renueva la sesión y reconecta ante el cierre 4401.
- REST usa JWT Bearer y valida rol y acceso al vehículo en rutas de consulta/operación.
- Las API keys heredadas solo funcionan si `ENABLE_LEGACY_API_KEYS=true`; el valor predeterminado es `false`.
- Se agregó `GET /auth/csrf` para recuperar el token CSRF desde el origen frontend autorizado cuando JavaScript no puede leer una cookie del dominio de la API.

### Frontend

- WebSocket envía el JWT como subprotocolo y nunca en la URL.
- Se agregó renovación del access token con cookie HttpOnly y encabezado CSRF.
- Al cargar la página, el frontend intenta restaurar la sesión mediante `/auth/csrf`, `/auth/refresh` y `/auth/me`.
- Los cierres 4403 y 4404 detienen la reconexión automática; el cierre 4401 intenta renovar y reconectar.
- Se corrigió la ruta de importación en `tests/domain.test.js` y el script `npm test` para que sí ejecute las pruebas ubicadas en `../tests`.

### Entregables RDS integrados

- `backend/script/migrations/002_auth_schema_alignment_up.sql`
- `backend/script/migrations/002_auth_schema_alignment_verify.sql`
- `backend/scripts/create_admin.py`
- `backend/scripts/ws_probe.py` (cliente WSS independiente)

## Contrato WSS

- Ruta: `/ws/vehiculos/{id_vehiculo}`.
- Una conexión se suscribe a un único vehículo por el ID de la ruta.
- Heartbeat: texto `ping` → JSON `pong`.
- Eventos: `estado_inicial`, `movimiento`, `demo_inicio`, `demo_movimiento`, `demo_fin`, `demo_cancelada`, `demo_error`, `error` y `pong`.
- Campos comunes: `tipo`, `id_vehiculo`, `comando`, `codigo`, `marca_temporal`.
- `marca_temporal` se genera en UTC ISO-8601. `fecha_actualizacion` conserva la marca que entrega RDS.
- `movimiento` y `demo_movimiento` incorporan `event_id`.
- El gestor distribuye eventos solo a conexiones del mismo `id_vehiculo`.
- El frontend filtra eventos por el vehículo seleccionado, descarta mensajes no válidos/duplicados y recupera estado/historial por REST tras reconectar.

## Verificación automatizada realizada

- Backend: **48 pruebas aprobadas** contra `FakeRDS`.
- Frontend: **5 pruebas aprobadas** con `npm test`.
- Frontend: `npm run check` completado sin errores de sintaxis.
- OpenAPI: esquema generado correctamente con 25 rutas REST.
- Los tests backend se ejecutaron con un stub de `mysql.connector` únicamente para importar la capa de conexión; no se abrió ninguna conexión real ni se modificó AWS RDS.

## Validaciones reales pendientes antes de producción

1. Ejecutar `002_auth_schema_alignment_verify.sql` contra la instancia correcta y confirmar columnas/índices de `auth_vehiculo_asignaciones`, especialmente `id_usuario`, `id_vehiculo`, `estado` y `fecha_revocacion`.
2. Confirmar que el valor real de estado activo sea exactamente `activa`.
3. Confirmar que `AUTH_SECRET_KEY` sea el mismo en todas las instancias y tenga al menos 32 caracteres aleatorios.
4. Desplegar backend actualizado y comprobar HTTPS/WSS con certificado válido.
5. Iniciar sesión con un comprador que tenga asignación activa y ejecutar `python -m scripts.ws_probe` como segundo cliente independiente.
6. Comprobar que otro usuario, un invitado y el administrador sin permiso de soporte no puedan suscribirse a una unidad vendida.
7. Probar expiración/renovación de JWT en el navegador real.
8. Si ESP8266/ESP32 usa esta misma ruta WSS, implementar credencial independiente de dispositivo antes de volver a conectarlo; no reutilizar JWT de usuario.
9. Confirmar la ejecución física en hardware por separado. Un evento WSS solo confirma la notificación del backend.

## Alcance no implementado

- Sesiones temporales y reservas de invitados para unidades de exhibición.
- Permisos explícitos y auditables de soporte para acceder a unidades vendidas.
- Identidad/autenticación propia del ESP8266/ESP32.
- Verificación contra RDS real y hardware: no puede afirmarse desde estas pruebas simuladas.
