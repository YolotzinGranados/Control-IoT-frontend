# Control IoT

Frontend único para **Control**, **Monitoreo** y **Administración** de vehículos IoT. La interfaz usa FastAPI por HTTPS y recibe eventos mediante WSS. Amazon RDS MySQL conserva el estado, las asignaciones y el historial.

## Módulos y perfiles

| Perfil | Control | Monitoreo | Administración y exhibición |
| --- | --- | --- | --- |
| Administrador | Control operativo con un permiso vigente para las unidades asignadas. | Estado, historial y WSS con el mismo alcance operativo. | Gestiona inventario, clientes, asignaciones y demos de unidades sin comprador. |
| Usuario | Movimientos y demos de sus unidades asignadas. | Estado e historial de sus unidades. | Crea y edita demos propias desde Control. |
| Invitado | Demostraciones de exhibición previamente configuradas. | Progreso de la prueba vía WSS. | Consulta el catálogo público. La prueba requiere cuenta temporal. |

Un **modelo comercial** agrupa unidades del mismo producto. Una **unidad física** tiene un `id_vehiculo` estable, su asignación activa y su catálogo de comandos. La migración 005 incorpora el código de modelo, la serie única, el estado comercial y las capacidades verificadas por código de comando. El inventario administrativo muestra esos datos cuando se habilita la integración. Los metadatos se dan de alta en MySQL.

## Ejecutar y probar

1. En `backend/`, copia `.env.example` a `.env` y configura MySQL, un secreto JWT aleatorio y el token privado del ESP8266. Usa un esquema de pruebas. Crea la cuenta inicial con `python -m scripts.create_admin`.
2. Instala las dependencias con `python -m pip install -r requirements-dev.txt` y arranca el backend con `python -m uvicorn app.main:app`. El Swagger local está en `http://127.0.0.1:8000/docs`.
3. Sirve `frontend/` mediante un servidor estático. Configura las URLs de API y WSS en `frontend/assets/js/config/app-config.js`. Exporta `FRONTEND_ALLOWED_ORIGINS` en el proceso FastAPI antes de iniciarlo. Para login entre orígenes, sirve la aplicación y la API con HTTPS y un certificado de confianza.
4. Ejecuta `python -m pytest -q` desde la raíz con las dependencias del backend instaladas. Las pruebas usan RDS simulado. En `frontend/` ejecuta `npm test` y `npm run check`.

Mantén `ENABLE_LEGACY_API_KEYS=false` en el despliegue. Conserva los secretos y respaldos fuera del repositorio.

## Autorización, reserva y parada

- FastAPI comprueba cuenta, rol y asignación. WSS autentica con los subprotocolos `['bearer', accessToken]` y vuelve a comprobar el acceso antes de entregar eventos y al recibir el heartbeat. El soporte para unidades asignadas requiere la migración 004, `ENABLE_EXPLICIT_SUPPORT=true` y un permiso temporal por administrador y asignación.
- Invitado abre una conexión WSS de exhibición como reserva exclusiva de la única placa. Debe esperar el acuse de configuración del ESP8266. El servidor limita la prueba a 30 pasos y 180 segundos dentro de la vigencia del JWT. Requiere una unidad habilitada, sin comprador, con DETENER activo y capacidades de exhibición verificadas. Con `ENABLE_COMMERCIAL_MODELS=false`, el catálogo sigue disponible y la prueba queda bloqueada.
- Las demos verifican pertenencia, orden, comandos activos y duración. La migración 005 permite aplicar los límites del modelo. El control manual reserva la operación para la cuenta que lo inició hasta que una cuenta autorizada envía DETENER. La finalización y la cancelación solicitan la parada sin insertar pasos de demo en el historial manual.
- El gestor de placa, las reservas y las ejecuciones viven en un proceso FastAPI. Usa un solo worker para esta topología. La identificación independiente de varias placas y la parada ante un corte de red o proceso requieren firmware y una prueba física supervisada.

## Conectividad

| Indicador | Fuente | Estados |
| --- | --- | --- |
| WSS | Conexión en esta pestaña | Conectado, reconectando o desconectado |
| API AWS | Respuesta de FastAPI en `/health` | Disponible, no disponible o comprobando |
| RDS | Resultado de `SELECT 1` emitido por el backend | Disponible, no disponible o sin verificar |

La conexión WSS del navegador y el acuse del ESP8266 son señales distintas. El servidor puede confirmar el envío de un evento. La ejecución física se verifica en la prueba supervisada.

## RDS y entrega

Los scripts se entregan sin aplicar a AWS. Consulta el [procedimiento de migración](backend/MIGRACION_RDS.md), el [contrato REST y WSS](frontend/docs/API_CONTRACT.md) y la [matriz de evaluación](EVALUACION.md). Registra allí las URLs publicadas y la evidencia de la validación.