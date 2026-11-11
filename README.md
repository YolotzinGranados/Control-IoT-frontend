<<<<<<< HEAD
# Control IoT — Frontend

Aplicación web estática para controlar un vehículo IoT mediante la API FastAPI existente en AWS. Esta práctica implementa únicamente el módulo de **Control**; no crea backend, tablas, Stored Procedures, monitoreo ni administración.
in
**Desarrollado por Yolotzin D. Granados Mendoza · 2026**

## Arquitectura

```text
GitHub Pages (HTTPS)
  └── HTML5 + Bootstrap 5 + CSS + módulos ES6
       ├── UI (vistas)
       ├── Dominio (catálogo, joystick, dispatcher, DEMO)
       ├── Cliente REST (Fetch)
       └── Cliente WSS (eventos y reconexión)
                 │
                 ▼
        FastAPI existente en AWS
          ├── REST /health y /vehiculos/{id}/...
          ├── WebSocket /ws/vehiculos/{id}
          └── Stored Procedures existentes → Amazon RDS
```

## Configuración

Editar `js/config/app-config.js`:

```js
export const APP_CONFIG = Object.freeze({
  API_BASE_URL: 'https://44.196.22.143:8000',
  VEHICLE_ID: 1,
  WS_URL: 'wss://44.196.22.143:8000/ws/vehiculos/1',
  HEALTH_PATH: '/health',
  // ...
});
```

`API_BASE_URL` se configura como HTTPS en el mismo host/puerto del WSS. El backend debe estar sirviendo REST mediante TLS en `:8000`. Si REST utiliza otro host/puerto HTTPS, cambia `API_BASE_URL` sin modificar los contratos de rutas.

No hay secretos en la configuración. La clave `X-API-Key` se introduce manualmente en la interfaz, vive solo en memoria y se borra al recargar o cerrar la pestaña. Nunca la guardes en este archivo, en LocalStorage ni en GitHub.

## Contratos utilizados

Consulta `docs/API_CONTRACT.md`. Las rutas consumidas son:

- `GET /health`
- `GET /vehiculos/{id_vehiculo}`
- `GET /vehiculos/{id_vehiculo}/comandos`
- `GET /vehiculos/{id_vehiculo}/demos`
- `POST /vehiculos/{id_vehiculo}/movimientos`
- `POST /vehiculos/{id_vehiculo}/demos/{id_demo}/iniciar`
- `POST /vehiculos/{id_vehiculo}/demos/cancelar`
- WSS `/ws/vehiculos/{id_vehiculo}`

El frontend no usa GET para operaciones de escritura y no reintenta automáticamente los POST.

## Requisitos obligatorios antes de usarlo desde GitHub Pages

1. **TLS OpenSSL:** la página GitHub Pages usa HTTPS; por eso REST también debe responder por HTTPS y el WebSocket por WSS. El certificado debe incluir `subjectAltName` para la IP `44.196.22.143` y estar firmado por una CA que cada dispositivo cliente haya instalado como confiable. Consulta `docs/OPENSSL_WINDOWS.md`.
2. **CORS:** el backend revisado no configura CORS. Agrega el middleware descrito en `docs/BACKEND_PREREQUISITES.md`, usando el origen `https://<USUARIO_GITHUB>.github.io`.
3. **WebSocket abierto:** el backend revisado no autentica la ruta WSS. La clave API protege POST REST, no la suscripción WebSocket. No confundas WSS con autorización.
4. **RDS:** `/health` ejecuta `db.ping()`. No existe un endpoint independiente de RDS. El frontend muestra RDS Disponible solo cuando recibe `estado: "ok"` y `base_datos: "conectada"`.

## Ejecución local en Windows

Desde PowerShell, en la carpeta raíz del frontend:

```powershell
py -m http.server 5500
```

Abre `http://localhost:5500`. Los módulos ES se sirven correctamente por HTTP en localhost. La API remota sigue requiriendo certificado confiable y CORS para `http://localhost:5500` si el navegador hace solicitudes cross-origin. Para una prueba equivalente a producción, sirve también el frontend bajo HTTPS.

No abras `index.html` directamente con `file://` porque los módulos ES y las solicitudes fetch no funcionan de forma fiable desde ese esquema.

## Publicar en GitHub Pages

1. Crea un repositorio nuevo llamado `control-iot` en GitHub.
2. Copia el contenido de esta carpeta a la raíz del repositorio.
3. Inicializa Git y publica la rama `main`:

```powershell
git init
git add .
git commit -m "feat: crear frontend de control IoT"
git branch -M main
git remote add origin https://github.com/<USUARIO_GITHUB>/control-iot.git
git push -u origin main
```

4. En GitHub abre **Settings → Pages**.
5. En **Build and deployment**, elige **Deploy from a branch**.
6. Selecciona `main` y carpeta `/ (root)`, guarda.
7. La página se publicará en `https://<USUARIO_GITHUB>.github.io/control-iot/`.
8. Añade `https://<USUARIO_GITHUB>.github.io` al CORS del backend existente.
9. Instala la CA OpenSSL en cada dispositivo que vaya a utilizar el control.

Los archivos usan rutas relativas (`./`) para funcionar en la subruta de GitHub Pages. `favicon.svg` está en la raíz y se vincula desde `index.html`.

## Seguridad y operación

- No se incluye API key, contraseña, llave privada, certificado privado ni dato de RDS.
- `X-API-Key` se mantiene solo en memoria.
- No se usa `innerHTML` para insertar datos remotos; se usa `textContent`/`createElement`.
- Los errores de timeout de POST no se reintentan porque el backend podría haber confirmado el COMMIT.
- La detención se prioriza en la cola del frontend después de resolver una solicitud en curso. Si la conexión cae o una solicitud se queda sin respuesta, el navegador no puede garantizar el orden de procesamiento remoto; no es una parada de seguridad certificada.
- El joystick se habilita únicamente para direcciones encontradas activas en el catálogo real y requiere un comando DETENER activo. No se inventan IDs ni comandos.
- El firmware ESP8266 compartido ejecuta movimientos individuales como pulsos temporizados (por ejemplo, `DURACION_NORMAL = 300 ms`); este frontend envía una orden por transición y no genera repetición automática. Por tanto, no debe interpretarse como movimiento continuo sostenido hasta soltar. Para movimiento continuo se necesitaría un contrato keepalive/start-stop acordado entre backend y firmware, fuera del alcance de este frontend.
- Si el catálogo no incluye `DETENER`, el botón permanece deshabilitado.
- La cancelación de DEMO usa el endpoint existente; la secuencia la ejecuta el backend. Como no existe una consulta de DEMO activa, la interfaz permite intentar cancelar una secuencia previa y muestra el 404 del backend si no existe.
- La conexión WSS del navegador no significa que el ESP8266/ESP32 esté en línea.
- El indicador API refleja que `/health` respondió, no que todas las rutas REST ni los 21 Stored Procedures hayan sido probados individualmente.

## Pruebas y documentación

- `docs/PRUEBAS.md`: joystick, botones, prioridad DETENER, DEMO, WSS independiente, conectividad y responsive.
- `docs/API_CONTRACT.md`: contratos derivados del backend inspeccionado.
- `docs/BACKEND_PREREQUISITES.md`: CORS y condiciones del backend existente.
- `docs/OPENSSL_WINDOWS.md`: CA privada, SAN de IP, confianza de navegadores y Uvicorn TLS.

## Verificación realizada en este paquete

Se revisó estáticamente la estructura de módulos, rutas, contratos y sintaxis JavaScript. No se ejecutaron pruebas de red contra AWS, no se comprobó el certificado real de EC2, no se publicó en GitHub Pages y no se probó hardware físico.
=======
# Control-IoT-frontend
>>>>>>> 182719ec51cafb4158263358de307f1afeb83eba
