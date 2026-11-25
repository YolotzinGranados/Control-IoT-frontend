USE vehiculo_iot;

CREATE TABLE vehiculos (
    id_vehiculo INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(80) NOT NULL,
    modelo VARCHAR(80),
    descripcion VARCHAR(255),
    microcontrolador VARCHAR(50),
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN NOT NULL DEFAULT TRUE
);


CREATE TABLE comandos (
    id_comando INT AUTO_INCREMENT PRIMARY KEY,
    id_vehiculo INT NOT NULL,
    nombre VARCHAR(60) NOT NULL,
    codigo INT NOT NULL,
    descripcion VARCHAR(255),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_comando_codigo UNIQUE (id_vehiculo , codigo),
    CONSTRAINT uq_comando_nombre UNIQUE (id_vehiculo , nombre),
    CONSTRAINT fk_comando_vehiculo FOREIGN KEY (id_vehiculo)
        REFERENCES vehiculos (id_vehiculo)
        ON DELETE CASCADE ON UPDATE CASCADE
);


CREATE TABLE estado_vehiculo (
    id_estado INT AUTO_INCREMENT PRIMARY KEY,
    id_vehiculo INT NOT NULL UNIQUE,
    id_comando INT NULL,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    conectado BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_estado_vehiculo FOREIGN KEY (id_vehiculo)
        REFERENCES vehiculos (id_vehiculo)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_estado_comando FOREIGN KEY (id_comando)
        REFERENCES comandos (id_comando)
        ON DELETE SET NULL ON UPDATE CASCADE
);


CREATE TABLE historial_comandos (
    id_historial BIGINT AUTO_INCREMENT PRIMARY KEY,
    id_vehiculo INT NOT NULL,
    id_comando INT NULL,
    fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    origen VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
    CONSTRAINT fk_historial_vehiculo FOREIGN KEY (id_vehiculo)
        REFERENCES vehiculos (id_vehiculo)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_historial_comando FOREIGN KEY (id_comando)
        REFERENCES comandos (id_comando)
        ON DELETE SET NULL ON UPDATE CASCADE
);


CREATE TABLE demos (
    id_demo INT AUTO_INCREMENT PRIMARY KEY,
    id_vehiculo INT NOT NULL,
    nombre VARCHAR(80) NOT NULL,
    descripcion VARCHAR(255),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_demo_vehiculo FOREIGN KEY (id_vehiculo)
        REFERENCES vehiculos (id_vehiculo)
        ON DELETE CASCADE ON UPDATE CASCADE
);


CREATE TABLE demo_movimientos (
    id_demo_movimiento INT AUTO_INCREMENT PRIMARY KEY,
    id_demo INT NOT NULL,
    id_comando INT NOT NULL,
    orden INT NOT NULL,
    duracion_ms INT UNSIGNED NOT NULL,
    pausa_ms INT UNSIGNED NOT NULL DEFAULT 0,
    CONSTRAINT uq_demo_orden UNIQUE (id_demo , orden),
    CONSTRAINT fk_mov_demo FOREIGN KEY (id_demo)
        REFERENCES demos (id_demo)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_mov_comando FOREIGN KEY (id_comando)
        REFERENCES comandos (id_comando)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

DELIMITER $$

CREATE PROCEDURE sp_crear_vehiculo(
    IN p_nombre VARCHAR(80),
    IN p_modelo VARCHAR(80),
    IN p_descripcion VARCHAR(255),
    IN p_microcontrolador VARCHAR(50)

)

BEGIN

    INSERT INTO vehiculos(nombre, modelo, descripcion, microcontrolador)

    VALUES(p_nombre, p_modelo, p_descripcion, p_microcontrolador);

    SELECT LAST_INSERT_ID() AS id_vehiculo;

END$$


CREATE PROCEDURE sp_obtener_vehiculos()

BEGIN

    SELECT * FROM vehiculos ORDER BY id_vehiculo;

END$$


CREATE PROCEDURE sp_obtener_vehiculo(IN p_id_vehiculo INT)

BEGIN

    SELECT * FROM vehiculos WHERE id_vehiculo = p_id_vehiculo;

END$$


CREATE PROCEDURE sp_actualizar_vehiculo(

    IN p_id_vehiculo INT,

    IN p_nombre VARCHAR(80),

    IN p_modelo VARCHAR(80),

    IN p_descripcion VARCHAR(255),

    IN p_microcontrolador VARCHAR(50),

    IN p_activo BOOLEAN

)

BEGIN

    UPDATE vehiculos

       SET nombre=p_nombre, modelo=p_modelo, descripcion=p_descripcion,

           microcontrolador=p_microcontrolador, activo=p_activo

     WHERE id_vehiculo=p_id_vehiculo;

END$$


CREATE PROCEDURE sp_eliminar_vehiculo(IN p_id_vehiculo INT)

BEGIN

    DELETE FROM vehiculos WHERE id_vehiculo=p_id_vehiculo;

END$$


CREATE PROCEDURE sp_crear_comando(

    IN p_id_vehiculo INT,

    IN p_nombre VARCHAR(60),

    IN p_codigo INT,

    IN p_descripcion VARCHAR(255)

)

BEGIN

    INSERT INTO comandos(id_vehiculo,nombre,codigo,descripcion)

    VALUES(p_id_vehiculo,p_nombre,p_codigo,p_descripcion);

    SELECT LAST_INSERT_ID() AS id_comando;

END$$


CREATE PROCEDURE sp_obtener_comandos_vehiculo(IN p_id_vehiculo INT)

BEGIN

    SELECT * FROM comandos

     WHERE id_vehiculo=p_id_vehiculo

     ORDER BY codigo;

END$$


CREATE PROCEDURE sp_actualizar_comando(

    IN p_id_comando INT,

    IN p_nombre VARCHAR(60),

    IN p_codigo INT,

    IN p_descripcion VARCHAR(255),

    IN p_activo BOOLEAN

)

BEGIN

    UPDATE comandos

       SET nombre=p_nombre, codigo=p_codigo,

           descripcion=p_descripcion, activo=p_activo

     WHERE id_comando=p_id_comando;

END$$


CREATE PROCEDURE sp_eliminar_comando(IN p_id_comando INT)

BEGIN

    DELETE FROM comandos WHERE id_comando=p_id_comando;

END$$


CREATE PROCEDURE sp_actualizar_estado(

    IN p_id_vehiculo INT,

    IN p_id_comando INT,

    IN p_conectado BOOLEAN

)

BEGIN

    INSERT INTO estado_vehiculo(id_vehiculo,id_comando,conectado)

    VALUES(p_id_vehiculo,p_id_comando,p_conectado)

    ON DUPLICATE KEY UPDATE

      id_comando=VALUES(id_comando),

      conectado=VALUES(conectado),

      fecha_actualizacion=CURRENT_TIMESTAMP;

END$$


CREATE PROCEDURE sp_obtener_estado(IN p_id_vehiculo INT)

BEGIN

    SELECT e.id_vehiculo, v.nombre AS vehiculo,

           e.id_comando, c.nombre AS comando, c.codigo,

           e.conectado, e.fecha_actualizacion

      FROM estado_vehiculo e

      JOIN vehiculos v ON v.id_vehiculo=e.id_vehiculo

 LEFT JOIN comandos c ON c.id_comando=e.id_comando

     WHERE e.id_vehiculo=p_id_vehiculo;

END$$


CREATE PROCEDURE sp_registrar_historial(

    IN p_id_vehiculo INT,

    IN p_id_comando INT,

    IN p_origen VARCHAR(30)

)

BEGIN

    INSERT INTO historial_comandos(id_vehiculo,id_comando,origen)

    VALUES(p_id_vehiculo,p_id_comando,p_origen);

END$$


CREATE PROCEDURE sp_obtener_historial(IN p_id_vehiculo INT)

BEGIN

    SELECT h.id_historial, h.id_vehiculo,

           c.nombre AS comando, c.codigo,

           h.fecha_hora, h.origen

      FROM historial_comandos h

 LEFT JOIN comandos c ON c.id_comando=h.id_comando

     WHERE h.id_vehiculo=p_id_vehiculo

     ORDER BY h.fecha_hora DESC, h.id_historial DESC;

END$$


CREATE PROCEDURE sp_crear_demo(

    IN p_id_vehiculo INT,

    IN p_nombre VARCHAR(80),

    IN p_descripcion VARCHAR(255)

)

BEGIN

    INSERT INTO demos(id_vehiculo,nombre,descripcion)

    VALUES(p_id_vehiculo,p_nombre,p_descripcion);

    SELECT LAST_INSERT_ID() AS id_demo;

END$$


CREATE PROCEDURE sp_obtener_demos(IN p_id_vehiculo INT)

BEGIN

    SELECT * FROM demos

     WHERE id_vehiculo=p_id_vehiculo

     ORDER BY id_demo;

END$$


CREATE PROCEDURE sp_actualizar_demo(

    IN p_id_demo INT,

    IN p_nombre VARCHAR(80),

    IN p_descripcion VARCHAR(255),

    IN p_activo BOOLEAN

)

BEGIN

    UPDATE demos

       SET nombre=p_nombre, descripcion=p_descripcion, activo=p_activo

     WHERE id_demo=p_id_demo;

END$$


CREATE PROCEDURE sp_eliminar_demo(IN p_id_demo INT)

BEGIN

    DELETE FROM demos WHERE id_demo=p_id_demo;

END$$


CREATE PROCEDURE sp_agregar_movimiento_demo(

    IN p_id_demo INT,

    IN p_id_comando INT,

    IN p_orden INT,

    IN p_duracion_ms INT,

    IN p_pausa_ms INT

)

BEGIN

    INSERT INTO demo_movimientos

      (id_demo,id_comando,orden,duracion_ms,pausa_ms)

    VALUES

      (p_id_demo,p_id_comando,p_orden,p_duracion_ms,p_pausa_ms);

END$$


CREATE PROCEDURE sp_obtener_movimientos_demo(IN p_id_demo INT)

BEGIN

    SELECT dm.id_demo_movimiento, dm.orden,

           dm.id_comando, c.nombre AS comando, c.codigo,

           dm.duracion_ms, dm.pausa_ms

      FROM demo_movimientos dm

      JOIN comandos c ON c.id_comando=dm.id_comando

     WHERE dm.id_demo=p_id_demo

     ORDER BY dm.orden;

END$$


CREATE PROCEDURE sp_actualizar_movimiento_demo(

    IN p_id_demo_movimiento INT,

    IN p_id_comando INT,

    IN p_orden INT,

    IN p_duracion_ms INT,

    IN p_pausa_ms INT

)

BEGIN

    UPDATE demo_movimientos

       SET id_comando=p_id_comando, orden=p_orden,

           duracion_ms=p_duracion_ms, pausa_ms=p_pausa_ms

     WHERE id_demo_movimiento=p_id_demo_movimiento;

END$$


CREATE PROCEDURE sp_eliminar_movimiento_demo(IN p_id_demo_movimiento INT)

BEGIN

    DELETE FROM demo_movimientos

     WHERE id_demo_movimiento=p_id_demo_movimiento;

END$$

DELIMITER ;
CALL sp_crear_vehiculo(

  'Excavadora IoT',

  'Modelo X',

  'Vehículo de construcción controlado por ESP8266',

  'ESP8266'

);

CALL sp_crear_comando(1,'AVANZAR',1,'Mover el vehículo hacia adelante');

CALL sp_crear_comando(1,'RETROCEDER',2,'Mover el vehículo hacia atrás');

CALL sp_crear_comando(1,'GIRAR_IZQUIERDA',3,'Giro hacia la izquierda');

CALL sp_crear_comando(1,'GIRAR_DERECHA',4,'Giro hacia la derecha');

CALL sp_crear_comando(1,'SUBIR_BRAZO',5,'Elevar el brazo');

CALL sp_crear_comando(1,'BAJAR_BRAZO',6,'Descender el brazo');

CALL sp_crear_comando(1,'ABRIR_PALA',7,'Abrir la pala');

CALL sp_crear_comando(1,'CERRAR_PALA',8,'Cerrar la pala');

CALL sp_crear_comando(1,'DETENER',9,'Detener cualquier movimiento');

CALL sp_actualizar_estado(1,9,1);

CALL sp_registrar_historial(1,1,'WORKBENCH');
CALL sp_registrar_historial(1,3,'WORKBENCH');
CALL sp_registrar_historial(1,5,'WORKBENCH');
CALL sp_registrar_historial(1,7,'WORKBENCH');
CALL sp_registrar_historial(1,9,'WORKBENCH');
CALL sp_crear_demo(

  1,
  'Demo principal',
  'Secuencia automática de movimientos del vehículo'
);

CALL sp_agregar_movimiento_demo(1,1,1,2000,400);
CALL sp_agregar_movimiento_demo(1,3,2,1000,300);
CALL sp_agregar_movimiento_demo(1,5,3,1500,300);
CALL sp_agregar_movimiento_demo(1,7,4,900,250);
CALL sp_agregar_movimiento_demo(1,8,5,900,250);
CALL sp_agregar_movimiento_demo(1,6,6,1500,300);
CALL sp_agregar_movimiento_demo(1,2,7,2000,400);
CALL sp_agregar_movimiento_demo(1,9,8,500,0);
CALL sp_obtener_vehiculos();
CALL sp_obtener_comandos_vehiculo(1);
CALL sp_obtener_estado(1);
CALL sp_obtener_historial(1);
CALL sp_obtener_demos(1);
CALL sp_obtener_movimientos_demo(1);

CALL sp_crear_vehiculo(
  'Excavadora IoT',
  'Modelo X',
  'Vehículo de construcción controlado por ESP8266',
  'ESP8266'
);

CALL sp_crear_comando(1,'AVANZAR',1,'Mover el vehículo hacia adelante');
CALL sp_crear_comando(1,'RETROCEDER',2,'Mover el vehículo hacia atrás');
CALL sp_crear_comando(1,'GIRAR_IZQUIERDA',3,'Giro hacia la izquierda');
CALL sp_crear_comando(1,'GIRAR_DERECHA',4,'Giro hacia la derecha');
CALL sp_crear_comando(1,'SUBIR_BRAZO',5,'Elevar el brazo');
CALL sp_crear_comando(1,'BAJAR_BRAZO',6,'Descender el brazo');
CALL sp_crear_comando(1,'ABRIR_PALA',7,'Abrir la pala');
CALL sp_crear_comando(1,'CERRAR_PALA',8,'Cerrar la pala');
CALL sp_crear_comando(1,'DETENER',9,'Detener cualquier movimiento');
CALL sp_actualizar_estado(1,9,1);
CALL sp_registrar_historial(1,1,'VSCODE-RDS');
CALL sp_registrar_historial(1,3,'VSCODE-RDS');
CALL sp_registrar_historial(1,5,'VSCODE-RDS');
CALL sp_registrar_historial(1,7,'VSCODE-RDS');
CALL sp_registrar_historial(1,9,'VSCODE-RDS');
CALL sp_crear_demo(
  1,
  'Demo principal',
  'Secuencia automática de movimientos del vehículo'
);
CALL sp_agregar_movimiento_demo(1,1,1,2000,400);
CALL sp_agregar_movimiento_demo(1,3,2,1000,300);
CALL sp_agregar_movimiento_demo(1,5,3,1500,300);
CALL sp_agregar_movimiento_demo(1,7,4,900,250);
CALL sp_agregar_movimiento_demo(1,8,5,900,250);
CALL sp_agregar_movimiento_demo(1,6,6,1500,300);
CALL sp_agregar_movimiento_demo(1,2,7,2000,400);
CALL sp_agregar_movimiento_demo(1,9,8,500,0);
CALL sp_obtener_vehiculos();
CALL sp_obtener_comandos_vehiculo(1);
CALL sp_obtener_estado(1);
CALL sp_obtener_historial(1);
CALL sp_obtener_demos(1);
CALL sp_obtener_movimientos_demo(1);