/**
 * faq.js — Preguntas frecuentes leídas desde SQLite
 * Los items son editables desde el panel del CRM.
 */

const db = require('./database');

/**
 * Obtener todos los items FAQ activos desde la DB.
 */
async function getFAQItems() {
  return db.all('SELECT * FROM faq_items WHERE activo=1 ORDER BY orden ASC');
}

/**
 * Construye el texto del menú FAQ numerado.
 */
async function textoMenuFAQ() {
  const items = await getFAQItems();
  const lista = items.map((p, i) => `*${i + 1}.* ${p.titulo}`).join('\n');
  return (
    `❓ *Preguntas Frecuentes*\n\n` +
    `${lista}\n\n` +
    `Responde con el *número* de tu pregunta.\n` +
    `Escribe *menu* para volver al inicio.`
  );
}

/**
 * Busca respuesta por número de opción o por keyword.
 * Retorna el texto de respuesta o null.
 */
async function responderFAQ(texto) {
  const items = await getFAQItems();
  const t = texto.trim().toLowerCase();

  // Por número (1-based)
  const num = parseInt(t);
  if (!isNaN(num) && num >= 1 && num <= items.length) {
    return items[num - 1].respuesta;
  }

  // Por keyword
  for (const item of items) {
    const keywords = item.keywords.split(',').map(k => k.trim().toLowerCase());
    if (keywords.some(k => t.includes(k))) {
      return item.respuesta;
    }
  }

  return null;
}

module.exports = { textoMenuFAQ, responderFAQ, getFAQItems };
