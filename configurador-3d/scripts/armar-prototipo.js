#!/usr/bin/env node
/*
 * Arma un único HTML con todo incrustado (estilos, catálogo, imágenes,
 * modelos 3D y código) para publicarlo como página privada.
 *
 * El resultado NO lleva <!doctype>, <html>, <head> ni <body>: el visor de
 * páginas los agrega. Empieza con el <title>, la meta de márgenes seguros y
 * las fuentes; después el CSS, el HTML, el catálogo, los GLB en base64, las
 * librerías del CDN (versiones exactas) y el código propio.
 *
 * Uso: node scripts/armar-prototipo.js [destino]   (por defecto dist/prototipo.html)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const existe = (f) => !!f && fs.existsSync(path.join(RAIZ, f));
const TIPOS = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function dataUri(f) {
  const tipo = TIPOS[path.extname(f).toLowerCase()];
  if (!tipo) throw new Error(`Tipo de imagen desconocido: ${f}`);
  return `data:${tipo};base64,${fs.readFileSync(path.join(RAIZ, f)).toString('base64')}`;
}

function entre(texto, marca) {
  const a = texto.indexOf(`<!--${marca}-->`);
  const b = texto.indexOf(`<!--/${marca}-->`);
  if (a < 0 || b < 0) throw new Error(`Falta la marca ${marca} en index.html`);
  return texto.slice(a + marca.length + 7, b).trim();
}

/** Código propio dentro de <script>: nunca puede cerrar la etiqueta antes de tiempo. */
function scriptSeguro(codigo, nombre) {
  if (/<\/script/i.test(codigo)) throw new Error(`${nombre} contiene "</script": no se puede incrustar`);
  return `<script>\n${codigo}\n</script>`;
}

function armar() {
  const index = leer('index.html');
  const avisos = [];
  const catalogo = JSON.parse(leer('catalogo.json'));
  const glbs = [];
  for (const m of catalogo.modelos) {
    if (m.imagen && m.imagen.archivo) m.imagen.archivo = dataUri(m.imagen.archivo);
    // Colores de paneles con miniatura propia (los valores con hex de una opción color_material).
    const colores = (m.opciones || []).filter((o) => o.tipo === 'color_material').flatMap((o) => o.valores.filter((v) => v.hex).map((v) => v.id));
    for (const a of m.archivos_3d || []) {
      if (existe(a.miniatura)) {
        // Miniatura y sus variantes ("-oscuro" y "-<color>"), todas incrustadas: { sufijo: data URI }.
        const variantes = {};
        for (const sufijo of ['', ...colores.map((c) => '-' + c)]) {
          for (const tema of ['', '-oscuro']) {
            const ruta = a.miniatura.replace(/(\.\w+)$/, `${sufijo}${tema}$1`);
            if (existe(ruta)) variantes[sufijo + tema] = dataUri(ruta);
            else avisos.push(`Sin miniatura ${ruta} (se usa la de color natural o la del tema claro).`);
          }
        }
        a.miniatura = variantes[''];
        a.miniaturas = variantes;
      } else { if (a.miniatura) avisos.push(`Sin miniatura ${a.miniatura} (se usa la foto de referencia).`); a.miniatura = null; }
      if (existe(a.archivo)) {
        const b64 = fs.readFileSync(path.join(RAIZ, a.archivo)).toString('base64');
        glbs.push(`<script type="application/octet-stream" id="glb-${a.id}">${b64}</script>`);
      } else {
        avisos.push(`Sin ${a.archivo}: el visor va a mostrar "Modelo 3D en preparación".`);
      }
    }
  }
  // Las imágenes del HTML (logo) también van incrustadas.
  const cuerpo = entre(index, 'CUERPO').replace(/src="(imagenes\/[^"]+)"/g, (_, f) => `src="${dataUri(f)}"`);
  const librerias = entre(index, 'LIBRERIAS').match(/<script src="https:[^"]+"><\/script>/g);
  if (!librerias || librerias.length !== 4) throw new Error('Se esperaban las 4 librerías de three.js en index.html');
  for (const l of librerias) if (!/(r128|three@0\.128\.0)\//.test(l)) throw new Error(`Librería sin versión exacta: ${l}`);
  const json = JSON.stringify(catalogo).replace(/</g, '\\u003c');

  const html = [
    entre(index, 'CABEZA'),
    `<style>\n${leer('estilos.css')}\n</style>`,
    cuerpo,
    `<script type="application/json" id="catalogo-datos">${json}</script>`,
    ...glbs,
    ...librerias,
    scriptSeguro(leer('reglas.js'), 'reglas.js'),
    scriptSeguro(leer('visor.js'), 'visor.js'),
    scriptSeguro(leer('app.js'), 'app.js'),
  ].join('\n') + '\n';
  return { html, avisos, glbs: glbs.length };
}

if (require.main === module) {
  const destino = process.argv[2] || path.join(RAIZ, 'dist', 'prototipo.html');
  const { html, avisos, glbs } = armar();
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, html);
  for (const a of avisos) console.warn('Aviso: ' + a);
  console.log(`Prototipo armado en ${destino}: ${Math.round(Buffer.byteLength(html) / 1024)} KB, ${glbs} modelos 3D incrustados.`);
}

module.exports = { armar };
