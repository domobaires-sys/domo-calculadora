'use strict';

// Arma una versión de demostración que funciona solo en el navegador (sin
// servidor), para mostrar el configurador y el panel con un simple link.
// Uso: npm run demo [-- carpeta-destino]   (por defecto: demo-publicada/)

const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const destino = path.resolve(process.argv[2] || path.join(raiz, 'demo-publicada'));
fs.mkdirSync(destino, { recursive: true });

const modulo = (nombre, archivo) => `(function (module) { ${fs.readFileSync(path.join(raiz, archivo), 'utf8')}\n window.__modulos.${nombre} = module.exports; })({ exports: {} });\n`;
const js = 'window.__modulos = {};\n'
  + `window.__modulos.catalogoInicial = ${fs.readFileSync(path.join(raiz, 'catalogo-inicial.json'), 'utf8')};\n`
  + modulo('validador', 'src/validador.js')
  + modulo('cotizador', 'src/cotizador.js')
  + fs.readFileSync(path.join(raiz, 'demo', 'api-navegador.js'), 'utf8');
fs.writeFileSync(path.join(destino, 'api-demo.js'), js);

const barra = (activa) => `
<div style="background:#15124f;color:#fff;padding:10px 16px;font:600 13px system-ui,sans-serif;display:flex;gap:16px;flex-wrap:wrap;align-items:center">
  <span>Demo DOMO</span>
  <a href="index.html" style="color:#fff;${activa === 'cliente' ? 'text-decoration:underline' : 'opacity:.75'}">Lo que ve el cliente</a>
  <a href="admin.html" style="color:#fff;${activa === 'admin' ? 'text-decoration:underline' : 'opacity:.75'}">Panel para modificar opciones</a>
  <span style="flex:1"></span>
  <button type="button" onclick="domoDemoReiniciar()" style="background:none;border:1px solid #fff8;color:#fff;border-radius:6px;padding:4px 10px;cursor:pointer;font:inherit">Volver a los datos de ejemplo</button>
</div>`;

// Página del cliente: sin doctype/html/head/body (el publicador los agrega).
let cliente = fs.readFileSync(path.join(raiz, 'public', 'configurador.html'), 'utf8')
  .replace(/<!DOCTYPE html>\s*<html[^>]*>\s*<head>/i, '')
  .replace(/<meta[^>]*>\s*/gi, '')
  .replace('<title>DOMO · Configurador</title>', '<title>Configurador DOMO</title>')
  .replace(/<\/head>\s*<body>/i, barra('cliente'))
  .replace(/<\/body>\s*<\/html>\s*$/i, '')
  .replace("<script>\n'use strict';", '<script src="api-demo.js"></script>\n<script>\n\'use strict\';');
fs.writeFileSync(path.join(destino, 'index.html'), cliente);

let admin = fs.readFileSync(path.join(raiz, 'public', 'admin.html'), 'utf8')
  .replace('<body>', '<body>' + barra('admin'))
  .replace("let token = store.get('domo_admin_token');", "let token = store.get('domo_admin_token') || 'demo'; // en la demo no hace falta clave")
  .replace("<script>\n'use strict';", '<script src="api-demo.js"></script>\n<script>\n\'use strict\';')
  .replace('header { background: #fff; border-bottom: 1px solid var(--borde); padding: 10px 20px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; position: sticky; top: 0;', 'header { background: #fff; border-bottom: 1px solid var(--borde); padding: 10px 20px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; position: sticky; top: env(safe-area-inset-top, 0px);');
fs.writeFileSync(path.join(destino, 'admin.html'), admin);

console.log(`Demo armada en ${destino}`);
