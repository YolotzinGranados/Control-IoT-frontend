# Requisitos de integración en el backend existente

El frontend es estático y no crea un backend nuevo. Antes de que GitHub Pages pueda consumir FastAPI desde el navegador, deben resolverse estos requisitos en el backend ya existente.

## 1. CORS para GitHub Pages

El backend revisado no incluye `CORSMiddleware`. Cuando se cree el repositorio, sustituye `<USUARIO_GITHUB>` por el usuario real. El origen CORS es solo el origen, sin nombre del repositorio ni ruta:

```python
from fastapi.middleware.cors import CORSMiddleware

# Inmediatamente después de crear `app = FastAPI(...)` y antes de iniciar el servicio:
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://<USUARIO_GITHUB>.github.io",
        "http://localhost:5500",  # solo durante pruebas locales; quitar al terminar si no se necesita
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Accept", "Content-Type", "X-API-Key"],
)
```

No usar `allow_origins=["*"]` como sustituto de autenticación. CORS no autentica usuarios; la protección de las operaciones sigue siendo `X-API-Key`.

## 2. TLS de FastAPI

El frontend asume que REST está disponible como `https://44.196.22.143:8000` y WSS como `wss://44.196.22.143:8000/ws/vehiculos/1`. Confirmar que el servidor TLS atiende REST y WebSocket en el mismo puerto. GitHub Pages no podrá consumir una API HTTP sin cifrar desde HTTPS (mixed content).

## 3. Certificado OpenSSL

El certificado presentado por el servidor debe incluir `subjectAltName = IP:44.196.22.143`. Instala la CA raíz correspondiente como confiable en cada dispositivo cliente. No se puede desactivar la validación TLS desde JavaScript.

## 4. Seguridad del WebSocket

El WebSocket actual no exige `X-API-Key` ni otro token. Cualquier cliente que conozca la ruta y pueda alcanzar el puerto puede suscribirse a los eventos del vehículo. El frontend no inventa autenticación WSS porque el backend no la implementa. Antes de abrirlo ampliamente a Internet, considera proteger la ruta en el backend existente.

## 5. Confirmaciones

- `201` de movimientos: el backend confirmó el registro transaccional en RDS y después intentó notificar WebSocket.
- `202` de DEMO: solicitud aceptada y secuencia lanzada en segundo plano.
- Evento `movimiento`/`demo_movimiento`: notificación recibida por el navegador.
- Ninguno de los anteriores confirma que el vehículo físico ejecutó la acción.
