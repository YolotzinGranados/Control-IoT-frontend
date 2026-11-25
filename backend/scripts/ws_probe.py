"""Cliente WSS independiente para validar autenticación, filtros y heartbeat.

Ejecutar desde backend: python -m scripts.ws_probe
El JWT nunca se muestra ni se coloca en la URL.
"""
import asyncio
import getpass
import json

import httpx
from websockets import connect
from websockets.exceptions import ConnectionClosed, InvalidStatus

DEFAULT_API = "https://44.196.22.143:8000"
DEFAULT_WS = "wss://44.196.22.143:8000/ws/vehiculos/1"


def mostrar(raw: str) -> dict:
    try:
        message = json.loads(raw)
    except json.JSONDecodeError:
        print(f"Mensaje no JSON: {raw}")
        return {}
    print(json.dumps(message, ensure_ascii=False, indent=2))
    return message


async def probar(url: str, token: str) -> None:
    async with connect(
        url,
        subprotocols=["bearer", token],
        open_timeout=12,
        close_timeout=3,
        ping_interval=None,
        max_size=1_048_576,
    ) as websocket:
        print(f"Conectado. Subprotocolo negociado: {websocket.subprotocol}")
        if websocket.subprotocol != "bearer":
            raise RuntimeError("El servidor no negoció el subprotocolo bearer.")

        print("\nPrimer mensaje:")
        initial = mostrar(await asyncio.wait_for(websocket.recv(), timeout=10))
        if initial.get("tipo") == "error":
            print("El servidor rechazó el acceso al vehículo solicitado.")
            return
        if initial.get("tipo") != "estado_inicial":
            raise RuntimeError("No se recibió el evento estado_inicial esperado.")

        print("\nEnviando heartbeat 'ping'…")
        await websocket.send("ping")
        while True:
            message = mostrar(await asyncio.wait_for(websocket.recv(), timeout=10))
            if message.get("tipo") == "pong":
                break

        print("\nEscuchando eventos del vehículo. Ctrl+C para salir.\n")
        async for raw in websocket:
            message = mostrar(raw)
            if message.get("tipo") == "error":
                print("El servidor cerrará la conexión por un error de sesión o autorización.")


async def main() -> None:
    api_base = input(f"API base URL [{DEFAULT_API}]: ").strip() or DEFAULT_API
    ws_url = input(f"URL WSS [{DEFAULT_WS}]: ").strip() or DEFAULT_WS
    mode = input("Autenticación: [1] iniciar sesión [2] pegar JWT existente (1): ").strip() or "1"

    if mode == "2":
        token = getpass.getpass("Access token JWT (no se mostrará): ").strip()
        if not token:
            raise SystemExit("Se requiere un JWT Bearer para conectar.")
        await probar(ws_url, token)
        return

    email = input("Correo de la cuenta: ").strip()
    password = getpass.getpass("Contraseña (no se mostrará): ")
    if not email or not password:
        raise SystemExit("Se requieren correo y contraseña.")

    with httpx.Client(timeout=12, verify=True) as client:
        response = client.post(
            f"{api_base.rstrip('/')}/auth/login",
            json={"email": email, "password": password},
        )
        data = response.json() if response.content else {}
        if not response.is_success or not data.get("access_token"):
            message = data.get("error", {}).get("mensaje") or data.get("detail") or "Login rechazado"
            raise SystemExit(f"No se pudo iniciar sesión: {message}")

        token = data["access_token"]
        csrf = data.get("csrf_token")
        try:
            await probar(ws_url, token)
        finally:
            # Revoca la cookie refresh creada para esta prueba independiente.
            if csrf:
                try:
                    client.post(
                        f"{api_base.rstrip('/')}/auth/logout",
                        headers={"X-CSRF-Token": csrf},
                        json={},
                    )
                except httpx.HTTPError:
                    print("Aviso: no se pudo revocar la sesión de prueba en el servidor.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except InvalidStatus as exc:
        status = getattr(exc.response, "status_code", "desconocido")
        raise SystemExit(
            f"Handshake rechazado (HTTP {status}). Verifica JWT, certificado y origen permitido."
        ) from exc
    except ConnectionClosed as exc:
        raise SystemExit(f"Conexión cerrada por el servidor: código {exc.code}.") from exc
    except asyncio.TimeoutError as exc:
        raise SystemExit("Tiempo de espera agotado al esperar respuesta WSS.") from exc
    except KeyboardInterrupt:
        print("\nPrueba WSS finalizada.")
