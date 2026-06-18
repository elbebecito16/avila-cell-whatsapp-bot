# Desplegar el bot 24/7 en la nube (sin API de Meta)

El bot usa **whatsapp-web.js** (escaneas un QR como WhatsApp Web). Para que NO
dependa de tu PC encendida, lo subimos a un servidor siempre encendido. Aquí va
con **Railway** (lo más sencillo), pero sirve igual en Render o un VPS.

## Lo que necesitas
- Un número de WhatsApp dedicado para el negocio (el del bot).
- Cuenta en https://railway.app (plan Hobby ~US$5/mes).
- El shop ya está en Netlify (https://TU-SHOP.netlify.app).

---

## 1) Subir el bot a Railway

1. En Railway: **New Project → Deploy from GitHub repo** → elige
   `elbebecito16/avila-cell-whatsapp-bot`.
2. Railway detecta el **Dockerfile** y construye la imagen (ya incluye Chromium).
3. **Settings → Networking → Generate Domain**: te da una URL pública, por ej.
   `https://avila-bot.up.railway.app`. Esa es la `BOT_URL`.

## 2) Volumen persistente (para no re-escanear el QR)

En el servicio → **Variables/Volumes → New Volume**, móntalo en:

```
/app/session
```

Así la sesión de WhatsApp sobrevive reinicios y solo escaneas el QR **una vez**.

## 3) Variables de entorno del bot (Railway → Variables)

```
BOT_API_KEY = una-clave-secreta-larga-que-tu-elijas
CRM_URL     = https://TU-SHOP.netlify.app
PORT        = (Railway lo asigna solo; no lo pongas a mano)
```

`BOT_API_KEY` es la **misma** clave que pondrás en Netlify (paso 5). Sirve para:
- que el shop pueda mandarle mensajes al bot (`/api/notificar`), y
- que el bot pueda consultar el CRM (`/api/bot/*`) de forma autenticada.

## 4) Escanear el QR (una sola vez)

- Abre la URL pública del bot (`https://avila-bot.up.railway.app`): el panel
  muestra el **QR**. También aparece en **Logs** de Railway.
- Escanéalo con el WhatsApp del negocio (Dispositivos vinculados → Vincular).
- Cuando diga "conectado", listo. Queda funcionando 24/7.

---

## 5) Conectar el shop (Netlify) con el bot

En Netlify → **Site settings → Environment variables**, agrega:

```
BOT_URL     = https://avila-bot.up.railway.app
BOT_API_KEY = la-misma-clave-secreta-del-paso-3
```

Luego **Deploys → Trigger deploy** para que tome las variables.

> Importante: usa `BOT_URL` y `BOT_API_KEY` (server-side, sin `NEXT_PUBLIC_`).
> Las variables `NEXT_PUBLIC_*` quedan expuestas en el navegador.

---

## 6) Probar

- **Bienvenida:** registra un cliente con su WhatsApp → debe recibir el saludo.
- **Taller:** crea/cambia el estado de una reparación → el cliente recibe el aviso.
- **Factura:** abre una factura → botón **Enviar por WhatsApp**.
- **Consulta:** desde otro teléfono, escríbele al bot el número de orden o
  "mi reparación" / un modelo de equipo → responde con estado/precio.

## Notas
- Si el bot se desconecta (WhatsApp cerró la sesión), vuelve a la URL del panel
  y reescanea el QR. El volumen evita que pase en reinicios normales.
- El envío nunca rompe la operación del shop: si el bot está caído, el mensaje
  queda registrado como `fallido` en la tabla `whatsapp_mensajes` y la venta/
  reparación continúa normal.
