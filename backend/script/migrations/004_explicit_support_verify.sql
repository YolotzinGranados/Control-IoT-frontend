SELECT DATABASE() AS esquema, VERSION() AS version_mysql;
SHOW CREATE TABLE auth_soporte_unidad;

SELECT COUNT(*) AS permisos, COALESCE(SUM(
    revocado_en IS NULL AND expira_en > UTC_TIMESTAMP()
), 0) AS permisos_vigentes
FROM auth_soporte_unidad;