#!/usr/bin/env node
/*
 * Genera las miniaturas de las tarjetas (imagenes/miniatura_<id>.png) con el
 * mismo visor 3D de la página y la misma configuración (lenguaje de materiales,
 * luz, sombra, vista 3/4 y encuadre centrado), con fondo transparente: en la
 * página se ven sobre el mismo fondo que el visor.
 *
 * Usa Playwright y Chromium (no son dependencias del proyecto). Las librerías
 * de three.js se toman de una copia local (THREE_LOCAL) en vez del CDN.
 * Si un GLB todavía no existe, lo saltea y avisa.
 *
 * Uso: node scripts/miniaturas.js [id ...]
 * Variables: PLAYWRIGHT (ruta del paquete), CHROMIUM (ejecutable), THREE_LOCAL (carpeta del paquete three 0.128.0).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const PW = process.env.PLAYWRIGHT || (() => { try { return require.resolve('playwright'); } catch (e) { return '/opt/node-tools/node_modules/playwright'; } })();
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const THREE_LOCAL = process.env.THREE_LOCAL || '/tmp/claude-0/-home-claude-domo-calculadora/70fb3143-3105-51a2-8103-0f2d7b872278/scratchpad/t/node_modules/three';
const ANCHO = 640;
const ALTO = 480;

/** Respuestas locales para las librerías de three.js que la página pide al CDN. */
const LIBRERIAS = {
  'three.min.js': 'build/three.min.js',
  'GLTFLoader.js': 'examples/js/loaders/GLTFLoader.js',
  'OrbitControls.js': 'examples/js/controls/OrbitControls.js',
  'RoomEnvironment.js': 'examples/js/environments/RoomEnvironment.js',
};
function rutearLibrerias(ruta) {
  const u = ruta.request().url();
  for (const [nombre, rel] of Object.entries(LIBRERIAS)) {
    if (!u.endsWith('/' + nombre)) continue;
    const local = path.join(THREE_LOCAL, rel);
    // Sin copia local, se bajan del CDN (hace falta conexión).
    return fs.existsSync(local) ? ruta.fulfill({ body: fs.readFileSync(local), contentType: 'text/javascript' }) : ruta.continue();
  }
  return null;
}

function optimizarPng(archivo) {
  // Recompresión sin pérdida (la paleta de 256 colores escalonaba los bordes y la sombra).
  // Si no hay Python con Pillow, queda como sale del navegador.
  try {
    execFileSync('python3', ['-c', [
      'import sys',
      'from PIL import Image',
      'p = sys.argv[1]',
      'Image.open(p).save(p, optimize=True)',
    ].join('\n'), archivo], { stdio: 'pipe' });
    return true;
  } catch (e) {
    return false;
  }
}

async function main() {
  const { chromium } = require(PW);
  const catalogo = JSON.parse(fs.readFileSync(path.join(RAIZ, 'catalogo.json'), 'utf8'));
  const pedidos = process.argv.slice(2);
  const archivos = catalogo.modelos.flatMap((m) => m.archivos_3d).filter((a) => !pedidos.length || pedidos.includes(a.id));
  const pagina = `<!doctype html><html><head><meta charset="utf-8"><style>
    :root{--visor-centro:transparent}html,body{margin:0;background:transparent}#v{position:relative;width:${ANCHO}px;height:${ALTO}px}
    .visor-lienzo{position:absolute;inset:0;width:100%;height:100%}</style></head><body><div id="v"></div>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/environments/RoomEnvironment.js"></script>
    <script>${fs.readFileSync(path.join(RAIZ, 'visor.js'), 'utf8')}</script></body></html>`;

  const navegador = await chromium.launch({ executablePath: CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await navegador.newContext({ viewport: { width: ANCHO, height: ALTO }, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: 'light' });
  const page = await ctx.newPage();
  await page.route('**/*', (r) => rutearLibrerias(r) || (r.request().url() === 'http://miniaturas.local/' ? r.fulfill({ body: pagina, contentType: 'text/html' }) : r.abort()));
  page.on('pageerror', (e) => console.error('Error en la página:', e.message));
  await page.goto('http://miniaturas.local/');
  let hechas = 0;
  for (const a of archivos) {
    const glb = path.join(RAIZ, a.archivo);
    if (!fs.existsSync(glb)) { console.warn(`Salteado ${a.id}: falta ${a.archivo}.`); continue; }
    const dataUrl = await page.evaluate(async ({ id, b64 }) => {
      document.querySelectorAll('script[type="application/octet-stream"]').forEach((s) => s.remove());
      const s = document.createElement('script');
      s.type = 'application/octet-stream';
      s.id = 'glb-' + id;
      s.textContent = b64;
      document.body.append(s);
      if (window.__visor) window.__visor.destruir();
      const v = window.DomoVisor.crear(document.getElementById('v'), { soloIncrustados: true, conservarImagen: true });
      window.__visor = v;
      v.tema(false);
      const r = await v.mostrar({ id });
      if (r.estado !== 'listo') throw new Error('No se pudo mostrar ' + id + ': ' + r.estado);
      v.vista('tres_cuartos');
      await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      return v.capturar();
    }, { id: a.id, b64: fs.readFileSync(glb).toString('base64') });
    const destino = path.join(RAIZ, a.miniatura || `imagenes/miniatura_${a.id}.png`);
    fs.writeFileSync(destino, Buffer.from(dataUrl.split(',')[1], 'base64'));
    const opt = optimizarPng(destino);
    console.log(`${path.relative(RAIZ, destino)}: ${Math.round(fs.statSync(destino).size / 1024)} KB${opt ? '' : ' (sin optimizar)'}`);
    hechas++;
  }
  await navegador.close();
  console.log(`${hechas} miniaturas generadas.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
