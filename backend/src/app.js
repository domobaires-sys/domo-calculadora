'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { cotizar, seleccionInicial, pasosActivos } = require('./cotizador');
const { validarCatalogo } = require('./validador');

const MAX_BODY = 512 * 1024;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ESTADOS_PEDIDO = ['nuevo', 'contactado', 'presupuestado', 'ganado', 'perdido'];

class ErrorHttp extends Error {
  constructor(status, mensaje, extra) {
    super(mensaje);
    this.status = status;
    this.extra = extra;
  }
}

function enviarJSON(res, status, datos, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(datos));
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let tam = 0;
    const partes = [];
    req.on('data', c => {
      tam += c.length;
      if (tam > MAX_BODY) {
        reject(new ErrorHttp(413, 'El cuerpo de la solicitud es demasiado grande'));
        req.destroy();
        return;
      }
      partes.push(c);
    });
    req.on('end', () => {
      const texto = Buffer.concat(partes).toString('utf8');
      if (!texto) return resolve({});
      try {
        resolve(JSON.parse(texto));
      } catch {
        reject(new ErrorHttp(400, 'El cuerpo no es JSON válido'));
      }
    });
    req.on('error', reject);
  });
}

function tokenValido(req, token) {
  const h = req.headers.authorization || '';
  const recibido = Buffer.from(h.startsWith('Bearer ') ? h.slice(7) : '');
  const esperado = Buffer.from(token);
  return recibido.length === esperado.length && crypto.timingSafeEqual(recibido, esperado);
}

// Límite simple de pedidos por IP para frenar spam en el formulario público.
function crearLimitador({ max, ventanaMs }) {
  const golpes = new Map();
  return ip => {
    const ahora = Date.now();
    const lista = (golpes.get(ip) || []).filter(t => ahora - t < ventanaMs);
    lista.push(ahora);
    golpes.set(ip, lista);
    return lista.length <= max;
  };
}

function texto(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function catalogoPublico(cat) {
  return {
    version: cat.version,
    ajustes: cat.ajustes,
    textos: cat.textos || {},
    pasos: pasosActivos(cat),
    seleccion_inicial: seleccionInicial(cat),
  };
}

function csvCelda(v) {
  const s = v === undefined || v === null ? '' : String(v);
  // Evita que Excel interprete celdas como fórmulas.
  const seguro = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n;]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

function pedidosCSV(pedidos) {
  const cols = ['numero', 'creado', 'estado', 'nombre', 'email', 'telefono', 'localidad', 'comentarios', 'resumen', 'total', 'moneda', 'notas'];
  const filas = pedidos.map(p => [
    p.numero, p.creado, p.estado,
    p.cliente?.nombre, p.cliente?.email, p.cliente?.telefono, p.cliente?.localidad, p.cliente?.comentarios,
    (p.cotizacion?.items || []).map(i => `${i.cantidad > 1 ? i.cantidad + 'x ' : ''}${i.nombre}`).join(' | '),
    p.cotizacion?.total, p.cotizacion?.moneda, p.notas,
  ].map(csvCelda).join(','));
  return '﻿' + [cols.join(','), ...filas].join('\n') + '\n';
}

const TIPOS_ESTATICOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function servirEstatico(res, nombre) {
  const archivo = path.join(PUBLIC_DIR, nombre);
  if (!archivo.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(archivo) || !fs.statSync(archivo).isFile()) return false;
  res.writeHead(200, { 'Content-Type': TIPOS_ESTATICOS[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(archivo).pipe(res);
  return true;
}

function crearApp({ almacen, adminToken, corsOrigin = '*', webhookUrl = null, log = console }) {
  const limitarPedidos = crearLimitador({ max: 10, ventanaMs: 10 * 60 * 1000 });

  function notificar(pedido) {
    if (!webhookUrl) return;
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        evento: 'nuevo_presupuesto',
        text: `Nuevo pedido ${pedido.numero} de ${pedido.cliente.nombre}: ${pedido.cotizacion.simbolo_moneda} ${pedido.cotizacion.total}`,
        pedido,
      }),
    }).catch(e => log.error('[webhook] no se pudo notificar:', e.message));
  }

  const rutas = [
    ['GET', /^\/api\/salud$/, () => ({ ok: true, version_catalogo: almacen.catalogo().version })],

    ['GET', /^\/api\/catalogo$/, () => catalogoPublico(almacen.catalogo())],

    ['POST', /^\/api\/cotizar$/, async ({ req }) => {
      const cuerpo = await leerCuerpo(req);
      return cotizar(almacen.catalogo(), cuerpo.seleccion || {});
    }],

    ['POST', /^\/api\/presupuestos$/, async ({ req, ip }) => {
      const cuerpo = await leerCuerpo(req);
      if (cuerpo.sitio_web) return { ok: true }; // trampa para bots: campo oculto
      if (!limitarPedidos(ip)) throw new ErrorHttp(429, 'Demasiados pedidos seguidos, probá de nuevo en unos minutos');
      const c = cuerpo.cliente || {};
      const cliente = {
        nombre: texto(c.nombre, 120),
        email: texto(c.email, 160),
        telefono: texto(c.telefono, 40),
        localidad: texto(c.localidad, 120),
        comentarios: texto(c.comentarios, 2000),
      };
      const faltan = [];
      if (!cliente.nombre) faltan.push('Ingresá tu nombre');
      if (!cliente.email && !cliente.telefono) faltan.push('Dejanos un email o un teléfono');
      if (cliente.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cliente.email)) faltan.push('El email no parece válido');
      if (faltan.length) throw new ErrorHttp(422, 'Faltan datos de contacto', { errores: faltan });
      const cat = almacen.catalogo();
      const cotizacion = cotizar(cat, cuerpo.seleccion || {});
      if (!cotizacion.ok) throw new ErrorHttp(422, 'La configuración tiene errores', { errores: cotizacion.errores.map(e => e.mensaje) });
      const { disponibilidad, ...guardable } = cotizacion;
      const pedido = almacen.agregarPedido({ cliente, cotizacion: guardable, version_catalogo: cat.version });
      notificar(pedido);
      return { ok: true, numero: pedido.numero, mensaje: cat.textos?.mensaje_enviado || 'Pedido recibido' };
    }],

    // ---- Administración (requiere token) ----
    ['GET', /^\/api\/admin\/catalogo$/, () => almacen.catalogo(), true],

    ['PUT', /^\/api\/admin\/catalogo$/, async ({ req }) => {
      const r = almacen.guardarCatalogo(await leerCuerpo(req));
      if (!r.ok) throw new ErrorHttp(r.conflicto ? 409 : 422, 'No se guardó el catálogo', { errores: r.errores });
      log.info(`[catalogo] guardada versión ${r.catalogo.version}`);
      return r.catalogo;
    }, true],

    ['POST', /^\/api\/admin\/catalogo\/validar$/, async ({ req }) => {
      const cat = await leerCuerpo(req);
      const errores = validarCatalogo(cat);
      return { ok: errores.length === 0, errores, ejemplo: errores.length ? null : cotizar(cat, {}) };
    }, true],

    ['GET', /^\/api\/admin\/historial$/, () => almacen.listarHistorial(), true],

    ['GET', /^\/api\/admin\/historial\/([\w.-]+)$/, ({ m }) => {
      const cat = almacen.leerHistorial(m[1]);
      if (!cat) throw new ErrorHttp(404, 'No existe esa versión');
      return cat;
    }, true],

    ['POST', /^\/api\/admin\/historial\/([\w.-]+)\/restaurar$/, ({ m }) => {
      const r = almacen.restaurar(m[1], { autor: 'admin (restauración)' });
      if (!r.ok) throw new ErrorHttp(422, 'No se pudo restaurar', { errores: r.errores });
      return r.catalogo;
    }, true],

    ['GET', /^\/api\/admin\/presupuestos$/, () => almacen.pedidos().slice().reverse(), true],

    ['GET', /^\/api\/admin\/presupuestos\.csv$/, ({ res }) => {
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="presupuestos.csv"' });
      res.end(pedidosCSV(almacen.pedidos()));
    }, true],

    ['PATCH', /^\/api\/admin\/presupuestos\/([\w-]+)$/, async ({ req, m }) => {
      const cuerpo = await leerCuerpo(req);
      const cambios = {};
      if (cuerpo.estado !== undefined) {
        if (!ESTADOS_PEDIDO.includes(cuerpo.estado)) throw new ErrorHttp(422, `Estado inválido (usar: ${ESTADOS_PEDIDO.join(', ')})`);
        cambios.estado = cuerpo.estado;
      }
      if (cuerpo.notas !== undefined) cambios.notas = texto(cuerpo.notas, 4000);
      const p = almacen.actualizarPedido(m[1], cambios);
      if (!p) throw new ErrorHttp(404, 'No existe ese pedido');
      return p;
    }, true],
  ];

  return async function manejar(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const ip = req.socket.remoteAddress || '';
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, OPTIONS');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    try {
      if (!url.pathname.startsWith('/api/')) {
        if (req.method === 'GET') {
          const pagina = { '/': 'configurador.html', '/admin': 'admin.html' }[url.pathname] || url.pathname.slice(1);
          if (servirEstatico(res, pagina)) return;
        }
        throw new ErrorHttp(404, 'No encontrado');
      }

      let rutaEncontrada = false;
      for (const [metodo, patron, fn, esAdmin] of rutas) {
        const m = url.pathname.match(patron);
        if (!m) continue;
        rutaEncontrada = true;
        if (metodo !== req.method) continue;
        if (esAdmin && !tokenValido(req, adminToken)) throw new ErrorHttp(401, 'Clave de administración incorrecta');
        const resultado = await fn({ req, res, m, ip, url });
        if (!res.headersSent) enviarJSON(res, 200, resultado);
        return;
      }
      throw new ErrorHttp(rutaEncontrada ? 405 : 404, rutaEncontrada ? 'Método no permitido' : 'No encontrado');
    } catch (e) {
      if (res.headersSent) return res.end();
      if (e instanceof ErrorHttp) return enviarJSON(res, e.status, { ok: false, error: e.message, ...e.extra });
      log.error(e);
      enviarJSON(res, 500, { ok: false, error: 'Error interno del servidor' });
    }
  };
}

module.exports = { crearApp, pedidosCSV, catalogoPublico };
