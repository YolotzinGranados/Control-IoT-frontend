"""Autorización RBAC con compatibilidad opcional de API keys heredadas."""
import secrets

from fastapi import Depends, Path, Request

from app.core.auth import principal_from_authorization_header
from app.core.config import get_settings
from app.core.dependencies import get_db
from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.repositories.auth_repository import AuthRepository


def _legacy_identity(request: Request):
    settings = get_settings()
    if not settings.enable_legacy_api_keys:
        return None
    supplied = request.headers.get("X-API-Key", "")
    if not supplied:
        return None
    admin_key = (
        settings.api_key_admin.get_secret_value()
        if settings.api_key_admin else ""
    )
    control_key = (
        settings.api_key_control.get_secret_value()
        if settings.api_key_control else ""
    )
    if admin_key and secrets.compare_digest(supplied, admin_key):
        return "legacy-admin"
    if control_key and secrets.compare_digest(supplied, control_key):
        return "legacy-control"
    return None


def _principal_or_legacy(request: Request, db):
    # Si hay JWT explícito, siempre prevalece sobre cualquier API key heredada
    # que el cliente HTTP pudiera enviar como encabezado predeterminado.
    authorization = request.headers.get("Authorization")
    if authorization:
        principal = principal_from_authorization_header(authorization, db)
        if principal is not None:
            return principal
    legacy = _legacy_identity(request)
    if legacy:
        return legacy
    raise UnauthorizedError("Se requiere un token Bearer")


def requiere_admin(request: Request, db=Depends(get_db)):
    identidad = _principal_or_legacy(request, db)
    if identidad == "legacy-admin":
        return identidad
    if isinstance(identidad, str) or "admin" not in identidad.roles:
        raise ForbiddenError("Se requiere el perfil administrador")
    return identidad


def requiere_control(request: Request, db=Depends(get_db)):
    identidad = _principal_or_legacy(request, db)
    if identidad in ("legacy-admin", "legacy-control"):
        return identidad
    if not set(identidad.roles).intersection({"admin", "user"}):
        raise ForbiddenError("El perfil no puede controlar vehículos")
    return identidad


def requiere_vehiculo(
    request: Request,
    id_vehiculo: int = Path(gt=0),
    db=Depends(get_db),
):
    identidad = _principal_or_legacy(request, db)
    # Las API keys solo se aceptan cuando ENABLE_LEGACY_API_KEYS=true.
    # En producción (false) todas las solicitudes requieren JWT y autorización RBAC.
    if identidad in ("legacy-admin", "legacy-control"):
        return identidad
    permitido = AuthRepository(db).can_access_vehicle(
        identidad.id_usuario,
        identidad.roles,
        id_vehiculo,
    )
    if not permitido:
        raise ForbiddenError("No tienes autorización para este vehículo")
    return identidad
