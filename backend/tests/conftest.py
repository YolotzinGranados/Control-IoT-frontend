import os

# Configuración falsa ANTES de importar la app (no se conecta a ningún RDS real).
AUTH_SECRET = "test-auth-secret-" + "x" * 48
os.environ.update(
    DB_HOST="fake",
    DB_USER="fake",
    DB_PASSWORD="fake",
    API_KEY_ADMIN="clave-admin-test",
    API_KEY_CONTROL="clave-control-test",
    ENABLE_LEGACY_API_KEYS="true",
    AUTH_SECRET_KEY=AUTH_SECRET,
)

import pytest
from fastapi.testclient import TestClient

from app.core.auth_crypto import create_access_token
from app.main import app
from app.repositories.auth_repository import AuthRepository
from app.services.demo_runner import DemoRunner
from tests.fakes import FakeRDS, sembrar

ADMIN = {"X-API-Key": "clave-admin-test"}
CONTROL = {"X-API-Key": "clave-control-test"}

ADMIN_TOKEN = create_access_token(
    user_id=1,
    email="admin@example.test",
    roles=["admin"],
    secret=AUTH_SECRET,
    ttl_seconds=3600,
)
USER_TOKEN = create_access_token(
    user_id=2,
    email="user@example.test",
    roles=["user"],
    secret=AUTH_SECRET,
    ttl_seconds=3600,
)
OTHER_USER_TOKEN = create_access_token(
    user_id=3,
    email="other@example.test",
    roles=["user"],
    secret=AUTH_SECRET,
    ttl_seconds=3600,
)
EXPIRED_TOKEN = create_access_token(
    user_id=2,
    email="user@example.test",
    roles=["user"],
    secret=AUTH_SECRET,
    ttl_seconds=-1,
)
GUEST_TOKEN = create_access_token(
    user_id=4,
    email="guest@example.test",
    roles=["guest"],
    secret=AUTH_SECRET,
    ttl_seconds=3600,
)

TEST_USERS = {
    1: {"id_usuario": 1, "email": "admin@example.test", "nombre": "Admin", "roles": ["admin"], "activo": True},
    2: {"id_usuario": 2, "email": "user@example.test", "nombre": "User", "roles": ["user"], "activo": True},
    3: {"id_usuario": 3, "email": "other@example.test", "nombre": "Other", "roles": ["user"], "activo": True},
    4: {"id_usuario": 4, "email": "guest@example.test", "nombre": "Guest", "roles": ["guest"], "activo": True},
}


@pytest.fixture
def rds():
    r = FakeRDS()
    sembrar(r)
    return r


@pytest.fixture
def client(rds, monkeypatch):
    # El fixture simula las dos consultas de autenticación sin tocar RDS real.
    def fake_get_by_id(self, user_id):
        return TEST_USERS.get(int(user_id))

    def fake_can_access_vehicle(self, user_id, roles, vehicle_id):
        roles = set(roles or ())
        if "admin" in roles:
            # El vehículo 1 está vendido/asignado; los demás son inventario libre.
            return int(vehicle_id) != 1
        if "user" in roles:
            return int(user_id) == 2 and int(vehicle_id) == 1
        return False

    monkeypatch.setattr(AuthRepository, "get_by_id", fake_get_by_id)
    monkeypatch.setattr(AuthRepository, "can_access_vehicle", fake_can_access_vehicle)

    with TestClient(app, headers=ADMIN) as c:
        app.state.db = rds
        app.state.executor = rds
        app.state.demo_runner = DemoRunner(rds, rds, app.state.ws_manager)
        yield c
