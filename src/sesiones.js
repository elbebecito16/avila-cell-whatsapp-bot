// Manejo de estado de conversación por número
// Estados: MENU | CONSULTA | CARRITO | ESPERA_VENDEDOR

const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutos

const sesiones = new Map();

function obtenerSesion(numero) {
  const s = sesiones.get(numero);
  if (!s) return null;
  // Si expiró, eliminar y retornar null (volverá al menú)
  if (Date.now() - s.ultimaActividad > TIMEOUT_MS) {
    sesiones.delete(numero);
    return null;
  }
  return s;
}

function crearSesion(numero) {
  const s = {
    numero,
    estado: 'IA', // modo conversacional natural por defecto; 'MENU' es respaldo

    carrito: [],
    ultimaBusqueda: [],   // últimos productos encontrados para elegir por número
    ultimaActividad: Date.now(),
  };
  sesiones.set(numero, s);
  return s;
}

function actualizarSesion(numero, cambios) {
  const s = sesiones.get(numero);
  if (!s) return;
  Object.assign(s, cambios, { ultimaActividad: Date.now() });
}

function eliminarSesion(numero) {
  sesiones.delete(numero);
}

module.exports = { obtenerSesion, crearSesion, actualizarSesion, eliminarSesion };
