const { nombreNegocio } = require('./config-negocio');

function formatearPrecio(precio) {
  return `RD$${Number(precio).toLocaleString('es-DO')}`;
}

// Extrae la parte descriptiva del nombre quitando palabras del modelo que ya están en el header
function extraerVariante(nombre, headerPalabras) {
  let n = nombre.toUpperCase();
  // Quitar palabras del header del nombre para obtener solo la variante
  for (const p of headerPalabras) {
    n = n.replace(new RegExp(`\\b${p}\\b`, 'g'), '');
  }
  return n.replace(/\s+/g, ' ').trim() || nombre.toUpperCase();
}

function construirEncabezado(productos) {
  // Tomar el nombre más corto como referencia del modelo
  const base = productos.reduce((a, b) => a.nombre.length <= b.nombre.length ? a : b);
  return base.nombre.toUpperCase();
}

function emojiPorCalidad(calidad) {
  const c = (calidad || '').toLowerCase();
  if (c.includes('oled')) return '✨';
  if (c.includes('original')) return '⭐';
  return '💠';
}

function construirRespuesta(encontrados, mensajeOriginal) {
  const negocio = nombreNegocio();
  if (encontrados.length === 0) {
    return {
      texto:
        `Gracias por escribirnos a *${negocio}* 🙏\n\n` +
        `No encontré ese producto en este momento.\n` +
        `Un vendedor revisará su consulta y le responderá en breve. 😊`,
      encontrado: false,
    };
  }

  if (encontrados.length === 1) {
    const p = encontrados[0];
    const emoji = emojiPorCalidad(p.calidad);
    return {
      texto:
        `📱 *${p.nombre.toUpperCase()}*\n` +
        `🔥 Disponible en *${negocio}* 🔥\n\n` +
        `${emoji} ${p.calidad} — *${formatearPrecio(p.precio)}*\n\n` +
        `Un vendedor le atenderá para confirmar su pedido. 😊`,
      encontrado: true,
      producto: p.nombre,
    };
  }

  // Agrupar: OLED aparte, resto junto
  const normales = encontrados.filter(p => !(p.calidad || '').toLowerCase().includes('oled') && !(p.calidad || '').toLowerCase().includes('original'));
  const oled     = encontrados.filter(p => (p.calidad || '').toLowerCase().includes('oled'));
  const original = encontrados.filter(p => (p.calidad || '').toLowerCase().includes('original'));

  // Encabezado: usar el primer producto como referencia
  const p0 = encontrados[0];
  const titulo = construirEncabezado(encontrados);

  let cuerpo = '';

  if (normales.length > 0) {
    cuerpo += normales.map(p => `💠 ${p.nombre.toUpperCase()} — *${formatearPrecio(p.precio)}*`).join('\n');
  }

  if (original.length > 0) {
    if (cuerpo) cuerpo += '\n\n';
    cuerpo += original.map(p => `⭐ ${p.nombre.toUpperCase()} — *${formatearPrecio(p.precio)}*`).join('\n');
  }

  if (oled.length > 0) {
    if (cuerpo) cuerpo += '\n\n';
    cuerpo += oled.map(p => `✨ ${p.nombre.toUpperCase()} — *${formatearPrecio(p.precio)}*`).join('\n');
  }

  return {
    texto:
      `📱 *${titulo}*\n` +
      `🔥 Disponibles en *${negocio}* 🔥\n\n` +
      `${cuerpo}\n\n` +
      `📍 *${negocio}*\n` +
      `🗨️ Díganos cuál desea y un vendedor le atenderá 😊`,
    encontrado: true,
    producto: encontrados.map(p => p.nombre).join(', '),
  };
}

module.exports = { construirRespuesta };
