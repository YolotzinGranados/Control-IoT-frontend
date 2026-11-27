"""Operaciones del panel de administración."""
from fastapi import APIRouter, Depends, Path

from app.core.auth import require_roles
from app.core.dependencies import get_db
from app.core.exceptions import ConflictError, NotFoundError
from app.core.auth_crypto import hash_password
from app.models.admin import (
    AssignmentCreateIn, CustomerCreateIn, ExhibitionToggleIn,
    CustomerDemoAssignmentsIn,
)
from app.core.dependencies import get_demo_runner, get_demo_service
from app.services.demo_runner import DemoRunner
from app.services.demo_service import DemoService
from app.repositories.auth_repository import AuthRepository

router = APIRouter(prefix="/admin", tags=["Administración"])
solo_admin = require_roles("admin")


@router.get("/dashboard", dependencies=[Depends(solo_admin)])
def dashboard(db=Depends(get_db)):
    return AuthRepository(db).dashboard_stats()




@router.get("/vehiculos", dependencies=[Depends(solo_admin)])
def inventario_completo(db=Depends(get_db)):
    """Lectura del inventario completo; no autoriza control de unidades asignadas."""
    return AuthRepository(db).list_admin_vehicles()


@router.post("/vehiculos/{id_vehiculo}/exhibicion", dependencies=[Depends(solo_admin)])
def configurar_exhibicion(
    datos: ExhibitionToggleIn,
    id_vehiculo: int = Path(gt=0),
    db=Depends(get_db),
):
    try:
        updated = AuthRepository(db).set_vehicle_exhibition(
            id_vehiculo, datos.es_exhibicion
        )
    except ValueError as exc:
        raise ConflictError(str(exc)) from exc
    if not updated:
        raise NotFoundError("El vehículo no existe")
    return {
        "mensaje": "Configuración de exhibición actualizada",
        "id_vehiculo": id_vehiculo,
        "es_exhibicion": datos.es_exhibicion,
    }


@router.get("/clientes", dependencies=[Depends(solo_admin)])
def listar_clientes(db=Depends(get_db)):
    return AuthRepository(db).list_customers()


@router.post("/clientes", status_code=201, dependencies=[Depends(solo_admin)])
def crear_cliente(datos: CustomerCreateIn, db=Depends(get_db)):
    repo = AuthRepository(db)
    try:
        user_id = repo.create_customer(
            username=datos.username,
            email=str(datos.email),
            nombre=datos.nombre,
            password_hash=hash_password(datos.password),
        )
    except Exception as exc:
        if getattr(exc, "errno", None) == 1062:
            raise ConflictError("El usuario o correo ya está registrado") from exc
        raise
    return {"mensaje": "Cliente creado", "id_usuario": user_id}


@router.get("/asignaciones", dependencies=[Depends(solo_admin)])
def listar_asignaciones(db=Depends(get_db)):
    return AuthRepository(db).list_assignments()


@router.post("/asignaciones", status_code=201, dependencies=[Depends(solo_admin)])
def crear_asignacion(datos: AssignmentCreateIn, db=Depends(get_db)):
    try:
        assignment_id = AuthRepository(db).create_assignment(
            datos.id_usuario, datos.id_vehiculo
        )
    except ValueError as exc:
        raise ConflictError(str(exc)) from exc
    except Exception as exc:
        if getattr(exc, "errno", None) == 1062:
            raise ConflictError("El vehículo ya tiene una asignación activa") from exc
        raise
    return {"mensaje": "Vehículo asignado", "id_asignacion": assignment_id}


@router.post("/asignaciones/{id_asignacion}/revocar", dependencies=[Depends(solo_admin)])
def revocar_asignacion(
    id_asignacion: int = Path(gt=0),
    db=Depends(get_db),
):
    if not AuthRepository(db).revoke_assignment(id_asignacion):
        raise NotFoundError("La asignación no existe o ya fue revocada")
    return {"mensaje": "Asignación revocada", "id_asignacion": id_asignacion}


@router.get("/clientes/{id_usuario}/vehiculos/{id_vehiculo}/demos", dependencies=[Depends(solo_admin)])
def listar_demos_cliente(
    id_usuario: int = Path(gt=0),
    id_vehiculo: int = Path(gt=0),
    db=Depends(get_db),
):
    try:
        return AuthRepository(db).list_customer_vehicle_demos(id_usuario, id_vehiculo)
    except ValueError as exc:
        raise ConflictError(str(exc)) from exc


@router.post("/clientes/{id_usuario}/vehiculos/{id_vehiculo}/demos", dependencies=[Depends(solo_admin)])
def guardar_demos_cliente(
    datos: CustomerDemoAssignmentsIn,
    id_usuario: int = Path(gt=0),
    id_vehiculo: int = Path(gt=0),
    db=Depends(get_db),
):
    try:
        total = AuthRepository(db).replace_customer_demo_assignments(
            id_usuario, id_vehiculo, datos.id_demos
        )
    except ValueError as exc:
        raise ConflictError(str(exc)) from exc
    return {
        "mensaje": "Asignación de DEMOs actualizada",
        "id_usuario": id_usuario,
        "id_vehiculo": id_vehiculo,
        "total_demos_asignadas": total,
        "id_demos": datos.id_demos,
    }


@router.get("/demos-sin-movimientos", dependencies=[Depends(solo_admin)])
def listar_demos_sin_movimientos(db=Depends(get_db)):
    return AuthRepository(db).list_empty_demos()


@router.post("/demos/eliminar-vacias", dependencies=[Depends(solo_admin)])
def eliminar_demos_vacias(
    db=Depends(get_db),
    servicio: DemoService = Depends(get_demo_service),
    runner: DemoRunner = Depends(get_demo_runner),
):
    """Reconsulta RDS y elimina únicamente DEMOs cuyo conteo de movimientos sea cero."""
    repo = AuthRepository(db)
    vacias = repo.list_empty_demos()
    eliminadas = []
    omitidas = []

    for item in vacias:
        ejecucion = runner.activa(item["id_vehiculo"])
        if ejecucion and ejecucion.id_demo == item["id_demo"]:
            omitidas.append({**item, "motivo": "La DEMO está en ejecución"})
            continue
        try:
            # DemoService valida pertenencia y elimina mediante sp_eliminar_demo.
            servicio.eliminar(item["id_vehiculo"], item["id_demo"])
            eliminadas.append(item)
        except Exception as exc:
            omitidas.append({**item, "motivo": str(exc)})

    return {
        "mensaje": "Limpieza de DEMOs vacías finalizada",
        "total_eliminadas": len(eliminadas),
        "total_omitidas": len(omitidas),
        "eliminadas": eliminadas,
        "omitidas": omitidas,
    }