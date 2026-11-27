-- M006: permite asignar varias DEMOs específicas a cada cliente.
-- No borra ni modifica asignaciones de vehículos, comandos, historial ni movimientos.
USE vehiculo_iot;

CREATE TABLE IF NOT EXISTS auth_usuario_demo_asignaciones (
    id_asignacion_demo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    id_usuario BIGINT UNSIGNED NOT NULL,
    id_vehiculo INT NOT NULL,
    id_demo INT NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    fecha_asignacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_revocacion DATETIME NULL,
    PRIMARY KEY (id_asignacion_demo),
    UNIQUE KEY uq_usuario_vehiculo_demo (id_usuario, id_vehiculo, id_demo),
    KEY ix_usuario_demo_activa (id_usuario, id_vehiculo, activo),
    KEY ix_demo_asignada (id_demo, id_vehiculo),
    CONSTRAINT fk_usuario_demo_usuario
        FOREIGN KEY (id_usuario) REFERENCES auth_usuarios(id_usuario)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_usuario_demo_vehiculo
        FOREIGN KEY (id_vehiculo) REFERENCES vehiculos(id_vehiculo)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_usuario_demo_demo
        FOREIGN KEY (id_demo) REFERENCES demos(id_demo)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SHOW CREATE TABLE auth_usuario_demo_asignaciones;
