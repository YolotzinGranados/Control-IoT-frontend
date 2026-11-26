-- M003: habilita unidades de exhibición para el perfil guest.
-- Ejecutar una sola vez en vehiculo_iot después de respaldo y verificación.
-- La columna queda desactivada por defecto: ninguna unidad se expone automáticamente.

USE vehiculo_iot;

SET @has_exhibition_column := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'vehiculos'
      AND COLUMN_NAME = 'es_exhibicion'
);

SET @ddl := IF(
    @has_exhibition_column = 0,
    'ALTER TABLE vehiculos ADD COLUMN es_exhibicion TINYINT(1) NOT NULL DEFAULT 0',
    'SELECT ''La columna es_exhibicion ya existe'' AS resultado'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_exhibition_index := (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'vehiculos'
      AND INDEX_NAME = 'ix_vehiculos_exhibicion'
);

SET @ddl := IF(
    @has_exhibition_index = 0,
    'CREATE INDEX ix_vehiculos_exhibicion ON vehiculos (activo, es_exhibicion)',
    'SELECT ''El índice ix_vehiculos_exhibicion ya existe'' AS resultado'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT id_vehiculo, nombre, activo, es_exhibicion
FROM vehiculos
ORDER BY id_vehiculo;

