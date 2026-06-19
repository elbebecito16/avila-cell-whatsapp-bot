const express = require('express');
const multer  = require('multer');
const XLSX    = require('xlsx');
const path    = require('path');
const db      = require('./database');
const estado  = require('./estado-bot');

const app    = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// CORS — permite que el CRM (localhost:3000) consulte la API del bot
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── Bot status ───────────────────────────────────────────────────────────────
app.get('/api/bot-status', (req, res) => res.json({
  conectado: estado.conectado,
  numero: estado.numeroConectado,
  ultimaActividad: estado.ultimaActividad,
  tieneQR: !!estado.qrData,
}));

app.get('/api/bot-qr', (req, res) => {
  if (!estado.qrData) return res.status(404).json({ error: 'Sin QR' });
  res.json({ qr: estado.qrData });
});

// ─── Configuración ────────────────────────────────────────────────────────────
app.get('/api/config', async (req, res) => {
  const rows = await db.all('SELECT clave, valor FROM configuracion');
  const obj = {};
  rows.forEach(r => { obj[r.clave] = r.valor; });
  res.json(obj);
});

app.put('/api/config', async (req, res) => {
  for (const [clave, valor] of Object.entries(req.body))
    await db.run('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?, ?)', [clave, String(valor)]);
  res.json({ ok: true });
});

// ─── Productos ────────────────────────────────────────────────────────────────
app.get('/api/productos', async (req, res) => {
  const { buscar, tipo, disponible } = req.query;
  let sql = 'SELECT * FROM productos WHERE 1=1';
  const params = [];
  if (buscar) { sql += ' AND (nombre LIKE ? OR marca LIKE ?)'; const b = `%${buscar}%`; params.push(b, b); }
  if (tipo)   { sql += ' AND tipo_pieza = ?'; params.push(tipo); }
  if (disponible !== undefined && disponible !== '') { sql += ' AND disponible = ?'; params.push(Number(disponible)); }
  sql += ' ORDER BY tipo_pieza, marca, nombre LIMIT 500';
  res.json(await db.all(sql, params));
});

app.post('/api/productos', async (req, res) => {
  const { codigo, nombre, modelo, marca, tipo_pieza, calidad, precio, disponible, sucursal, notas } = req.body;
  const r = await db.run(
    `INSERT INTO productos (codigo, nombre, modelo, marca, tipo_pieza, calidad, precio, disponible, sucursal, notas) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [codigo || null, nombre, modelo || nombre, marca, tipo_pieza, calidad || 'Estandar', precio, disponible ?? 1, sucursal || 'Santiago', notas || null]
  );
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/productos/:id', async (req, res) => {
  const { nombre, modelo, marca, tipo_pieza, calidad, precio, disponible, sucursal, notas } = req.body;
  await db.run(
    `UPDATE productos SET nombre=?,modelo=?,marca=?,tipo_pieza=?,calidad=?,precio=?,disponible=?,sucursal=?,notas=? WHERE id=?`,
    [nombre, modelo || nombre, marca, tipo_pieza, calidad, precio, disponible, sucursal, notas, req.params.id]
  );
  res.json({ ok: true });
});

app.delete('/api/productos/:id', async (req, res) => {
  await db.run('DELETE FROM productos WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ─── Importar Excel ───────────────────────────────────────────────────────────
app.post('/api/importar', upload.single('archivo'), async (req, res) => {
  try {
    const wb   = XLSX.readFile(req.file.path);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    let ok = 0;
    for (const f of rows) {
      await db.run(
        `INSERT OR REPLACE INTO productos (codigo, nombre, modelo, marca, tipo_pieza, calidad, precio, disponible, sucursal) VALUES (?,?,?,?,?,?,?,?,?)`,
        [f.Codigo || null, f.Nombre || f.nombre, f.Modelo || f.Nombre || f.nombre,
         f.Marca || f.marca, (f.TipoPieza || f.tipo_pieza || 'pantalla').toLowerCase(),
         f.Calidad || 'Estandar', parseInt(f.Precio || 0), (f.Disponible ?? 1) ? 1 : 0, f.Sucursal || 'Santiago']
      );
      ok++;
    }
    res.json({ importados: ok });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/plantilla', (req, res) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Codigo','Nombre','Modelo','Marca','TipoPieza','Calidad','Precio','Disponible','Sucursal'],
    ['IP11-PAN','PANTALLA IPHONE 11 INCELL','iPhone 11','Apple','pantalla','Incell',1500,1,'Santiago'],
  ]), 'Productos');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename=plantilla_productos.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ─── Pedidos ──────────────────────────────────────────────────────────────────
app.get('/api/pedidos', async (req, res) => {
  const { estado: est } = req.query;
  let sql = 'SELECT * FROM pedidos WHERE 1=1';
  const params = [];
  if (est) { sql += ' AND estado = ?'; params.push(est); }
  sql += ' ORDER BY created_at DESC LIMIT 200';
  const rows = await db.all(sql, params);
  rows.forEach(r => { try { r.productos = JSON.parse(r.productos_json); } catch { r.productos = []; } });
  res.json(rows);
});

app.put('/api/pedidos/:id/estado', async (req, res) => {
  const { estado: nuevoEstado, notas } = req.body;
  await db.run(
    `UPDATE pedidos SET estado=?, notas=?, updated_at=datetime('now') WHERE id=?`,
    [nuevoEstado, notas || null, req.params.id]
  );
  res.json({ ok: true });
});

app.get('/api/pedidos/stats', async (req, res) => {
  const [pendientes, facturados, cancelados] = await Promise.all([
    db.get("SELECT COUNT(*) as n, COALESCE(SUM(total),0) as total FROM pedidos WHERE estado='pendiente'"),
    db.get("SELECT COUNT(*) as n, COALESCE(SUM(total),0) as total FROM pedidos WHERE estado='facturado'"),
    db.get("SELECT COUNT(*) as n FROM pedidos WHERE estado='cancelado'"),
  ]);
  res.json({ pendientes, facturados, cancelados });
});

// ─── Aprendizaje ──────────────────────────────────────────────────────────────
app.get('/api/aprendizaje', async (req, res) =>
  res.json(await db.all('SELECT * FROM consultas_aprendidas ORDER BY veces_usada DESC, created_at DESC'))
);

app.post('/api/aprendizaje', async (req, res) => {
  const { patron, producto_nombre, producto_id } = req.body;
  if (!patron || !producto_nombre) return res.status(400).json({ error: 'patron y producto_nombre requeridos' });
  try {
    const r = await db.run(
      'INSERT OR REPLACE INTO consultas_aprendidas (patron, producto_nombre, producto_id) VALUES (?,?,?)',
      [patron.toLowerCase().trim(), producto_nombre, producto_id || null]
    );
    res.json({ id: r.lastInsertRowid, ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/aprendizaje/:id', async (req, res) => {
  await db.run('DELETE FROM consultas_aprendidas WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ─── Sin respuesta ────────────────────────────────────────────────────────────
app.get('/api/no-encontradas', async (req, res) =>
  res.json(await db.all('SELECT * FROM consultas_no_encontradas ORDER BY fecha DESC LIMIT 100')));

app.put('/api/no-encontradas/:id/atender', async (req, res) => {
  await db.run('UPDATE consultas_no_encontradas SET atendida=1 WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ─── Estadísticas ─────────────────────────────────────────────────────────────
app.get('/api/estadisticas', async (req, res) => {
  const [total, respondidas, noEncontradas, hoy, iaConsultas] = await Promise.all([
    db.get('SELECT COUNT(*) as n FROM estadisticas'),
    db.get('SELECT COUNT(*) as n FROM estadisticas WHERE respondio_bot=1'),
    db.get('SELECT COUNT(*) as n FROM consultas_no_encontradas WHERE atendida=0'),
    db.get("SELECT COUNT(*) as n FROM estadisticas WHERE fecha >= date('now')"),
    db.get("SELECT valor FROM configuracion WHERE clave='ia_consultas'"),
  ]);
  res.json({
    total: total.n, respondidas: respondidas.n,
    noEncontradas: noEncontradas.n, hoy: hoy.n,
    iaConsultas: parseInt(iaConsultas?.valor || 0),
  });
});

// ─── FAQ items (CRUD) ────────────────────────────────────────────────────────
app.get('/api/faq', async (req, res) => {
  res.json(await db.all('SELECT * FROM faq_items ORDER BY orden ASC'));
});

app.post('/api/faq', async (req, res) => {
  const { titulo, keywords, respuesta, orden, activo } = req.body;
  if (!titulo || !respuesta) return res.status(400).json({ error: 'titulo y respuesta requeridos' });
  const maxOrden = await db.get('SELECT COALESCE(MAX(orden),0)+1 as n FROM faq_items');
  const r = await db.run(
    'INSERT INTO faq_items (orden, titulo, keywords, respuesta, activo) VALUES (?,?,?,?,?)',
    [orden ?? maxOrden.n, titulo, keywords ?? '', respuesta, activo ?? 1]
  );
  res.json({ id: r.lastInsertRowid, ok: true });
});

app.put('/api/faq/:id', async (req, res) => {
  const { titulo, keywords, respuesta, orden, activo } = req.body;
  await db.run(
    `UPDATE faq_items SET titulo=?, keywords=?, respuesta=?, orden=?, activo=?, updated_at=datetime('now') WHERE id=?`,
    [titulo, keywords ?? '', respuesta, orden, activo ?? 1, req.params.id]
  );
  res.json({ ok: true });
});

app.delete('/api/faq/:id', async (req, res) => {
  await db.run('DELETE FROM faq_items WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ─── Log de conversaciones ────────────────────────────────────────────────────
app.get('/api/conversaciones', async (req, res) => {
  const rows = await db.all(
    'SELECT * FROM conversaciones_log ORDER BY updated_at DESC LIMIT 100'
  );
  res.json(rows);
});

// Endpoint interno que usa bot.js para actualizar el log
app.post('/api/conversaciones/log', async (req, res) => {
  const { numero, nombre, estado, ultimo_mensaje } = req.body;
  await db.run(
    `INSERT INTO conversaciones_log (numero, nombre, estado, ultimo_mensaje, updated_at)
     VALUES (?,?,?,?,datetime('now'))
     ON CONFLICT(numero) DO UPDATE SET nombre=excluded.nombre, estado=excluded.estado,
     ultimo_mensaje=excluded.ultimo_mensaje, updated_at=excluded.updated_at`,
    [numero, nombre ?? null, estado ?? null, ultimo_mensaje ?? null]
  ).catch(() =>
    db.run(
      `UPDATE conversaciones_log SET nombre=?, estado=?, ultimo_mensaje=?, updated_at=datetime('now') WHERE numero=?`,
      [nombre, estado, ultimo_mensaje, numero]
    )
  );
  res.json({ ok: true });
});

// ─── Notificaciones WhatsApp (llamado por el CRM) ────────────────────────────
// El CRM hace POST a /api/notificar para que el bot envíe un WhatsApp.
// Requiere que el bot esté conectado. La clave de seguridad se configura
// en la tabla configuracion con clave='bot_api_key'.

let _whatsappClient = null;

function setWhatsappClient(c) { _whatsappClient = c; }

app.post('/api/notificar', async (req, res) => {
  try {
    const { telefono, mensaje, api_key } = req.body;

    // Validar API key: prioriza la variable de entorno (deploy en la nube),
    // con fallback a la guardada en SQLite (config local).
    const keyRow = await db.get("SELECT valor FROM configuracion WHERE clave='bot_api_key'");
    const keyEsperada = process.env.BOT_API_KEY || keyRow?.valor;
    if (keyEsperada && api_key !== keyEsperada) {
      return res.status(401).json({ error: 'API key inválida' });
    }

    if (!telefono || !mensaje) {
      return res.status(400).json({ error: 'telefono y mensaje son requeridos' });
    }

    if (!_whatsappClient || !estado.conectado) {
      return res.status(503).json({ error: 'Bot WhatsApp no conectado' });
    }

    // Formatear número al estilo WA: 18095550000@c.us
    const num = telefono.replace(/\D/g, '');
    const chatId = num.startsWith('1') ? `${num}@c.us` : `1${num}@c.us`;

    // Validar que el número existe en WhatsApp antes de enviar
    const numeroValido = await _whatsappClient.getNumberId(chatId);
    if (!numeroValido) {
      return res.status(400).json({ error: `El número ${num} no tiene WhatsApp activo` });
    }

    await _whatsappClient.sendMessage(chatId, mensaje);
    console.log(`📨 [NOTIFICACION] Enviado a ${chatId}: ${mensaje.substring(0, 60)}...`);

    // Registrar en log
    await db.run(
      "INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('notificaciones_enviadas', '0')"
    );
    await db.run(
      "UPDATE configuracion SET valor = CAST(CAST(valor AS INTEGER) + 1 AS TEXT) WHERE clave='notificaciones_enviadas'"
    );

    res.json({ ok: true, enviado_a: chatId });
  } catch (e) {
    console.error('Error en /api/notificar:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Estadísticas de notificaciones ──────────────────────────────────────────
app.get('/api/notificaciones/stats', async (req, res) => {
  const row = await db.get("SELECT valor FROM configuracion WHERE clave='notificaciones_enviadas'");
  res.json({ total_enviadas: parseInt(row?.valor || 0) });
});

function iniciarPanel(puerto = process.env.PORT || 3001) {
  app.listen(puerto, '0.0.0.0', () => console.log(`📊 Panel admin escuchando en puerto ${puerto}`));
}

module.exports = { iniciarPanel, setWhatsappClient };
