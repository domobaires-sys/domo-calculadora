#!/usr/bin/env node
// Arma un único archivo HTML con todo incrustado (catálogo, estilos y código),
// para revisar el prototipo sin servidor. Uso: node scripts/armar-prototipo.js
'use strict';
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const leer = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');
const entre = (texto, marca) => {
  const a = texto.indexOf(`<!--${marca}-->`);
  const b = texto.indexOf(`<!--/${marca}-->`);
  if (a < 0 || b < 0) throw new Error(`Falta la marca ${marca} en index.html`);
  return texto.slice(a + marca.length + 7, b).trim();
};

const index = leer('index.html');
const catalogo = JSON.parse(leer('catalogo.json')); // valida que el JSON sea correcto
// Las imágenes de los modelos van incrustadas para que el archivo funcione solo.
for (const m of catalogo.modelos) {
  if (m.imagen && m.imagen.archivo && !m.imagen.archivo.startsWith('data:')) {
    const tipo = m.imagen.archivo.endsWith('.png') ? 'image/png' : 'image/jpeg';
    m.imagen.archivo = `data:${tipo};base64,${fs.readFileSync(path.join(raiz, m.imagen.archivo)).toString('base64')}`;
  }
}
const json = JSON.stringify(catalogo).replace(/</g, '\\u003c');
const scripts = index.match(/<script src="https:[^"]+"><\/script>/g).join('\n');

const salida = [
  entre(index, 'CABEZA'),
  `<style>\n${leer('estilos.css')}\n</style>`,
  entre(index, 'CUERPO'),
  `<script type="application/json" id="catalogo-datos">${json}</script>`,
  scripts,
  `<script>\n${leer('reglas.js')}\n</script>`,
  `<script>\n${leer('visor.js')}\n</script>`,
  `<script>\n${leer('app.js')}\n</script>`,
].join('\n');

const destino = process.argv[2] || path.join(raiz, 'dist', 'prototipo.html');
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, salida);
console.log(`Prototipo armado en ${destino} (${Math.round(salida.length / 1024)} KB)`);
