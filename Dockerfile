# Imagen para correr el bot 24/7 en la nube (Railway, Render, VPS, etc.)
# Incluye Chromium del sistema para Puppeteer / whatsapp-web.js.
FROM node:20-slim

# Dependencias del sistema + Chromium para Puppeteer +
# toolchain (python3/make/g++) para compilar módulos nativos como sqlite3.
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
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Puppeteer usa el Chromium del sistema (no descarga el suyo)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
# Compila los módulos nativos (sqlite3) desde el código fuente para evitar
# binarios precompilados incompatibles (ERR_DLOPEN_FAILED).
RUN npm install --omit=dev --build-from-source

COPY . .

# La sesión de WhatsApp se guarda en /app/session.
# En Railway la persistencia se configura con un "Volume" montado en /app/session
# (no se usa la instrucción VOLUME de Docker, que Railway no soporta).

EXPOSE 3001
CMD ["node", "index.js"]
