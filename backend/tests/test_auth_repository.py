from contextlib import contextmanager

from app.repositories.auth_repository import AuthRepository


class FakeCursor:
    def __init__(self, row):
        self.row = row
        self.sql = ""
        self.params = None
        self.closed = False

    def execute(self, sql, params):
        self.sql = sql
        self.params = params

    def fetchone(self):
        return self.row

    def close(self):
        self.closed = True


class FakeConnection:
    def __init__(self, row):
        self.cursor_instance = FakeCursor(row)

    def cursor(self):
        return self.cursor_instance


class FakeDB:
    def __init__(self, row):
        self.connection_instance = FakeConnection(row)
        self.connection_calls = 0

    @contextmanager
    def connection(self):
        self.connection_calls += 1
        yield self.connection_instance


def test_user_requires_active_assignment_and_queries_own_vehicle():
    db = FakeDB((1,))
    assert AuthRepository(db).can_access_vehicle(27, ["user"], 8) is True
    cursor = db.connection_instance.cursor_instance
    assert "id_usuario = %s" in cursor.sql
    assert "id_vehiculo = %s" in cursor.sql
    assert "estado = 'activa'" in cursor.sql
    assert "fecha_revocacion IS NULL" in cursor.sql
    assert cursor.params == (27, 8)
    assert cursor.closed


def test_user_without_active_assignment_is_denied():
    db = FakeDB(None)
    assert AuthRepository(db).can_access_vehicle(27, ["user"], 8) is False


def test_admin_can_access_only_unassigned_vehicle():
    free_db = FakeDB(None)
    assigned_db = FakeDB((1,))
    assert AuthRepository(free_db).can_access_vehicle(1, ["admin"], 8) is True
    assert AuthRepository(assigned_db).can_access_vehicle(1, ["admin"], 8) is False


def test_guest_is_denied_without_querying_assignments():
    db = FakeDB((1,))
    assert AuthRepository(db).can_access_vehicle(9, ["guest"], 8) is False
    assert db.connection_calls == 0
