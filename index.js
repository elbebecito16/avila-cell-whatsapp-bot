require('dotenv').config(); // carga CRM_URL, BOT_API_KEY, etc. desde .env
const fs = require('fs');
const path = require('path');

// Al persistir la sesión en un volumen, un contenedor que muere sin cerrar
// Chromium deja archivos de bloqueo (SingletonLock/Socket/Cookie). El siguiente
// arranque los ve y Chromium falla con "profile appears to be in use ... Code: 21".
// Los borramos antes de iniciar — son locks huérfanos, no datos de sesión.
function limpiarLocksChromium(dir = './session') {
  const LOCKS = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
  let entradas;
  try { entradas = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; } // el folder aún no existe (primer arranque)
  for (const e of entradas) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) limpiarLocksChromium(full);
    else if (LOCKS.includes(e.name)) {
      try { fs.rmSync(full, { force: true }); console.log(`🧹 Lock huérfano eliminado: ${full}`); }
      catch (err) { console.error(`No se pudo borrar ${full}:`, err.message); }
    }
  }
}

// Reset de sesión bajo demanda: si RESET_SESSION=1, borramos la sesión guardada
// para forzar un QR nuevo (relogin limpio). Útil cuando la sesión queda
// "fantasma" (conectada pero sin sincronizar mensajes). Tras escanear el QR,
// quita la variable en Railway para no borrar la sesión en cada deploy.
if (process.env.RESET_SESSION === '1') {
  try {
    fs.rmSync('./session', { recursive: true, force: true });
    console.log('♻️  RESET_SESSION=1 → sesión borrada. Se generará un QR nuevo.');
  } catch (err) {
    console.error('No se pudo borrar la sesión:', err.message);
  }
}

limpiarLocksChromium();

const client = require('./src/bot');
const { iniciarPanel, setWhatsappClient } = require('./src/panel');

iniciarPanel(process.env.PORT || 3001);
setWhatsappClient(client); // Permite que el panel envíe mensajes WA

// Inicializar con reintentos automáticos si falla la conexión
async function iniciarBot(intento = 1) {
  try {
    console.log(`🚀 Iniciando bot (intento ${intento})...`);
    await client.initialize();
  } catch (err) {
    const esRedError = err.message?.includes('ERR_NAME_NOT_RESOLVED')
      || err.message?.includes('ERR_INTERNET_DISCONNECTED')
      || err.message?.includes('net::')
      || err.message?.includes('ENOTFOUND')
      || err.message?.includes('ETIMEDOUT');

    if (esRedError) {
      const espera = Math.min(intento * 15, 120); // máx 2 minutos entre intentos
      console.error(`⚠️  Sin internet. Reintentando en ${espera} segundos... (intento ${intento})`);
      setTimeout(() => iniciarBot(intento + 1), espera * 1000);
    } else {
      // Error diferente (auth, sesión corrupta, etc.) — mostrar y no reintentar
      console.error('❌ Error al iniciar el bot:', err.message);
      process.exit(1);
    }
  }
}

iniciarBot();
