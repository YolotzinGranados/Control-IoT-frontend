"""Dependencias de identidad, sesión, RBAC y autorización por vehículo."""
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.auth_crypto import decode_access_token
from app.core.config import get_settings
from app.core.dependencies import get_db
from app.core.exceptions import UnauthorizedError
from app.repositories.auth_repository import AuthRepository

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class Principal:
    id_usuario: int
    email: str
    roles: tuple[str, ...]


def principal_from_token(token: str, db) -> Principal:
    """Valida firma/expiración y vuelve a consultar cuenta y roles en RDS."""
    settings = get_settings()
    if not settings.auth_secret_key:
        raise UnauthorizedError("Autenticación no configurada")

    try:
        claims = decode_access_token(
            token,
            settings.auth_secret_key.get_secret_value(),
        )
        user_id = int(claims["sub"])
    except Exception as exc:
        raise UnauthorizedError("Token inválido o expirado") from exc

    user = AuthRepository(db).get_by_id(user_id)
    if not user or not user["activo"]:
        raise UnauthorizedError("La cuenta está inactiva o no existe")

    # Los roles siempre se leen de RDS; nunca se confía en los roles del navegador.
    return Principal(
        id_usuario=user["id_usuario"],
        email=user["email"],
        roles=tuple(user["roles"]),
    )


def principal_from_authorization_header(authorization: str | None, db) -> Principal | None:
    """Devuelve None si no hay Authorization; rechaza esquemas/tokens mal formados."""
    if not authorization:
        return None
    scheme, separator, token = authorization.partition(" ")
    if not separator or scheme.lower() != "bearer" or not token.strip():
        raise UnauthorizedError("Se requiere un token Bearer válido")
    return principal_from_token(token.strip(), db)


def get_current_principal(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db=Depends(get_db),
) -> Principal:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise UnauthorizedError("Se requiere un token Bearer")
    return principal_from_token(credentials.credentials, db)


def require_roles(*allowed: str):
    def dependency(principal: Principal = Depends(get_current_principal)) -> Principal:
        if not set(principal.roles).intersection(allowed):
            raise HTTPException(
                status_code=403,
                detail="El perfil no tiene permiso para esta operación",
            )
        return principal
    return dependency
