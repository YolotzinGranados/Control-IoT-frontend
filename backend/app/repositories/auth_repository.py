"""Persistencia de usuarios, roles y sesiones de autenticacion."""

from datetime import datetime
import uuid


class AuthRepository:

    def __init__(self, db):
        self.db = db

    # --------------------------------------------------
    # DETECCION DE COLUMNAS REALES EN AWS RDS
    # --------------------------------------------------

    def _refresh_schema(self, conn):
        cur = conn.cursor()
        try:
            cur.execute("SHOW COLUMNS FROM auth_sesiones_refresh")
            columns = {row[0] for row in cur.fetchall()}
        finally:
            cur.close()

        def find_column(*candidates):
            for name in candidates:
                if name in columns:
                    return name
            raise RuntimeError(
                f"No se encontro ninguna de estas columnas "
                f"en auth_sesiones_refresh: {candidates}. "
                f"Columnas disponibles: {sorted(columns)}"
            )

        return {
            "session": find_column("id_sesion", "session_id"),
            "user": find_column("id_usuario", "user_id"),
            "token": find_column("token_hash"),
            "expires": find_column("expira_en", "expires_at"),
            "revoked": find_column("revocada_en", "revoked_at"),
            "agent": (
                "user_agent" if "user_agent" in columns else None
            ),
        }

    @staticmethod
    def _date(value):
        if value.tzinfo is not None:
            return value.replace(tzinfo=None)
        return value

    # --------------------------------------------------
    # USUARIOS
    # --------------------------------------------------

    @staticmethod
    def _user(row):
        if not row:
            return None

        roles_csv = row.get("roles_csv") or ""

        return {
            "id_usuario": int(row["id_usuario"]),
            "username": row.get("username"),
            "email": row.get("email"),
            "nombre": row["nombre"],
            "password_hash": row.get("password_hash"),
            "activo": bool(row["activo"]),
            "roles": roles_csv.split(",") if roles_csv else [],
        }

    def get_by_email(self, email: str):
        with self.db.connection() as conn:
            cur = conn.cursor(dictionary=True)
            try:
                cur.execute(
                    """
                    SELECT
                        u.id_usuario,
                        u.username,
                        u.email,
                        u.nombre,
                        u.password_hash,
                        u.activo,
                        GROUP_CONCAT(
                            r.codigo ORDER BY r.codigo
                        ) AS roles_csv
                    FROM auth_usuarios u
                    LEFT JOIN auth_usuario_roles ur
                        ON ur.id_usuario = u.id_usuario
                    LEFT JOIN auth_roles r
                        ON r.id_rol = ur.id_rol
                    WHERE u.email = %s
                    GROUP BY u.id_usuario
                    """,
                    (email.strip().lower(),)
                )
                return self._user(cur.fetchone())
            finally:
                cur.close()

    def get_by_id(self, user_id: int):
        with self.db.connection() as conn:
            cur = conn.cursor(dictionary=True)
            try:
                cur.execute(
                    """
                    SELECT
                        u.id_usuario,
                        u.username,
                        u.email,
                        u.nombre,
                        u.password_hash,
                        u.activo,
                        GROUP_CONCAT(
                            r.codigo ORDER BY r.codigo
                        ) AS roles_csv
                    FROM auth_usuarios u
                    LEFT JOIN auth_usuario_roles ur
                        ON ur.id_usuario = u.id_usuario
                    LEFT JOIN auth_roles r
                        ON r.id_rol = ur.id_rol
                    WHERE u.id_usuario = %s
                    GROUP BY u.id_usuario
                    """,
                    (user_id,)
                )
                return self._user(cur.fetchone())
            finally:
                cur.close()

    # --------------------------------------------------
    # REGISTRO DE INVITADOS
    # --------------------------------------------------

    def create_guest(
        self,
        *,
        email: str,
        nombre: str,
        password_hash: str,
        username: str | None = None
    ):
        username = (
            username.strip()
            if username
            else f"guest_{uuid.uuid4().hex[:12]}"
        )

        with self.db.transaction() as conn:
            cur = conn.cursor()
            try:
                cur.execute(
                    """
                    INSERT INTO auth_usuarios
                    (
                        username,
                        email,
                        nombre,
                        password_hash,
                        activo
                    )
                    VALUES (%s, %s, %s, %s, TRUE)
                    """,
                    (
                        username,
                        email.strip().lower(),
                        nombre.strip(),
                        password_hash
                    )
                )

                user_id = cur.lastrowid

                cur.execute(
                    """
                    SELECT id_rol
                    FROM auth_roles
                    WHERE codigo = 'guest'
                    """
                )

                role = cur.fetchone()

                if not role:
                    raise RuntimeError(
                        "El rol guest no existe en auth_roles."
                    )

                cur.execute(
                    """
                    INSERT INTO auth_usuario_roles
                    (id_usuario, id_rol)
                    VALUES (%s, %s)
                    """,
                    (user_id, role[0])
                )

                return int(user_id)

            finally:
                cur.close()

    # --------------------------------------------------
    # CREAR SESION REFRESH
    # --------------------------------------------------

    def create_refresh_session(
        self,
        *,
        session_id: str,
        user_id: int,
        token_hash: str,
        expires_at: datetime,
        user_agent: str | None
    ):
        with self.db.transaction() as conn:
            schema = self._refresh_schema(conn)

            fields = [
                schema["session"],
                schema["user"],
                schema["token"],
                schema["expires"],
            ]

            values = [
                session_id,
                user_id,
                token_hash,
                self._date(expires_at),
            ]

            if schema["agent"]:
                fields.append(schema["agent"])
                values.append((user_agent or "")[:255])

            columns_sql = ", ".join(
                f"`{field}`" for field in fields
            )

            placeholders = ", ".join(
                ["%s"] * len(values)
            )

            cur = conn.cursor()
            try:
                cur.execute(
                    f"""
                    INSERT INTO auth_sesiones_refresh
                    ({columns_sql})
                    VALUES ({placeholders})
                    """,
                    tuple(values)
                )
            finally:
                cur.close()

    # --------------------------------------------------
    # RENOVAR SESION REFRESH
    # --------------------------------------------------

    def rotate_refresh_session(
        self,
        *,
        old_hash: str,
        session_id: str,
        user_id: int,
        new_hash: str,
        expires_at: datetime,
        user_agent: str | None
    ):
        with self.db.transaction() as conn:
            schema = self._refresh_schema(conn)

            session_col = f"`{schema['session']}`"
            user_col = f"`{schema['user']}`"
            token_col = f"`{schema['token']}`"
            expires_col = f"`{schema['expires']}`"
            revoked_col = f"`{schema['revoked']}`"

            cur = conn.cursor()
            try:
                cur.execute(
                    f"""
                    SELECT {session_col}
                    FROM auth_sesiones_refresh
                    WHERE {token_col} = %s
                      AND {revoked_col} IS NULL
                      AND {expires_col} > UTC_TIMESTAMP()
                    FOR UPDATE
                    """,
                    (old_hash,)
                )

                if not cur.fetchone():
                    return False

                cur.execute(
                    f"""
                    UPDATE auth_sesiones_refresh
                    SET {revoked_col} = UTC_TIMESTAMP()
                    WHERE {token_col} = %s
                      AND {revoked_col} IS NULL
                    """,
                    (old_hash,)
                )

                fields = [
                    schema["session"],
                    schema["user"],
                    schema["token"],
                    schema["expires"],
                ]

                values = [
                    session_id,
                    user_id,
                    new_hash,
                    self._date(expires_at),
                ]

                if schema["agent"]:
                    fields.append(schema["agent"])
                    values.append((user_agent or "")[:255])

                columns_sql = ", ".join(
                    f"`{field}`" for field in fields
                )

                placeholders = ", ".join(
                    ["%s"] * len(values)
                )

                cur.execute(
                    f"""
                    INSERT INTO auth_sesiones_refresh
                    ({columns_sql})
                    VALUES ({placeholders})
                    """,
                    tuple(values)
                )

                return True

            finally:
                cur.close()

    # --------------------------------------------------
    # REVOCAR SESION
    # --------------------------------------------------

    def revoke_refresh_session(self, token_hash: str):
        with self.db.transaction() as conn:
            schema = self._refresh_schema(conn)

            cur = conn.cursor()
            try:
                cur.execute(
                    f"""
                    UPDATE auth_sesiones_refresh
                    SET `{schema['revoked']}` = UTC_TIMESTAMP()
                    WHERE `{schema['token']}` = %s
                      AND `{schema['revoked']}` IS NULL
                    """,
                    (token_hash,)
                )
            finally:
                cur.close()

    # --------------------------------------------------
    # CONSULTAR SESION REFRESH
    # --------------------------------------------------

    def find_refresh_session(self, token_hash: str):
        with self.db.connection() as conn:
            schema = self._refresh_schema(conn)

            cur = conn.cursor(dictionary=True)
            try:
                cur.execute(
                    f"""
                    SELECT
                        s.`{schema['user']}` AS id_usuario,
                        u.username,
                        u.email,
                        u.nombre,
                        u.activo,
                        GROUP_CONCAT(
                            r.codigo ORDER BY r.codigo
                        ) AS roles_csv

                    FROM auth_sesiones_refresh s

                    JOIN auth_usuarios u
                        ON u.id_usuario = s.`{schema['user']}`

                    LEFT JOIN auth_usuario_roles ur
                        ON ur.id_usuario = u.id_usuario

                    LEFT JOIN auth_roles r
                        ON r.id_rol = ur.id_rol

                    WHERE s.`{schema['token']}` = %s
                      AND s.`{schema['revoked']}` IS NULL
                      AND s.`{schema['expires']}` > UTC_TIMESTAMP()
                      AND u.activo = TRUE

                    GROUP BY
                        s.`{schema['session']}`,
                        s.`{schema['user']}`,
                        u.id_usuario,
                        u.username,
                        u.email,
                        u.nombre,
                        u.activo
                    """,
                    (token_hash,)
                )

                row = cur.fetchone()

                if not row:
                    return None

                roles_csv = row.get("roles_csv") or ""

                return {
                    "id_usuario": int(row["id_usuario"]),
                    "username": row.get("username"),
                    "email": row.get("email"),
                    "nombre": row["nombre"],
                    "activo": bool(row["activo"]),
                    "roles": (
                        roles_csv.split(",")
                        if roles_csv
                        else []
                    )
                }

            finally:
                cur.close()
    # --------------------------------------------------
    # AUTORIZACION DE VEHICULOS
    # --------------------------------------------------

    def can_access_vehicle(self, user_id: int, roles, vehicle_id: int) -> bool:
        """Comprueba asignación activa. Admin solo ve unidades sin comprador activo.

        La tabla auth_vehiculo_asignaciones pertenece al esquema AWS confirmado.
        Si la consulta falla (tabla/columnas no disponibles), el acceso falla cerrado.
        """
        role_set = set(roles or ())
        if "guest" in role_set or not role_set:
            return False

        with self.db.connection() as conn:
            cur = conn.cursor()
            try:
                if "admin" in role_set:
                    cur.execute(
                        """
                        SELECT 1
                        FROM auth_vehiculo_asignaciones
                        WHERE id_vehiculo = %s
                          AND estado = 'activa'
                          AND fecha_revocacion IS NULL
                        LIMIT 1
                        """,
                        (vehicle_id,),
                    )
                    # Admin puede acceder al inventario no vendido; una unidad asignada
                    # requiere un permiso explícito de soporte que aún no existe.
                    return cur.fetchone() is None

                if "user" in role_set:
                    cur.execute(
                        """
                        SELECT 1
                        FROM auth_vehiculo_asignaciones
                        WHERE id_usuario = %s
                          AND id_vehiculo = %s
                          AND estado = 'activa'
                          AND fecha_revocacion IS NULL
                        LIMIT 1
                        """,
                        (user_id, vehicle_id),
                    )
                    return cur.fetchone() is not None

                return False
            finally:
                cur.close()


    def list_assigned_vehicles(self, user_id: int) -> list[dict]:
        """Devuelve únicamente vehículos activos asignados al comprador."""
        with self.db.connection() as conn:
            cur = conn.cursor(dictionary=True)
            try:
                cur.execute(
                    """
                    SELECT
                        v.id_vehiculo,
                        v.nombre,
                        v.modelo,
                        v.descripcion,
                        v.microcontrolador,
                        v.activo
                    FROM auth_vehiculo_asignaciones a
                    INNER JOIN vehiculos v
                        ON v.id_vehiculo = a.id_vehiculo
                    WHERE a.id_usuario = %s
                      AND a.estado = 'activa'
                      AND a.fecha_revocacion IS NULL
                      AND v.activo = 1
                    ORDER BY v.id_vehiculo ASC
                    """,
                    (user_id,),
                )

                rows = cur.fetchall() or []

                return [
                    {
                        "id_vehiculo": int(row["id_vehiculo"]),
                        "nombre": row["nombre"],
                        "modelo": row.get("modelo"),
                        "descripcion": row.get("descripcion"),
                        "microcontrolador": row.get("microcontrolador"),
                        "activo": bool(row["activo"]),
                    }
                    for row in rows
                ]
            finally:
                cur.close()

    # --------------------------------------------------
    # ADMINISTRACIÓN: CLIENTES, ASIGNACIONES Y MÉTRICAS
    # --------------------------------------------------

    def list_customers(self) -> list[dict]:
        with self.db.connection() as conn:
            cur = conn.cursor(dictionary=True)
            try:
                cur.execute(
                    """
                    SELECT
                        u.id_usuario,
                        u.username,
                        u.email,
                        u.nombre,
                        u.activo,
                        COUNT(DISTINCT CASE
                            WHEN a.estado = 'activa'
                             AND a.fecha_revocacion IS NULL
                            THEN a.id_asignacion END) AS vehiculos_asignados
                    FROM auth_usuarios u
                    INNER JOIN auth_usuario_roles ur
                        ON ur.id_usuario = u.id_usuario
                    INNER JOIN auth_roles r
                        ON r.id_rol = ur.id_rol
                    LEFT JOIN auth_vehiculo_asignaciones a
                        ON a.id_usuario = u.id_usuario
                    WHERE r.codigo = 'user'
                    GROUP BY u.id_usuario, u.username, u.email, u.nombre, u.activo
                    ORDER BY u.id_usuario DESC
                    """
                )
                return [
                    {
                        "id_usuario": int(row["id_usuario"]),
                        "username": row.get("username"),
                        "email": row.get("email"),
                        "nombre": row["nombre"],
                        "activo": bool(row["activo"]),
                        "vehiculos_asignados": int(row.get("vehiculos_asignados") or 0),
                    }
                    for row in (cur.fetchall() or [])
                ]
            finally:
                cur.close()

    def create_customer(
        self, *, username: str, email: str, nombre: str, password_hash: str
    ) -> int:
        with self.db.transaction() as conn:
            cur = conn.cursor()
            try:
                cur.execute(
                    "SELECT id_rol FROM auth_roles WHERE codigo = 'user' FOR UPDATE"
                )
                role = cur.fetchone()
                if not role:
                    raise RuntimeError("No existe el rol user en auth_roles.")

                cur.execute(
                    """
                    INSERT INTO auth_usuarios
                        (username, email, nombre, password_hash, activo)
                    VALUES (%s, %s, %s, %s, TRUE)
                    """,
                    (username.strip(), email.strip().lower(), nombre.strip(), password_hash),
                )
                user_id = int(cur.lastrowid)
                cur.execute(
                    """
                    INSERT INTO auth_usuario_roles (id_usuario, id_rol)
                    VALUES (%s, %s)
                    """,
                    (user_id, int(role[0])),
                )
                return user_id
            finally:
                cur.close()

    def list_assignments(self) -> list[dict]:
        with self.db.connection() as conn:
            cur = conn.cursor(dictionary=True)
            try:
                cur.execute(
                    """
                    SELECT
                        a.id_asignacion,
                        a.id_usuario,
                        a.id_vehiculo,
                        a.estado,
                        a.fecha_asignacion,
                        a.fecha_revocacion,
                        u.nombre AS cliente,
                        u.email,
                        v.nombre AS vehiculo,
                        v.modelo
                    FROM auth_vehiculo_asignaciones a
                    INNER JOIN auth_usuarios u ON u.id_usuario = a.id_usuario
                    INNER JOIN vehiculos v ON v.id_vehiculo = a.id_vehiculo
                    ORDER BY a.id_asignacion DESC
                    """
                )
                rows = cur.fetchall() or []
                return [
                    {
                        "id_asignacion": int(row["id_asignacion"]),
                        "id_usuario": int(row["id_usuario"]),
                        "id_vehiculo": int(row["id_vehiculo"]),
                        "estado": row["estado"],
                        "fecha_asignacion": row.get("fecha_asignacion"),
                        "fecha_revocacion": row.get("fecha_revocacion"),
                        "cliente": row.get("cliente"),
                        "email": row.get("email"),
                        "vehiculo": row.get("vehiculo"),
                        "modelo": row.get("modelo"),
                    }
                    for row in rows
                ]
            finally:
                cur.close()

    def create_assignment(self, user_id: int, vehicle_id: int) -> int:
        with self.db.transaction() as conn:
            cur = conn.cursor()
            try:
                cur.execute(
                    """
                    SELECT u.id_usuario
                    FROM auth_usuarios u
                    INNER JOIN auth_usuario_roles ur ON ur.id_usuario = u.id_usuario
                    INNER JOIN auth_roles r ON r.id_rol = ur.id_rol
                    WHERE u.id_usuario = %s AND u.activo = TRUE AND r.codigo = 'user'
                    LIMIT 1 FOR UPDATE
                    """,
                    (user_id,),
                )
                if not cur.fetchone():
                    raise ValueError("El cliente no existe, está inactivo o no tiene perfil user.")

                cur.execute(
                    "SELECT id_vehiculo, es_exhibicion FROM vehiculos WHERE id_vehiculo = %s AND activo = TRUE FOR UPDATE",
                    (vehicle_id,),
                )
                vehicle = cur.fetchone()
                if not vehicle:
                    raise ValueError("El vehículo no existe o está inactivo.")
                if bool(vehicle[1]):
                    raise ValueError("Desactiva el modo de exhibición antes de asignar este vehículo a un cliente.")

                cur.execute(
                    """
                    SELECT id_asignacion
                    FROM auth_vehiculo_asignaciones
                    WHERE id_vehiculo = %s
                      AND estado = 'activa'
                      AND fecha_revocacion IS NULL
                    LIMIT 1 FOR UPDATE
                    """,
                    (vehicle_id,),
                )
                if cur.fetchone():
                    raise ValueError("El vehículo ya tiene una asignación activa.")

                cur.execute(
                    """
                    INSERT INTO auth_vehiculo_asignaciones
                        (id_usuario, id_vehiculo, estado, fecha_revocacion)
                    VALUES (%s, %s, 'activa', NULL)
                    """,
                    (user_id, vehicle_id),
                )
                return int(cur.lastrowid)
            finally:
                cur.close()

    def revoke_assignment(self, assignment_id: int) -> bool:
        with self.db.transaction() as conn:
            cur = conn.cursor()
            try:
                cur.execute(
                    """
                    SELECT id_usuario, id_vehiculo
                    FROM auth_vehiculo_asignaciones
                    WHERE id_asignacion = %s
                      AND estado = 'activa'
                      AND fecha_revocacion IS NULL
                    FOR UPDATE
                    """,
                    (assignment_id,),
                )
                assignment = cur.fetchone()
                if not assignment:
                    return False

                user_id, vehicle_id = int(assignment[0]), int(assignment[1])
                cur.execute(
                    """
                    UPDATE auth_vehiculo_asignaciones
                    SET estado = 'revocada', fecha_revocacion = UTC_TIMESTAMP()
                    WHERE id_asignacion = %s
                    """,
                    (assignment_id,),
                )
                updated = cur.rowcount > 0
                cur.execute(
                    """
                    UPDATE auth_usuario_demo_asignaciones
                    SET activo = 0, fecha_revocacion = UTC_TIMESTAMP()
                    WHERE id_usuario = %s AND id_vehiculo = %s AND activo = 1
                    """,
                    (user_id, vehicle_id),
                )
                return updated
            finally:
                cur.close()

    def dashboard_stats(self) -> dict:
        with self.db.connection() as conn:
            cur = conn.cursor(dictionary=True)
            try:
                cur.execute(
                    """
                    SELECT
                      (SELECT COUNT(*) FROM vehiculos) AS vehiculos_total,
                      (SELECT COUNT(*) FROM vehiculos WHERE activo = TRUE) AS vehiculos_activos,
                      (SELECT COUNT(DISTINCT u.id_usuario)
                         FROM auth_usuarios u
                         JOIN auth_usuario_roles ur ON ur.id_usuario = u.id_usuario
                         JOIN auth_roles r ON r.id_rol = ur.id_rol
                        WHERE r.codigo = 'user' AND u.activo = TRUE) AS clientes_activos,
                      (SELECT COUNT(*)
                         FROM auth_vehiculo_asignaciones a
                         INNER JOIN vehiculos v ON v.id_vehiculo = a.id_vehiculo
                        WHERE a.estado = 'activa'
                          AND a.fecha_revocacion IS NULL
                          AND v.activo = TRUE) AS asignaciones_activas,
                      (SELECT COUNT(DISTINCT u.id_usuario)
                         FROM auth_usuarios u
                         JOIN auth_usuario_roles ur ON ur.id_usuario = u.id_usuario
                         JOIN auth_roles r ON r.id_rol = ur.id_rol
                        WHERE r.codigo = 'guest' AND u.activo = TRUE) AS invitados_activos,
                      (SELECT COUNT(*) FROM demos WHERE activo = TRUE) AS demos_activas
                    """
                )
                row = cur.fetchone() or {}
                return {key: int(value or 0) for key, value in row.items()}
            finally:
                cur.close()

    def can_access_guest_vehicle(self, vehicle_id: int) -> bool:
        """Guest solo puede observar unidades de exhibición sin comprador activo."""
        try:
            with self.db.connection() as conn:
                cur = conn.cursor()
                try:
                    cur.execute(
                        """
                        SELECT 1
                        FROM vehiculos v
                        WHERE v.id_vehiculo = %s
                          AND v.activo = TRUE
                          AND v.es_exhibicion = TRUE
                          AND NOT EXISTS (
                            SELECT 1
                            FROM auth_vehiculo_asignaciones a
                            WHERE a.id_vehiculo = v.id_vehiculo
                              AND a.estado = 'activa'
                              AND a.fecha_revocacion IS NULL
                          )
                        LIMIT 1
                        """,
                        (vehicle_id,),
                    )
                    return cur.fetchone() is not None
                finally:
                    cur.close()
        except Exception:
            # Ante una falla de RDS, la autorización guest se deniega.
            return False



    def list_admin_vehicles(self) -> list[dict]:
        """Inventario completo para lectura administrativa; no concede control del vehículo."""
        with self.db.connection() as conn:
            cur = conn.cursor(dictionary=True)
            try:
                cur.execute(
                    """
                    SELECT
                        v.id_vehiculo, v.nombre, v.modelo, v.descripcion,
                        v.microcontrolador, v.activo, v.es_exhibicion,
                        a.id_asignacion,
                        a.id_usuario,
                        u.nombre AS cliente
                    FROM vehiculos v
                    LEFT JOIN auth_vehiculo_asignaciones a
                      ON a.id_vehiculo = v.id_vehiculo
                     AND a.estado = 'activa'
                     AND a.fecha_revocacion IS NULL
                    LEFT JOIN auth_usuarios u ON u.id_usuario = a.id_usuario
                    ORDER BY v.id_vehiculo DESC
                    """
                )
                return [
                    {
                        "id_vehiculo": int(row["id_vehiculo"]),
                        "nombre": row["nombre"],
                        "modelo": row.get("modelo"),
                        "descripcion": row.get("descripcion"),
                        "microcontrolador": row.get("microcontrolador"),
                        "activo": bool(row["activo"]),
                        "es_exhibicion": bool(row.get("es_exhibicion")),
                        "asignado": row.get("id_asignacion") is not None,
                        "cliente": row.get("cliente"),
                    }
                    for row in (cur.fetchall() or [])
                ]
            finally:
                cur.close()

    def set_vehicle_exhibition(self, vehicle_id: int, enabled: bool) -> bool:
        with self.db.transaction() as conn:
            cur = conn.cursor()
            try:
                cur.execute(
                    "SELECT activo FROM vehiculos WHERE id_vehiculo = %s FOR UPDATE",
                    (vehicle_id,),
                )
                vehicle = cur.fetchone()
                if not vehicle:
                    return False
                if enabled and not bool(vehicle[0]):
                    raise ValueError("Activa el vehículo antes de habilitarlo para exhibición.")
                if enabled:
                    cur.execute(
                        """
                        SELECT id_asignacion
                        FROM auth_vehiculo_asignaciones
                        WHERE id_vehiculo = %s
                          AND estado = 'activa'
                          AND fecha_revocacion IS NULL
                        LIMIT 1 FOR UPDATE
                        """,
                        (vehicle_id,),
                    )
                    if cur.fetchone():
                        raise ValueError("No se puede exhibir un vehículo asignado a un cliente.")
                cur.execute(
                    "UPDATE vehiculos SET es_exhibicion = %s WHERE id_vehiculo = %s",
                    (1 if enabled else 0, vehicle_id),
                )
                return True
            finally:
                cur.close()



    # --------------------------------------------------
    # ASIGNACIÓN INDIVIDUAL DE DEMOS A CLIENTES
    # --------------------------------------------------

    def list_customer_vehicle_demos(self, user_id: int, vehicle_id: int) -> list[dict]:
        """Lista las DEMOs activas de un vehículo e indica cuáles tiene el cliente."""
        with self.db.connection() as conn:
            cur = conn.cursor(dictionary=True)
            try:
                cur.execute(
                    """
                    SELECT 1
                    FROM auth_vehiculo_asignaciones
                    WHERE id_usuario = %s AND id_vehiculo = %s
                      AND estado = 'activa' AND fecha_revocacion IS NULL
                    LIMIT 1
                    """,
                    (user_id, vehicle_id),
                )
                if not cur.fetchone():
                    raise ValueError("El cliente no tiene asignado este vehículo.")

                cur.execute(
                    """
                    SELECT
                        d.id_demo, d.id_vehiculo, d.nombre, d.descripcion, d.activo,
                        CASE WHEN a.id_asignacion_demo IS NULL THEN 0 ELSE 1 END AS asignada
                    FROM demos d
                    LEFT JOIN auth_usuario_demo_asignaciones a
                      ON a.id_usuario = %s
                     AND a.id_vehiculo = d.id_vehiculo
                     AND a.id_demo = d.id_demo
                     AND a.activo = 1
                    WHERE d.id_vehiculo = %s
                    ORDER BY d.id_demo ASC
                    """,
                    (user_id, vehicle_id),
                )
                return [
                    {
                        "id_demo": int(row["id_demo"]),
                        "id_vehiculo": int(row["id_vehiculo"]),
                        "nombre": row["nombre"],
                        "descripcion": row.get("descripcion"),
                        "activo": bool(row["activo"]),
                        "asignada": bool(row["asignada"]),
                    }
                    for row in (cur.fetchall() or [])
                ]
            finally:
                cur.close()

    def replace_customer_demo_assignments(
        self, user_id: int, vehicle_id: int, demo_ids: list[int]
    ) -> int:
        """Reemplaza el conjunto de DEMOs autorizadas para un cliente y vehículo."""
        demo_ids = list(dict.fromkeys(int(value) for value in demo_ids))
        with self.db.transaction() as conn:
            cur = conn.cursor()
            try:
                cur.execute(
                    """
                    SELECT a.id_asignacion
                    FROM auth_vehiculo_asignaciones a
                    INNER JOIN auth_usuarios u ON u.id_usuario = a.id_usuario
                    WHERE a.id_usuario = %s AND a.id_vehiculo = %s
                      AND a.estado = 'activa' AND a.fecha_revocacion IS NULL
                      AND u.activo = 1
                    LIMIT 1 FOR UPDATE
                    """,
                    (user_id, vehicle_id),
                )
                if not cur.fetchone():
                    raise ValueError("El cliente no tiene una asignación activa de este vehículo.")

                if demo_ids:
                    placeholders = ",".join(["%s"] * len(demo_ids))
                    cur.execute(
                        f"SELECT id_demo FROM demos WHERE id_vehiculo = %s AND activo = 1 AND id_demo IN ({placeholders}) FOR UPDATE",
                        (vehicle_id, *demo_ids),
                    )
                    valid_ids = {int(row[0]) for row in (cur.fetchall() or [])}
                    if valid_ids != set(demo_ids):
                        raise ValueError("Una o más DEMOs no existen, están inactivas o pertenecen a otro vehículo.")

                cur.execute(
                    """
                    UPDATE auth_usuario_demo_asignaciones
                    SET activo = 0, fecha_revocacion = UTC_TIMESTAMP()
                    WHERE id_usuario = %s AND id_vehiculo = %s AND activo = 1
                    """,
                    (user_id, vehicle_id),
                )

                for demo_id in demo_ids:
                    cur.execute(
                        """
                        INSERT INTO auth_usuario_demo_asignaciones
                            (id_usuario, id_vehiculo, id_demo, activo, fecha_asignacion, fecha_revocacion)
                        VALUES (%s, %s, %s, 1, UTC_TIMESTAMP(), NULL)
                        ON DUPLICATE KEY UPDATE
                            activo = 1,
                            fecha_asignacion = UTC_TIMESTAMP(),
                            fecha_revocacion = NULL
                        """,
                        (user_id, vehicle_id, demo_id),
                    )
                return len(demo_ids)
            finally:
                cur.close()

    def list_assigned_demos(self, user_id: int, vehicle_id: int) -> list[dict]:
        """Devuelve solo las DEMOs autorizadas al cliente en el vehículo indicado."""
        with self.db.connection() as conn:
            cur = conn.cursor(dictionary=True)
            try:
                cur.execute(
                    """
                    SELECT d.id_demo, d.id_vehiculo, d.nombre, d.descripcion, d.activo
                    FROM auth_vehiculo_asignaciones va
                    INNER JOIN auth_usuario_demo_asignaciones da
                      ON da.id_usuario = va.id_usuario
                     AND da.id_vehiculo = va.id_vehiculo
                     AND da.activo = 1
                    INNER JOIN demos d
                      ON d.id_demo = da.id_demo
                     AND d.id_vehiculo = da.id_vehiculo
                    WHERE va.id_usuario = %s AND va.id_vehiculo = %s
                      AND va.estado = 'activa' AND va.fecha_revocacion IS NULL
                      AND d.activo = 1
                    ORDER BY d.id_demo ASC
                    """,
                    (user_id, vehicle_id),
                )
                return [
                    {
                        "id_demo": int(row["id_demo"]),
                        "id_vehiculo": int(row["id_vehiculo"]),
                        "nombre": row["nombre"],
                        "descripcion": row.get("descripcion"),
                        "activo": bool(row["activo"]),
                    }
                    for row in (cur.fetchall() or [])
                ]
            finally:
                cur.close()

    def can_access_demo(self, user_id: int, vehicle_id: int, demo_id: int) -> bool:
        """Valida simultáneamente la asignación del vehículo y de la DEMO."""
        with self.db.connection() as conn:
            cur = conn.cursor()
            try:
                cur.execute(
                    """
                    SELECT 1
                    FROM auth_vehiculo_asignaciones va
                    INNER JOIN auth_usuario_demo_asignaciones da
                      ON da.id_usuario = va.id_usuario
                     AND da.id_vehiculo = va.id_vehiculo
                     AND da.activo = 1
                    INNER JOIN demos d
                      ON d.id_demo = da.id_demo
                     AND d.id_vehiculo = da.id_vehiculo
                    WHERE va.id_usuario = %s AND va.id_vehiculo = %s
                      AND da.id_demo = %s
                      AND va.estado = 'activa' AND va.fecha_revocacion IS NULL
                      AND d.activo = 1
                    LIMIT 1
                    """,
                    (user_id, vehicle_id, demo_id),
                )
                return cur.fetchone() is not None
            finally:
                cur.close()

    def list_empty_demos(self) -> list[dict]:
        """Lista DEMOs que realmente no tienen filas en demo_movimientos."""
        with self.db.connection() as conn:
            cur = conn.cursor(dictionary=True)
            try:
                cur.execute(
                    """
                    SELECT
                        d.id_demo, d.id_vehiculo, d.nombre AS demo,
                        v.nombre AS vehiculo, COUNT(m.id_demo_movimiento) AS movimientos
                    FROM demos d
                    INNER JOIN vehiculos v ON v.id_vehiculo = d.id_vehiculo
                    LEFT JOIN demo_movimientos m ON m.id_demo = d.id_demo
                    GROUP BY d.id_demo, d.id_vehiculo, d.nombre, v.nombre
                    HAVING COUNT(m.id_demo_movimiento) = 0
                    ORDER BY v.id_vehiculo, d.id_demo
                    """
                )
                return [
                    {
                        "id_demo": int(row["id_demo"]),
                        "id_vehiculo": int(row["id_vehiculo"]),
                        "demo": row["demo"],
                        "vehiculo": row["vehiculo"],
                        "movimientos": int(row["movimientos"]),
                    }
                    for row in (cur.fetchall() or [])
                ]
            finally:
                cur.close()
