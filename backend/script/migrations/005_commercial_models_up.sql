-- Preparación aditiva del catálogo comercial, sin backfill ni cambios a SP.
-- Comparar los tipos de PK con el inventario antes de ensayar en una restauración.
CREATE TABLE IF NOT EXISTS modelos_comerciales (
    id_modelo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(64) NOT NULL UNIQUE,
    nombre VARCHAR(80) NOT NULL,
    publicado BOOLEAN NOT NULL DEFAULT FALSE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS unidades_comerciales (
    id_vehiculo INT NOT NULL PRIMARY KEY,
    id_modelo BIGINT UNSIGNED NOT NULL,
    serie VARCHAR(80) NOT NULL UNIQUE,
    estado_comercial ENUM('inventario', 'vendida', 'retirada') NOT NULL,
    FOREIGN KEY (id_vehiculo) REFERENCES vehiculos(id_vehiculo),
    FOREIGN KEY (id_modelo) REFERENCES modelos_comerciales(id_modelo)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS capacidades_modelo (
    id_modelo BIGINT UNSIGNED NOT NULL,
    codigo_comando INT NOT NULL,
    duracion_max_ms INT UNSIGNED NOT NULL CHECK (duracion_max_ms > 0),
    permitido_exhibicion BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (id_modelo, codigo_comando),
    FOREIGN KEY (id_modelo) REFERENCES modelos_comerciales(id_modelo)
) ENGINE=InnoDB;