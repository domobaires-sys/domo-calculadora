#!/usr/bin/env node
/*
 * Prueba de punta a punta del prototipo armado (fuera de "npm test").
 *
 * Arma dist/prototipo.html, lo abre envuelto en un documento mínimo (como lo
 * hace el visor de páginas privadas), recorre las 4 etapas en escritorio
 * (1280×860) y celular (390×844), abre la puerta, cambia trama y color,
 * prepara la solicitud y la copia, y verifica: cero errores en la consola,
 * nada de desplazamiento horizontal, textos exactos y estados de los botones.
 * También prueba un modelo 3D faltante, un enlace compartido, un código viejo,
 * el modo oscuro, un navegador sin WebGL, cambios rápidos de modelo (ir y
 * volver antes de que termine la carga o el fundido), el foco del teclado,
 * la solicitud que se actualiza al cambiar los datos, la dirección (enlace
 * abierto en la misma pestaña, recarga y botón Atrás del navegador) y que el
 * modelo no quede debajo de los botones del visor. Guarda capturas ui_*.png.
 *
 * Usa Playwright y Chromium (no son dependencias del proyecto). Sin conexión:
 * las librerías de three.js salen de una copia local (THREE_LOCAL) y las
 * fuentes de Google se bloquean (se ve la tipografía de respaldo).
 *
 * Uso: node scripts/probar-e2e.js     Variables: CAPTURAS (carpeta), PLAYWRIGHT, CHROMIUM, THREE_LOCAL.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { armar } = require('./armar-prototipo.js');
const R = require('../reglas.js');

const RAIZ = path.join(__dirname, '..');
const PW = process.env.PLAYWRIGHT || (() => { try { return require.resolve('playwright'); } catch (e) { return '/opt/node-tools/node_modules/playwright'; } })();
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const THREE_LOCAL = process.env.THREE_LOCAL || '/tmp/claude-0/-home-claude-domo-calculadora/70fb3143-3105-51a2-8103-0f2d7b872278/scratchpad/t/node_modules/three';
const CAPTURAS = process.env.CAPTURAS || '/tmp/claude-0/-home-claude-domo-calculadora/70fb3143-3105-51a2-8103-0f2d7b872278/scratchpad/ver';
const ORIGEN = 'https://domo.local/'; // https: el portapapeles solo existe en contextos seguros
const LIBRERIAS = {
  'three.min.js': 'build/three.min.js',
  'GLTFLoader.js': 'examples/js/loaders/GLTFLoader.js',
  'OrbitControls.js': 'examples/js/controls/OrbitControls.js',
  'RoomEnvironment.js': 'examples/js/environments/RoomEnvironment.js',
};
const catalogo = JSON.parse(fs.readFileSync(path.join(RAIZ, 'catalogo.json'), 'utf8'));
const DATOS = { nombre: 'Ana Pérez', telefono: '11 5555-1234', email: '', localidad: 'Tandil, Buenos Aires', uso: '', unidades: '1', comentario: 'Terreno con algo de pendiente.', consentimiento: true };

let fallas = 0;
const resultados = [];
async function paso(nombre, fn) {
  try {
    await fn();
    resultados.push(`  ok   ${nombre}`);
  } catch (e) {
    fallas++;
    resultados.push(`  FALLA ${nombre}\n        ${String(e && e.message || e).split('\n').join('\n        ')}`);
  }
}

/** El HTML armado envuelto como lo publica el visor de páginas: doctype, head mínimo y body. */
function documento(html) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>${html}</body></html>`;
}

async function abrir(navegador, html, opciones) {
  const op = Object.assign({ ancho: 1280, alto: 860, hash: '', oscuro: false, sinWebgl: false }, opciones);
  const celular = op.ancho < 600;
  const ctx = await navegador.newContext({
    viewport: { width: op.ancho, height: op.alto }, deviceScaleFactor: 1, isMobile: celular, hasTouch: celular,
    colorScheme: op.oscuro ? 'dark' : 'light', permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await ctx.newPage();
  const errores = [];
  let fuentesBloqueadas = 0;
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const url = (m.location() && m.location().url) || '';
    if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return; // fuentes bloqueadas a propósito
    errores.push(m.text() + (url ? ` (${url})` : ''));
  });
  page.on('pageerror', (e) => errores.push('Error de código: ' + e.message));
  await page.route('**/*', (r) => {
    const u = r.request().url();
    for (const [nombre, rel] of Object.entries(LIBRERIAS)) {
      if (u.endsWith('/' + nombre)) return r.fulfill({ body: fs.readFileSync(path.join(THREE_LOCAL, rel)), contentType: 'text/javascript' });
    }
    if (u.startsWith(ORIGEN)) return r.fulfill({ body: documento(html), contentType: 'text/html; charset=utf-8' });
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) { fuentesBloqueadas++; return r.abort(); }
    errores.push('Pedido inesperado a ' + u);
    return r.abort();
  });
  if (op.sinWebgl) {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (tipo, ...resto) { return /webgl/.test(tipo) ? null : original.call(this, tipo, ...resto); };
    });
  }
  await page.goto(ORIGEN + (op.hash ? '#' + op.hash : ''));
  await page.waitForSelector('#etapa h1');
  return { ctx, page, errores, fuentes: () => fuentesBloqueadas };
}

const esperar3d = (page) => page.waitForFunction(() => {
  const c = window.DomoConfigurador;
  return c && ['listo', 'faltante', 'error', 'sin_webgl', 'sin_libreria'].includes(c.estado3d) && !(c.visor && c.visor.ocupado);
}, null, { timeout: 30000 });

async function sinScrollHorizontal(page, donde) {
  const { ancho, doc, pie } = await page.evaluate(() => ({ ancho: window.innerWidth, doc: document.documentElement.scrollWidth, pie: document.getElementById('pie').getBoundingClientRect() }));
  assert.ok(doc <= ancho, `${donde}: hay desplazamiento horizontal (${doc} > ${ancho})`);
  // El pie queda fijo abajo: con un alto fraccionario, Chromium deja asomar por debajo el texto que pasa detrás.
  assert.ok(Number.isInteger(pie.height), `${donde}: el pie mide ${pie.height} px de alto (tiene que ser entero)`);
}

async function captura(page, nombre) {
  // Espera a que termine cualquier desplazamiento suave antes de sacar la foto.
  // (tres lecturas iguales seguidas: en un navegador lento el desplazamiento avanza a saltos)
  let y = -1;
  let quieto = 0;
  for (let i = 0; i < 40 && quieto < 3; i++) {
    const ahora = await page.evaluate(() => window.scrollY);
    quieto = ahora === y ? quieto + 1 : 0;
    y = ahora;
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(CAPTURAS, `ui_${nombre}.png`) });
}

async function recorrido(navegador, html, ancho, alto, et) {
  const { ctx, page, errores } = await abrir(navegador, html, { ancho, alto });
  const celular = ancho < 600;
  await paso(`${et}: carga el Dormi Áureo (trama A) en 3D`, async () => {
    await esperar3d(page);
    assert.equal(await page.evaluate(() => window.DomoConfigurador.estado3d), 'listo');
    assert.equal(await page.evaluate(() => window.DomoConfigurador.visor.modeloActual), 'dormi_aureo_a');
    assert.equal(await page.locator('.tarjeta-modelo').count(), 3);
    assert.deepEqual(await page.locator('.tm-nombre').allTextContents(), ['Dormi Áureo', 'Dormi Patagónico', 'Cubic']);
    assert.equal(await page.getAttribute('.tarjeta-modelo[data-modelo="dormi_aureo"]', 'aria-pressed'), 'true');
    assert.match(await page.textContent('#visor-rotulo'), /\d+,\d+ × \d+,\d+ × \d+,\d+ m/);
    assert.match(await page.textContent('#pie'), /Pendiente de cotización/);
    await sinScrollHorizontal(page, 'etapa 1');
    await captura(page, `${et}_1_modelo`);
  });
  await paso(`${et}: elegir otro modelo lo marca y cambia el 3D`, async () => {
    for (const id of ['dormi_patagonico', 'cubic', 'dormi_aureo']) {
      await page.click(`.tarjeta-modelo[data-modelo="${id}"]`);
      await page.waitForFunction((m) => window.DomoConfigurador.estado.modelo === m, id);
      await esperar3d(page);
      assert.equal(await page.getAttribute(`.tarjeta-modelo[data-modelo="${id}"]`, 'aria-pressed'), 'true');
      const a = R.archivo3d(catalogo, R.crearEstado(catalogo, id));
      if (a.estado === 'listo') assert.equal(await page.evaluate(() => window.DomoConfigurador.visor.modeloActual), a.id);
      if (id === 'dormi_patagonico' && !celular) await captura(page, `${et}_1_modelo_patagonico`);
    }
  });
  await paso(`${et}: etapa 2 cambia la trama y el color de los paneles`, async () => {
    await page.click('#boton-siguiente');
    await page.waitForFunction(() => window.DomoConfigurador.etapa === 1);
    assert.equal(await page.locator('.opcion-trama').count(), 2);
    assert.deepEqual(await page.locator('.muestra-nombre').allTextContents(), ['Natural', 'Azul Francia', 'Blanco', 'Negro']);
    const natural = await page.evaluate(() => window.DomoConfigurador.visor.colorDe('panel'));
    await page.click('.opcion-trama[data-valor="b"]');
    await page.waitForFunction(() => window.DomoConfigurador.visor.modeloActual === 'dormi_aureo_b');
    await esperar3d(page);
    assert.equal(await page.getAttribute('.opcion-trama[data-valor="b"]', 'aria-pressed'), 'true');
    await page.click('.muestra[data-valor="azul"]');
    await page.waitForFunction(() => !window.DomoConfigurador.visor.ocupado);
    assert.equal(await page.evaluate(() => window.DomoConfigurador.visor.colorDe('panel')), '#1f3f8f');
    assert.notEqual(await page.evaluate(() => window.DomoConfigurador.visor.colorDe('incrustacion')), '#1f3f8f', 'la incrustación no cambia');
    await page.click('.muestra[data-valor="natural"]');
    await page.waitForFunction(() => !window.DomoConfigurador.visor.ocupado);
    assert.equal(await page.evaluate(() => window.DomoConfigurador.visor.colorDe('panel')), natural, '"Natural" vuelve al color del archivo');
    await page.click('.muestra[data-valor="azul"]');
    await page.waitForFunction(() => !window.DomoConfigurador.visor.ocupado);
    assert.match(await page.textContent('#pie'), /Opción B · Azul Francia/);
    assert.match(await page.textContent('.etapa-cabeza .foto-ref figcaption'), /Imagen de referencia/);
    // Las miniaturas de las tramas siguen el color elegido.
    assert.match(await page.getAttribute('.opcion-trama[data-valor="a"] img.solo-claro', 'src'), /^data:image\/webp/);
    assert.equal(await page.locator('.muestra[aria-pressed="true"] .marca-seleccion').count(), 1, 'la muestra elegida lleva la marca con tilde');
    await sinScrollHorizontal(page, 'etapa 2');
  });
  await paso(`${et}: abrir y cerrar las puertas`, async () => {
    const boton = page.locator('#boton-puerta');
    assert.equal(await boton.getAttribute('aria-label'), 'Abrir puertas');
    const anchoCerrado = (await boton.boundingBox()).width;
    const altoAcciones = (await page.locator('#visor-acciones').boundingBox()).height;
    await boton.click();
    await page.waitForFunction(() => !window.DomoConfigurador.visor.ocupado);
    const angulos = await page.evaluate(() => window.DomoConfigurador.visor.angulosPuertas());
    assert.equal(angulos.length, 2);
    for (const a of angulos) assert.ok(Math.abs(Math.abs(a) - 100) < 0.5, `ángulo ${a}`);
    assert.equal(await page.getAttribute('#boton-puerta', 'aria-label'), 'Cerrar puertas');
    assert.equal(await page.getAttribute('#boton-puerta', 'aria-pressed'), 'true');
    // El botón no cambia de ancho ni los botones de arriba cambian de renglón.
    assert.equal((await page.locator('#boton-puerta').boundingBox()).width, anchoCerrado);
    assert.equal((await page.locator('#visor-acciones').boundingBox()).height, altoAcciones);
    if (!celular) await page.click('.visor-vistas button[aria-label="Frente"]');
    await page.waitForFunction(() => !window.DomoConfigurador.visor.ocupado);
    await captura(page, `${et}_2_diseno_puertas_abiertas`);
    if (!celular) await page.click('.visor-vistas button[aria-label="3/4"]');
    await page.click('#boton-puerta');
    await page.waitForFunction(() => !window.DomoConfigurador.visor.ocupado);
    assert.deepEqual((await page.evaluate(() => window.DomoConfigurador.visor.angulosPuertas())).map(Math.abs), [0, 0]);
    await captura(page, `${et}_2_diseno`);
  });
  await paso(`${et}: los botones de vista mueven la cámara`, async () => {
    const tresCuartos = await page.evaluate(() => window.DomoConfigurador.visor.orientacion);
    for (const v of ['Frente', 'Lateral', 'Desde arriba', '3/4']) {
      await page.click(`.visor-vistas button[aria-label="${v}"]`);
      await page.waitForFunction(() => !window.DomoConfigurador.visor.ocupado);
      assert.equal(await page.getAttribute(`.visor-vistas button[aria-label="${v}"]`, 'aria-pressed'), 'true');
    }
    await page.click('[data-vista="centrar"]');
    await page.waitForFunction(() => !window.DomoConfigurador.visor.ocupado);
    // Girar a mano desmarca la vista elegida (mientras la cámara se mueve sola, el giro a mano no se toma).
    const caja = await page.locator('.visor-lienzo').boundingBox();
    await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
    await page.mouse.down();
    await page.mouse.move(caja.x + caja.width / 2 + 80, caja.y + caja.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.waitForFunction(() => !window.DomoConfigurador.visor.ocupado);
    assert.equal(await page.locator('.vistas-grupo [aria-pressed="true"]').count(), 0, 'después de girar no queda ninguna vista marcada');
    // Elegir una vista justo después de girar: la cámara llega y se queda ahí (sin envión del giro).
    await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
    await page.mouse.down();
    await page.mouse.move(caja.x + caja.width / 2 + 150, caja.y + caja.height / 2 + 20, { steps: 3 });
    await page.mouse.up();
    await page.click('.visor-vistas button[aria-label="3/4"]');
    await page.waitForFunction(() => !window.DomoConfigurador.visor.ocupado);
    await page.waitForTimeout(1500);
    assert.deepEqual(await page.evaluate(() => window.DomoConfigurador.visor.orientacion), tresCuartos, 'la cámara queda en 3/4');
    assert.equal(await page.getAttribute('.visor-vistas button[aria-label="3/4"]', 'aria-pressed'), 'true');
  });
  await paso(`${et}: etapa 3 muestra las tres modalidades y exige elegir una`, async () => {
    await page.click('#boton-siguiente');
    await page.waitForFunction(() => window.DomoConfigurador.etapa === 2);
    assert.deepEqual(await page.locator('.opcion-entrega .opcion-nombre').allTextContents(), ['Kit', 'Media obra', 'Llave en mano']);
    assert.equal(await page.locator('.opcion-entrega .precio:has-text("Pendiente de cotización")').count(), 3);
    await page.click('#boton-siguiente');
    assert.equal(await page.evaluate(() => window.DomoConfigurador.etapa), 2, 'sin modalidad no avanza');
    assert.equal(await page.locator('#error-modalidad').count(), 1);
    await page.click('.opcion-entrega[data-modalidad="media_obra"]');
    assert.equal(await page.getAttribute('.opcion-entrega[data-modalidad="media_obra"]', 'aria-pressed'), 'true');
    await sinScrollHorizontal(page, 'etapa 3');
    await captura(page, `${et}_3_entrega`);
  });
  const esperado = R.textoSolicitud(catalogo, { v: catalogo.version_catalogo, modelo: 'dormi_aureo', opciones: { trama: 'b', color: 'azul' }, modalidad: 'media_obra' }, DATOS);
  await paso(`${et}: etapa 4 valida el formulario y prepara la solicitud exacta`, async () => {
    await page.click('#boton-siguiente');
    await page.waitForFunction(() => window.DomoConfigurador.etapa === 3);
    assert.match(await page.textContent('.resumen'), /Pendiente de cotización/);
    assert.match(await page.textContent('.resumen'), /según el modelo 3D de DOMO/);
    await page.click('#boton-preparar');
    assert.equal(await page.locator('[aria-invalid="true"]').count(), 5, 'marca nombre, teléfono y email (falta uno de los dos), localidad y consentimiento');
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'f-nombre');
    await captura(page, `${et}_4_errores`);
    await page.fill('#f-nombre', DATOS.nombre);
    await page.fill('#f-email', 'ana@correo');
    await page.fill('#f-localidad', DATOS.localidad);
    await page.check('#f-consentimiento');
    await page.click('#boton-preparar');
    assert.equal(await page.locator('[aria-invalid="true"]').count(), 1, 'email incompleto');
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'f-email');
    await page.fill('#f-email', '');
    await page.fill('#f-telefono', DATOS.telefono);
    await page.fill('#f-comentario', DATOS.comentario);
    await page.click('#boton-preparar');
    await page.waitForSelector('#solicitud-texto');
    assert.equal(await page.textContent('#solicitud-texto'), esperado);
    await sinScrollHorizontal(page, 'etapa 4');
    await captura(page, `${et}_4_solicitud`);
  });
  await paso(`${et}: copiar la solicitud y el enlace de la configuración`, async () => {
    await page.click('#boton-copiar');
    await page.waitForFunction(() => /Copiado|Seleccionado/.test(document.getElementById('boton-copiar').textContent));
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), esperado);
    await page.click('#boton-enlace');
    await page.waitForFunction(() => /Copiado|Seleccionado/.test(document.getElementById('boton-enlace').textContent));
    const enlace = await page.evaluate(() => navigator.clipboard.readText());
    assert.equal(enlace, ORIGEN + '#d1.dormi_aureo.trama-b.color-azul.entrega-media_obra');
    const hash = await page.evaluate(() => location.hash.slice(1));
    assert.match(hash, /^[A-Za-z0-9._-]+$/);
    assert.ok(!/Ana|5555|Tandil/.test(hash), 'el enlace no lleva datos personales');
  });
  await paso(`${et}: si cambian los datos, la solicitud se actualiza o se retira`, async () => {
    await page.fill('#f-nombre', 'Juan Gómez');
    assert.match(await page.textContent('#solicitud-texto'), /\nNombre: Juan Gómez\n/);
    assert.equal((await page.textContent('#boton-copiar')).trim(), 'Copiar', 'el botón vuelve a "Copiar" con el texto nuevo');
    await page.click('#boton-mas');
    assert.match(await page.textContent('#solicitud-texto'), /\nCantidad de unidades: 2\n/);
    await page.click('#boton-menos');
    await page.uncheck('#f-consentimiento');
    assert.equal(await page.locator('#solicitud-texto').count(), 0, 'sin consentimiento no queda nada para copiar');
    await page.check('#f-consentimiento');
    await page.fill('#f-nombre', DATOS.nombre);
    await page.click('#boton-preparar');
    await page.waitForSelector('#solicitud-texto');
    assert.equal(await page.textContent('#solicitud-texto'), esperado);
  });
  await paso(`${et}: el indicador de etapas permite volver atrás`, async () => {
    await page.click('#etapas li:nth-child(2) button');
    await page.waitForFunction(() => window.DomoConfigurador.etapa === 1);
    await page.click('#etapas li:nth-child(1) button');
    await page.waitForFunction(() => window.DomoConfigurador.etapa === 0);
    assert.equal(await page.getAttribute('.tarjeta-modelo[data-modelo="dormi_aureo"]', 'aria-pressed'), 'true');
  });
  await paso(`${et}: el botón Atrás del navegador vuelve a la etapa anterior`, async () => {
    await page.goBack();
    await page.waitForFunction(() => window.DomoConfigurador.etapa === 1);
    await page.goBack();
    await page.waitForFunction(() => window.DomoConfigurador.etapa === 3);
    assert.equal(await page.evaluate(() => location.origin), new URL(ORIGEN).origin, 'sigue en el configurador');
    await page.goForward();
    await page.waitForFunction(() => window.DomoConfigurador.etapa === 1);
    assert.equal(await page.evaluate(() => location.hash), '#d1.dormi_aureo.trama-b.color-azul.entrega-media_obra', 'la configuración no cambia al moverse por el historial');
  });
  if (celular) {
    await paso(`${et}: la barra inferior mide lo mismo en todas las etapas y no corta ningún texto`, async () => {
      const medidas = [];
      for (let i = 0; i < 4; i++) {
        await page.evaluate((n) => document.querySelector(`#etapas [data-etapa="${n}"]`).click(), i);
        await page.waitForFunction((n) => window.DomoConfigurador.etapa === n, i);
        medidas.push(await page.evaluate(() => {
          const pie = document.getElementById('pie');
          const cortados = [...pie.querySelectorAll('p, span')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible').map((e) => e.textContent);
          return { alto: pie.getBoundingClientRect().height, cortados };
        }));
      }
      assert.deepEqual(medidas.map((m) => m.cortados).flat(), [], 'textos cortados en la barra');
      assert.equal(new Set(medidas.map((m) => m.alto)).size, 1, `alto de la barra por etapa: ${medidas.map((m) => m.alto).join(', ')}`);
    });
    await paso(`${et}: la barra inferior queda fija y a la vista`, async () => {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(200);
      const r = await page.evaluate(() => { const b = document.getElementById('pie').getBoundingClientRect(); return { abajo: b.bottom, alto: window.innerHeight, posicion: getComputedStyle(document.getElementById('pie')).position }; });
      assert.equal(r.posicion, 'fixed');
      assert.ok(Math.abs(r.abajo - r.alto) < 1, `barra en ${r.abajo} de ${r.alto}`);
      await captura(page, `${et}_1_modelo_abajo`);
    });
  }
  await paso(`${et}: cero errores en la consola`, async () => { assert.deepEqual(errores, []); });
  await ctx.close();
}

async function main() {
  fs.mkdirSync(CAPTURAS, { recursive: true });
  const { html, avisos } = armar();
  fs.mkdirSync(path.join(RAIZ, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(RAIZ, 'dist', 'prototipo.html'), html);
  for (const a of avisos) console.warn('Aviso del armado: ' + a);

  await paso('el HTML armado cumple el contrato de la página privada', async () => {
    assert.ok(html.startsWith('<title>Configurador DOMO BAIRES</title>\n<meta name="claude:viewport-fit-sides" content="cover">'));
    assert.ok(!/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(html));
    assert.ok(!/\balert\(|\bconfirm\(|\bprompt\(|window\.print|mailto:/.test(html));
  });

  const { chromium } = require(PW);
  const navegador = await chromium.launch({ executablePath: CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

  await recorrido(navegador, html, 1280, 860, 'escritorio');
  await recorrido(navegador, html, 390, 844, 'celular');

  await paso('pantalla angosta (360 px): nada se sale ni se tapa', async () => {
    const { ctx, page, errores } = await abrir(navegador, html, { ancho: 360, alto: 760 });
    await esperar3d(page);
    await sinScrollHorizontal(page, '360 px');
    const r = await page.evaluate(() => {
      const texto = (el) => { const g = document.createRange(); g.selectNodeContents(el); return g.getBoundingClientRect(); };
      const titulo = texto(document.querySelector('.marca-titulo')).right;
      const sello = document.querySelector('.sello').getBoundingClientRect().left;
      const fuera = [...document.querySelectorAll('.tarjeta-modelo')].filter((t) => texto(t.querySelector('.tm-medidas')).right > t.querySelector('.tm-texto').getBoundingClientRect().right + 1).length;
      return { titulo, sello, fuera };
    });
    assert.ok(r.titulo < r.sello, `el título de la marca (hasta ${r.titulo}) queda debajo del sello (desde ${r.sello})`);
    assert.equal(r.fuera, 0, 'las medidas de las tarjetas quedan dentro de la tarjeta');
    // El rótulo del visor nunca corta una cifra en dos renglones.
    const rotulo = await page.evaluate(() => { const c = document.querySelector('.rotulo-cifra'); const r = document.createRange(); r.selectNodeContents(c); return r.getClientRects().length; });
    assert.equal(rotulo, 1, 'las medidas del rótulo quedan en un renglón');
    await captura(page, 'celular_360_1_modelo');
    assert.deepEqual(errores, []);
    await ctx.close();
  });

  await paso('el modelo no queda debajo de los botones del visor (390 y 360 px, las cuatro vistas)', async () => {
    for (const [ancho, alto] of [[390, 844], [360, 740]]) {
      for (const hash of ['d1.dormi_aureo.trama-a', 'd1.dormi_patagonico', 'd1.cubic']) {
        const { ctx, page, errores } = await abrir(navegador, html, { ancho, alto, hash });
        await esperar3d(page);
        for (const v of ['frente', 'tres_cuartos', 'lateral']) {
          await page.click(`[data-vista="${v}"]`);
          await page.waitForFunction(() => !window.DomoConfigurador.visor.ocupado);
          // Filas del lienzo con algo dibujado (alfa > 0) dentro de la franja de los botones.
          const r = await page.evaluate(() => {
            const visor = window.DomoConfigurador.visor;
            const img = new Image();
            return new Promise((ok) => {
              img.onload = () => {
                const c = document.createElement('canvas');
                c.width = img.width; c.height = img.height;
                const g = c.getContext('2d');
                g.drawImage(img, 0, 0);
                const d = g.getImageData(0, 0, c.width, c.height).data;
                const caja = document.getElementById('visor').getBoundingClientRect();
                const escala = c.height / caja.height;
                const franja = (el) => { const b = el.getBoundingClientRect(); return [Math.floor((b.top - caja.top) * escala), Math.ceil((b.bottom - caja.top) * escala), Math.floor((b.left - caja.left) * escala), Math.ceil((b.right - caja.left) * escala)]; };
                // Solo cuenta lo opaco del modelo (no la sombra suave del suelo, alfa bajo).
                const tapado = (y0, y1, x0, x1) => { let n = 0; for (let y = Math.max(0, y0); y < Math.min(c.height, y1); y++) for (let x = Math.max(0, x0); x < Math.min(c.width, x1); x++) if (d[(y * c.width + x) * 4 + 3] > 200) n++; return n; };
                const zonas = ['visor-acciones', 'visor-rotulo', 'visor-vistas'].map((id) => document.getElementById(id)).filter((e) => e.childElementCount);
                ok(zonas.map((e) => tapado(...franja(e))).reduce((a, b) => a + b, 0));
              };
              img.src = visor.capturar();
            });
          });
          assert.ok(r < 40, `${ancho} px, ${hash}, vista ${v}: ${r} px del modelo debajo de los botones`);
        }
        assert.deepEqual(errores, []);
        await ctx.close();
      }
    }
  });

  await paso('cambios rápidos de modelo: el visor nunca queda vacío ni sin botones', async () => {
    for (const reducido of [false, true]) {
      const { ctx, page, errores } = await abrir(navegador, html, { hash: 'd1.cubic', reducido });
      await esperar3d(page);
      const revisar = async (donde, id) => {
        await page.waitForTimeout(1200);
        await esperar3d(page);
        const r = await page.evaluate(() => ({
          actual: window.DomoConfigurador.visor.modeloActual, e3d: window.DomoConfigurador.estado3d,
          visible: window.DomoConfigurador.visor.visible, opacidad: getComputedStyle(document.querySelector('.visor-lienzo')).opacity,
          botones: document.querySelectorAll('#visor-acciones button, #visor-vistas button').length,
        }));
        assert.deepEqual(r, { actual: id, e3d: 'listo', visible: true, opacidad: '1', botones: 7 }, `${donde} (movimiento ${reducido ? 'reducido' : 'normal'})`);
      };
      // Un modelo ya cargado y vuelta al actual a los 60 ms (antes del fundido de 180 ms).
      await page.click('#etapas [data-etapa="0"]');
      await page.click('.tarjeta-modelo[data-modelo="dormi_patagonico"]');
      await esperar3d(page);
      await page.click('.tarjeta-modelo[data-modelo="cubic"]');
      await esperar3d(page);
      await page.click('.tarjeta-modelo[data-modelo="dormi_patagonico"]');
      await page.waitForTimeout(60);
      await page.click('.tarjeta-modelo[data-modelo="cubic"]');
      await revisar('Patagónico y vuelta a Cubic a los 60 ms', 'cubic');
      // Un modelo sin cargar y vuelta al actual en el mismo instante.
      await page.evaluate(() => {
        document.querySelector('.tarjeta-modelo[data-modelo="dormi_aureo"]').click();
        document.querySelector('.tarjeta-modelo[data-modelo="cubic"]').click();
      });
      await revisar('Áureo (sin cargar) y vuelta a Cubic en el mismo instante', 'cubic');
      // Trama B y trama A en el mismo instante.
      await page.click('.tarjeta-modelo[data-modelo="dormi_aureo"]');
      await esperar3d(page);
      await page.click('#etapas [data-etapa="1"]');
      await page.evaluate(() => {
        document.querySelector('.opcion-trama[data-valor="b"]').click();
        document.querySelector('.opcion-trama[data-valor="a"]').click();
      });
      await revisar('trama B y trama A en el mismo instante', 'dormi_aureo_a');
      assert.deepEqual(errores, []);
      await ctx.close();
    }
  });

  await paso('el teclado no pierde su lugar al elegir', async () => {
    const { ctx, page, errores } = await abrir(navegador, html, {});
    await esperar3d(page);
    const foco = () => page.evaluate(() => { const a = document.activeElement; return a && a !== document.body ? (a.id || a.dataset.modelo || a.dataset.valor || a.dataset.vista || a.dataset.modalidad || a.dataset.etapa) : 'BODY'; });
    await page.focus('.tarjeta-modelo[data-modelo="cubic"]');
    await page.keyboard.press('Enter');
    assert.equal(await foco(), 'cubic');
    await esperar3d(page);
    assert.equal(await foco(), 'cubic', 'sigue en la tarjeta cuando el 3D queda listo');
    await page.focus('#boton-puerta');
    await page.keyboard.press('Enter');
    assert.equal(await foco(), 'boton-puerta');
    await esperar3d(page);
    await page.focus('[data-vista="lateral"]');
    await page.keyboard.press('Enter');
    assert.equal(await foco(), 'lateral');
    await page.click('#boton-siguiente');
    await page.waitForFunction(() => window.DomoConfigurador.etapa === 1);
    await page.click('#boton-siguiente');
    await page.waitForFunction(() => window.DomoConfigurador.etapa === 2);
    await page.focus('.opcion-entrega[data-modalidad="kit"]');
    await page.keyboard.press('Space');
    assert.equal(await foco(), 'kit');
    assert.deepEqual(errores, []);
    await ctx.close();
  });

  await paso('dirección: un enlace abierto en la misma pestaña se aplica y una recarga no se toma como enlace', async () => {
    const { ctx, page, errores } = await abrir(navegador, html, {});
    await esperar3d(page);
    await page.click('.tarjeta-modelo[data-modelo="cubic"]');
    await esperar3d(page);
    await page.reload();
    await page.waitForSelector('#etapa h1');
    await esperar3d(page);
    assert.equal(await page.evaluate(() => window.DomoConfigurador.etapa), 0, 'la recarga vuelve a la misma etapa');
    assert.equal((await page.textContent('#avisos')).trim(), '', 'la recarga no muestra el aviso de configuración compartida');
    assert.equal(await page.evaluate(() => window.DomoConfigurador.estado.modelo), 'cubic');
    await page.evaluate(() => { location.hash = '#d1.dormi_aureo.trama-b.color-azul.entrega-kit'; });
    await page.waitForFunction(() => window.DomoConfigurador.estado.modelo === 'dormi_aureo');
    await esperar3d(page);
    assert.deepEqual(await page.evaluate(() => window.DomoConfigurador.estado), { v: catalogo.version_catalogo, modelo: 'dormi_aureo', opciones: { trama: 'b', color: 'azul' }, modalidad: 'kit' });
    assert.equal(await page.evaluate(() => window.DomoConfigurador.visor.modeloActual), 'dormi_aureo_b');
    assert.match(await page.textContent('#avisos'), /configuración compartida/);
    // El aviso se va al cambiar de etapa.
    await page.click('#etapas [data-etapa="1"]');
    assert.equal((await page.textContent('#avisos')).trim(), '');
    assert.deepEqual(errores, []);
    await ctx.close();
  });

  await paso('el Dormi Patagónico y el Cubic muestran "Diseño único" y su composición', async () => {
    for (const id of ['dormi_patagonico', 'cubic']) {
      const { ctx, page, errores } = await abrir(navegador, html, { hash: `d1.${id}` });
      await esperar3d(page);
      assert.equal(await page.evaluate(() => window.DomoConfigurador.etapa), 1);
      assert.match(await page.textContent('.diseno-unico'), /Diseño único/);
      assert.equal(await page.locator('.ficha .fila').count() >= 5, true);
      await captura(page, `escritorio_2_diseno_${id}`);
      if (id === 'dormi_patagonico') {
        await page.click('#boton-puerta');
        await page.waitForFunction(() => !window.DomoConfigurador.visor.ocupado);
        await page.click('.visor-vistas button[aria-label="Frente"]');
        await page.waitForFunction(() => !window.DomoConfigurador.visor.ocupado);
        const [a] = await page.evaluate(() => window.DomoConfigurador.visor.angulosPuertas());
        assert.ok(a < 0, 'bisagra a la izquierda: giro negativo');
        await captura(page, `escritorio_2_diseno_${id}_puerta`);
      }
      if (id === 'cubic') {
        await page.click('#boton-puerta');
        await page.waitForFunction(() => !window.DomoConfigurador.visor.ocupado);
        const [a] = await page.evaluate(() => window.DomoConfigurador.visor.angulosPuertas());
        assert.ok(a > 0, 'bisagra a la derecha: giro positivo');
        await captura(page, `escritorio_2_diseno_${id}_puerta`);
      }
      assert.deepEqual(errores, []);
      await ctx.close();
    }
  });

  await paso('un GLB faltante muestra "Modelo 3D en preparación" sin romper nada', async () => {
    const sinCubic = html.replace(/<script type="application\/octet-stream" id="glb-cubic">[^<]*<\/script>\n?/, '');
    assert.notEqual(sinCubic, html);
    const { ctx, page, errores } = await abrir(navegador, sinCubic, { hash: 'd1.cubic' });
    await esperar3d(page);
    assert.equal(await page.evaluate(() => window.DomoConfigurador.estado3d), 'faltante');
    assert.match(await page.textContent('#visor-capa'), /Modelo 3D en preparación/);
    await captura(page, 'escritorio_glb_faltante');
    await page.click('#etapas li:nth-child(1) button');
    await page.click('.tarjeta-modelo[data-modelo="dormi_aureo"]');
    await page.waitForFunction(() => window.DomoConfigurador.visor.modeloActual === 'dormi_aureo_a');
    await esperar3d(page);
    assert.equal(await page.evaluate(() => window.DomoConfigurador.estado3d), 'listo');
    assert.deepEqual(errores, []);
    await ctx.close();
  });

  await paso('un enlace compartido abre esa configuración; uno viejo avisa y arranca de cero', async () => {
    let s = await abrir(navegador, html, { hash: 'd1.dormi_aureo.trama-b.color-negro.entrega-kit' });
    await esperar3d(s.page);
    assert.deepEqual(await s.page.evaluate(() => window.DomoConfigurador.estado), { v: catalogo.version_catalogo, modelo: 'dormi_aureo', opciones: { trama: 'b', color: 'negro' }, modalidad: 'kit' });
    assert.equal(await s.page.evaluate(() => window.DomoConfigurador.etapa), 3);
    assert.equal(await s.page.evaluate(() => window.DomoConfigurador.visor.colorDe('panel')), '#1c1d21');
    assert.deepEqual(s.errores, []);
    await s.ctx.close();
    s = await abrir(navegador, html, { hash: 'c1.eyJ2IjoiMC4yLjAiLCJtIjoiY3ViaWMifQ' });
    await esperar3d(s.page);
    assert.match(await s.page.textContent('#avisos'), /versión anterior/);
    assert.equal(await s.page.evaluate(() => window.DomoConfigurador.estado.modelo), 'dormi_aureo');
    await captura(s.page, 'escritorio_codigo_viejo');
    assert.deepEqual(s.errores, []);
    await s.ctx.close();
  });

  await paso('modo oscuro: tema propio y logo blanco', async () => {
    for (const [ancho, alto, et] of [[1280, 860, 'escritorio'], [390, 844, 'celular']]) {
      const { ctx, page, errores } = await abrir(navegador, html, { oscuro: true, ancho, alto, hash: 'd1.dormi_aureo.trama-a.color-blanco' });
      await esperar3d(page);
      const fondo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      assert.equal(fondo, 'rgb(17, 18, 20)');
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.logo.solo-oscuro')).display), 'block');
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.logo.solo-claro')).display), 'none');
      // Las miniaturas también tienen su versión oscura (misma luz y sombra que el visor en oscuro).
      const visibles = await page.evaluate(() => {
        const ver = (sel) => [...document.querySelectorAll(sel)].filter((i) => getComputedStyle(i).display !== 'none').length;
        return { oscuras: ver('.miniatura img.solo-oscuro'), claras: ver('.miniatura img.solo-claro') };
      });
      assert.equal(visibles.claras, 0, 'en oscuro no se ve ninguna miniatura clara');
      assert.ok(visibles.oscuras >= 2, `en la etapa 2 se ven las miniaturas oscuras de las tramas (${visibles.oscuras})`);
      await captura(page, `${et}_oscuro_2_diseno`);
      assert.deepEqual(errores, []);
      await ctx.close();
    }
  });

  await paso('sin WebGL se ve la foto de referencia con un aviso', async () => {
    const { ctx, page, errores } = await abrir(navegador, html, { sinWebgl: true });
    await page.waitForSelector('.visor-aviso');
    assert.match(await page.textContent('#visor-capa'), /no puede mostrar el 3D/);
    assert.equal(await page.locator('.visor-aviso img').count(), 1);
    await page.click('#boton-siguiente');
    assert.equal(await page.evaluate(() => window.DomoConfigurador.etapa), 1, 'se puede seguir configurando');
    await captura(page, 'escritorio_sin_webgl');
    assert.deepEqual(errores, []);
    await ctx.close();
  });

  await navegador.close();
  console.log(resultados.join('\n'));
  console.log(`\n${resultados.length - fallas} de ${resultados.length} pasos bien. Capturas en ${CAPTURAS}`);
  process.exit(fallas ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
