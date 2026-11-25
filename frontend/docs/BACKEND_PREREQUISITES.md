# Requisitos de despliegue y esquema — Control IoT 1.3

## CORS

`backend/app/main.py` permite únicamente el origen publicado:

- `https://yolotzingranados.github.io`

Se permiten `GET`, `POST`, `OPTIONS`, las cabeceras `Content-Type`, `Authorization`, `X-CSRF-Token` y credenciales. Si cambia el dominio del frontend, actualizar `FRONTEND_ALLOWED_ORIGINS` en `backend/app/core/config.py` y la configuración CORS de forma coordinada.

## Variables de entorno

Completar `backend/.env` a partir de `.env.example`. `AUTH_SECRET_KEY` debe tener al menos 32 caracteres aleatorios. No subir `.env` al repositorio.

`ENABLE_LEGACY_API_KEYS` permanece `false` en producción. Solo se usa en pruebas de compatibilidad; el frontend usa JWT.

## Esquema de asignaciones

El backend consulta `auth_vehiculo_asignaciones` con estos campos confirmados por los scripts de diagnóstico/alineación del proyecto:

- `id_usuario`
- `id_vehiculo`
- `estado`
- `fecha_revocacion`

Una asignación concede acceso si `estado = 'activa'` y `fecha_revocacion IS NULL`. Antes de desplegar, ejecutar `002_auth_schema_alignment_verify.sql` y comprobar que los nombres y valores coinciden con RDS real.

La autorización falla cerrada si la consulta no puede ejecutarse. No se debe crear o modificar la tabla automáticamente desde el arranque de FastAPI.

## WSS y firmware

La ruta `/ws/vehiculos/{id_vehiculo}` está protegida para sesiones JWT de usuario. No debe usarse directamente desde firmware como si fuera un usuario. Si el ESP8266/ESP32 necesita un canal WSS propio, definir identidad de dispositivo y credencial independiente.

## RDS

Los tests automatizados utilizan `FakeRDS`. No ejecutan procedimientos ni DDL contra AWS. Aplicar las migraciones solo después de verificar backup/snapshot y revisar resultados en la instancia correcta.
