/**
 * faq.js — Preguntas frecuentes y menú FAQ
 */

const PREGUNTAS = [
  {
    id: '1',
    titulo: '⏱️ Tiempo de reparación',
    keywords: ['tiempo', 'cuanto tarda', 'demora', 'cuando estara', 'cuando esta'],
    respuesta:
      `⏱️ *Tiempos de reparación:*\n\n` +
      `• Pantallas y baterías: *1–2 horas* ⚡\n` +
      `• Puertos de carga / botones: *2–4 horas*\n` +
      `• Reparaciones complejas (placa, etc.): *1–3 días*\n` +
      `• Si hay que pedir pieza: te avisamos cuando llegue 📦\n\n` +
      `_Te notificamos por WhatsApp cuando tu equipo esté listo._`,
  },
  {
    id: '2',
    titulo: '💳 Formas de pago',
    keywords: ['pago', 'pagar', 'efectivo', 'tarjeta', 'transferencia', 'metodo'],
    respuesta:
      `💳 *Formas de pago aceptadas:*\n\n` +
      `• 💵 Efectivo\n` +
      `• 💳 Tarjeta (débito / crédito)\n` +
      `• 📲 Transferencia bancaria\n` +
      `• 📱 Pagos móviles\n\n` +
      `_Todos los precios son en RD$ (pesos dominicanos)._`,
  },
  {
    id: '3',
    titulo: '🛡️ Garantía',
    keywords: ['garantia', 'garantía', 'garantizas', 'cubre', 'cubierto'],
    respuesta:
      `🛡️ *Nuestra garantía:*\n\n` +
      `• *30 días* en reparaciones de pantalla y batería\n` +
      `• *15 días* en otros servicios de reparación\n` +
      `• *No cubre* daños por caída o agua posteriores\n` +
      `• Para hacer válida la garantía trae tu comprobante\n\n` +
      `_Trabajamos con piezas de calidad para garantizar durabilidad._`,
  },
  {
    id: '4',
    titulo: '📍 Dónde estamos',
    keywords: ['donde', 'dirección', 'direccion', 'ubicación', 'ubicacion', 'sucursal', 'llegar'],
    respuesta:
      `📍 *Nuestras sucursales:*\n\n` +
      `🏪 *Principal (Cienfuegos)*\n` +
      `Horario: Lun–Sáb 8:00am – 7:00pm\n\n` +
      `🏪 *Gurabo*\n` +
      `Horario: Lun–Sáb 8:00am – 6:00pm\n\n` +
      `🏪 *Tavinza*\n` +
      `Horario: Lun–Sáb 8:00am – 6:00pm\n\n` +
      `🏪 *Calle 10*\n` +
      `Horario: Lun–Sáb 8:00am – 6:00pm\n\n` +
      `🏪 *Pekín*\n` +
      `Horario: Lun–Sáb 8:00am – 6:00pm`,
  },
  {
    id: '5',
    titulo: '🕐 Horarios',
    keywords: ['horario', 'hora', 'abierto', 'abre', 'cierra', 'cuando abren'],
    respuesta:
      `🕐 *Horarios de atención:*\n\n` +
      `📅 *Lunes a Sábado:* 8:00am – 7:00pm\n` +
      `📅 *Domingo:* Cerrado\n\n` +
      `_Fuera de horario puedes dejar tu consulta aquí y te respondemos al abrir._`,
  },
  {
    id: '6',
    titulo: '🔒 Datos del equipo',
    keywords: ['datos', 'fotos', 'privacidad', 'borran', 'borrar', 'informacion'],
    respuesta:
      `🔒 *Tus datos están seguros:*\n\n` +
      `• Solo accedemos al sistema para diagnosticar el problema\n` +
      `• NO borramos tus datos sin tu autorización\n` +
      `• Recomendamos hacer backup antes de traer el equipo\n` +
      `• Tu equipo queda bajo llave durante la reparación\n\n` +
      `_Si necesitas que borren los datos, indícalo al entregar._`,
  },
];

/**
 * Muestra el menú de FAQ numerado.
 */
function textoMenuFAQ() {
  const lista = PREGUNTAS.map(p => `*${p.id}.* ${p.titulo}`).join('\n');
  return (
    `❓ *Preguntas Frecuentes*\n\n` +
    `${lista}\n\n` +
    `Responde con el *número* de tu pregunta.\n` +
    `Escribe *menu* para volver al inicio.`
  );
}

/**
 * Busca una respuesta por número o por keyword en el texto.
 * Retorna { respuesta, encontrado } o null.
 */
function responderFAQ(texto) {
  const t = texto.trim().toLowerCase();

  // Respuesta directa por número
  const porNumero = PREGUNTAS.find(p => p.id === t);
  if (porNumero) return porNumero.respuesta;

  // Coincidencia por keyword
  const porKeyword = PREGUNTAS.find(p => p.keywords.some(k => t.includes(k)));
  if (porKeyword) return porKeyword.respuesta;

  return null;
}

module.exports = { textoMenuFAQ, responderFAQ, PREGUNTAS };
