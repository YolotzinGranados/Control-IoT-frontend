"""Catálogo y demostraciones limitadas para el perfil invitado."""
from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool

from app.core.auth import require_roles
from app.core.dependencies import get_db, get_demo_runner, get_demo_service, get_vehiculo_service, get_ws_manager
from app.core.exceptions import ConflictError, ForbiddenError
from app.repositories.auth_repository import AuthRepository
from app.services.demo_runner import DemoRunner
from app.services.demo_service import DemoService
from app.services.vehiculo_service import VehiculoService
router = APIRouter(prefix="/invitado", tags=["Invitado"])
solo_invitado = require_roles("guest")


@router.get("/catalogo", dependencies=[Depends(solo_invitado)])
def catalogo(
    db=Depends(get_db),
    servicio: VehiculoService = Depends(get_vehiculo_service),
    demos: DemoService = Depends(get_demo_service),
):
    """Muestra vehículos de exhibición y solo DEMOs activas, configuradas y seguras."""
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

    result = []
    for vehicle_id in ids:
        vehicle = servicio.obtener(vehicle_id)
        demos_publicadas = []
        for demo in (vehicle.get("demos") or []):
            if not demo.get("activo"):
                continue
            movimientos = demos.movimientos(vehicle_id, int(demo["id_demo"]))
            if not movimientos or len(movimientos) > 30:
                continue
            duracion_total = sum(
                int(mov.get("duracion_ms") or 0) + int(mov.get("pausa_ms") or 0)
                for mov in movimientos
            )
            if duracion_total > 180000:
                continue
            demos_publicadas.append({
                "id_demo": int(demo["id_demo"]),
                "nombre": demo["nombre"],
                "descripcion": demo.get("descripcion"),
                "activo": True,
                "total_movimientos": len(movimientos),
            })

        if demos_publicadas:
            result.append({
                "id_vehiculo": int(vehicle["id_vehiculo"]),
                "nombre": vehicle["nombre"],
                "modelo": vehicle.get("modelo"),
                "descripcion": vehicle.get("descripcion"),
                "microcontrolador": vehicle.get("microcontrolador"),
                "demos": demos_publicadas,
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
    manager=Depends(get_ws_manager),
):
    if id_vehiculo <= 0 or id_demo <= 0:
        raise ConflictError("Identificadores de vehículo y DEMO inválidos")

    if not AuthRepository(db).can_access_guest_vehicle(id_vehiculo):
        raise ForbiddenError("Este vehículo no está habilitado para exhibición")

    if not manager.listo_para_vehiculo(id_vehiculo):
        raise ConflictError(
            "El ESP8266 todavía no está conectado y confirmado para este vehículo. "
            "Conecta la placa y espera el evento de confirmación antes de iniciar la DEMO."
        )

    preparacion = await run_in_threadpool(
        servicio.preparar_ejecucion, id_vehiculo, id_demo
    )
    movimientos = preparacion["movimientos"]
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