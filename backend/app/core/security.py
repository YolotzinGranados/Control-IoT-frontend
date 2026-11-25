"""Compatibilidad temporal de seguridad para las rutas REST existentes.

En producción se usan JWT Bearer. Las API keys heredadas solo se aceptan si
ENABLE_LEGACY_API_KEYS=true; esa opción se reserva para pruebas/migración.
"""
import secrets

from fastapi import Depends, HTTPException, Request

from app.core.auth import principal_from_authorization_header
from app.core.config import get_settings
from app.core.dependencies import get_db
from app.core.exceptions import UnauthorizedError


def _principal_or_legacy_role(request: Request, db):
    principal = principal_from_authorization_header(
        request.headers.get("Authorization"),
        db,
    )
    if principal is not None:
        return principal

    settings = get_settings()
    if not settings.enable_legacy_api_keys:
        raise UnauthorizedError("Se requiere autenticación Bearer")

    supplied = request.headers.get("X-API-Key", "")
    if not supplied:
        raise UnauthorizedError("Falta la credencial de acceso")

    admin_key = (
        settings.api_key_admin.get_secret_value()
        if settings.api_key_admin else ""
    )
    control_key = (
        settings.api_key_control.get_secret_value()
        if settings.api_key_control else ""
    )

    if admin_key and secrets.compare_digest(supplied, admin_key):
        return "legacy_admin"
    if control_key and secrets.compare_digest(supplied, control_key):
        return "legacy_control"
    raise UnauthorizedError("Credencial de acceso inválida")


def requiere_admin(
    request: Request,
    db=Depends(get_db),
):
    identity = _principal_or_legacy_role(request, db)
    if identity == "legacy_admin":
        return identity
    if identity == "legacy_control":
        raise HTTPException(status_code=403, detail="Se requiere perfil administrador")
    if "admin" not in identity.roles:
        raise HTTPException(status_code=403, detail="Se requiere perfil administrador")
    return identity


def requiere_control(
    request: Request,
    db=Depends(get_db),
):
    identity = _principal_or_legacy_role(request, db)
    if identity in ("legacy_admin", "legacy_control"):
        return identity
    if not set(identity.roles).intersection({"admin", "user"}):
        raise HTTPException(status_code=403, detail="El perfil no puede controlar vehículos")
    return identity


def requiere_vehiculo(
    id_vehiculo: int,
    request: Request,
    db=Depends(get_db),
):
    """Autoriza la unidad concreta; solo el modo heredado de pruebas omite la asignación."""
    identity = _principal_or_legacy_role(request, db)
    if identity in ("legacy_admin", "legacy_control"):
        return identity
    from app.repositories.auth_repository import AuthRepository
    if not AuthRepository(db).can_access_vehicle(
        identity.id_usuario,
        identity.roles,
        id_vehiculo,
    ):
        raise HTTPException(
            status_code=403,
            detail="No tienes autorización para acceder a este vehículo",
        )
    return identity
