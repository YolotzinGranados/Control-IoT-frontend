"""Catálogo y demostraciones limitadas para el perfil invitado."""
from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool

from app.core.auth import require_roles
from app.core.dependencies import get_db, get_demo_runner, get_demo_service, get_vehiculo_service
from app.core.exceptions import ConflictError, ForbiddenError
from app.repositories.auth_repository import AuthRepository
from app.services.demo_runner import DemoRunner
from app.services.demo_service import DemoService
from app.services.vehiculo_service import VehiculoService
from app.core.config import get_settings
router = APIRouter(prefix="/invitado", tags=["Invitado"])
solo_invitado = require_roles("guest")


@router.get("/catalogo", dependencies=[Depends(solo_invitado)])
def catalogo(
    db=Depends(get_db),
    servicio: VehiculoService = Depends(get_vehiculo_service),
):
    """Devuelve solo vehículos activos marcados para exhibición y sin comprador activo."""
    with db.connection() as conn:
        cur = conn.cursor()
        try:
            cur.execute(
                """
                SELECT v.id_vehiculo
                FROM vehiculos v
                WHERE v.activo = TRUE
                  AND v.es_exhibicion = TRUE
                  AND NOT EXISTS (
                    SELECT 1
                    FROM auth_vehiculo_asignaciones a
                    WHERE a.id_vehiculo = v.id_vehiculo
                      AND a.estado = 'activa'
                      AND a.fecha_revocacion IS NULL
                  )
                ORDER BY v.id_vehiculo
                """
            )
            ids = [int(row[0]) for row in (cur.fetchall() or [])]
        finally:
            cur.close()
            publicadas = get_settings().guest_allowed_demos

    result = []
    for vehicle_id in ids:
        vehicle = servicio.obtener(vehicle_id)
        result.append({
            "id_vehiculo": vehicle["id_vehiculo"],
            "nombre": vehicle["nombre"],
            "modelo": vehicle.get("modelo"),
            "descripcion": vehicle.get("descripcion"),
            "microcontrolador": vehicle.get("microcontrolador"),
            "demos": [
                {
                    "id_demo": demo["id_demo"],
                    "nombre": demo["nombre"],
                    "descripcion": demo.get("descripcion"),
                    "activo": bool(demo.get("activo")),
                }
                for demo in (vehicle.get("demos") or [])
                if demo.get("activo") and (vehicle_id, demo["id_demo"]) in publicadas
            ],
        })
    return result


@router.post(
    "/vehiculos/{id_vehiculo}/demos/{id_demo}/iniciar",
    status_code=202,
    dependencies=[Depends(solo_invitado)],
)
async def iniciar_demo_invitado(
    id_vehiculo: int,
    id_demo: int,
    db=Depends(get_db),
    servicio: DemoService = Depends(get_demo_service),
    runner: DemoRunner = Depends(get_demo_runner),
):
    if id_vehiculo <= 0 or id_demo <= 0:
        raise ConflictError("Identificadores de vehículo y DEMO inválidos")

    if not AuthRepository(db).can_access_guest_vehicle(id_vehiculo):
        raise ForbiddenError("Este vehículo no está habilitado para exhibición")

    preparacion = await run_in_threadpool(
        servicio.preparar_ejecucion, id_vehiculo, id_demo
    )
    movimientos = preparacion["movimientos"]
    if (id_vehiculo, id_demo) not in get_settings().guest_allowed_demos: raise ForbiddenError("Esta demostración no está publicada para invitados")
    if len(movimientos) > 30:
        raise ConflictError("La DEMO de invitado supera el máximo de 30 movimientos")

    duracion_total = sum(
        int(m.get("duracion_ms") or 0) + int(m.get("pausa_ms") or 0)
        for m in movimientos
    )
    if duracion_total > 180000:
        raise ConflictError("La DEMO de invitado supera los 180 segundos permitidos")

    ejecucion = runner.iniciar(id_vehiculo, preparacion)
    return {
        "mensaje": "DEMO temporal aceptada",
        "id_vehiculo": id_vehiculo,
        "id_demo": ejecucion.id_demo,
        "demo": ejecucion.nombre,
        "total_movimientos": ejecucion.total,
        "websocket": f"/ws/vehiculos/{id_vehiculo}",
    }
