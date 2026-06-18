/**
 * crm.js — Puente HTTP entre el bot y el CRM (localhost:3000)
 * El bot llama aquí para consultar reparaciones e inventario en tiempo real.
 */

const CRM_URL = process.env.CRM_URL || 'http://localhost:3000';

async function fetch2(url) {
  try {
    const headers = {};
    // Si el CRM exige clave (BOT_API_KEY), la enviamos en x-api-key
    if (process.env.BOT_API_KEY) headers['x-api-key'] = process.env.BOT_API_KEY;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── Reparaciones ──────────────────────────────────────────────────────────────

/**
 * Busca una orden de reparación por número (REP-001).
 * Retorna el objeto o null si no se encontró.
 */
async function consultarReparacion(numeroOrden) {
  const limpio = numeroOrden.trim().toUpperCase().replace(/^#/, '');
  const data = await fetch2(`${CRM_URL}/api/bot/reparacion/${encodeURIComponent(limpio)}`);
  return data ?? null;
}

/**
 * Busca todas las reparaciones asociadas a un número de WhatsApp.
 */
async function reparacionesPorTelefono(telefono) {
  const limpio = telefono.replace('@c.us', '').replace(/\D/g, '');
  const data = await fetch2(`${CRM_URL}/api/bot/reparaciones?telefono=${limpio}`);
  return Array.isArray(data) ? data : [];
}

// ── Inventario ────────────────────────────────────────────────────────────────

/**
 * Consulta productos del inventario real del CRM.
 * Devuelve array de { nombre, codigo, precio_venta, stock }
 */
async function buscarEnInventarioCRM(texto) {
  const data = await fetch2(`${CRM_URL}/api/bot/inventario?q=${encodeURIComponent(texto)}`);
  return Array.isArray(data) ? data : [];
}

module.exports = { consultarReparacion, reparacionesPorTelefono, buscarEnInventarioCRM };
