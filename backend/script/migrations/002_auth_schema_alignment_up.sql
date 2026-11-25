-- Control IoT - Fase 1: alineacion no destructiva de autenticacion para AWS RDS.
-- Base esperada: vehiculo_iot (MySQL 8.x).
-- IMPORTANTE:
--   * No elimina tablas, columnas, indices, usuarios, roles ni sesiones.
--   * No modifica las tablas IoT (vehiculos, comandos, demos, etc.).
--   * Se ajusta al esquema confirmado en las capturas de AWS:
--       auth_usuarios: username, email, nombre, password_hash, activo,
--                      fecha_registro, fecha_actualizacion.
--       auth_roles: id_rol, codigo, nombre.
--       auth_usuario_roles: id_usuario, id_rol, fecha_asignacion.
--       auth_sesiones_refresh: id_sesion, id_usuario, token_hash,
--                              expira_en, user_agent, created_at, revocada_en.
--   * Ejecutar primero en la base vehiculo_iot y revisar los resultados.

USE vehiculo_iot;

-- 1. Confirmar la base seleccionada.
SELECT DATABASE() AS base_seleccionada;

-- 2. Sembrar/normalizar únicamente los tres roles conocidos.
--    codigo tiene índice UNIQUE en el esquema confirmado.
START TRANSACTION;
INSERT INTO auth_roles (codigo, nombre)
VALUES
  ('admin', 'Administrador'),
  ('user',  'Comprador'),
  ('guest', 'Invitado')
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre);
COMMIT;

-- 3. Mostrar las columnas reales de las tablas de autenticación.
--    Esta consulta permite detectar diferencias antes de tocar el backend.
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE,
       COLUMN_DEFAULT, EXTRA
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'auth_usuarios',
    'auth_roles',
    'auth_usuario_roles',
    'auth_sesiones_refresh',
    'auth_vehiculo_asignaciones'
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- 4. Confirmar que los roles existen.
SELECT id_rol, codigo, nombre
FROM auth_roles
WHERE codigo IN ('admin', 'user', 'guest')
ORDER BY id_rol;

-- 5. Conteos informativos. No modifican datos.
SELECT 'auth_usuarios' AS tabla, COUNT(*) AS registros FROM auth_usuarios
UNION ALL
SELECT 'auth_roles', COUNT(*) FROM auth_roles
UNION ALL
SELECT 'auth_usuario_roles', COUNT(*) FROM auth_usuario_roles
UNION ALL
SELECT 'auth_sesiones_refresh', COUNT(*) FROM auth_sesiones_refresh
UNION ALL
SELECT 'auth_vehiculo_asignaciones', COUNT(*) FROM auth_vehiculo_asignaciones;
