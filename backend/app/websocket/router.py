"""WebSocket autenticado por vehículo: /ws/vehiculos/{id_vehiculo}.

El navegador no puede establecer Authorization en el handshake WebSocket. Por eso
el cliente envía el JWT como segundo subprotocolo: ["bearer", access_token]. El
servidor negocia únicamente el subprotocolo "bearer" y nunca devuelve el token.
"""
import asyncio
import hmac
import json
import logging
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from starlette.websockets import WebSocketState

from app.core.auth import principal_from_token
from app.core.auth_crypto import decode_access_token
from app.core.config import FRONTEND_ALLOWED_ORIGINS, get_settings
from app.core.dependencies import crear_estado_service
from app.core.exceptions import AppError, ForbiddenError, NotFoundError, UnauthorizedError
from app.repositories.auth_repository import AuthRepository
from app.websocket import eventos as ev

logger = logging.getLogger(__name__)
router = APIRouter()

CODIGO_NO_AUTENTICADO = 4401
CODIGO_SIN_PERMISO = 4403
CODIGO_NO_ENCONTRADO = 4404
CODIGO_ERROR_INTERNO = 1011


def _token_del_handshake(websocket: WebSocket) -> str | None:
    """Extrae JWT de subprotocols sin colocarlo en la URL ni en logs."""
    protocols = websocket.scope.get("subprotocols", [])
    if len(protocols) >= 2 and protocols[0].lower() == "bearer":
        return protocols[1]
    return None


def _validar_token(token: str, db):
    """Valida JWT/cuenta activa y devuelve principal + expiración Unix."""
    settings = get_settings()
    if not settings.auth_secret_key:
        raise UnauthorizedError("Autenticación no configurada")
    try:
        claims = decode_access_token(
            token,
            settings.auth_secret_key.get_secret_value(),
        )
    except ValueError as exc:
        raise UnauthorizedError("Token inválido o expirado") from exc
    principal = principal_from_token(token, db)
    return principal, int(claims["exp"])


@router.websocket("/ws/vehiculos/{id_vehiculo}")
async def websocket_vehiculo(websocket: WebSocket, id_vehiculo: int):
    app = websocket.app
    manager = app.state.ws_manager
    accepted = False
    registered = False

    # Los clientes de navegador deben proceder del frontend publicado. Clientes
    # independientes sin Origin pueden conectarse, pero siempre con JWT válido.
    origin = websocket.headers.get("origin")
    if origin and origin not in FRONTEND_ALLOWED_ORIGINS:
        await websocket.close(code=CODIGO_SIN_PERMISO)
        return

    token = _token_del_handshake(websocket)
    if not token:
        await websocket.close(code=CODIGO_NO_AUTENTICADO)
        return

    try:
        principal, expira_en = await run_in_threadpool(
            _validar_token,
            token,
            app.state.db,
        )
        if expira_en <= int(time.time()):
            raise UnauthorizedError("El token expiró")

        # Una vez validada la identidad se acepta el protocolo. Los rechazos de
        # recurso se envían ya como cierres WSS 4403/4404, legibles por el navegador.
        await websocket.accept(subprotocol="bearer")
        accepted = True

        # Comprueba que la unidad exista antes de comprobar asignación; no envía datos.
        servicio = crear_estado_service(app.state.db, app.state.executor)
        estado = await run_in_threadpool(servicio.obtener, id_vehiculo)

        permisos = AuthRepository(app.state.db)
        if "guest" in principal.roles:
            autorizado = await run_in_threadpool(
                permisos.can_access_guest_vehicle,
                id_vehiculo,
            )
        else:
            autorizado = await run_in_threadpool(
                permisos.can_access_vehicle,
                principal.id_usuario,
                principal.roles,
                id_vehiculo,
            )
        if not autorizado:
            raise ForbiddenError("No tienes autorización para este vehículo")

        manager.registrar(id_vehiculo, websocket)
        registered = True

        # La conexión del navegador ocurre al pulsar "Conectar". Después de
        # validar permisos, este ID pasa a ser el vehículo activo de la única placa.
        await manager.seleccionar_vehiculo(id_vehiculo)
        await websocket.send_json(ev.evento_estado_inicial(estado))

        # La sesión WSS no sobrevive a la expiración del access token.
        while True:
            restante = expira_en - time.time()
            if restante <= 0:
                await _cerrar_con_error(
                    websocket,
                    id_vehiculo,
                    "La sesión expiró; renueva el token y vuelve a conectar",
                    CODIGO_NO_AUTENTICADO,
                )
                break

            try:
                texto = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=restante,
                )
            except asyncio.TimeoutError:
                await _cerrar_con_error(
                    websocket,
                    id_vehiculo,
                    "La sesión expiró; renueva el token y vuelve a conectar",
                    CODIGO_NO_AUTENTICADO,
                )
                break

            if texto.strip().lower() == "ping":
                if "guest" in principal.roles:
                    sigue_autorizado = await run_in_threadpool(
                        AuthRepository(app.state.db).can_access_guest_vehicle,
                        id_vehiculo,
                    )
                    if not sigue_autorizado:
                        await _cerrar_con_error(
                            websocket,
                            id_vehiculo,
                            "El vehículo dejó de estar habilitado para exhibición",
                            CODIGO_SIN_PERMISO,
                        )
                        break
                await websocket.send_json(ev.evento(ev.PONG, id_vehiculo))

    except WebSocketDisconnect:
        pass
    except UnauthorizedError as exc:
        if accepted:
            await _cerrar_con_error(websocket, id_vehiculo, exc.mensaje, CODIGO_NO_AUTENTICADO)
        else:
            await websocket.close(code=CODIGO_NO_AUTENTICADO)
    except ForbiddenError as exc:
        if accepted:
            await _cerrar_con_error(websocket, id_vehiculo, exc.mensaje, CODIGO_SIN_PERMISO)
        else:
            await websocket.close(code=CODIGO_SIN_PERMISO)
    except NotFoundError as exc:
        if accepted:
            await _cerrar_con_error(websocket, id_vehiculo, exc.mensaje, CODIGO_NO_ENCONTRADO)
        else:
            await websocket.close(code=CODIGO_NO_ENCONTRADO)
    except AppError as exc:
        if accepted:
            await _cerrar_con_error(websocket, id_vehiculo, exc.mensaje, CODIGO_ERROR_INTERNO)
        else:
            await websocket.close(code=CODIGO_ERROR_INTERNO)
    except Exception:
        logger.exception("Error en el WebSocket del vehículo %s", id_vehiculo)
        if accepted:
            await _cerrar_con_error(
                websocket,
                id_vehiculo,
                "Error interno del servidor",
                CODIGO_ERROR_INTERNO,
            )
        else:
            await websocket.close(code=CODIGO_ERROR_INTERNO)
    finally:
        if registered:
            manager.desconectar(id_vehiculo, websocket)


@router.websocket("/ws/esp8266")
async def websocket_esp8266(websocket: WebSocket):
    """Conexión persistente de la única placa. No recibe un ID en la URL.

    La selección del vehículo llega después desde la sesión WSS autorizada del
    usuario. La placa se autentica con ESP8266_WS_TOKEN, no con MAC ni ID manual.
    """
    settings = get_settings()
    configured = settings.esp8266_ws_token
    authorization = websocket.headers.get("authorization", "")
    expected = (
        f"Bearer {configured.get_secret_value()}"
        if configured and configured.get_secret_value()
        else ""
    )

    if not expected or not hmac.compare_digest(authorization, expected):
        await websocket.close(code=CODIGO_NO_AUTENTICADO)
        return

    origin = websocket.headers.get("origin")
    if origin and origin not in FRONTEND_ALLOWED_ORIGINS:
        await websocket.close(code=CODIGO_SIN_PERMISO)
        return

    await websocket.accept()
    manager = websocket.app.state.ws_manager
    await manager.registrar_dispositivo(websocket)

    try:
        while True:
            texto = await websocket.receive_text()
            if texto.strip().lower() == "ping":
                await websocket.send_json({"tipo": "pong"})
                continue

            try:
                mensaje = json.loads(texto)
            except (TypeError, json.JSONDecodeError):
                logger.warning("ESP8266 envió un mensaje JSON inválido")
                continue

            if not isinstance(mensaje, dict):
                continue

            if mensaje.get("tipo") == "vehiculo_configurado":
                try:
                    id_recibido = int(mensaje.get("id_vehiculo", 0))
                except (TypeError, ValueError):
                    id_recibido = 0

                confirmado = id_recibido > 0 and await manager.confirmar_dispositivo(
                    id_recibido, websocket
                )
                if not confirmado:
                    id_actual = manager.vehiculo_activo
                    if id_actual is None:
                        await websocket.send_json({"tipo": "esperar_seleccion"})
                    else:
                        await websocket.send_json({
                            "tipo": "configuracion_vehiculo",
                            "id_vehiculo": id_actual,
                        })

    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("Error en la conexión WSS de la placa ESP8266")
    finally:
        await manager.desconectar_dispositivo(websocket)


async def _cerrar_con_error(
    websocket: WebSocket,
    id_vehiculo: int,
    mensaje: str,
    codigo: int,
) -> None:
    try:
        if websocket.application_state == WebSocketState.CONNECTED:
            await websocket.send_json(
                ev.evento(ev.ERROR, id_vehiculo, mensaje=mensaje)
            )
            await websocket.close(code=codigo)
    except Exception:
        pass  # el socket ya estaba cerrado

