const Fuse = require('fuse.js');
const db = require('./database');
const { interpretarBusqueda } = require('./ia');

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
  'precio', 'cuanto', 'cuánto', 'cuesta', 'tiene', 'tienes', 'hay', 'stock',
  'necesito', 'quiero', 'para', 'de', 'la', 'el', 'un', 'una', 'me', 'su',
  'unidad', 'orig', 'original', 'kit', 'completo', 'completa', 'con', 'sin',
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
  const textoNorm     = normalizarTexto(mensajeCliente);
  const piezaDetectada = detectarPieza(textoNorm);
  const marcaDetectada = detectarMarca(textoNorm);

  // ── CAPA 0: Sinónimos aprendidos (máxima prioridad) ───────────────────────
  const aprendido = await buscarEnAprendidas(textoNorm);
  if (aprendido) return { encontrados: aprendido, pieza: piezaDetectada, viaAprendizaje: true };

  // ── 1. Filtrar candidatos por SQL (pieza + marca si se detectaron) ─────────
  let sql = 'SELECT * FROM productos WHERE 1=1';
  const params = [];
  if (piezaDetectada) { sql += ' AND tipo_pieza = ?'; params.push(piezaDetectada); }
  if (marcaDetectada) { sql += ' AND marca = ?';      params.push(marcaDetectada); }

  let candidatos = await db.all(sql, params);

  // Si no hay candidatos con marca, ampliar a solo pieza
  if (candidatos.length === 0 && marcaDetectada) {
    let sql2 = 'SELECT * FROM productos WHERE 1=1';
    const p2 = [];
    if (piezaDetectada) { sql2 += ' AND tipo_pieza = ?'; p2.push(piezaDetectada); }
    candidatos = await db.all(sql2, p2);
  }

  if (candidatos.length === 0) return { encontrados: [], pieza: piezaDetectada };

  // ── 2. Extraer tokens de búsqueda limpios ────────────────────────────────
  const tokens = textoNorm.split(' ')
    .filter(p => p.length >= 2)
    .filter(p => !Object.values(SINONIMOS_PIEZA).flat().includes(p))
    .filter(p => !PALABRAS_RELLENO.includes(p))
    .filter(p => !PALABRAS_MARCA.includes(p));

  const numerosRequeridos  = tokens.filter(p => /\d/.test(p));         // ej: "13", "a60", "a51"
  const palabrasTexto      = tokens.filter(p => !/\d/.test(p));
  const calificadoresQuery = palabrasTexto.filter(p => CALIFICADORES.includes(p));
  const palabrasGenerales  = palabrasTexto.filter(p => !CALIFICADORES.includes(p));

  // ── 3. Filtro estricto por palabras ──────────────────────────────────────
  const porPalabras = candidatos.filter(prod => {
    const campo = `${prod.nombre} ${prod.modelo}`.toLowerCase();

    // TODOS los números de modelo deben aparecer en el nombre del producto
    const cumpleNumeros       = numerosRequeridos.every(n => campo.includes(n));
    // TODOS los calificadores (pro, max, plus…) deben aparecer
    const cumpleCalificadores = calificadoresQuery.every(c => campo.includes(c));
    // Al menos una palabra general (marca/tipo extra) debe aparecer, si las hay
    const cumpleGeneral       = palabrasGenerales.length === 0 || palabrasGenerales.some(w => campo.includes(w));

    return cumpleNumeros && cumpleCalificadores && cumpleGeneral;
  });

  // Si encontró resultados exactos, retornarlos
  if (porPalabras.length > 0)
    return { encontrados: porPalabras.slice(0, 10), pieza: piezaDetectada };

  // ── 4. Sin coincidencia exacta → intentar con DeepSeek ───────────────────
  console.log(`🤖 Sin resultados exactos para "${mensajeCliente}", consultando DeepSeek...`);
  const ia = await interpretarBusqueda(mensajeCliente);

  if (ia && ia.confianza !== 'baja') {
    // Segunda búsqueda con los datos que DeepSeek extrajo
    let sql2 = 'SELECT * FROM productos WHERE 1=1';
    const p2 = [];

    if (ia.tipo_pieza) { sql2 += ' AND tipo_pieza = ?'; p2.push(ia.tipo_pieza); }
    if (ia.marca)      { sql2 += ' AND marca = ?';      p2.push(ia.marca); }

    let candidatos2 = await db.all(sql2, p2);

    // Si no encontró con marca, ampliar sin marca
    if (candidatos2.length === 0 && ia.marca) {
      const sql3 = sql2.replace(' AND marca = ?', '');
      const p3   = p2.filter(x => x !== ia.marca);
      candidatos2 = await db.all(sql3, p3);
    }

    if (candidatos2.length > 0 && ia.terminos?.length > 0) {
      const terminos = ia.terminos.map(t => t.toLowerCase());
      // Separar números de modelo de palabras generales
      const numerosIA   = terminos.filter(t => /\d/.test(t));
      const generalesIA = terminos.filter(t => !/\d/.test(t) && !['pantalla','bateria','tapa','camara','pin','flex','display','lcd'].includes(t));

      const porIA = candidatos2.filter(prod => {
        const campo = `${prod.nombre} ${prod.modelo}`.toLowerCase();
        // TODOS los números de modelo deben coincidir (igual que búsqueda normal)
        const cumpleNumeros  = numerosIA.length === 0 || numerosIA.every(n => campo.includes(n));
        // Al menos una palabra general si las hay
        const cumpleGeneral  = generalesIA.length === 0 || generalesIA.some(g => campo.includes(g));
        return cumpleNumeros && cumpleGeneral;
      });

      if (porIA.length > 0) {
        console.log(`✅ DeepSeek encontró ${porIA.length} producto(s)`);
        return { encontrados: porIA.slice(0, 10), pieza: ia.tipo_pieza || piezaDetectada, viaIA: true };
      }
    }
  }

  // ── 5. Fuse como último recurso SOLO sin número de modelo ─────────────────
  if (numerosRequeridos.length > 0) {
    return { encontrados: [], pieza: piezaDetectada };
  }

  const fuse = new Fuse(candidatos, {
    keys: [{ name: 'nombre', weight: 0.7 }, { name: 'modelo', weight: 0.3 }],
    threshold: 0.3,
    includeScore: true,
    minMatchCharLength: 3,
  });
  const resultados = fuse.search(textoNorm).map(r => r.item).slice(0, 10);
  return { encontrados: resultados, pieza: piezaDetectada };
}

async function registrarConsultaNoEncontrada(mensaje, numero) {
  await db.run('INSERT INTO consultas_no_encontradas (mensaje, numero) VALUES (?, ?)', [mensaje, numero]);
}

async function registrarEstadistica(numero, mensaje, productoEncontrado, respondioBot) {
  await db.run('INSERT INTO estadisticas (numero, mensaje, producto_encontrado, respondio_bot) VALUES (?, ?, ?, ?)',
    [numero, mensaje, productoEncontrado || null, respondioBot ? 1 : 0]);
}

module.exports = { buscarProductos, registrarConsultaNoEncontrada, registrarEstadistica, detectarMarca };
