'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cotizar, seleccionInicial } = require('../src/cotizador');
const catalogo = require('../catalogo-inicial.json');

const mensajes = q => q.errores.map(e => e.mensaje).join(' | ');

test('la configuración predeterminada es válida y calcula medidas', () => {
  const q = cotizar(catalogo, {});
  assert.equal(q.ok, true, mensajes(q));
  assert.deepEqual(q.medidas, { diametro_m: 6, altura_m: 3.75, area_piso_m2: 28.27, area_cubierta_m2: 70.69 });
  assert.equal(q.total, Math.round((q.neto + q.iva) * 100) / 100);
});

test('los precios por m² usan el área del tamaño elegido', () => {
  const q = cotizar(catalogo, { terminacion_exterior: 'chapa_grafito' });
  const item = q.items.find(i => i.opcion === 'chapa_grafito');
  assert.equal(item.metros, 70.69);
  assert.equal(item.importe, 2120.7); // 30 × 70.69
});

test('el multiplicador de línea se muestra como ajuste y respeta aplica_multiplicador', () => {
  const sel = { linea: 'confort', tamano: 'd7', electricidad: 'solar_3kw' };
  const q = cotizar(catalogo, sel);
  assert.equal(q.ok, true, mensajes(q));
  const ajuste = q.items.find(i => i.modo === 'multiplicador');
  const afectados = q.items.filter(i => i.modo !== 'multiplicador' && i.paso !== 'electricidad' && i.paso !== 'biodigestor')
    .reduce((s, i) => s + i.importe, 0);
  assert.ok(Math.abs(ajuste.importe - afectados * 0.15) < 0.02);
  assert.match(ajuste.nombre, /\+15%/);
});

test('el porcentaje (montaje) se calcula sobre el total con recargo', () => {
  const q = cotizar(catalogo, { opcionales: ['montaje'] });
  const montaje = q.items.find(i => i.opcion === 'montaje');
  const resto = q.items.filter(i => i !== montaje).reduce((s, i) => s + i.importe, 0);
  assert.ok(Math.abs(montaje.importe - resto * 0.12) < 0.02);
  assert.equal(q.items[q.items.length - 1], montaje);
});

test('valor_por_linea reemplaza el precio general', () => {
  const cat = structuredClone(catalogo);
  cat.pasos.find(p => p.id === 'portico').opciones.find(o => o.id === 'portico_recto').precio.valor_por_linea = { essential: 1000 };
  const q = cotizar(cat, { portico: 'portico_recto' });
  assert.equal(q.items.find(i => i.opcion === 'portico_recto').importe, 1000);
});

test('reglas: línea, diámetro, exclusiones y requisitos', () => {
  const q = cotizar(catalogo, {
    linea: 'essential', tamano: 'd5', portico: 'portico_arco',
    opcionales: ['platea', 'deck'],
  });
  const m = mensajes(q);
  assert.equal(q.ok, false);
  assert.match(m, /Pórtico en arco.*6 m o más/);
  assert.match(m, /Piso deck elevado.*No se puede combinar con Platea/);
  assert.match(mensajes(cotizar(catalogo, { ventanas: { ventana_portico: 1 } })), /Rectangular en pórtico.*Requiere Pórtico recto/);
  assert.equal(cotizar(catalogo, { portico: 'portico_recto', ventanas: { ventana_portico: 1 } }).ok, true);
  assert.equal(q.disponibilidad.tamano.d8.disponible, false);
  assert.match(q.disponibilidad.tamano.d8.motivo, /Confort o Design/);
});

test('cantidades: mínimo, máximo general, por línea y por opción', () => {
  assert.match(mensajes(cotizar(catalogo, { puertas: {} })), /al menos 1/);
  assert.match(mensajes(cotizar(catalogo, { puertas: { puerta_simple: 2 } })), /máximo es 1 en línea Essential/);
  assert.equal(cotizar(catalogo, { linea: 'confort', puertas: { puerta_simple: 2 } }).ok, true);
  assert.match(mensajes(cotizar(catalogo, { linea: 'confort', puertas: { puerta_simple: 4 } })), /máximo es 3/);
  assert.match(mensajes(cotizar(catalogo, { ventanas: { claraboya: 2 } })), /Claraboya cenital.*máximo es 1/);
  assert.match(mensajes(cotizar(catalogo, { puertas: { puerta_simple: 1.5 } })), /entero/);
});

test('opciones inexistentes, obligatorias vacías y "a consultar"', () => {
  assert.match(mensajes(cotizar(catalogo, { estructura: 'bambu' })), /"bambu" no existe/);
  assert.match(mensajes(cotizar(catalogo, { tamano: null })), /Falta elegir "Tamaño"/);
  const q = cotizar(catalogo, { linea: 'design', tamano: 'd12' });
  assert.equal(q.ok, true, mensajes(q));
  assert.equal(q.incluye_items_a_consultar, true);
  assert.equal(q.items.find(i => i.opcion === 'd12').importe, null);
});

test('las opciones y pasos inactivos no se pueden elegir', () => {
  const cat = structuredClone(catalogo);
  cat.pasos.find(p => p.id === 'terminacion_exterior').opciones.find(o => o.id === 'tejas_terracota').activo = false;
  cat.pasos.find(p => p.id === 'biodigestor').activo = false;
  assert.match(mensajes(cotizar(cat, { terminacion_exterior: 'tejas_terracota' })), /no existe o no está disponible/);
  assert.equal(cotizar(cat, { biodigestor: 'biodigestor_600' }).items.some(i => i.paso === 'biodigestor'), false);
  assert.equal('biodigestor' in seleccionInicial(cat), false);
});

test('precios con IVA incluido', () => {
  const cat = structuredClone(catalogo);
  cat.ajustes.precios_incluyen_iva = true;
  const q = cotizar(cat, {});
  assert.equal(q.total, q.subtotal);
  assert.ok(Math.abs(q.neto * 1.21 - q.total) < 0.02);
});
