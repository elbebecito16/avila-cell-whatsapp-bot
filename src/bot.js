const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode  = require('qrcode-terminal');
const QRCode  = require('qrcode');
const db      = require('./database');
const { buscarProductos, registrarConsultaNoEncontrada, registrarEstadistica } = require('./buscador');
const { construirRespuesta } = require('./respuestas');
const { formatearPrecio, resumenCarrito, guardarPedido } = require('./carrito');
const { obtenerSesion, crearSesion, actualizarSesion, eliminarSesion } = require('./sesiones');
const estado  = require('./estado-bot');
const { consultarReparacion, reparacionesPorTelefono } = require('./crm');
const { textoMenuFAQ, responderFAQ } = require('./faq');

// ── Cache de configuración ─────────────────────────────────────────────────
let configCache = {
  horario_activo: '1', horario_inicio: '08:00', horario_fin: '20:00',
  nombre_negocio: 'Avila Cell',
};
async function refrescarConfig() {
  const rows = await db.all('SELECT clave, valor FROM configuracion');
  rows.forEach(r => { configCache[r.clave] = r.valor; });
}
refrescarConfig();
setInterval(refrescarConfig, 30000);

function dentroDeHorario() {
  if (configCache.horario_activo !== '1') return true;
  const ahora = new Date();
  const [hIni, mIni] = (configCache.horario_inicio || '08:00').split(':').map(Number);
  const [hFin, mFin] = (configCache.horario_fin   || '20:00').split(':').map(Number);
  const min = ahora.getHours() * 60 + ahora.getMinutes();
  return min >= hIni * 60 + mIni && min <= hFin * 60 + mFin;
}

// ── Detección de consulta de precio ───────────────────────────────────────
const PALABRAS_IGNORAR = ['hola', 'buenos dias', 'buenas', 'gracias', 'ok', 'si', 'no', 'listo', 'perfecto', 'claro', 'bien', 'dale', 'exacto'];
const ES_OFERTA = ['vendo', 'vendemos', 'ofrezco', 'ofrecemos', 'tenemos disponibles', 'disponibles en', 'haga su pedido', 'hagan su pedido', 'al por mayor', 'al mayor', 'precio al mayor', 'delivery', 'envío gratis', 'envio gratis', 'hacemos envío', 'llame al', 'llama al', 'contáctenos', 'contactenos', 'visítenos', 'visitenos', 'somos distribuidores', 'distribuidor', 'pregunte por', 'pregunta por'];
const PIEZAS    = ['pantalla', 'display', 'lcd', 'bateria', 'batería', 'tapa', 'camara', 'cámara', 'pin de carga', 'flex', 'housing'];
const ES_PREGUNTA = ['precio', 'cuanto', 'cuánto', 'cuesta', 'vale', 'tienen', 'tienes', 'hay', 'stock', 'consigues', 'manejan', 'disponible', 'me pueden', 'me consigues', 'busco', 'necesito'];
const TIENE_MODELO = /\b(\d{1,2})\b|\d{2,4}[a-z]{0,3}\b|\b(pro|max|plus|mini|ultra|lite|note|se|xl|neo|fe|go|a\d{2,3}|s\d{1,2}|j\d|k\d{2}|stylo|aristo|g\d|fold|flip|edge|pop\s*\d|tab)\b/i;

function esConsultaDePrecio(t) {
  if (t.length < 5) return false;
  if (PALABRAS_IGNORAR.some(p => t === p)) return false;
  if (ES_OFERTA.some(p => t.includes(p))) return false;
  if (t.length > 160 && !ES_PREGUNTA.some(p => t.includes(p))) return false;
  const mencionaPieza  = PIEZAS.some(p => t.includes(p));
  const mencionaMarca  = ['iphone','samsung','xiaomi','redmi','tecno','motorola','moto','lg','zte','huawei','alcatel','infinix','coolpad','itel','tcl','pop','galaxy'].some(m => t.includes(m));
  const tieneModelo    = TIENE_MODELO.test(t);
  const tienePregunta  = ES_PREGUNTA.some(p => t.includes(p));
  if (mencionaPieza && !tieneModelo && !mencionaMarca) return false;
  if ((mencionaPieza || mencionaMarca) && (tienePregunta || tieneModelo)) return true;
  if (tienePregunta && tieneModelo) return true;
  return false;
}

// ── Textos del menú ────────────────────────────────────────────────────────
function textoMenuPrincipal(nombre) {
  const negocio = configCache.nombre_negocio || 'Avila Cell';
  const saludo = nombre ? `¡Hola, *${nombre}*! 👋` : '¡Hola! 👋';
  return (
    `${saludo} Bienvenido a *${negocio}* 📱\n\n` +
    `¿En qué te podemos ayudar?\n\n` +
    `*1️⃣* Consultar precios\n` +
    `*2️⃣* Hacer un pedido\n` +
    `*3️⃣* Estado de mi reparación\n` +
    `*4️⃣* Preguntas frecuentes\n` +
    `*0️⃣* Hablar con un vendedor\n\n` +
    `_Responde con el número de tu opción._`
  );
}

// ── Formateador de estado de reparación ────────────────────────────────────
const ESTADO_EMOJIS = {
  recibido:        '📥 Recibido',
  diagnostico:     '🔬 En diagnóstico',
  esperando_pieza: '📦 Esperando pieza',
  en_reparacion:   '🔧 En reparación',
  reparado:        '✅ ¡LISTO para retirar!',
  no_reparado:     '❌ No pudo repararse',
  entregado:       '🏠 Entregado',
};

function formatearReparacion(r) {
  const estado = ESTADO_EMOJIS[r.estado] ?? r.estado;
  const precio = r.precio_cobrado > 0 ? `\n💵 *Total a pagar:* RD$${Number(r.precio_cobrado).toLocaleString('es-DO')}` : '';
  const listo  = r.estado === 'reparado' ? `\n\n🎉 *¡Tu equipo está listo! Puedes pasar a retirarlo.*` : '';
  return (
    `📱 *Orden #${r.numero}*\n` +
    `${r.marca} ${r.modelo}${r.color ? ` · ${r.color}` : ''}\n` +
    `📋 Estado: *${estado}*${precio}${listo}\n\n` +
    `_Escribe otro número de orden o *menu* para volver._`
  );
}

// ── Cliente WhatsApp ───────────────────────────────────────────────────────
// Permite usar el Chrome del sistema solo si existe; si no, deja que
// whatsapp-web.js use su Chromium incluido (evita errores de version).
const fs = require('fs');
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
// En la nube (Docker) se inyecta PUPPETEER_EXECUTABLE_PATH apuntando al Chromium
// del sistema; en Windows local se autodetecta Chrome; si no, usa el incluido.
const chromeDelSistema = process.env.PUPPETEER_EXECUTABLE_PATH
  || CHROME_PATHS.find((p) => { try { return fs.existsSync(p); } catch { return false; } });

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './session' }),
  takeoverOnConflict: true,
  takeoverTimeoutMs: 10000,
  // Fija la version de WhatsApp Web para evitar el error
  // "Execution context was destroyed" cuando WhatsApp actualiza su pagina.
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1023204620.html',
  },
  puppeteer: {
    headless: true,
    protocolTimeout: 120_000,
    ...(chromeDelSistema ? { executablePath: chromeDelSistema } : {}),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  },
});

client.on('qr', async (qr) => {
  console.log('\n📱 Escanea este QR con tu WhatsApp:');
  qrcode.generate(qr, { small: true });
  estado.qrTexto = qr;
  estado.conectado = false;
  try { estado.qrData = await QRCode.toDataURL(qr, { width: 300, margin: 2 }); }
  catch { estado.qrData = null; }
});

client.on('ready', async () => {
  estado.conectado = true;
  estado.qrData = null;
  estado.qrTexto = null;
  estado.numeroConectado = client.info?.wid?.user || 'Desconocido';
  console.log(`✅ Bot conectado! Número: ${estado.numeroConectado}`);
  console.log('📊 Panel admin: http://localhost:3001');
});

client.on('auth_failure', () => {
  estado.conectado = false;
  console.error('❌ Error de autenticación. Borra la carpeta /session y reinicia.');
});

client.on('disconnected', (r) => {
  estado.conectado = false;
  estado.numeroConectado = null;
  console.log('⚠️ Desconectado:', r);
  // Reintentar conexión automáticamente después de 10 segundos
  console.log('🔄 Reintentando conexión en 10 segundos...');
  setTimeout(() => {
    console.log('🔄 Reconectando...');
    try { client.initialize(); } catch (e) { console.error('Error al reconectar:', e.message); }
  }, 10000);
});

// ── Manejo de mensajes ─────────────────────────────────────────────────────
client.on('message', async (msg) => {
  try {
    if (msg.from.includes('@g.us')) return; // ignorar grupos
    if (msg.fromMe) return;
    if (msg.type !== 'chat') return;

    const numero = msg.from;
    const texto  = msg.body.trim();
    const t      = texto.toLowerCase();

    estado.ultimaActividad = new Date().toISOString();
    estado.mensajesHoy++;

    // Registrar conversación en log (no bloquea el flujo)
    fetch('http://localhost:3001/api/conversaciones/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        numero,
        nombre: (await msg.getContact().catch(() => null))?.pushname ?? null,
        estado: obtenerSesion(numero)?.estado ?? 'NUEVO',
        ultimo_mensaje: texto.substring(0, 100),
      }),
    }).catch(() => {});

    // ── FILTRO: Solo contactos en agenda ──────────────────────────────────
    const contacto = await msg.getContact();
    if (!contacto.isMyContact) {
      console.log(`🚫 Ignorado (no en agenda): ${numero}`);
      return;
    }
    const nombreCliente = contacto.pushname || contacto.name || numero;

    // ── Verificar horario ─────────────────────────────────────────────────
    if (!dentroDeHorario()) {
      const row = await db.get("SELECT valor FROM configuracion WHERE clave='fuera_horario'");
      if (row?.valor) await msg.reply(row.valor);
      return;
    }

    // ── Obtener o crear sesión ────────────────────────────────────────────
    let sesion = obtenerSesion(numero);

    // Palabras clave que siempre muestran el menú
    const pidioMenu = ['menu', 'menú', 'inicio', 'start', 'hola', 'buenas', 'buenos dias', 'hi'].includes(t);

    if (!sesion || pidioMenu) {
      sesion = crearSesion(numero);
      await msg.reply(textoMenuPrincipal(nombreCliente));
      console.log(`📋 Menú enviado a ${nombreCliente} (${numero})`);
      return;
    }

    // ── Enrutar según estado actual ───────────────────────────────────────
    actualizarSesion(numero, {}); // actualiza timestamp

    switch (sesion.estado) {

      // ── Estado: MENU — esperando elección ────────────────────────────────
      case 'MENU': {
        if (t === '1') {
          actualizarSesion(numero, { estado: 'CONSULTA' });
          await msg.reply(
            `🔍 *Modo consulta de precios*\n\n` +
            `Escríbeme qué pieza necesitas y el modelo.\n` +
            `_Ejemplo: "pantalla iphone 13 pro max" o "bateria samsung a51"_\n\n` +
            `Escribe *menu* para volver al inicio.`
          );
        } else if (t === '2') {
          actualizarSesion(numero, { estado: 'CARRITO', carrito: [] });
          await msg.reply(
            `🛒 *Modo pedido*\n\n` +
            `Busca los productos que necesitas y los agrego a tu carrito.\n` +
            `_Ejemplo: "pantalla 13 pro max"_\n\n` +
            `Cuando termines escribe *confirmar* para enviar tu pedido.\n` +
            `Escribe *carrito* para ver lo que llevas.\n` +
            `Escribe *menu* para volver al inicio.`
          );
        } else if (t === '3') {
          actualizarSesion(numero, { estado: 'REPARACION' });
          // Intentar cargar órdenes del cliente por teléfono automáticamente
          const ordenes = await reparacionesPorTelefono(numero);
          if (ordenes.length > 0) {
            const lista = ordenes.map(r =>
              `• *#${r.numero}* — ${r.marca} ${r.modelo}: ${ESTADO_EMOJIS[r.estado] ?? r.estado}`
            ).join('\n');
            await msg.reply(
              `🔧 *Tus órdenes de reparación:*\n\n${lista}\n\n` +
              `Escribe el *número de orden* (ej: REP-001) para ver el detalle.\n` +
              `Escribe *menu* para volver al inicio.`
            );
          } else {
            await msg.reply(
              `🔧 *Estado de reparación*\n\n` +
              `Escríbeme el número de tu orden de reparación.\n` +
              `_Ejemplo: REP-001 o #REP-001_\n\n` +
              `Lo encuentras en el comprobante que te dimos al dejar el equipo.\n\n` +
              `Escribe *menu* para volver al inicio.`
            );
          }
        } else if (t === '4') {
          actualizarSesion(numero, { estado: 'FAQ' });
          await msg.reply(await textoMenuFAQ());
        } else if (t === '0') {
          actualizarSesion(numero, { estado: 'ESPERA_VENDEDOR' });
          await msg.reply(
            `👨‍💼 Un vendedor le atenderá en breve.\n\n` +
            `_Escribe *menu* si desea volver al menú principal._`
          );
          console.log(`🔔 [VENDEDOR REQUERIDO] ${nombreCliente} (${numero})`);
        } else {
          await msg.reply(
            `Por favor elige una opción válida:\n\n` +
            `*1* Consultar precios\n*2* Hacer un pedido\n` +
            `*3* Estado de mi reparación\n*4* Preguntas frecuentes\n*0* Hablar con un vendedor`
          );
        }
        break;
      }

      // ── Estado: CONSULTA — búsqueda de precios ───────────────────────────
      case 'CONSULTA': {
        // El usuario ya eligió "consultar precios" → buscar directamente
        // sin filtro estricto. Solo descartar mensajes sin sentido.
        if (t.length < 3) {
          await msg.reply(`_Escríbeme qué pieza y modelo necesitas._\n_Ejemplo: "pantalla tcl 10se" o "bateria samsung a51"_`);
          break;
        }
        if (['1','2','0'].includes(t)) {
          await msg.reply(`Para volver al menú escribe *menu*.\n\nO escríbeme el producto que buscas.`);
          break;
        }
        const { encontrados } = await buscarProductos(texto);
        const respuesta = construirRespuesta(encontrados, texto);
        await msg.reply(respuesta.texto);
        if (!respuesta.encontrado) await registrarConsultaNoEncontrada(texto, numero);
        await registrarEstadistica(numero, texto, respuesta.producto, true);
        console.log(`📤 CONSULTA ${respuesta.encontrado ? '✅' : '❌'} [${nombreCliente}]: ${texto}`);
        break;
      }

      // ── Estado: CARRITO — hacer pedido ───────────────────────────────────
      case 'CARRITO': {
        const sesActual = obtenerSesion(numero);

        // Ver carrito
        if (t === 'carrito' || t === 'ver carrito') {
          if (sesActual.carrito.length === 0) {
            await msg.reply(`🛒 Tu carrito está vacío.\n\nBusca productos escribiendo el nombre y modelo.`);
          } else {
            await msg.reply(`🛒 *Tu carrito:*\n\n${resumenCarrito(sesActual.carrito)}\n\nEscribe *confirmar* para enviar el pedido o sigue buscando.`);
          }
          return;
        }

        // Confirmar pedido
        if (t === 'confirmar' || t === 'confirmar pedido' || t === 'enviar pedido') {
          if (!sesActual.carrito || sesActual.carrito.length === 0) {
            await msg.reply(`Tu carrito está vacío. Agrega productos antes de confirmar.`);
            return;
          }
          const idPedido = await guardarPedido(numero, nombreCliente, sesActual.carrito);
          const resumen  = resumenCarrito(sesActual.carrito);
          await msg.reply(
            `✅ *¡Pedido recibido!*\n\n` +
            `📋 *Pedido #${idPedido}*\n${resumen}\n\n` +
            `Un vendedor confirmará tu pedido y coordinará la entrega. 😊\n\n` +
            `Escribe *menu* para volver al inicio.`
          );
          eliminarSesion(numero); // reset
          console.log(`🛒 PEDIDO #${idPedido} de ${nombreCliente} — Total: RD$${sesActual.carrito.reduce((s,i)=>s+i.precio*i.cantidad,0)}`);
          return;
        }

        // Vaciar carrito
        if (t === 'vaciar' || t === 'vaciar carrito') {
          actualizarSesion(numero, { carrito: [], ultimaBusqueda: [] });
          await msg.reply(`🗑️ Carrito vaciado. Puedes empezar a buscar de nuevo.`);
          return;
        }

        // El cliente elige un número de la última búsqueda (ej: "2")
        const eleccion = parseInt(t);
        if (!isNaN(eleccion) && sesActual.ultimaBusqueda?.length > 0) {
          const idx = eleccion - 1;
          if (idx >= 0 && idx < sesActual.ultimaBusqueda.length) {
            const prod = sesActual.ultimaBusqueda[idx];
            // Ver si ya está en carrito
            const existe = sesActual.carrito.find(i => i.codigo === prod.codigo || i.nombre === prod.nombre);
            if (existe) {
              existe.cantidad += 1;
              actualizarSesion(numero, { carrito: sesActual.carrito });
              await msg.reply(
                `✅ Agregado x${existe.cantidad}: *${prod.nombre}* — ${formatearPrecio(prod.precio * existe.cantidad)}\n\n` +
                `Escribe *carrito* para ver tu pedido o sigue buscando.`
              );
            } else {
              const nuevoCarrito = [...sesActual.carrito, { nombre: prod.nombre, codigo: prod.codigo || '', precio: prod.precio, cantidad: 1 }];
              actualizarSesion(numero, { carrito: nuevoCarrito });
              await msg.reply(
                `✅ Agregado: *${prod.nombre}* — ${formatearPrecio(prod.precio)}\n\n` +
                `Escribe *carrito* para ver tu pedido o sigue buscando.`
              );
            }
          } else {
            await msg.reply(`Número inválido. Elige entre 1 y ${sesActual.ultimaBusqueda.length}.`);
          }
          return;
        }

        // Buscar producto
        if (esConsultaDePrecio(t)) {
          const { encontrados } = await buscarProductos(texto);
          if (encontrados.length === 0) {
            await msg.reply(`❌ No encontré ese producto. Intenta con otro nombre o modelo.`);
            return;
          }
          // Guardar resultados para elección posterior
          actualizarSesion(numero, { ultimaBusqueda: encontrados });

          let lista = encontrados.map((p, i) =>
            `*${i + 1}.* ${p.nombre} — ${formatearPrecio(p.precio)}`
          ).join('\n');

          await msg.reply(
            `🔍 Encontré estas opciones:\n\n${lista}\n\n` +
            `Responde con el *número* para agregar al carrito.\n` +
            `Escribe *carrito* para ver tu pedido.`
          );
        } else {
          await msg.reply(
            `_Escribe el producto que necesitas (ej: "pantalla 13 pro max")_\n` +
            `o *carrito* para ver tu pedido\n` +
            `o *confirmar* para enviar el pedido.`
          );
        }
        break;
      }

      // ── Estado: REPARACION — consulta de estado de orden ────────────────────
      case 'REPARACION': {
        // Detectar número de orden: REP-001, #REP-001, rep001, etc.
        const matchOrden = texto.match(/(?:#?)([A-Z]{2,5}[-\s]?\d{3,6})/i);
        if (matchOrden) {
          const numOrden = matchOrden[1].toUpperCase().replace(/\s/g, '-');
          const rep = await consultarReparacion(numOrden);
          if (rep) {
            await msg.reply(formatearReparacion(rep));
            console.log(`🔧 REPARACION consultada [${nombreCliente}]: ${numOrden} → ${rep.estado}`);
          } else {
            await msg.reply(
              `❌ No encontré la orden *${numOrden}*.\n\n` +
              `Verifica que el número esté correcto en tu comprobante.\n` +
              `Si necesitas ayuda escribe *0* para hablar con un vendedor.`
            );
          }
        } else {
          await msg.reply(
            `_Escríbeme el número de orden que aparece en tu comprobante._\n` +
            `_Ejemplo: REP-001_\n\nEscribe *menu* para volver al inicio.`
          );
        }
        break;
      }

      // ── Estado: FAQ — preguntas frecuentes ───────────────────────────────────
      case 'FAQ': {
        const respFAQ = await responderFAQ(t);
        if (respFAQ) {
          await msg.reply(respFAQ + '\n\n_Escribe otro número o *menu* para volver al inicio._');
        } else {
          const menuFAQ = await textoMenuFAQ();
          await msg.reply(`No encontré respuesta para eso. 🤔\n\n${menuFAQ}`);
        }
        break;
      }

      // ── Estado: ESPERA_VENDEDOR ───────────────────────────────────────────
      case 'ESPERA_VENDEDOR': {
        // Bot no responde, solo el vendedor atiende manualmente
        console.log(`💬 [VENDEDOR] Mensaje de ${nombreCliente}: ${texto}`);
        break;
      }

      default:
        eliminarSesion(numero);
        await msg.reply(textoMenuPrincipal(nombreCliente));
    }

  } catch (err) {
    console.error('Error en mensaje:', err.message);
  }
});

module.exports = client;
