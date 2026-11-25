-- Verificacion posterior a 002_auth_schema_alignment_up.sql.
-- Todas las consultas son de solo lectura.
USE vehiculo_iot;

-- A. Columnas relevantes de usuarios y roles.
SHOW COLUMNS FROM auth_usuarios;
SHOW COLUMNS FROM auth_roles;
SHOW COLUMNS FROM auth_usuario_roles;
SHOW COLUMNS FROM auth_sesiones_refresh;
SHOW COLUMNS FROM auth_vehiculo_asignaciones;

-- B. Indices (deben conservarse uq_auth_username, uq_auth_email,
--    indices de asignaciones y sus claves primarias).
SHOW INDEX FROM auth_usuarios;
SHOW INDEX FROM auth_roles;
SHOW INDEX FROM auth_usuario_roles;
SHOW INDEX FROM auth_sesiones_refresh;
SHOW INDEX FROM auth_vehiculo_asignaciones;

-- C. Relaciones FK de autenticacion.
SELECT
    TABLE_NAME,
    COLUMN_NAME,
    CONSTRAINT_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND REFERENCED_TABLE_NAME IS NOT NULL
  AND TABLE_NAME IN (
    'auth_usuario_roles',
    'auth_sesiones_refresh',
    'auth_vehiculo_asignaciones'
  )
ORDER BY TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME;

-- D. Roles esperados.
SELECT id_rol, codigo, nombre
FROM auth_roles
ORDER BY id_rol;

-- E. Cuentas y asignaciones activas (no mostrar hashes ni contraseñas).
SELECT
    u.id_usuario,
    u.username,
    u.email,
    u.nombre,
    u.activo,
    GROUP_CONCAT(r.codigo ORDER BY r.codigo) AS roles
FROM auth_usuarios u
LEFT JOIN auth_usuario_roles ur ON ur.id_usuario = u.id_usuario
LEFT JOIN auth_roles r ON r.id_rol = ur.id_rol
GROUP BY u.id_usuario, u.username, u.email, u.nombre, u.activo
ORDER BY u.id_usuario;

SELECT
    a.id_asignacion,
    a.id_usuario,
    a.id_vehiculo,
    a.estado,
    a.fecha_asignacion,
    a.fecha_revocacion,
    a.id_vehiculo_activo
FROM auth_vehiculo_asignaciones a
ORDER BY a.id_asignacion;

-- F. La consulta debe devolver cero filas: vehículos con más de una asignación activa.
SELECT id_vehiculo, COUNT(*) AS asignaciones_activas
FROM auth_vehiculo_asignaciones
WHERE estado = 'activa'
GROUP BY id_vehiculo
HAVING COUNT(*) > 1;
