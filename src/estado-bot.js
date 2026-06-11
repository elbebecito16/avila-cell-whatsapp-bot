// Estado compartido entre bot.js y panel.js
const estado = {
  conectado: false,
  qrData: null,          // data URL del QR para mostrar en el panel
  qrTexto: null,         // texto raw del QR
  numeroConectado: null, // número de WhatsApp conectado
  ultimaActividad: null,
  mensajesHoy: 0,
};

module.exports = estado;
