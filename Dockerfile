# Imagen para correr el bot 24/7 en la nube (Railway, Render, VPS, etc.)
# Incluye Chromium del sistema para Puppeteer / whatsapp-web.js.
FROM node:20-slim

# Dependencias del sistema + Chromium para Puppeteer
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libx11-xcb1 \
    libdrm2 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Puppeteer usa el Chromium del sistema (no descarga el suyo)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# La sesión de WhatsApp se guarda aquí; monta un volumen persistente en /app/session
VOLUME ["/app/session"]

EXPOSE 3001
CMD ["node", "index.js"]
