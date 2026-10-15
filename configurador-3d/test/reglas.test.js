'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../reglas.js');
const catalogo = require('../catalogo.json');

const copia = () => JSON.parse(JSON.stringify(catalogo));

test('la colección tiene exactamente los tres modelos con sus nombres', () => {
  assert.deepEqual(catalogo.modelos.map((m) => m.nombre), ['Dormi Áureo', 'Dormi Patagónico', 'Cubic']);
  for (const m of catalogo.modelos) assert.equal(m.variantes.length, 2, m.nombre);
});

test('ningún precio se presenta como cero: sin dato es "pendiente de cotización"', () => {
  for (const c of catalogo.categorias) {
    for (const o of c.opciones) assert.notEqual(o.precio && o.precio.importe, 0, o.id);
  }
  const e = R.crearEstado(catalogo);
  assert.equal(R.resumen(catalogo, e).total.texto, 'Pendiente de cotización');
  assert.equal(R.textoPrecio(catalogo, undefined), 'Pendiente de cotización');
  assert.equal(R.textoPrecio(catalogo, { estado: 'sin_cargo' }), 'Sin cargo');
  assert.equal(R.textoPrecio(catalogo, { estado: 'incluido' }), 'Incluido');
});

test('el estado inicial es válido salvo la modalidad, que se elige en la etapa 3', () => {
  for (const m of catalogo.modelos) {
    const e = R.crearEstado(catalogo, m.id);
    assert.deepEqual(R.validar(catalogo, e), ['Falta elegir la modalidad de entrega.'], m.id);
    const ok = R.aplicar(catalogo, e, { tipo: 'modalidad', modalidad: 'kit' }).estado;
    assert.deepEqual(R.validar(catalogo, ok), [], m.id);
  }
});

test('la variante cerrada fija ventanas, cantidad y pórtico, y lo explica', () => {
  const e = R.crearEstado(catalogo, 'dormi_aureo');
  const r = R.aplicar(catalogo, e, { tipo: 'variante', variante: 'dormi_aureo_v2' });
  assert.equal(r.estado.sel.portico, 'portico_recto');
  assert.equal(r.estado.sel.ventana, 'ventana_fija');
  assert.equal(r.estado.cant.ventana, 2);
  assert.ok(r.cambios.some((c) => c.categoria === 'portico'));
  const ev = R.evaluarOpcion(catalogo, r.estado, 'portico', 'sin_portico');
  assert.equal(ev.disponible, false);
  assert.match(ev.motivo, /conjunto cerrado/);
  assert.deepEqual(R.limiteCantidad(catalogo, r.estado, 'ventana'), { min: 2, max: 2, fija: 2 });
});

test('elegir una opción que requiere otra avisa el cambio antes de aplicarlo', () => {
  const e = R.crearEstado(catalogo, 'dormi_patagonico');
  assert.equal(e.sel.portico, 'sin_portico');
  const ev = R.evaluarOpcion(catalogo, e, 'puerta', 'puerta_doble_vidriada');
  assert.equal(ev.disponible, true);
  assert.equal(ev.cambios.length, 1);
  assert.match(ev.cambios[0].texto, /Pórtico recto/);
  const r = R.aplicar(catalogo, e, { tipo: 'elegir', categoria: 'puerta', opcion: 'puerta_doble_vidriada' });
  assert.equal(r.estado.sel.portico, 'portico_recto');
  // Si después quita el pórtico, la puerta vuelve a la simple y también se avisa.
  const r2 = R.aplicar(catalogo, r.estado, { tipo: 'elegir', categoria: 'portico', opcion: 'sin_portico' });
  assert.equal(r2.estado.sel.puerta, 'puerta_simple');
  assert.ok(r2.cambios.some((c) => c.categoria === 'puerta'));
});

test('las exclusiones funcionan en los dos sentidos', () => {
  const cat = copia();
  cat.categorias.find((c) => c.id === 'adicionales').opciones[0].excluye = ['madera_cedro'];
  let e = R.crearEstado(cat);
  e = R.aplicar(cat, e, { tipo: 'elegir', categoria: 'adicionales', opcion: 'electricidad_autonoma' }).estado;
  const r = R.aplicar(cat, e, { tipo: 'elegir', categoria: 'terminacion', opcion: 'madera_cedro' });
  assert.deepEqual(r.estado.sel.adicionales, []);
  assert.ok(r.cambios.some((c) => /se quita/.test(c.texto)));
  const malo = { ...e, sel: { ...e.sel, terminacion: 'madera_cedro' } };
  assert.ok(R.validar(cat, malo).some((x) => /No combina/.test(x)));
});

test('cambiar de modelo conserva lo compatible y recorta lo que no entra', () => {
  let e = R.crearEstado(catalogo, 'dormi_aureo');
  e = R.aplicar(catalogo, e, { tipo: 'cantidad', categoria: 'ventana', cantidad: 3 }).estado;
  e = R.aplicar(catalogo, e, { tipo: 'elegir', categoria: 'terminacion', opcion: 'madera_cedro' }).estado;
  e = R.aplicar(catalogo, e, { tipo: 'modalidad', modalidad: 'media_obra' }).estado;
  const r = R.aplicar(catalogo, e, { tipo: 'modelo', modelo: 'cubic' });
  assert.equal(r.estado.sel.terminacion, 'madera_cedro');
  assert.equal(r.estado.cant.ventana, 2);
  assert.equal(r.estado.modalidad, 'media_obra');
  assert.equal(r.estado.variante, 'cubic_v1');
  assert.equal(r.cambios.length, 1);
  assert.match(r.cambios[0].texto, /de 3 a 2/);
});

test('las cantidades respetan los límites del modelo', () => {
  const e = R.crearEstado(catalogo, 'cubic');
  const r = R.aplicar(catalogo, e, { tipo: 'cantidad', categoria: 'ventana', cantidad: 9 });
  assert.equal(r.estado.cant.ventana, 2);
  const r0 = R.aplicar(catalogo, e, { tipo: 'cantidad', categoria: 'ventana', cantidad: -1 });
  assert.equal(r0.estado.cant.ventana, 0);
  assert.equal(R.aberturas(catalogo, r0.estado).filter((a) => a.tipo === 'ventana').length, 0);
});

test('las aberturas del 3D coinciden con la selección y sus posiciones', () => {
  let e = R.crearEstado(catalogo, 'dormi_aureo');
  e = R.aplicar(catalogo, e, { tipo: 'cantidad', categoria: 'ventana', cantidad: 3 }).estado;
  const ab = R.aberturas(catalogo, e);
  assert.deepEqual(ab.map((a) => `${a.tipo}:${a.posicion}`), ['puerta:frente', 'ventana:izquierda', 'ventana:derecha', 'ventana:fondo']);
});

test('el resumen reproduce exactamente la elección', () => {
  let e = R.crearEstado(catalogo, 'dormi_patagonico');
  e = R.aplicar(catalogo, e, { tipo: 'elegir', categoria: 'adicionales', opcion: 'biodigestor' }).estado;
  e = R.aplicar(catalogo, e, { tipo: 'modalidad', modalidad: 'llave_en_mano' }).estado;
  const t = R.resumen(catalogo, e).lineas.map((l) => `${l.etiqueta}: ${l.valor}`);
  assert.deepEqual(t, [
    'Modelo: Dormi Patagónico',
    'Variante: Variante 1 (combinable)',
    'Terminación exterior: Chapa grafito',
    'Puerta: Puerta simple de madera',
    'Ventanas: 2 × Ventana fija',
    'Pórtico: Sin pórtico',
    'Adicionales: Biodigestor',
    'Modalidad: Llave en Mano',
  ]);
});

test('con precios cargados suma, y un pendiente deja todo como pendiente', () => {
  const cat = copia();
  cat.precios.moneda = 'US$';
  for (const c of cat.categorias) for (const o of c.opciones) o.precio = { estado: 'valor', importe: 100 };
  cat.categorias.find((c) => c.id === 'portico').opciones[0].precio = { estado: 'sin_cargo' };
  const e = R.crearEstado(cat, 'dormi_aureo');
  // terminación 100 + puerta 100 + 2 ventanas 200 + pórtico sin cargo
  assert.equal(R.resumen(cat, e).total.texto, `US$ ${(400).toLocaleString('es-AR')}`);
  cat.categorias.find((c) => c.id === 'puerta').opciones[0].precio = { estado: 'pendiente' };
  assert.equal(R.resumen(cat, e).total.estado, 'pendiente');
});

test('el enlace guarda solo identificadores y se recupera igual', () => {
  let e = R.crearEstado(catalogo, 'cubic');
  e = R.aplicar(catalogo, e, { tipo: 'modalidad', modalidad: 'kit' }).estado;
  const codigo = R.codificar(e);
  assert.match(codigo, /^c1\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(R.decodificar(codigo), e);
  assert.equal(R.decodificar('cualquier cosa'), null);
  assert.equal(R.decodificar('c1.%%%'), null);
});

test('una configuración vieja o rota se adapta y avisa qué cambió', () => {
  const vieja = { v: '0.0.1', modelo: 'king', variante: 'x', sel: { puerta: 'no_existe', portico: 'portico_recto' }, cant: { ventana: 7 }, modalidad: 'kit' };
  const r = R.recuperar(catalogo, vieja);
  assert.equal(r.estado.modelo, 'dormi_aureo');
  assert.equal(r.estado.sel.puerta, 'puerta_simple');
  assert.equal(r.estado.v, catalogo.version_catalogo);
  assert.ok(r.avisos.length >= 3);
  assert.ok(R.validar(catalogo, vieja).length > 0);
});
