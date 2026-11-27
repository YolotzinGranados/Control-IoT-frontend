SHOW CREATE TABLE modelos_comerciales;
SHOW CREATE TABLE unidades_comerciales;
SHOW CREATE TABLE capacidades_modelo;

SELECT v.id_vehiculo, v.modelo AS etiqueta_heredada,
       u.serie, u.estado_comercial, m.codigo AS modelo_comercial
FROM vehiculos v
LEFT JOIN unidades_comerciales u USING (id_vehiculo)
LEFT JOIN modelos_comerciales m USING (id_modelo)
ORDER BY v.id_vehiculo;