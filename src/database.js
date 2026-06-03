const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'productos.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const raw = new sqlite3.Database(DB_PATH);

// Wrapper síncrono usando promesas para uso simple
function run(sql, params = []) {
  return new Promise((res, rej) =>
    raw.run(sql, params, function (err) { err ? rej(err) : res({ lastInsertRowid: this.lastID, changes: this.changes }); })
  );
}
function get(sql, params = []) {
  return new Promise((res, rej) => raw.get(sql, params, (err, row) => err ? rej(err) : res(row)));
}
function all(sql, params = []) {
  return new Promise((res, rej) => raw.all(sql, params, (err, rows) => err ? rej(err) : res(rows)));
}
function exec(sql) {
  return new Promise((res, rej) => raw.exec(sql, err => err ? rej(err) : res()));
}

// Inicializar tablas
exec(`
  CREATE TABLE IF NOT EXISTS configuracion (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE,
    nombre TEXT NOT NULL,
    modelo TEXT NOT NULL,
    marca TEXT NOT NULL,
    tipo_pieza TEXT NOT NULL,
    calidad TEXT DEFAULT 'Estandar',
    precio INTEGER NOT NULL,
    disponible INTEGER DEFAULT 1,
    sucursal TEXT DEFAULT 'Santiago',
    notas TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS consultas_no_encontradas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mensaje TEXT NOT NULL,
    numero TEXT NOT NULL,
    fecha TEXT DEFAULT (datetime('now')),
    atendida INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS estadisticas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT NOT NULL,
    mensaje TEXT NOT NULL,
    producto_encontrado TEXT,
    respondio_bot INTEGER DEFAULT 0,
    fecha TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS consultas_aprendidas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patron TEXT NOT NULL UNIQUE,
    producto_id INTEGER,
    producto_nombre TEXT NOT NULL,
    veces_usada INTEGER DEFAULT 0,
    creado_por TEXT DEFAULT 'admin',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT NOT NULL,
    nombre_cliente TEXT,
    productos_json TEXT NOT NULL,
    total INTEGER NOT NULL,
    estado TEXT DEFAULT 'pendiente',
    notas TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`).then(() => {
  // Configuración por defecto
  const defaults = [
    ['saludo', '¡Hola! Sí, tenemos disponible:'],
    ['cierre', 'Un vendedor continuará con usted para confirmar y coordinar la entrega. 😊'],
    ['no_encontrado', 'Gracias por escribirnos a *Avila Cell* 🙏\n\nDame un momento para verificar.\n\nUn vendedor le atenderá en breve.'],
    ['multiples', 'Díganos cuál necesita y un vendedor le atenderá. 😊'],
    ['horario_activo', '1'],
    ['horario_inicio', '08:00'],
    ['horario_fin', '20:00'],
    ['fuera_horario', 'Gracias por escribirnos. Nuestro horario es de 8am a 8pm. Le atenderemos en breve. 🙏'],
    ['sucursal_defecto', 'Santiago'],
    ['nombre_negocio', 'Avila Cell'],
    ['bot_api_key', 'avilabot2025'],
    ['crm_url', 'http://localhost:3000'],
    ['notificaciones_enviadas', '0'],
  ];
  defaults.forEach(([k, v]) => raw.run('INSERT OR IGNORE INTO configuracion VALUES (?,?)', [k, v]));
}).catch(err => console.error('DB init error:', err));

module.exports = { run, get, all, exec, raw };
