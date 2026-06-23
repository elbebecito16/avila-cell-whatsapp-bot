// Asistente conversacional con DeepSeek (function-calling).
// Reemplaza el menú rígido: entiende lenguaje natural y usa "tools" para traer
// datos REALES (precios del inventario, estado de reparaciones, FAQ/horarios),
// nunca los inventa. Informa y, para cerrar venta, escala a un vendedor humano.
const OpenAI = require('openai');
const { nombreNegocio, get } = require('./config-negocio');
const { buscarProductos } = require('./buscador');
const { consultarReparacion, reparacionesPorTelefono } = require('./crm');
const { getFAQItems } = require('./faq');

const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_KEY || 'sk-9bb1b798ec0c485dbbc5534f671a5974',
});

function fmtPrecio(p) { return `RD$${Number(p).toLocaleString('es-DO')}`; }

// ── Historial de conversación por número (en memoria) ───────────────────────
const historiales = new Map(); // numero -> [{role, content}]
const MAX_MENSAJES = 12;       // ~6 turnos de ida y vuelta

function getHistorial(numero) {
  if (!historiales.has(numero)) historiales.set(numero, []);
  return historiales.get(numero);
}
function limpiarHistorial(numero) { historiales.delete(numero); }

// ── Definición de las herramientas que la IA puede invocar ──────────────────
const tools = [
  {
    type: 'function',
    function: {
      name: 'buscar_precio',
      description: 'Busca productos en el inventario real del sistema (repuestos, accesorios, equipos) y devuelve precio y stock. Úsalo SIEMPRE que el cliente pregunte por un precio, disponibilidad o producto (ej. "iphone 12", "cargador tipo c", "bateria"). Nunca inventes precios ni disponibilidad.',
      parameters: {
        type: 'object',
        properties: {
          consulta: { type: 'string', description: 'La pieza y modelo a buscar, ej. "pantalla iphone 13 pro" o "bateria samsung a51".' },
        },
        required: ['consulta'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'estado_reparacion',
      description: 'Consulta el estado de una orden de reparación por su número (ej. REP-001). Úsalo cuando el cliente pregunte por su equipo/reparación y dé un número de orden.',
      parameters: {
        type: 'object',
        properties: {
          numero_orden: { type: 'string', description: 'Número de orden, ej. "REP-001".' },
        },
        required: ['numero_orden'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mis_reparaciones',
      description: 'Lista las reparaciones registradas por número de teléfono. Si el cliente te da un teléfono (ej. "8297301557"), pásalo en "telefono". Si no da ninguno, se usa el número con el que escribe. Úsalo cuando pregunte por su equipo sin número de orden.',
      parameters: {
        type: 'object',
        properties: {
          telefono: { type: 'string', description: 'Teléfono del cliente si lo proporcionó (solo dígitos). Opcional.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'info_negocio',
      description: 'Devuelve información del negocio: horarios, sucursales/ubicación, garantía, formas de pago y otras preguntas frecuentes. Úsalo para esas consultas.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'escalar_a_vendedor',
      description: 'Marca que un vendedor humano debe continuar (para cerrar una venta/pedido, coordinar entrega/pago, o si el cliente pide hablar con una persona). Llámalo en esos casos.',
      parameters: {
        type: 'object',
        properties: {
          motivo: { type: 'string', description: 'Motivo breve, ej. "quiere comprar pantalla iphone 13".' },
        },
        required: ['motivo'],
      },
    },
  },
];

// ── Ejecución de cada tool ──────────────────────────────────────────────────
async function ejecutarTool(nombre, args, ctx) {
  try {
    if (nombre === 'buscar_precio') {
      const { encontrados } = await buscarProductos(args.consulta || '');
      if (!encontrados || encontrados.length === 0) {
        return { encontrados: [], nota: 'No se encontró ese producto en el inventario.' };
      }
      return {
        encontrados: encontrados.slice(0, 8).map(p => ({
          nombre: p.nombre,
          precio: fmtPrecio(p.precio),
          stock: p.stock,
          disponible: Number(p.stock) > 0,
        })),
      };
    }
    if (nombre === 'estado_reparacion') {
      const rep = await consultarReparacion(args.numero_orden || '');
      if (!rep) return { encontrada: false, nota: 'No existe esa orden.' };
      return {
        encontrada: true,
        numero: rep.numero, equipo: `${rep.marca} ${rep.modelo}`, color: rep.color || null,
        estado: rep.estado,
        total: rep.precio_cobrado > 0 ? fmtPrecio(rep.precio_cobrado) : null,
      };
    }
    if (nombre === 'mis_reparaciones') {
      const tel = (args.telefono && args.telefono.replace(/\D/g, '')) || ctx.numero;
      const ords = await reparacionesPorTelefono(tel);
      return { reparaciones: ords.map(r => ({ numero: r.numero, equipo: `${r.marca} ${r.modelo}`, estado: r.estado })) };
    }
    if (nombre === 'info_negocio') {
      const items = await getFAQItems().catch(() => []);
      return {
        negocio: nombreNegocio(),
        horario: `${get('horario_inicio', '08:00')} a ${get('horario_fin', '20:00')}`,
        info: items.map(i => ({ tema: i.titulo, detalle: i.respuesta })),
      };
    }
    if (nombre === 'escalar_a_vendedor') {
      ctx.escalar = true;
      ctx.motivoEscalacion = args.motivo || '';
      return { ok: true };
    }
  } catch (err) {
    return { error: err.message };
  }
  return { error: 'tool desconocida' };
}

function systemPrompt(nombreCliente) {
  const negocio = nombreNegocio();
  return `Eres el asistente de WhatsApp de *${negocio}*, una tienda de repuestos y reparación de celulares en República Dominicana. Atiendes a ${nombreCliente || 'un cliente'}.

TONO: dominicano, cálido y breve, como un vendedor amable por WhatsApp. Respuestas cortas (1-4 líneas), con uno o dos emojis a lo sumo. Tutea.

REGLAS:
- NUNCA inventes precios, disponibilidad ni estados. Usa SIEMPRE las herramientas para traer datos reales del inventario y del sistema.
- Si preguntan por un precio/pieza → usa buscar_precio. Si no aparece, dilo con honestidad y ofrece avisar a un vendedor.
- Para horarios, sucursales, garantía o pagos → usa info_negocio.
- Para estado de una reparación → estado_reparacion (si dan número) o mis_reparaciones.
- Cuando el cliente quiera COMPRAR/cerrar pedido, coordinar entrega o pago, o pida hablar con una persona → usa escalar_a_vendedor y dile que un vendedor le continúa enseguida. 😊
- No muestres menús numerados; conversa natural. No repitas saludos en cada mensaje.
- Responde en español.`;
}

/**
 * Procesa un mensaje del cliente con DeepSeek + tools.
 * Devuelve { texto, escalar } o null si la IA falla (para que el bot use fallback).
 */
async function responder(numero, nombreCliente, mensaje) {
  const ctx = { numero, escalar: false, motivoEscalacion: '' };
  const historial = getHistorial(numero);

  const mensajes = [
    { role: 'system', content: systemPrompt(nombreCliente) },
    ...historial,
    { role: 'user', content: mensaje },
  ];

  try {
    for (let i = 0; i < 4; i++) { // hasta 4 vueltas de tool-calling
      const resp = await deepseek.chat.completions.create({
        model: 'deepseek-chat',
        messages: mensajes,
        tools,
        tool_choice: 'auto',
        temperature: 0.4,
        max_tokens: 400,
      });
      const msg = resp.choices[0].message;
      mensajes.push(msg);

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const tc of msg.tool_calls) {
          let args = {};
          try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
          const resultado = await ejecutarTool(tc.function.name, args, ctx);
          mensajes.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(resultado) });
        }
        continue; // volver a llamar con los resultados
      }

      // Respuesta final
      const texto = (msg.content || '').trim();
      if (!texto) return null;

      // Guardar en historial (solo user + respuesta final)
      historial.push({ role: 'user', content: mensaje });
      historial.push({ role: 'assistant', content: texto });
      while (historial.length > MAX_MENSAJES) historial.shift();

      return { texto, escalar: ctx.escalar, motivo: ctx.motivoEscalacion };
    }
    return null; // se pasó de vueltas
  } catch (err) {
    console.error('❌ Asistente DeepSeek:', err.message);
    return null;
  }
}

module.exports = { responder, limpiarHistorial };
