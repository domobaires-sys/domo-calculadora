'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validarCatalogo } = require('../src/validador');
const catalogo = require('../catalogo-inicial.json');

const con = fn => { const c = structuredClone(catalogo); fn(c); return validarCatalogo(c).join('\n'); };
const paso = (c, id) => c.pasos.find(p => p.id === id);

test('el catálogo inicial es válido', () => {
  assert.deepEqual(validarCatalogo(catalogo), []);
});

test('detecta ids repetidos y con formato inválido', () => {
  assert.match(con(c => { paso(c, 'ventanas').opciones[0].id = 'puerta_simple'; }), /ya se usa en el paso "puertas"/);
  assert.match(con(c => { paso(c, 'ventanas').opciones[0].id = 'Ventana Grande'; }), /minúsculas/);
  assert.match(con(c => { c.pasos[1].id = 'linea'; }), /"linea" está repetido/);
});

test('detecta precios y modos inválidos', () => {
  assert.match(con(c => { paso(c, 'puertas').opciones[0].precio.valor = '650'; }), /precio.valor debe ser un número/);
  assert.match(con(c => { paso(c, 'puertas').opciones[0].precio.modo = 'gratis'; }), /precio.modo debe ser uno de/);
  assert.match(con(c => { paso(c, 'puertas').opciones[0].precio = { modo: 'multiplicador', valor: 2 }; }), /multiplicador no puede usarse en un paso de cantidades/);
  assert.match(con(c => { paso(c, 'portico').opciones[1].precio.valor_por_linea = { premium: 1 }; }), /línea "premium" que no existe/);
});

test('detecta reglas que apuntan a opciones o líneas inexistentes', () => {
  assert.match(con(c => { paso(c, 'opcionales').opciones[0].reglas.excluye = ['pileta']; }), /opción "pileta" que no existe/);
  assert.match(con(c => { paso(c, 'tamano').opciones[0].reglas.solo_lineas = ['lujo']; }), /"lujo" que no es una línea/);
  assert.match(con(c => { paso(c, 'opcionales').opciones[0].reglas.color = ['x']; }), /regla desconocida "color"/);
});

test('exige diámetro en los tamaños y predeterminadas existentes', () => {
  assert.match(con(c => { delete paso(c, 'tamano').opciones[0].diametro_m; }), /diametro_m/);
  assert.match(con(c => { paso(c, 'estructura').predeterminada = 'bambu'; }), /predeterminada "bambu" no existe/);
  assert.match(con(c => { paso(c, 'puertas').min_total = 5; }), /min_total no puede ser mayor/);
  assert.match(con(c => { c.ajustes.porcion_esfera = 2; }), /porcion_esfera/);
});

test('valida geometría de modelos, superficie mínima y pasos por línea', () => {
  assert.match(con(c => { paso(c, 'modelo_dormi').opciones[0].geometria.area_piso_m2 = 8; }), /debe ser mayor a 10 m², el mínimo de la línea Dormi/);
  assert.match(con(c => { delete paso(c, 'modelo_dormi').opciones[0].geometria.altura_m; }), /geometria.altura_m/);
  assert.match(con(c => { paso(c, 'portico').solo_lineas = ['lujo']; }), /solo_lineas usa "lujo"/);
  assert.match(con(c => { paso(c, 'ventanal_dormi').opciones[0].reglas.solo_con = ['nada']; }), /opción "nada" que no existe/);
});
