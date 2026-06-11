const db = require('./database');

function formatearPrecio(precio) {
  return `RD$${Number(precio).toLocaleString('es-DO')}`;
}

function resumenCarrito(carrito) {
  if (carrito.length === 0) return '_(carrito vacío)_';
  let txt = carrito.map((item, i) =>
    `${i + 1}. ${item.nombre} x${item.cantidad} — *${formatearPrecio(item.precio * item.cantidad)}*`
  ).join('\n');
  const total = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
  txt += `\n\n*Total: ${formatearPrecio(total)}*`;
  return txt;
}

async function guardarPedido(numero, nombreCliente, carrito) {
  const total = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
  const productosJson = JSON.stringify(carrito);
  const result = await db.run(
    `INSERT INTO pedidos (numero, nombre_cliente, productos_json, total, estado)
     VALUES (?, ?, ?, ?, 'pendiente')`,
    [numero, nombreCliente || numero, productosJson, total]
  );
  return result.lastInsertRowid;
}

module.exports = { formatearPrecio, resumenCarrito, guardarPedido };
