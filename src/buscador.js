const db = require('./database');
const { buscarEnInventarioCRM } = require('./crm');

const VARIANTES_MODELO = {
  'iphone once': 'iphone 11', 'iphone diez': 'iphone 10',
  'ip 11': 'iphone 11', 'ip 12': 'iphone 12', 'ip 13': 'iphone 13', 'ip 14': 'iphone 14',
  'ipx': 'iphone x', 'iphone x s': 'iphone xs',
  '13pm': '13 pro max', '14pm': '14 pro max', '15pm': '15 pro max',
  'sam a12': 'samsung a12', 'samsum': 'samsung', 'samsun': 'samsung',
  'a 12': 'a12', 'a 21': 'a21', 'a 31': 'a31', 'a 51': 'a51', 'a 71': 'a71',
  'redmi nte': 'redmi note', 'nto': 'note', 'xaomi': 'xiaomi', 'shiaomi': 'xiaomi',
};

const SINONIMOS_PIEZA = {
  pantalla: ['pantalla', 'display', 'lcd', 'screen', 'tactil', 'tacil', 'cristal', 'glass'],
  bateria:  ['bateria', 'batería', 'pila', 'batry', 'bat', 'battery'],
  tapa:     ['tapa', 'back cover', 'carcasa trasera', 'espalda', 'backcover'],
  camara:   ['camara', 'cámara', 'cam', 'lente', 'camra', 'camera'],
  pin:      ['pin', 'pin de carga', 'carga', 'puerto', 'usb', 'conector', 'charging port', 'flex carga', 'flex de carga'],
  flex:     ['flex', 'boton', 'botón', 'home', 'power', 'volumen'],
};

// Palabras de marca reconocidas — se quitan de los tokens de búsqueda
// porque la marca ya filtró el SQL; dejarlas causaría falsos positivos
const PALABRAS_MARCA = [
  'iphone', 'apple', 'samsung', 'galaxy',
  'xiaomi', 'redmi',
  'moto', 'motorola',
  'huawei',
  'alcatel', 'revvl',
  'tecno',
  'infinix',
  'coolpad',
  'zte',
  'lg', 'stylo', 'aristo',
  'itel',
  'tcl',
];

// Palabras de relleno que no aportan al modelo
const PALABRAS_RELLENO = [
  'precio', 'cuanto', 'cuánto', 'cuesta', 'vale', 'tiene', 'tienen', 'tienes', 'tengo',
  'hay', 'stock', 'disponible', 'necesito', 'quiero', 'busco', 'dame', 'vende', 'venden',
  'consigues', 'consiguen', 'manejan', 'tendran', 'tendrán', 'queda', 'quedan',
  'para', 'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'me', 'mi', 'su',
  'unidad', 'orig', 'original', 'kit', 'completo', 'completa', 'con', 'sin', 'por', 'favor',
  'hola', 'buenas', 'klk', 'saludos', 'algun', 'alguna', 'algún', 'ese', 'esa', 'este', 'esta',
];

const CALIFICADORES = ['pro', 'max', 'plus', 'mini', 'ultra', 'lite', 'edge', 'prime', 'note', 'go', 'se', 'xl', 'neo', 'fe'];

function normalizarTexto(texto) {
  let t = texto.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [v, c] of Object.entries(VARIANTES_MODELO))
    t = t.replace(new RegExp(`\\b${v}\\b`, 'gi'), c);
  return t;
}

function detectarPieza(texto) {
  const t = normalizarTexto(texto);
  for (const [pieza, palabras] of Object.entries(SINONIMOS_PIEZA))
    if (palabras.some(p => t.includes(p))) return pieza;
  return null;
}

function detectarMarca(texto) {
  const t = normalizarTexto(texto);
  if (t.includes('iphone') || t.includes('apple'))             return 'Apple';
  if (t.includes('samsung') || t.includes('galaxy'))           return 'Samsung';
  if (t.includes('xiaomi') || t.includes('redmi'))             return 'Xiaomi';
  if (t.includes('moto') || t.includes('motorola'))            return 'Motorola';
  if (t.includes('huawei'))                                    return 'Huawei';
  if (t.includes('alcatel') || t.includes('revvl'))            return 'Alcatel';
  if (t.includes('tecno'))                                     return 'Tecno';
  if (t.includes('infinix'))                                   return 'Infinix';
  if (t.includes('coolpad'))                                   return 'Coolpad';
  if (t.includes('zte'))                                       return 'ZTE';
  if (t.includes('lg') || t.includes('stylo') || t.includes('aristo')) return 'LG';
  if (t.includes('itel'))                                      return 'Itel';
  if (t.includes('tcl'))                                       return 'TCL';
  return null;
}

// ── Capa 0: Buscar en sinónimos aprendidos por el admin ───────────────────────
async function buscarEnAprendidas(textoNorm) {
  const aprendidas = await db.all('SELECT * FROM consultas_aprendidas ORDER BY LENGTH(patron) DESC');
  for (const a of aprendidas) {
    const patron = a.patron.toLowerCase().trim();
    // Coincidencia exacta o el patrón está contenido en el texto
    if (textoNorm === patron || textoNorm.includes(patron)) {
      // Buscar el producto en la BD por nombre
      const prod = await db.get(
        'SELECT * FROM productos WHERE LOWER(nombre) LIKE ? LIMIT 1',
        [`%${a.producto_nombre.toLowerCase()}%`]
      );
      if (prod) {
        // Incrementar contador de uso
        await db.run('UPDATE consultas_aprendidas SET veces_usada = veces_usada + 1 WHERE id = ?', [a.id]);
        console.log(`📚 Aprendizaje: "${textoNorm}" → ${prod.nombre}`);
        return [prod];
      }
    }
  }
  return null;
}

async function buscarProductos(mensajeCliente) {
  // El inventario REAL vive en el shop (Supabase/Netlify), no en la BD local.
  // Limpiamos la consulta (quitamos relleno y sinónimos de pieza redundantes) y
  // delegamos al endpoint /api/bot/inventario, que matchea por todas las palabras.
  const textoNorm = normalizarTexto(mensajeCliente);
  const tokens = textoNorm.split(' ')
    .filter(p => p.length >= 2)
    .filter(p => !PALABRAS_RELLENO.includes(p));
  const consulta = tokens.join(' ').trim() || textoNorm;

  const items = await buscarEnInventarioCRM(consulta);
  const encontrados = (items || []).map(p => ({
    nombre:  p.nombre,
    precio:  p.precio_venta,
    codigo:  p.codigo,
    stock:   p.stock,
    calidad: '', // el inventario del shop no maneja variantes de calidad
  }));
  return { encontrados };
}

async function registrarConsultaNoEncontrada(mensaje, numero) {
  await db.run('INSERT INTO consultas_no_encontradas (mensaje, numero) VALUES (?, ?)', [mensaje, numero]);
}

async function registrarEstadistica(numero, mensaje, productoEncontrado, respondioBot) {
  await db.run('INSERT INTO estadisticas (numero, mensaje, producto_encontrado, respondio_bot) VALUES (?, ?, ?, ?)',
    [numero, mensaje, productoEncontrado || null, respondioBot ? 1 : 0]);
}

module.exports = { buscarProductos, registrarConsultaNoEncontrada, registrarEstadistica, detectarMarca };
