USE vehiculo_iot;

SHOW CREATE TABLE auth_usuario_demo_asignaciones;

SELECT
    a.id_asignacion_demo,
    a.id_usuario,
    u.nombre AS cliente,
    a.id_vehiculo,
    v.nombre AS vehiculo,
    a.id_demo,
    d.nombre AS demo,
    a.activo,
    a.fecha_asignacion,
    a.fecha_revocacion
FROM auth_usuario_demo_asignaciones a
INNER JOIN auth_usuarios u ON u.id_usuario = a.id_usuario
INNER JOIN vehiculos v ON v.id_vehiculo = a.id_vehiculo
INNER JOIN demos d ON d.id_demo = a.id_demo
ORDER BY a.id_usuario, a.id_vehiculo, a.id_demo;

SELECT
    a.id_usuario,
    a.id_vehiculo,
    COUNT(*) AS demos_activas
FROM auth_usuario_demo_asignaciones a
INNER JOIN auth_vehiculo_asignaciones va
    ON va.id_usuario = a.id_usuario
   AND va.id_vehiculo = a.id_vehiculo
   AND va.estado = 'activa'
   AND va.fecha_revocacion IS NULL
WHERE a.activo = 1
GROUP BY a.id_usuario, a.id_vehiculo
ORDER BY a.id_usuario, a.id_vehiculo;
