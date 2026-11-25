# Pruebas — Control IoT 1.3

## Pruebas automatizadas

Backend (desde `backend/`):

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

Frontend (desde `frontend/`):

```powershell
npm test
npm run check
```

Las pruebas backend usan `FakeRDS`; no se conectan a Amazon RDS. Las pruebas frontend verifican la lógica de dominio y sintaxis JavaScript.

## WSS con cliente independiente

1. Inicia sesión en el frontend y confirma que la cuenta tenga una asignación activa al vehículo.
2. Desde `backend/`, ejecuta `python -m scripts.ws_probe`.
3. Introduce `wss://44.196.22.143:8000/ws/vehiculos/1` (o el ID autorizado).
4. Pega el access token JWT cuando el script lo solicite. No lo incluyas en la URL ni lo publiques en capturas.
5. Confirma `estado_inicial` y el `pong` del heartbeat.
6. Mantén el segundo cliente conectado y ejecuta un movimiento o DEMO desde el frontend.
7. Confirma que ambos clientes reciben los eventos del vehículo correcto.
8. Conecta a otro ID y comprueba que no reciba eventos de la unidad anterior.

## Casos de autorización WSS

- Sin JWT: cierre 4401.
- JWT inválido/expirado: cierre 4401.
- Usuario sin asignación activa: cierre 4403.
- Invitado: cierre 4403 hasta implementar sesiones temporales de exhibición.
- Vehículo inexistente: cierre 4404.
- Origen de navegador no permitido: cierre 4403.
- Usuario propietario con asignación activa: conexión aceptada.
- Administrador: solo unidades sin asignación activa; el acceso de soporte a unidades vendidas sigue pendiente.

## DEMO y heartbeat

- `ping` recibe `pong`.
- DEMO emite `demo_inicio`, un `demo_movimiento` por paso y `demo_fin`.
- Cancelación emite `demo_cancelada`.
- Un error de ejecución emite `demo_error`.
- Los eventos de DEMO no se agregan al historial individual.

## Validación real pendiente

La aprobación automatizada no sustituye estas comprobaciones en AWS:

- Certificado TLS válido y confiable para REST y WSS.
- CORS desde el origen publicado.
- Columnas/índices reales de `auth_vehiculo_asignaciones`.
- Token emitido por la API desplegada y asignación real en RDS.
- Comunicación con ESP8266/ESP32 y confirmación física independiente.
