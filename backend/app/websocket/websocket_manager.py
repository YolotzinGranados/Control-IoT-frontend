"""Gestor WSS: clientes agrupados por vehículo y una sola placa ESP8266.

El navegador se registra en /ws/vehiculos/{id_vehiculo}. La placa mantiene
una sola conexión en /ws/esp8266. Al conectar el usuario un vehículo, el
backend le envía a la placa la nueva identidad; no se almacena ningún ID fijo
ni se requiere una tabla de placas.
"""
import asyncio
import logging
from collections import defaultdict
from typing import Optional

from fastapi import WebSocket

logger = logging.getLogger(__name__)
TIMEOUT_ENVIO = 2.0


class WebSocketManager:
    def __init__(self):
        self._clientes: dict[int, set[WebSocket]] = defaultdict(set)
        self._dispositivo: Optional[WebSocket] = None
        self._vehiculo_activo: Optional[int] = None
        self._dispositivo_listo = False

    @property
    def vehiculo_activo(self) -> Optional[int]:
        return self._vehiculo_activo

    @property
    def dispositivo_listo(self) -> bool:
        return self._dispositivo_listo

    def registrar(self, id_vehiculo: int, websocket: WebSocket) -> None:
        """Registra un navegador ya aceptado y autorizado."""
        self._clientes[id_vehiculo].add(websocket)
        logger.info("WS navegador conectado al vehículo %s (%s clientes)",
                    id_vehiculo, self.total_clientes(id_vehiculo))

    def desconectar(self, id_vehiculo: int, websocket: WebSocket) -> None:
        clientes = self._clientes.get(id_vehiculo)
        if clientes is not None:
            clientes.discard(websocket)
            if not clientes:
                del self._clientes[id_vehiculo]

    def total_clientes(self, id_vehiculo: int) -> int:
        return len(self._clientes.get(id_vehiculo, ()))

    @staticmethod
    async def _enviar_seguro(websocket: WebSocket, mensaje: dict) -> bool:
        try:
            await asyncio.wait_for(websocket.send_json(mensaje), timeout=TIMEOUT_ENVIO)
            return True
        except Exception:
            return False

    async def notificar_clientes_web(self, id_vehiculo: int, mensaje: dict) -> int:
        clientes = list(self._clientes.get(id_vehiculo, ()))
        if not clientes:
            return 0
        resultados = await asyncio.gather(
            *(self._enviar_seguro(ws, mensaje) for ws in clientes)
        )
        for ws, ok in zip(clientes, resultados):
            if not ok:
                self.desconectar(id_vehiculo, ws)
        return sum(resultados)

    async def registrar_dispositivo(self, websocket: WebSocket) -> None:
        """Registra la única placa. Si ya había otra sesión, la anterior se cierra."""
        anterior = self._dispositivo
        self._dispositivo = websocket
        self._dispositivo_listo = False

        if anterior is not None and anterior is not websocket:
            try:
                await anterior.close(code=4001, reason="Nueva sesión ESP8266 autorizada")
            except Exception:
                pass

        if self._vehiculo_activo is None:
            if not await self._enviar_seguro(websocket, {"tipo": "esperar_seleccion"}):
                if self._dispositivo is websocket:
                    self._dispositivo = None
            return

        id_v = self._vehiculo_activo
        enviado = await self._enviar_seguro(websocket, {
            "tipo": "configuracion_vehiculo",
            "id_vehiculo": id_v,
        })
        if not enviado:
            if self._dispositivo is websocket:
                self._dispositivo = None
            await self.notificar_clientes_web(id_v, {
                "tipo": "dispositivo_offline",
                "id_vehiculo": id_v,
            })
            return
        await self.notificar_clientes_web(id_v, {
            "tipo": "dispositivo_configurando",
            "id_vehiculo": id_v,
        })

    async def desconectar_dispositivo(self, websocket: WebSocket) -> None:
        """Evita que una conexión vieja desconecte una sesión ESP8266 más nueva."""
        if self._dispositivo is not websocket:
            return
        self._dispositivo = None
        self._dispositivo_listo = False
        id_v = self._vehiculo_activo
        logger.warning("ESP8266 desconectado; vehículo activo: %s", id_v)
        if id_v is not None:
            await self.notificar_clientes_web(id_v, {
                "tipo": "dispositivo_offline",
                "id_vehiculo": id_v,
            })

    async def seleccionar_vehiculo(self, id_vehiculo: int) -> bool:
        """Cambia el vehículo físico al pulsar Conectar en la interfaz autorizada."""
        id_anterior = self._vehiculo_activo
        id_vehiculo = int(id_vehiculo)
        if id_anterior is not None and id_anterior != id_vehiculo:
            await self.notificar_clientes_web(id_anterior, {
                "tipo": "dispositivo_desvinculado",
                "id_vehiculo": id_anterior,
                "nuevo_id_vehiculo": id_vehiculo,
            })

        self._vehiculo_activo = id_vehiculo
        self._dispositivo_listo = False
        mensaje = {
            "tipo": "configuracion_vehiculo",
            "id_vehiculo": self._vehiculo_activo,
        }

        if self._dispositivo is None:
            await self.notificar_clientes_web(id_vehiculo, {
                "tipo": "dispositivo_offline",
                "id_vehiculo": id_vehiculo,
            })
            logger.warning("Vehículo %s seleccionado, pero ESP8266 está desconectado", id_vehiculo)
            return False

        ok = await self._enviar_seguro(self._dispositivo, mensaje)
        if not ok:
            dispositivo = self._dispositivo
            self._dispositivo = None
            self._dispositivo_listo = False
            await self.notificar_clientes_web(id_vehiculo, {
                "tipo": "dispositivo_offline",
                "id_vehiculo": id_vehiculo,
            })
            logger.warning("No se pudo enviar configuración al ESP8266")
            return False

        await self.notificar_clientes_web(id_vehiculo, {
            "tipo": "dispositivo_configurando",
            "id_vehiculo": id_vehiculo,
        })
        logger.info("Se solicitó al ESP8266 cambiar al vehículo %s", id_vehiculo)
        return True

    async def confirmar_dispositivo(self, id_vehiculo: int, websocket: WebSocket) -> bool:
        """Acepta el ACK solo de la conexión ESP8266 vigente y del ID seleccionado."""
        if self._dispositivo is not websocket or self._vehiculo_activo != int(id_vehiculo):
            return False
        self._dispositivo_listo = True
        await self.notificar_clientes_web(id_vehiculo, {
            "tipo": "dispositivo_listo",
            "id_vehiculo": id_vehiculo,
        })
        logger.info("ESP8266 listo para controlar el vehículo %s", id_vehiculo)
        return True

    def listo_para_vehiculo(self, id_vehiculo: int) -> bool:
        """True solo si la única placa confirmó exactamente este vehículo."""
        return self._dispositivo_listo and self._vehiculo_activo == int(id_vehiculo)

    async def enviar_a_vehiculo(self, id_vehiculo: int, mensaje: dict) -> int:
        """Notifica navegadores del vehículo y la única placa si está vinculada a él."""
        notificados = await self.notificar_clientes_web(id_vehiculo, mensaje)

        if (self._dispositivo is not None
                and self._dispositivo_listo
                and self._vehiculo_activo == int(id_vehiculo)):
            dispositivo = self._dispositivo
            ok = await self._enviar_seguro(dispositivo, mensaje)
            if ok:
                notificados += 1
            else:
                await self.desconectar_dispositivo(dispositivo)

        return notificados
