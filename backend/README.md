# Backend FastAPI — Control IoT 1.3

## Preparación

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
```

Completa `.env` con los datos de RDS y un `AUTH_SECRET_KEY` aleatorio. No compartas `.env` ni credenciales.

## Pruebas

```powershell
python -m pytest -q
python -m compileall -q app scripts tests
```

Las pruebas usan `FakeRDS`; no conectan con AWS.

## Crear el primer administrador

Después de confirmar el esquema de AWS, backup y roles:

```powershell
python -m scripts.create_admin
```

El script solicita username, correo, nombre y contraseña de forma interactiva. No almacena la contraseña en texto plano.

## Diagnóstico WSS independiente

```powershell
python -m scripts.ws_probe
```

Solicita las URL de API/WSS y permite iniciar sesión interactivamente o pegar un JWT existente. La contraseña/token no se muestran. Conecta por el subprotocolo `bearer`, prueba `ping/pong` y escucha eventos.

## Migraciones de autenticación

Los scripts `001_authentication_*` y `002_auth_schema_alignment_*` deben revisarse contra el esquema real antes de ejecutarse. No ejecutar `001_authentication_down.sql` en una base con datos de producción. Consultar `LEEME_FASE1.txt` y `frontend/docs/BACKEND_PREREQUISITES.md`.
