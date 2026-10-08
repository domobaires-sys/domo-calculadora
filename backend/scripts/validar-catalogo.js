'use strict';

// Uso: npm run validar [-- ruta/al/catalogo.json]
// Revisa un catálogo editado a mano antes de subirlo.

const path = require('node:path');
const { leerJSON } = require('../src/almacen');
const { validarCatalogo } = require('../src/validador');
const { cotizar } = require('../src/cotizador');

const archivo = path.resolve(process.argv[2] || path.join(__dirname, '..', 'data', 'catalogo.json'));
let cat;
try {
  cat = leerJSON(archivo);
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}
if (!cat) {
  console.error(`✗ No existe ${archivo}`);
  process.exit(1);
}

const errores = validarCatalogo(cat);
if (errores.length) {
  console.error(`✗ ${archivo} tiene ${errores.length} error(es):`);
  for (const e of errores) console.error(`  - ${e}`);
  process.exit(1);
}

const ejemplo = cotizar(cat, {});
console.log(`✓ ${archivo} es válido (${cat.pasos.length} pasos).`);
console.log(`  Configuración predeterminada: ${ejemplo.simbolo_moneda} ${ejemplo.total} (${ejemplo.ok ? 'sin errores' : ejemplo.errores.map(e => e.mensaje).join('; ')})`);
