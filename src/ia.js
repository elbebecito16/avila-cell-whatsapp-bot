const OpenAI = require('openai');
const db = require('./database');

// Cliente DeepSeek (compatible con API de OpenAI)
const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_KEY || 'sk-9bb1b798ec0c485dbbc5534f671a5974',
});

// Cache de marcas, tipos y ejemplos exitosos (se refresca cada 5 min)
let cacheMarcas   = [];
let cacheTipos    = [];
let cacheEjemplos = [];
let ultimoRefresh = 0;

async function refrescarCatalogo() {
  if (Date.now() - ultimoRefresh < 5 * 60 * 1000) return;
  try {
    const marcas = await db.all("SELECT DISTINCT marca FROM productos ORDER BY marca");
    const tipos  = await db.all("SELECT DISTINCT tipo_pieza FROM productos ORDER BY tipo_pieza");
    cacheMarcas  = marcas.map(r => r.marca);
    cacheTipos   = tipos.map(r => r.tipo_pieza);

    // Últimas 30 búsquedas exitosas como ejemplos de entrenamiento dinámico
    const exitosas = await db.all(`
      SELECT mensaje, producto_encontrado FROM estadisticas
      WHERE respondio_bot = 1 AND producto_encontrado IS NOT NULL
        AND LENGTH(mensaje) > 5
      ORDER BY fecha DESC LIMIT 30
    `);
    cacheEjemplos = exitosas
      .filter(e => e.producto_encontrado)
      .map(e => `- "${e.mensaje}" → encontró: "${e.producto_encontrado.split(',')[0].trim()}"`)
      .slice(0, 20);

    ultimoRefresh = Date.now();
  } catch {}
}

/**
 * Usa DeepSeek para interpretar una búsqueda que el bot no pudo resolver.
 * Retorna { marca, modelo, tipo_pieza, terminos_busqueda } o null si falla.
 */
async function interpretarBusqueda(mensajeCliente) {
  await refrescarCatalogo();

  const prompt = `Eres un asistente para una tienda de repuestos de celulares llamada Avila Cell en República Dominicana.

El cliente escribió: "${mensajeCliente}"

Marcas disponibles en nuestro inventario: ${cacheMarcas.join(', ')}
Tipos de piezas disponibles: ${cacheTipos.join(', ')}

INSTRUCCIONES ESTRICTAS:
1. Extrae la marca EXACTAMENTE como aparece en la lista de marcas disponibles (o null)
2. Extrae el modelo EXACTAMENTE como aparece en el mensaje del cliente — NO inventes ni cambies el número de modelo. Si el cliente dice "15", el modelo es "15", no "13" ni otro número.
3. Extrae el tipo de pieza EXACTAMENTE como aparece en la lista de tipos disponibles (o null)
4. En "terminos" incluye SOLO las palabras que aparecen en el mensaje original que son relevantes para identificar el producto (números de modelo, variantes como pro/max/plus/se). NO incluyas palabras que no estén en el mensaje.
5. Si el mensaje tiene un número de modelo claro (ej: 15, a60, 10se), ese número DEBE estar en terminos.

Ejemplos generales:
- "tapa iphone 15" → modelo:"15", terminos:["15","iphone","tapa"]
- "pantalla itel a669" → modelo:"A669", terminos:["a669","itel"]
- "bateria samsung a71" → modelo:"A71", terminos:["a71","samsung"]
- "pantalla tcl 10se" → modelo:"10SE", terminos:["10se","tcl"]
${cacheEjemplos.length > 0 ? `\nBúsquedas reales exitosas de clientes de Avila Cell (aprende de estas):\n${cacheEjemplos.join('\n')}` : ''}

Responde SOLO con JSON válido, sin texto adicional:
{
  "marca": "Apple",
  "modelo": "15",
  "tipo_pieza": "tapa",
  "terminos": ["15", "iphone", "tapa"],
  "confianza": "alta"
}`;

  try {
    const response = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.1,
    });

    const texto = response.choices[0].message.content.trim();
    // Extraer JSON aunque tenga texto alrededor
    const match = texto.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const resultado = JSON.parse(match[0]);

    // Filtrar palabras que no son parte del modelo (adjetivos, artículos, etc.)
    const PALABRAS_BASURA = [
      'grande', 'chico', 'pequeño', 'nuevo', 'viejo', 'bueno', 'malo',
      'original', 'generico', 'barato', 'caro', 'para', 'del', 'con',
      'pantalla', 'bateria', 'tapa', 'camara', 'pin', 'flex', 'display',
    ];
    if (Array.isArray(resultado.terminos)) {
      resultado.terminos = resultado.terminos.filter(t =>
        !PALABRAS_BASURA.includes(t.toLowerCase())
      );
    }

    console.log(`🤖 DeepSeek interpretó "${mensajeCliente}":`, resultado);

    // Registrar uso
    await db.run(
      "INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('ia_consultas', '0')"
    );
    await db.run(
      "UPDATE configuracion SET valor = CAST(CAST(valor AS INTEGER) + 1 AS TEXT) WHERE clave = 'ia_consultas'"
    );

    return resultado;
  } catch (err) {
    console.error('❌ Error DeepSeek:', err.message);
    return null;
  }
}

module.exports = { interpretarBusqueda };
