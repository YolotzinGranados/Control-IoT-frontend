"""Configuración central de FastAPI y Amazon RDS."""

import os
from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]

FRONTEND_ALLOWED_ORIGINS = tuple(
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ALLOWED_ORIGINS",
        "https://yolotzingranados.github.io",
    ).split(",")
    if origin.strip()
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Amazon RDS
    db_host: str
    db_port: int = 3306
    db_user: str
    db_password: SecretStr
    db_name: str = "vehiculo_iot"
    db_pool_size: int = 10
    db_connect_timeout: int = 10

    # API keys heredadas
    api_key_admin: Optional[SecretStr] = None
    api_key_control: Optional[SecretStr] = None
    enable_legacy_api_keys: bool = False

    # Funciones habilitadas mediante migraciones
    enable_explicit_support: bool = False
    enable_commercial_models: bool = False
    enable_guest_demo_publication: bool = False

    # Autenticación de usuarios
    auth_secret_key: Optional[SecretStr] = None
    auth_access_ttl_minutes: int = 10
    auth_guest_ttl_minutes: int = 15
    auth_refresh_ttl_days: int = 14

    # Credencial privada del ESP8266 conectado por WSS
    esp8266_ws_token: Optional[SecretStr] = None

    # Cookies de sesión
    auth_refresh_cookie_name: str = "iot_refresh"
    auth_csrf_cookie_name: str = "iot_csrf"


@lru_cache
def get_settings() -> Settings:
    return Settings()