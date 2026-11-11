# Contrato REST y WebSocket utilizado

Este documento se deriva del backend `Websocket_IoT_revisado.zip` inspeccionado para preparar el frontend. No sustituye el OpenAPI del servidor desplegado; debe contrastarse con `https://44.196.22.143:8000/openapi.json` cuando el certificado sea confiable.

## Configuración

- API base asumida: `https://44.196.22.143:8000`
- WebSocket: `wss://44.196.22.143:8000/ws/vehiculos/1`
- Vehículo: `1`
- Salud: `GET /health`

La URL base HTTPS se asume porque el usuario proporcionó WSS en el mismo host y puerto. Confirmar que Uvicorn/servidor TLS sirve también HTTP REST sobre HTTPS en ese puerto.

## Consultas

| Método | Ruta | Uso |
|---|---|---|
| GET | `/vehiculos/{id_vehiculo}` | Nombre, modelo, microcontrolador, estado y datos relacionados |
| GET | `/vehiculos/{id_vehiculo}/comandos` | Catálogo de comandos del vehículo |
| GET | `/vehiculos/{id_vehiculo}/demos` | DEMO existentes |
| GET | `/health` | Comprueba FastAPI y ejecuta `db.ping()` hacia RDS |

## Movimiento individual

`POST /vehiculos/{id_vehiculo}/movimientos`

Cabecera protegida: `X-API-Key: <clave_control>`.

Cuerpo exacto según `MovimientoIn`:

```json
{
  "id_comando": 3,
  "origen": "WEB"
}
```

El identificador debe proceder del catálogo REST. El ejemplo numérico es ilustrativo; no se codifica en el frontend.

Respuesta 201 `MovimientoEjecutadoOut`: `id_vehiculo`, `id_comando`, `comando`, `codigo`, `origen`, `fecha_hora`, `estado`, `clientes_notificados`.

El backend confirma COMMIT en RDS antes de notificar a los clientes WebSocket. `clientes_notificados` cuenta clientes WebSocket, no vehículos físicos.

## DEMO

- `GET /vehiculos/{id_vehiculo}/demos`
- `POST /vehiculos/{id_vehiculo}/demos/{id_demo}/iniciar` — requiere `X-API-Key`, responde 202.
- `POST /vehiculos/{id_vehiculo}/demos/cancelar` — requiere `X-API-Key`.

El frontend no obtiene ni reproduce pasos. FastAPI lee los movimientos y respeta `duracion_ms` y `pausa_ms`. No existe una consulta REST para saber si ya había una DEMO activa antes de abrir la pestaña; el frontend permite intentar cancelar la DEMO del servidor y el backend responderá 404 si no hay una ejecución activa. Los eventos internos de DEMO no se registran en el historial individual.

## WebSocket

Ruta: `/ws/vehiculos/{id_vehiculo}`. Mensaje de heartbeat: texto `ping`; respuesta JSON con `tipo: "pong"`.

Eventos documentados en `app/websocket/eventos.py` y `app/services/demo_runner.py`:

- `estado_inicial`
- `movimiento`
- `demo_inicio`
- `demo_movimiento`
- `demo_fin`
- `demo_cancelada`
- `demo_error`
- `error`
- `pong`

Los eventos incluyen `tipo`, `id_vehiculo`, `comando`, `codigo` y `marca_temporal`; cada tipo puede incluir campos adicionales.

## Salud y RDS

`GET /health` devuelve `{"estado":"ok","base_datos":"conectada"}` cuando `db.ping()` funciona. El backend revisado no expone un diagnóstico RDS independiente. El frontend deriva el indicador RDS de esa respuesta y no muestra una verificación separada inexistente.

## Límites conocidos

- El backend revisado no configura CORS en `app/main.py`.
- El WebSocket no implementa autenticación.
- El endpoint `/health` comprueba el proceso FastAPI y el ping de RDS; no ejecuta una prueba individual de las 21 rutas REST.
- La conexión WSS del navegador no representa el estado físico del ESP8266/ESP32.
- El catálogo real se carga desde RDS en tiempo de ejecución; el frontend no contiene comandos de respaldo.
