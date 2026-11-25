"""Crea el primer administrador usando el esquema real de AWS RDS.

Esquema esperado de auth_usuarios:
  username VARCHAR(80) NOT NULL UNIQUE
  email VARCHAR(254) NULL UNIQUE
  nombre VARCHAR(120) NOT NULL
  password_hash VARCHAR(255) NOT NULL
  activo TINYINT(1) NOT NULL DEFAULT 1

Esquema esperado de auth_roles:
  id_rol, codigo, nombre

No imprime ni almacena la contraseña en texto plano.
"""
from getpass import getpass
import re
import sys

from app.core.auth_crypto import hash_password
from app.core.config import get_settings
from app.core.database import Database


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,80}$")


def pedir_dato(mensaje: str, max_len: int) -> str:
    valor = input(mensaje).strip()
    if not valor or len(valor) > max_len:
        raise SystemExit(f"ERROR: El dato debe tener entre 1 y {max_len} caracteres.")
    return valor


def validar_password(password: str) -> None:
    if not 12 <= len(password) <= 128:
        raise SystemExit("ERROR: La contraseña debe tener entre 12 y 128 caracteres.")
    if not any(c.islower() for c in password):
        raise SystemExit("ERROR: La contraseña debe incluir una minúscula.")
    if not any(c.isupper() for c in password):
        raise SystemExit("ERROR: La contraseña debe incluir una mayúscula.")
    if not any(c.isdigit() for c in password):
        raise SystemExit("ERROR: La contraseña debe incluir un número.")


def main() -> None:
    settings = get_settings()

    username = pedir_dato("Usuario administrador (3-80 caracteres): ", 80)
    if not USERNAME_RE.fullmatch(username):
        raise SystemExit(
            "ERROR: El usuario solo puede contener letras, números, punto, guion y guion bajo."
        )

    email = pedir_dato("Correo electrónico: ", 254).lower()
    if not EMAIL_RE.fullmatch(email):
        raise SystemExit("ERROR: El correo electrónico no es válido.")

    nombre = pedir_dato("Nombre completo: ", 120)
    if len(nombre) < 2:
        raise SystemExit("ERROR: El nombre debe tener al menos 2 caracteres.")

    password = getpass("Contraseña (12-128 caracteres): ")
    confirmacion = getpass("Confirma la contraseña: ")
    if password != confirmacion:
        raise SystemExit("ERROR: Las contraseñas no coinciden.")
    validar_password(password)

    db = Database(settings)
    user_id = None
    try:
        with db.transaction() as conn:
            cur = conn.cursor()
            try:
                # Evita crear duplicados por username o correo.
                cur.execute(
                    """SELECT id_usuario FROM auth_usuarios
                       WHERE username = %s OR email = %s
                       LIMIT 1 FOR UPDATE""",
                    (username, email),
                )
                existente = cur.fetchone()
                if existente:
                    raise RuntimeError(
                        f"Ya existe una cuenta con ese usuario o correo (ID {existente[0]})."
                    )

                # Este script se reserva para el primer administrador.
                cur.execute(
                    """SELECT COUNT(*)
                       FROM auth_usuario_roles ur
                       JOIN auth_roles r ON r.id_rol = ur.id_rol
                       WHERE r.codigo = 'admin'"""
                )
                if int(cur.fetchone()[0]) > 0:
                    raise RuntimeError(
                        "Ya existe un administrador. Crea administradores posteriores "
                        "desde el módulo de administración."
                    )

                cur.execute(
                    "SELECT id_rol FROM auth_roles WHERE codigo = 'admin' FOR UPDATE"
                )
                role = cur.fetchone()
                if not role:
                    raise RuntimeError(
                        "No existe el rol admin. Ejecuta primero "
                        "002_auth_schema_alignment_up.sql."
                    )

                cur.execute(
                    """INSERT INTO auth_usuarios
                       (username, email, nombre, password_hash, activo)
                       VALUES (%s, %s, %s, %s, 1)""",
                    (username, email, nombre, hash_password(password)),
                )
                user_id = int(cur.lastrowid)

                cur.execute(
                    """INSERT INTO auth_usuario_roles (id_usuario, id_rol)
                       VALUES (%s, %s)""",
                    (user_id, int(role[0])),
                )
            finally:
                cur.close()

        print("\nADMINISTRADOR CREADO CORRECTAMENTE.")
        print(f"Usuario: {username}")
        print(f"Correo: {email}")
        print(f"ID de usuario: {user_id}")
    except RuntimeError as exc:
        raise SystemExit(f"ERROR: {exc}") from exc
    finally:
        db.close()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nOperación cancelada.")
        sys.exit(130)
