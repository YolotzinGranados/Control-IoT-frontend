# Guía de puesta en marcha — Perfil Invitado

## Qué incluye

- Pantalla independiente para el perfil `guest`.
- Catálogo de vehículos habilitados para exhibición.
- Ficha con nombre, modelo, descripción y microcontrolador.
- Listado de DEMO activas por vehículo.
- Inicio de una DEMO temporal y seguimiento de `demo_inicio`, `demo_movimiento`, `demo_fin` y `demo_error` por WSS.
- Sesión JWT guest no renovable (15 minutos por defecto).
- Sin control manual, historial, administración ni cancelación de DEMO.

## 1. Preparar RDS

1. Realiza un respaldo de la base `vehiculo_iot`.
2. Ejecuta una sola vez `backend/script/migrations/003_guest_exhibition_up.sql`.
3. Revisa el listado que devuelve la migración.
4. Identifica una unidad dedicada a exhibición. No habilites una unidad vendida, asignada a un cliente o que esté prestada para uso privado.
5. Habilita únicamente esa unidad:

```sql
UPDATE vehiculos
SET es_exhibicion = 1
WHERE id_vehiculo = ID_VERIFICADO;
```

6. Verifica el resultado:

```sql
SELECT
    v.id_vehiculo,
    v.nombre,
    v.activo,
    v.es_exhibicion,
    EXISTS (
        SELECT 1
        FROM auth_vehiculo_asignaciones a
        WHERE a.id_vehiculo = v.id_vehiculo
          AND a.estado = 'activa'
          AND a.fecha_revocacion IS NULL
    ) AS tiene_cliente_activo
FROM vehiculos v
ORDER BY v.id_vehiculo;
```

La unidad solo será visible si `activo = 1`, `es_exhibicion = 1` y `tiene_cliente_activo = 0`.

## 2. Preparar backend

1. Integra los archivos actualizados de `backend/` en el repositorio del backend desplegado.
2. En `.env`, agrega o confirma:

```env
AUTH_GUEST_TTL_MINUTES=15
```

3. Reinicia Uvicorn para cargar el router `/invitado`, la autorización guest y la política de sesión temporal.
4. Comprueba `GET /health` y revisa en `/docs` que aparezcan:
   - `GET /invitado/catalogo`
   - `POST /invitado/vehiculos/{id_vehiculo}/demos/{id_demo}/iniciar`

## 3. Publicar frontend

El frontend es HTML, CSS y JavaScript estático. No necesita un proceso de compilación para GitHub Pages.

1. Integra los archivos actualizados de `frontend/` en `Control-IoT-frontend`.
2. Conserva la URL de API y WSS que ya utiliza el proyecto en `frontend/assets/js/config/app-config.js`.
3. Ejecuta localmente `npm run check` y `npm test` desde `frontend/`.
4. Publica los cambios en la rama configurada para GitHub Pages.

## 4. Prueba funcional

1. Abre la página publicada y crea una cuenta de invitado.
2. Confirma que aparece la pantalla **MODO INVITADO**.
3. Comprueba que el catálogo muestra solo unidades de exhibición habilitadas.
4. Pulsa **Iniciar DEMO** en una secuencia activa.
5. Comprueba que el indicador WSS cambia a **Conectado**.
6. Verifica que aparecen el inicio, cada movimiento y la finalización de la DEMO.
7. Espera a que termine la sesión temporal; el sistema debe regresar al inicio de sesión.

## 5. Pruebas de seguridad

Con un token guest, estas operaciones deben rechazarse:

- `GET /vehiculos/{id}/comandos`
- `GET /vehiculos/{id}/historial`
- `POST /vehiculos/{id}/movimientos`
- Rutas administrativas de vehículos y DEMO.
- WSS para vehículos no habilitados para exhibición o con asignación activa de cliente.

La única operación de escritura permitida al invitado es iniciar una DEMO activa mediante la ruta específica `/invitado/.../iniciar`. La secuencia debe tener como máximo 30 pasos y duración acumulada de hasta 180 segundos.

## Consideraciones

- El invitado no puede cancelar la secuencia; la DEMO debe estar diseñada para terminar automáticamente dentro del límite.
- Si el navegador se cierra después de iniciar una DEMO, el backend continúa la secuencia hasta terminarla.
- Los eventos WSS confirman notificaciones del backend, no la ejecución física de motores. La prueba de hardware debe realizarse por separado.
- Las pruebas automatizadas usan `FakeRDS`. La validación final debe realizarse contra la instancia RDS y el vehículo de exhibición real.
