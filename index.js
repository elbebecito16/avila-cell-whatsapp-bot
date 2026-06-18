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
