const XLSX    = require('xlsx');
const sqlite3 = require('sqlite3').verbose();
const path    = require('path');
const fs      = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'productos.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new sqlite3.Database(DB_PATH);

function run(sql, params = []) {
  return new Promise((res, rej) => db.run(sql, params, function(err) { err ? rej(err) : res(this); }));
}
function get(sql, params = []) {
  return new Promise((res, rej) => db.get(sql, params, (err, row) => err ? rej(err) : res(row)));
}

function detectarTipo(n) {
  if (/pantalla|panatalla|lcd|display/.test(n)) return 'pantalla';
  if (/bateria|baterias/.test(n)) return 'bateria';
  if (/tapa trasera|tapa k|tapa \d|tapa lg|tapa iphone|tapa \d{2}/.test(n)) return 'tapa';
  if (/flex de carga|flex carga|felx de carga|flex pin/.test(n)) return 'pin';
  if (/flex de camara|flex camara/.test(n)) return 'camara';
  if (/flex de audio|flex audio|flex de volumen|flex volumen|flex encendido|flex de encedido/.test(n)) return 'flex';
  if (/housing/.test(n)) return 'housing';
  if (/boton|home button/.test(n)) return 'flex';
  if (/camara|lentes cristal/.test(n)) return 'camara';
  if (/bocina/.test(n)) return 'bocina';
  if (/cable|cargador|cabezita|airpod|funda|audifono/.test(n)) return 'accesorio';
  if (/stencil|estacion|espatula|microscopio|drimer|soplador|guantes|precalentadora|limpiador|destornillador|base soldador|pega |estano|pinza|lapiz|fuente de carga/.test(n)) return 'herramienta';
  return 'otro';
}

function detectarMarca(n) {
  if (/iphone/.test(n)) return 'Apple';
  if (/samsung|samsuing|samnsung|galaxi/.test(n)) return 'Samsung';
  if (/alcatel|revvl/.test(n)) return 'Alcatel';
  if (/redmi|xiaomi|remi |remid /.test(n)) return 'Xiaomi';
  if (/moto |motorola/.test(n)) return 'Motorola';
  if (/\blg\b|stylo|aristo|ls676|sp200|tribute|lm-k|xpression|x power|xpower|phoenix|l555|q51|q60|l210|k51|k40|k30|k22|k20|k50/.test(n)) return 'LG';
  if (/huawei/.test(n)) return 'Huawei';
  if (/\bzte\b|z971|z981|z982|6400/.test(n)) return 'ZTE';
  if (/tecno/.test(n)) return 'Tecno';
  if (/infinix/.test(n)) return 'Infinix';
  if (/coolpad/.test(n)) return 'Coolpad';
  return 'Generico';
}

function detectarCalidad(n) {
  if (/oled/.test(n)) return 'OLED';
  if (/original/.test(n)) return 'Original';
  if (/incell|jk/.test(n)) return 'Incell';
  if (/mochino|moshino|moshi/.test(n)) return 'Mochino';
  if (/\bfhd\b|\bhd\b/.test(n)) return 'HD';
  if (/\bgx\b/.test(n)) return 'GX';
  if (/\btft\b/.test(n)) return 'TFT';
  return 'Estandar';
}

function parsearPrecio(val) {
  if (!val && val !== 0) return 0;
  const n = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(n) ? 0 : Math.round(n);
}

async function main() {
  console.log('📖 Leyendo Excel...');
  const wb   = XLSX.readFile('C:\\Users\\AVILACELL\\Downloads\\LISTADO DE PRODUCTO (1).xls');
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });

  const vistos = new Set();
  const productos = [];

  for (const row of rows) {
    const num    = String(row[1]).trim();
    const nombre = String(row[3]).trim();
    if (!num || !/^\d+$/.test(num) || !nombre || nombre.length < 3) continue;
    if (vistos.has(num)) continue;
    vistos.add(num);

    const stock  = parseFloat(String(row[11]).replace(/,/g, '')) || 0;
    const precio = parsearPrecio(row[17]);
    if (precio < 5) continue;

    const n = nombre.toLowerCase();
    productos.push({
      codigo:     num,
      nombre:     nombre.replace(/\s+/g, ' ').trim(),
      marca:      detectarMarca(n),
      tipo_pieza: detectarTipo(n),
      calidad:    detectarCalidad(n),
      precio,
      disponible: stock > 0 ? 1 : 0,
    });
  }

  console.log(`✅ ${productos.length} productos encontrados`);

  // Asegurar tablas
  await new Promise((res, rej) => db.exec(`
    CREATE TABLE IF NOT EXISTS productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT UNIQUE, nombre TEXT NOT NULL,
      modelo TEXT NOT NULL, marca TEXT NOT NULL, tipo_pieza TEXT NOT NULL,
      calidad TEXT DEFAULT 'Estandar', precio INTEGER NOT NULL, disponible INTEGER DEFAULT 1,
      sucursal TEXT DEFAULT 'Santiago', notas TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
  `, err => err ? rej(err) : res()));

  await run('DELETE FROM productos');

  for (const p of productos) {
    await run(
      `INSERT OR IGNORE INTO productos (codigo, nombre, modelo, marca, tipo_pieza, calidad, precio, disponible, sucursal)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [p.codigo, p.nombre, p.nombre, p.marca, p.tipo_pieza, p.calidad, p.precio, p.disponible, 'Santiago']
    );
  }

  const { n } = await get('SELECT COUNT(*) as n FROM productos');
  console.log(`\n✅ ${n} productos en la base de datos`);

  // Resumen
  await new Promise(res => db.all(
    'SELECT tipo_pieza, COUNT(*) as c, SUM(disponible) as d FROM productos GROUP BY tipo_pieza ORDER BY c DESC',
    (err, rows) => {
      if (!err) { console.log('\n📊 Resumen:'); rows.forEach(r => console.log(`   ${r.tipo_pieza.padEnd(12)} ${r.c} (${r.d} disponibles)`)); }
      res();
    }
  ));

  db.close(() => console.log('\n🎉 Importación completada!'));
}

main().catch(err => { console.error(err); db.close(); });
