# Plan de pruebas del frontend Control IoT

Estas pruebas son una guía para ejecutar después de configurar TLS, CORS y la clave de control. No se afirma que se hayan realizado pruebas contra AWS ni hardware real.

## Preparación

1. Publica o sirve el frontend por HTTPS.
2. Instala y confía en la CA OpenSSL en el dispositivo de prueba.
3. Confirma que `https://44.196.22.143:8000/docs` y `/health` abren sin advertencia de certificado.
4. Confirma CORS para `https://<USUARIO_GITHUB>.github.io`.
5. Carga `GET /vehiculos/1`, `GET /vehiculos/1/comandos` y `GET /vehiculos/1/demos`.
6. Introduce la clave `X-API-Key` de control directamente en el campo de la aplicación. No la escribas en el repositorio.

## Joystick

1. Comprueba que solo las direcciones que existan activas en el catálogo estén habilitadas.
2. Desplaza el puntero hacia arriba: debe enviarse un POST al comando AVANZAR real del catálogo. El firmware compartido ejecuta el comando como pulso temporizado (normalmente 300 ms), no como movimiento continuo sostenido.
3. Mueve el puntero dentro de la misma dirección: no debe generar POST repetitivos.
4. Cambia a otra dirección disponible: debe enviarse una sola transición de comando.
5. Suelta el puntero: el joystick vuelve a neutral y se solicita el comando DETENER.
6. Repite con touch, mouse, flechas y WASD.
7. Prueba `pointercancel`, pérdida de captura, cambio de pestaña y pérdida de foco.
8. Si el catálogo no contiene una dirección o DETENER, comprueba que no se invente ni se envíe un ID. Sin DETENER activo, el joystick y los controles manuales quedan bloqueados.

## Botones y prioridad DETENER

1. Pulsa un control secundario activo.
2. Comprueba que se realiza un único POST con `id_comando` y `origen: "WEB"`.
3. Intenta pulsar otro botón mientras hay una solicitud pendiente: debe bloquearse y explicar que existe una orden pendiente.
4. Solicita DETENER durante una solicitud: debe quedar priorizado en la cola y ejecutarse después de resolver la petición en curso.
5. Provoca timeout: la interfaz no debe reintentar automáticamente, porque el backend podría haber confirmado el COMMIT aunque el navegador no recibiera respuesta.

## DEMO

1. Selecciona una DEMO activa recibida desde `GET /vehiculos/1/demos`.
2. Inicia una sola vez y comprueba respuesta HTTP 202.
3. Conecta una segunda sesión WSS independiente para observar `demo_inicio`, N eventos `demo_movimiento` y `demo_fin`.
4. Comprueba que el navegador no reproduce pasos localmente ni hace POST por cada movimiento interno.
5. Inicia otra DEMO mientras la primera está activa: el backend debe rechazarla con 409.
6. Cancela y comprueba `demo_cancelada` y respuesta del endpoint de cancelación.
7. Verifica que los movimientos internos de DEMO no aparezcan en historial individual.

## WSS independiente

1. Abre Postman, Thunder Client o una extensión WebSocket.
2. Conecta a `wss://44.196.22.143:8000/ws/vehiculos/1`.
3. Acepta la conexión solo si el certificado es válido y confiable; no desactives la validación TLS.
4. Envía el texto `ping`; el backend debe contestar un JSON con `tipo: "pong"`.
5. Desde el frontend envía un comando y observa el evento `movimiento` con `id_vehiculo`, `comando`, `codigo`, `id_comando` cuando corresponda y `marca_temporal`.
6. Inicia una DEMO y observa inicio, N movimientos y finalización; repite y cancela para observar `demo_cancelada`.
7. Compara los mensajes del WSS independiente con el panel web. Un evento recibido no prueba que el microcontrolador ejecutó físicamente la acción.

## Conectividad

- Desconecta WSS: debe pasar a Reconectando y luego En línea al recuperarse.
- Detén FastAPI: API No disponible y RDS Sin verificar.
- Mantén FastAPI arriba y desconecta RDS: API Disponible si `/health` responde 503; RDS No disponible.
- Respuesta 200 de `/health` con `estado: ok` y `base_datos: conectada`: ambos indicadores Disponibles.

## Diseño y accesibilidad

- Prueba celular vertical y horizontal, tableta y escritorio.
- Comprueba que no exista scroll horizontal.
- Usa teclado, foco visible, lector de pantalla y `prefers-reduced-motion`.
- Prueba botones con dedos y verifica áreas táctiles.
- Verifica footer y favicon desde la subruta `/<repositorio>/` de GitHub Pages.
