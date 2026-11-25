# OpenSSL en Windows EC2 sin dominio ni Let's Encrypt

Esta guía conserva OpenSSL y usa la IP pública `44.196.22.143`. No instala ni utiliza Let's Encrypt.

## Importante: confianza del navegador

Un certificado autofirmado puede cifrar la conexión, pero Chrome/Edge no lo consideran confiable automáticamente. Para que una página HTTPS alojada en GitHub Pages pueda llamar a `https://44.196.22.143:8000` y abrir WSS, instala la CA raíz que firma el certificado del servidor en cada dispositivo que utilizará la aplicación.

No compartas la llave privada de la CA (`rootCA.key`). Manténla fuera de EC2 y fuera del repositorio GitHub. En EC2 solo debe estar la llave privada del servidor (`server.key`) y el certificado del servidor (`server.crt`).

## 1. Crear una CA propia en una máquina Windows de confianza

Abre PowerShell en una máquina administrativa que tenga OpenSSL disponible. Crea una carpeta privada, por ejemplo `C:\IoT-CA`, y ejecuta:

```powershell
mkdir C:\IoT-CA
cd C:\IoT-CA
openssl genrsa -out rootCA.key 4096
openssl req -x509 -new -nodes -key rootCA.key -sha256 -days 3650 -out rootCA.crt -subj "/CN=YOLO IoT Local Root CA" -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign" -addext "subjectKeyIdentifier=hash"
```

`rootCA.key` es altamente sensible. No lo copies a EC2.

## 2. Crear la llave y CSR del servidor

En una carpeta protegida del servidor Windows EC2:

```powershell
openssl genrsa -out server.key 2048
openssl req -new -key server.key -out server.csr -subj "/CN=44.196.22.143"
```

Copia `server.csr` desde EC2 a la máquina administrativa que conserva `rootCA.key` y `rootCA.crt`. La llave `server.key` permanece en EC2.

## 3. Firmar el certificado con SAN de IP

En la máquina administrativa crea `server.ext` con este contenido:

```ini
[server_ext]
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=IP:44.196.22.143
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid,issuer
```

Firma el CSR:

```powershell
openssl x509 -req -in server.csr -CA rootCA.crt -CAkey rootCA.key -CAcreateserial -out server.crt -days 397 -sha256 -extfile server.ext -extensions server_ext
```

Copia `server.crt` a EC2 junto a `server.key`. No copies `rootCA.key`.

Verifica que el certificado tenga SAN de IP:

```powershell
openssl x509 -in server.crt -noout -ext subjectAltName
```

La salida debe incluir `IP Address:44.196.22.143`.

## 4. Confiar en la CA en los dispositivos clientes

En Windows, importa `rootCA.crt` en:

- `certlm.msc` (equipo local) o `certmgr.msc` (usuario actual).
- **Entidades de certificación raíz de confianza**.

Cierra y vuelve a abrir el navegador. En otros equipos y móviles, instala también `rootCA.crt` y habilita la confianza completa según el sistema operativo. Sin este paso, la conexión desde GitHub Pages será rechazada.

Chrome y Edge en Windows normalmente utilizan el almacén de certificados de Windows. Otros navegadores pueden tener un almacén o una política de confianza independiente.

## 5. Servir FastAPI con TLS en el puerto 8000

Si el despliegue actual usa Uvicorn directamente, el patrón es:

```powershell
py -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --ssl-keyfile "C:\ruta\segura\server.key" --ssl-certfile "C:\ruta\segura\server.crt"
```

Esto habilita HTTPS para REST y WSS para WebSocket en el mismo puerto. Ajusta las rutas reales y el método con el que actualmente inicias el servicio. No ejecutes dos servidores Uvicorn en el mismo puerto.

Asegúrate de que el Firewall de Windows y el Security Group de EC2 permitan TCP 8000 desde los orígenes necesarios. No expongas el puerto 3306 de RDS a Internet.

## 6. Verificar

Desde un equipo que confíe en `rootCA.crt` abre:

- `https://44.196.22.143:8000/docs`
- `https://44.196.22.143:8000/health`

Después conecta un cliente WebSocket a:

- `wss://44.196.22.143:8000/ws/vehiculos/1`

Si el certificado no incluye SAN de IP, no está firmado por una CA confiable en ese equipo, está vencido o no coincide con la IP, el navegador rechazará la conexión.

## 7. Renovación y cambio de IP

Los certificados firmados por tu CA no se renuevan solos. Antes de su vencimiento, genera un CSR/certificado nuevo con el mismo SAN y reinicia/recarga el servicio TLS.

La dirección indicada es una IP pública. Si AWS la cambia al detener/iniciar la instancia, tendrás que actualizar el SAN del certificado, `API_BASE_URL`, `WS_URL` en `js/config/app-config.js` y volver a confiar el nuevo certificado/CA según corresponda. El frontend no puede descubrir una IP pública nueva por sí solo.

## Límite de esta solución

La CA privada es confiable solo en los dispositivos donde instales su certificado raíz. No será confiable automáticamente para cualquier visitante de la página pública de GitHub Pages. Esta limitación es propia de los certificados autofirmados/privados y no se puede solucionar con código frontend.
