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
 * el modo oscuro y un navegador sin WebGL. Guarda capturas ui_*.png.
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
const DATOS = { nombre: 'Ana Pérez', contacto: '11 5555-1234', localidad: 'Tandil, Buenos Aires', comentario: 'Terreno con algo de pendiente.', consentimiento: true };

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
  let y = -1;
  for (let i = 0; i < 20; i++) {
    const ahora = await page.evaluate(() => window.scrollY);
    if (ahora === y) break;
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
    assert.match(await page.textContent('.etapa-cabeza .foto-ref figcaption'), /Foto de referencia/);
    await sinScrollHorizontal(page, 'etapa 2');
  });
  await paso(`${et}: abrir y cerrar las puertas`, async () => {
    const boton = page.locator('#boton-puerta');
    assert.equal((await boton.textContent()).trim(), 'Abrir puertas');
    await boton.click();
    await page.waitForFunction(() => !window.DomoConfigurador.visor.ocupado);
    const angulos = await page.evaluate(() => window.DomoConfigurador.visor.angulosPuertas());
    assert.equal(angulos.length, 2);
    for (const a of angulos) assert.ok(Math.abs(Math.abs(a) - 100) < 0.5, `ángulo ${a}`);
    assert.equal((await page.locator('#boton-puerta').textContent()).trim(), 'Cerrar puertas');
    assert.equal(await page.getAttribute('#boton-puerta', 'aria-pressed'), 'true');
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
    for (const v of ['Frente', 'Lateral', 'Desde arriba', '3/4']) {
      await page.click(`.visor-vistas button[aria-label="${v}"]`);
      await page.waitForFunction(() => !window.DomoConfigurador.visor.ocupado);
      assert.equal(await page.getAttribute(`.visor-vistas button[aria-label="${v}"]`, 'aria-pressed'), 'true');
    }
    await page.click('.visor-vistas button:has-text("Centrar")');
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
    assert.equal(await page.locator('[aria-invalid="true"]').count(), 4, 'marca nombre, contacto, localidad y consentimiento');
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'f-nombre');
    await captura(page, `${et}_4_errores`);
    await page.fill('#f-nombre', DATOS.nombre);
    await page.fill('#f-contacto', 'ana@correo');
    await page.fill('#f-localidad', DATOS.localidad);
    await page.check('#f-consentimiento');
    await page.click('#boton-preparar');
    assert.equal(await page.locator('[aria-invalid="true"]').count(), 1, 'email incompleto');
    await page.fill('#f-contacto', DATOS.contacto);
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
  await paso(`${et}: el indicador de etapas permite volver atrás`, async () => {
    await page.click('#etapas li:nth-child(2) button');
    await page.waitForFunction(() => window.DomoConfigurador.etapa === 1);
    await page.click('#etapas li:nth-child(1) button');
    await page.waitForFunction(() => window.DomoConfigurador.etapa === 0);
    assert.equal(await page.getAttribute('.tarjeta-modelo[data-modelo="dormi_aureo"]', 'aria-pressed'), 'true');
  });
  if (celular) {
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
    await captura(page, 'celular_360_1_modelo');
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
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.logo-oscuro')).display), 'block');
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.logo-claro')).display), 'none');
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
