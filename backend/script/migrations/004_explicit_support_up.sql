-- Aplicar en una restauración de RDS antes de habilitar ENABLE_EXPLICIT_SUPPORT.
-- Los tipos de las claves foráneas se toman de las tablas existentes.
SET @tipo_admin := (
    SELECT COLUMN_TYPE FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'auth_usuarios'
      AND COLUMN_NAME = 'id_usuario'
);

SET @tipo_asignacion := (
    SELECT COLUMN_TYPE FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'auth_vehiculo_asignaciones'
      AND COLUMN_NAME = 'id_asignacion'
);

SET @ddl := CONCAT(
    'CREATE TABLE IF NOT EXISTS auth_soporte_unidad (',
    'id_permiso BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,',
    'id_admin ', @tipo_admin, ' NOT NULL,',
    'id_asignacion ', @tipo_asignacion, ' NOT NULL,',
    'id_otorgante ', @tipo_admin, ' NOT NULL,',
    'motivo VARCHAR(255) NOT NULL,',
    'expira_en DATETIME NOT NULL,',
    'revocado_en DATETIME NULL,',
    'KEY ix_soporte_vigencia (id_admin, id_asignacion, revocado_en, expira_en),',
    'FOREIGN KEY (id_admin) REFERENCES auth_usuarios(id_usuario),',
    'FOREIGN KEY (id_asignacion) REFERENCES auth_vehiculo_asignaciones(id_asignacion),',
    'FOREIGN KEY (id_otorgante) REFERENCES auth_usuarios(id_usuario)',
    ') ENGINE=InnoDB'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;