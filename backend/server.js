'use strict';

const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { Almacen } = require('./src/almacen');
const { crearApp } = require('./src/app');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));

let adminToken = process.env.ADMIN_TOKEN;
if (!adminToken) {
  adminToken = crypto.randomBytes(12).toString('hex');
  console.warn(`[admin] No se definió ADMIN_TOKEN. Clave temporal para esta ejecución: ${adminToken}`);
}

const almacen = new Almacen({ dataDir: DATA_DIR, catalogoInicial: path.join(__dirname, 'catalogo-inicial.json') });
const app = crearApp({
  almacen,
  adminToken,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  webhookUrl: process.env.NOTIFICAR_WEBHOOK_URL || null,
});

http.createServer(app).listen(PORT, () => {
  console.log(`Configurador DOMO escuchando en http://localhost:${PORT}`);
  console.log(`  Configurador: http://localhost:${PORT}/`);
  console.log(`  Panel admin:  http://localhost:${PORT}/admin`);
  console.log(`  Datos en:     ${DATA_DIR}`);
});
