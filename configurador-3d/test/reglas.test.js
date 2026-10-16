'use strict';
// Reglas del configurador: estado, cambios, código de configuración, formulario y solicitud.
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../reglas.js');
const catalogo = require('../catalogo.json');

const copia = () => JSON.parse(JSON.stringify(catalogo));
const datosOk = { nombre: 'Ana Pérez', contacto: '11 5555-1234', localidad: 'Tandil', comentario: '', consentimiento: true };

test('el estado inicial es el Dormi Áureo con sus opciones predeterminadas y sin modalidad', () => {
  const e = R.crearEstado(catalogo);
  assert.deepEqual(e, { v: catalogo.version_catalogo, modelo: 'dormi_aureo', opciones: { trama: 'a', color: 'natural' }, modalidad: null });
  assert.deepEqual(R.normalizar(catalogo, e).cambios, []);
  assert.deepEqual(R.validarConfiguracion(catalogo, e), ['Elegí la modalidad de entrega.']);
  for (const m of catalogo.modelos) {
    const x = R.aplicar(catalogo, R.crearEstado(catalogo, m.id), { tipo: 'modalidad', modalidad: 'kit' }).estado;
    assert.deepEqual(R.validarConfiguracion(catalogo, x), [], m.id);
    assert.ok(R.archivo3d(catalogo, x), `${m.id} tiene su archivo 3D`);
  }
});

test('cambiar de modelo limpia las opciones que no corresponden y conserva la modalidad', () => {
  let e = R.crearEstado(catalogo, 'dormi_aureo');
  e = R.aplicar(catalogo, e, { tipo: 'opcion', opcion: 'trama', valor: 'b' }).estado;
  e = R.aplicar(catalogo, e, { tipo: 'opcion', opcion: 'color', valor: 'azul' }).estado;
  e = R.aplicar(catalogo, e, { tipo: 'modalidad', modalidad: 'media_obra' }).estado;
  const p = R.aplicar(catalogo, e, { tipo: 'modelo', modelo: 'dormi_patagonico' }).estado;
  assert.deepEqual(p.opciones, {});
  assert.equal(p.modalidad, 'media_obra');
  // Al volver al Áureo, sus opciones arrancan de nuevo en las predeterminadas.
  const a = R.aplicar(catalogo, p, { tipo: 'modelo', modelo: 'dormi_aureo' }).estado;
  assert.deepEqual(a.opciones, { trama: 'a', color: 'natural' });
  // Opciones de otro modelo que llegan "colgadas" se quitan y se avisa.
  const n = R.normalizar(catalogo, { modelo: 'cubic', opciones: { color: 'azul' }, modalidad: null });
  assert.deepEqual(n.estado.opciones, {});
  assert.equal(n.cambios.length, 1);
});

test('la trama elige el modelo 3D y el color cambia solo el material "panel"', () => {
  let e = R.crearEstado(catalogo, 'dormi_aureo');
  assert.equal(R.archivo3d(catalogo, e).id, 'dormi_aureo_a');
  assert.deepEqual(R.colorMaterial(catalogo, e), { material: 'panel', hex: null });
  e = R.aplicar(catalogo, e, { tipo: 'opcion', opcion: 'trama', valor: 'b' }).estado;
  e = R.aplicar(catalogo, e, { tipo: 'opcion', opcion: 'color', valor: 'negro' }).estado;
  assert.equal(R.archivo3d(catalogo, e).id, 'dormi_aureo_b');
  assert.deepEqual(R.colorMaterial(catalogo, e), { material: 'panel', hex: '#1c1d21' });
  assert.equal(R.colorMaterial(catalogo, R.crearEstado(catalogo, 'cubic')), null);
  // Un valor inexistente no cambia nada y se explica.
  const r = R.aplicar(catalogo, e, { tipo: 'opcion', opcion: 'color', valor: 'verde' });
  assert.equal(r.estado.opciones.color, 'negro');
  assert.equal(r.cambios.length, 1);
  assert.throws(() => R.aplicar(catalogo, e, { tipo: 'otra' }));
});

test('el código de configuración va y vuelve, y solo usa letras, números, punto, guion y guion bajo', () => {
  for (const m of catalogo.modelos) {
    for (const mod of [null, ...catalogo.modalidades.map((x) => x.id)]) {
      let e = R.crearEstado(catalogo, m.id);
      for (const o of m.opciones) e = R.aplicar(catalogo, e, { tipo: 'opcion', opcion: o.id, valor: o.valores[o.valores.length - 1].id }).estado;
      if (mod) e = R.aplicar(catalogo, e, { tipo: 'modalidad', modalidad: mod }).estado;
      const codigo = R.codificar(e);
      assert.match(codigo, /^[A-Za-z0-9._-]+$/, codigo);
      const r = R.recuperar(catalogo, codigo);
      assert.equal(r.valido, true);
      assert.deepEqual(r.avisos, []);
      assert.deepEqual(r.estado, e);
    }
  }
  assert.equal(R.codificar({ modelo: 'dormi_aureo', opciones: { trama: 'b', color: 'azul' }, modalidad: 'kit' }), 'd1.dormi_aureo.trama-b.color-azul.entrega-kit');
});

test('un código viejo, roto o con datos que ya no existen se recupera sin romper nada', () => {
  const inicial = R.crearEstado(catalogo);
  for (const roto of ['c1.eyJ2IjoiMC4yLjAiLCJtIjoiY3ViaWMifQ', 'basura', 'd1.', 'd1.cubic.sin_guion', 'd1.cubic.color-<b>', 'd1.Cubic', 'x'.repeat(400)]) {
    const r = R.recuperar(catalogo, roto);
    assert.equal(r.valido, false, roto);
    assert.deepEqual(r.estado, inicial, roto);
    assert.equal(r.avisos.length, 1, roto);
  }
  assert.match(R.recuperar(catalogo, 'c1.eyJ2Ijoi').avisos[0], /versión anterior/);
  assert.equal(R.recuperar(catalogo, ''), null);
  // Bien formado pero con un modelo, una opción o una modalidad que no existen.
  const r = R.recuperar(catalogo, 'd1.domo_viejo.color-azul.entrega-alquiler');
  assert.equal(r.valido, true);
  assert.equal(r.estado.modelo, 'dormi_aureo');
  assert.deepEqual(r.estado.opciones, { trama: 'a', color: 'azul' });
  assert.equal(r.estado.modalidad, null);
  assert.equal(r.avisos.length, 2);
  const r2 = R.recuperar(catalogo, 'd1.dormi_aureo.trama-z.color-azul.extra-si');
  assert.deepEqual(r2.estado.opciones, { trama: 'a', color: 'azul' });
  assert.equal(r2.avisos.length, 2);
});

test('ningún precio se muestra en cero: sin dato es "Pendiente de cotización"', () => {
  const P = 'Pendiente de cotización';
  for (const p of [undefined, null, { estado: 'pendiente' }, { estado: 'valor' }, { estado: 'valor', importe: 0, moneda: 'ARS' },
    { estado: 'valor', importe: -5, moneda: 'ARS' }, { estado: 'valor', importe: 1000, moneda: '' }, { estado: 'valor', importe: '1000', moneda: 'ARS' }]) {
    assert.equal(R.textoPrecio(p), P, JSON.stringify(p));
  }
  assert.equal(R.textoPrecio({ estado: 'valor', importe: 12500000, moneda: 'ARS', iva: 'incluido' }), 'ARS 12.500.000 (IVA incluido)');
  assert.equal(R.textoPrecio({ estado: 'valor', importe: 18900, moneda: 'USD', iva: 'no_incluido' }), 'USD 18.900 + IVA');
  for (const m of catalogo.modelos) {
    for (const mod of catalogo.modalidades) {
      const e = { ...R.crearEstado(catalogo, m.id), modalidad: mod.id };
      assert.equal(R.resumen(catalogo, e).precio, P);
    }
  }
});

test('las medidas se escriben con coma decimal y su unidad', () => {
  assert.equal(R.numero(4.747, 2), '4,75');
  assert.equal(R.numero(3, 2), '3');
  assert.equal(R.numero(10, 0), '10');
  assert.equal(R.numero(3.5, 2), '3,5');
  assert.equal(R.textoMedida('piso_area_m2', 15.48), '15,5 m²');
  assert.equal(R.textoMedida('alto_m', 4.747), '4,75 m');
  assert.equal(R.textoMedida('paños_vidriados', 4), '4');
  assert.equal(R.medidasPrincipales({ ancho_m: 7.854, fondo_m: 7.87, alto_m: 4.747 }), '7,85 × 7,87 × 4,75 m');
  assert.equal(R.medidasPrincipales(null), null);
});

test('la composición completa las plantillas con datos del modelo 3D y marca lo pendiente', () => {
  const cat = copia();
  const pat = cat.modelos.find((m) => m.id === 'dormi_patagonico');
  pat.archivos_3d[0].medidas = { ancho_m: 4, fondo_m: 4, alto_m: 4, lado_m: 1.795, puerta_ancho_m: 0.9, puerta_alto_m: 2 };
  pat.archivos_3d[0].puertas = 1;
  pat.composicion = [
    { id: 'p', nombre: 'Planta', plantilla: 'Octogonal, de {lado_m} m de lado', estado: 'confirmado' },
    { id: 'u', nombre: 'Puertas', plantilla: '{puertas}, de {puerta_ancho_m} × {puerta_alto_m} m', estado: 'confirmado' },
    { id: 'v', nombre: 'Paños vidriados', plantilla: '{paños_vidriados}', estado: 'confirmado' },
    { id: 'm', nombre: 'Muros cerrados', estado: 'pendiente', valor: 'no se muestra' },
    { id: 'c', nombre: 'Cubierta', valor: 'Zome', estado: 'confirmado' },
  ];
  const lista = R.composicion(cat, R.crearEstado(cat, 'dormi_patagonico'));
  assert.deepEqual(lista.map((x) => [x.texto, x.pendiente]), [
    ['Octogonal, de 1,8 m de lado', false],
    ['1, de 0,9 × 2 m', false],
    ['A confirmar', true],
    ['A confirmar', true],
    ['Zome', false],
  ]);
});

test('el formulario pide nombre, un teléfono o email válido, localidad y consentimiento', () => {
  assert.deepEqual(R.validarContacto(datosOk), { ok: true, errores: {} });
  assert.equal(R.validarContacto({ ...datosOk, contacto: 'ana@correo.com.ar' }).ok, true);
  assert.equal(R.validarContacto({ ...datosOk, contacto: '+54 9 249 455-1234' }).ok, true);
  const vacio = R.validarContacto({});
  assert.equal(vacio.ok, false);
  assert.deepEqual(Object.keys(vacio.errores).sort(), ['consentimiento', 'contacto', 'localidad', 'nombre']);
  assert.ok(R.validarContacto({ ...datosOk, contacto: 'ana@correo' }).errores.contacto);
  assert.ok(R.validarContacto({ ...datosOk, contacto: '1234' }).errores.contacto);
  assert.ok(R.validarContacto({ ...datosOk, contacto: 'llamame' }).errores.contacto);
  assert.ok(R.validarContacto({ ...datosOk, nombre: '  A ' }).errores.nombre);
  assert.ok(R.validarContacto({ ...datosOk, consentimiento: 'true' }).errores.consentimiento);
  assert.ok(R.validarContacto({ ...datosOk, comentario: 'x'.repeat(1001) }).errores.comentario);
});

test('el texto de la solicitud es exacto', () => {
  let e = R.crearEstado(catalogo, 'dormi_aureo');
  e = R.aplicar(catalogo, e, { tipo: 'opcion', opcion: 'trama', valor: 'b' }).estado;
  e = R.aplicar(catalogo, e, { tipo: 'opcion', opcion: 'color', valor: 'azul' }).estado;
  e = R.aplicar(catalogo, e, { tipo: 'modalidad', modalidad: 'kit' }).estado;
  const med = R.medidasDe(catalogo, e);
  const principales = R.medidasPrincipales(med);
  const esperado = [
    'Solicitud de presupuesto · DOMO BAIRES',
    '',
    'Modelo: Dormi Áureo',
    'Diseño de la trama: Opción B',
    'Color de los paneles: Azul Francia',
    `Medidas (ancho × fondo × alto): ${principales}, según el modelo 3D de DOMO`,
    `Superficie de piso: ${R.textoMedida('piso_area_m2', med.piso_area_m2)}`,
    'Entrega: Kit',
    'Precio: Pendiente de cotización',
    '',
    'Nombre: Ana Pérez',
    'Contacto: 11 5555-1234',
    'Localidad de la obra: Tandil',
    'Comentario: Terreno con pendiente.\nConsulta por plazos.',
    '',
    `Código de configuración: d1.dormi_aureo.trama-b.color-azul.entrega-kit (catálogo ${catalogo.version_catalogo})`,
  ].join('\n');
  const texto = R.textoSolicitud(catalogo, e, { ...datosOk, nombre: '  Ana   Pérez ', comentario: ' Terreno con pendiente.\r\nConsulta por plazos. ' });
  assert.equal(texto, esperado);
  // Sin comentario no aparece la línea; los modelos de diseño único lo dicen.
  const c = R.textoSolicitud(catalogo, { ...R.crearEstado(catalogo, 'cubic'), modalidad: 'llave_en_mano' }, datosOk);
  assert.ok(!/Comentario:/.test(c));
  assert.match(c, /\nDiseño: Diseño único\n/);
  assert.match(c, /\nEntrega: Llave en mano\n/);
  assert.ok(!/@|5555-1234/.test(R.codificar(e)), 'el código no lleva datos personales');
});

test('el resumen corto nombra modelo, diseño y modalidad', () => {
  assert.equal(R.resumenCorto(catalogo, R.crearEstado(catalogo)), 'Dormi Áureo · Opción A · Natural · Entrega sin elegir');
  assert.equal(R.resumenCorto(catalogo, { ...R.crearEstado(catalogo, 'cubic'), modalidad: 'media_obra' }), 'Cubic · Diseño único · Media obra');
});
