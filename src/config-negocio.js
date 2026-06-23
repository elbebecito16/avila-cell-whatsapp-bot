// Configuración compartida del negocio (tabla 'configuracion' del bot).
// Permite que CUALQUIER módulo (respuestas, ia, bot, panel) lea el nombre del
// negocio y otros valores sin hardcodearlos. Se cachea en memoria y se refresca
// al iniciar y cada 30s, así un cambio en el panel se refleja sin reiniciar.
const db = require('./database');

const cache = {};

async function refrescar() {
  try {
    const rows = await db.all('SELECT clave, valor FROM configuracion');
    rows.forEach(r => { cache[r.clave] = r.valor; });
  } catch {
    // la BD puede no estar lista en el primer ciclo; se reintenta luego.
  }
}
refrescar();
setInterval(refrescar, 30000);

// Devuelve el valor de una clave, o el default si está vacío/ausente.
function get(clave, def = '') {
  const v = cache[clave];
  return v != null && v !== '' ? v : def;
}

// Nombre del negocio registrado en configuración (fallback genérico).
function nombreNegocio() {
  return get('nombre_negocio', 'nuestra tienda');
}

module.exports = { get, nombreNegocio, refrescar, cache };
