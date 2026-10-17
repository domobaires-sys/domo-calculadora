#!/usr/bin/env node
/*
 * Genera las miniaturas de las tarjetas con el mismo visor 3D de la página y la
 * misma configuración (lenguaje de materiales, luz, sombra, vista 3/4 y encuadre
 * centrado), con fondo transparente: en la página se ven sobre el mismo fondo
 * que el visor.
 *
 * Por cada archivo 3D (catálogo: archivos_3d[].miniatura, por ejemplo
 * imagenes/miniatura_dormi_aureo_a.webp) escribe:
 *   - <base>.webp           tema claro (la luz, la sombra y la exposición del visor en claro)
 *   - <base>-oscuro.webp    tema oscuro (las del visor en oscuro)
 *   - <base>-<color>.webp y <base>-<color>-oscuro.webp, por cada color de paneles del
 *     modelo (opción color_material con hex): así la trama se ve en el color elegido.
 * Se dibujan al doble (720 × 540) y se achican a 360 × 270 (casi el doble del tamaño más
 * grande en que se muestran), en WebP con transparencia.
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
const ANCHO = 360;  // tamaño final
const ALTO = 270;
const ESCALA = 2;   // se dibuja al doble y se achica: bordes y sombra más limpios

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

/** Achica la captura (PNG al doble) y la guarda en WebP con transparencia. Necesita Python con Pillow. */
function guardarWebp(png, destino) {
  execFileSync('python3', ['-c', [
    'import sys, io',
    'from PIL import Image',
    'im = Image.open(io.BytesIO(sys.stdin.buffer.read())).convert("RGBA")',
    `im = im.resize((${ANCHO}, ${ALTO}), Image.LANCZOS)`,
    'im.save(sys.argv[1], "WEBP", quality=82, alpha_quality=70, method=6)',
  ].join('\n'), destino], { input: png, stdio: ['pipe', 'pipe', 'pipe'] });
}

async function main() {
  const { chromium } = require(PW);
  const catalogo = JSON.parse(fs.readFileSync(path.join(RAIZ, 'catalogo.json'), 'utf8'));
  const pedidos = process.argv.slice(2);
  const archivos = catalogo.modelos.flatMap((m) => m.archivos_3d).filter((a) => !pedidos.length || pedidos.includes(a.id));
  const pagina = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;background:transparent}#v{position:relative;width:${ANCHO * ESCALA}px;height:${ALTO * ESCALA}px}
    .visor-lienzo{position:absolute;inset:0;width:100%;height:100%}</style></head><body><div id="v"></div>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/environments/RoomEnvironment.js"></script>
    <script>${fs.readFileSync(path.join(RAIZ, 'visor.js'), 'utf8')}</script></body></html>`;

  const navegador = await chromium.launch({ executablePath: CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await navegador.newContext({ viewport: { width: ANCHO * ESCALA, height: ALTO * ESCALA }, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: 'light' });
  const page = await ctx.newPage();
  await page.route('**/*', (r) => rutearLibrerias(r) || (r.request().url() === 'http://miniaturas.local/' ? r.fulfill({ body: pagina, contentType: 'text/html' }) : r.abort()));
  page.on('pageerror', (e) => console.error('Error en la página:', e.message));
  await page.goto('http://miniaturas.local/');
  let hechas = 0;
  for (const a of archivos) {
    const glb = path.join(RAIZ, a.archivo);
    if (!fs.existsSync(glb)) { console.warn(`Salteado ${a.id}: falta ${a.archivo}.`); continue; }
    const m = catalogo.modelos.find((x) => x.archivos_3d.includes(a));
    // Colores de los paneles con miniatura propia: los valores con hex de la opción color_material.
    const opcionColor = (m.opciones || []).find((o) => o.tipo === 'color_material');
    const colores = [{ id: '', hex: null }].concat(opcionColor ? opcionColor.valores.filter((v) => v.hex).map((v) => ({ id: v.id, hex: v.hex })) : []);
    const capturas = await page.evaluate(async ({ id, b64, colores, material }) => {
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
      const salida = {};
      for (const c of colores) {
        v.colorear(c.hex ? { material, hex: c.hex } : null);
        for (const oscuro of [false, true]) {
          v.tema(oscuro);
          salida[(c.id ? '-' + c.id : '') + (oscuro ? '-oscuro' : '')] = v.capturar();
        }
      }
      return salida;
    }, { id: a.id, b64: fs.readFileSync(glb).toString('base64'), colores, material: opcionColor ? opcionColor.material : null });
    const base = a.miniatura || `imagenes/miniatura_${a.id}.webp`;
    for (const [sufijo, dataUrl] of Object.entries(capturas)) {
      const destino = path.join(RAIZ, base.replace(/(\.\w+)$/, `${sufijo}$1`));
      guardarWebp(Buffer.from(dataUrl.split(',')[1], 'base64'), destino);
      console.log(`${path.relative(RAIZ, destino)}: ${Math.round(fs.statSync(destino).size / 1024)} KB`);
      hechas++;
    }
  }
  await navegador.close();
  console.log(`${hechas} miniaturas generadas.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
