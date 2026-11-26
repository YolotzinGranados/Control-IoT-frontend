USE vehiculo_iot;
SHOW COLUMNS FROM vehiculos LIKE 'es_exhibicion';
SHOW INDEX FROM vehiculos WHERE Key_name = 'ix_vehiculos_exhibicion';
SELECT
  v.id_vehiculo, v.nombre, v.activo, v.es_exhibicion,
  EXISTS (
    SELECT 1 FROM auth_vehiculo_asignaciones a
    WHERE a.id_vehiculo = v.id_vehiculo
      AND a.estado = 'activa'
      AND a.fecha_revocacion IS NULL
  ) AS tiene_cliente_activo
FROM vehiculos v
ORDER BY v.id_vehiculo;
