'use strict';

// Persistencia en archivos JSON. Sin base de datos: el catálogo y los pedidos
// quedan en DATA_DIR y se pueden respaldar copiando esa carpeta.

const fs = require('node:fs');
const path = require('node:path');
const { validarCatalogo } = require('./validador');

const MAX_HISTORIAL = 50;

function leerJSON(archivo, porDefecto) {
  try {
    return JSON.parse(fs.readFileSync(archivo, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return porDefecto;
    throw new Error(`No se pudo leer ${path.basename(archivo)}: ${e.message}`);
  }
}

// Escritura atómica: se escribe a un temporal y se renombra, así un corte a
// mitad de camino nunca deja un archivo a medio escribir.
function escribirJSON(archivo, datos) {
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  const tmp = `${archivo}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(datos, null, 2) + '\n');
  fs.renameSync(tmp, archivo);
}

class Almacen {
  constructor({ dataDir, catalogoInicial }) {
    this.dataDir = dataDir;
    this.archivoCatalogo = path.join(dataDir, 'catalogo.json');
    this.dirHistorial = path.join(dataDir, 'historial');
    this.archivoPedidos = path.join(dataDir, 'presupuestos.json');
    fs.mkdirSync(this.dirHistorial, { recursive: true });
    if (!fs.existsSync(this.archivoCatalogo)) {
      escribirJSON(this.archivoCatalogo, leerJSON(catalogoInicial));
    }
    this.cache = null;
    this.cacheMtime = 0;
  }

  // Relee el archivo si cambió en disco, así una edición manual del JSON se
  // ve sin reiniciar el servidor.
  catalogo() {
    const mtime = fs.statSync(this.archivoCatalogo).mtimeMs;
    if (!this.cache || mtime !== this.cacheMtime) {
      const cat = leerJSON(this.archivoCatalogo);
      const errores = validarCatalogo(cat);
      if (errores.length && this.cache) {
        console.error('[catalogo] el archivo editado tiene errores, se sigue usando la versión anterior:\n  ' + errores.join('\n  '));
      } else {
        if (errores.length) console.error('[catalogo] advertencia, el catálogo tiene errores:\n  ' + errores.join('\n  '));
        this.cache = cat;
      }
      this.cacheMtime = mtime;
    }
    return this.cache;
  }

  guardarCatalogo(nuevo, { autor = 'admin' } = {}) {
    const errores = validarCatalogo(nuevo);
    if (errores.length) return { ok: false, errores };
    const actual = this.catalogo();
    if (nuevo.version !== undefined && actual.version !== undefined && nuevo.version !== actual.version) {
      return {
        ok: false,
        conflicto: true,
        errores: [`El catálogo cambió mientras lo editabas (versión ${actual.version}, la tuya es ${nuevo.version}). Recargá y volvé a aplicar tus cambios.`],
      };
    }
    this.respaldar(actual);
    const guardado = {
      ...nuevo,
      version: (actual.version || 0) + 1,
      actualizado: new Date().toISOString(),
      actualizado_por: autor,
    };
    escribirJSON(this.archivoCatalogo, guardado);
    this.cache = guardado;
    this.cacheMtime = fs.statSync(this.archivoCatalogo).mtimeMs;
    return { ok: true, catalogo: guardado };
  }

  respaldar(cat) {
    const sello = new Date().toISOString().replace(/[:.]/g, '-');
    escribirJSON(path.join(this.dirHistorial, `catalogo-v${cat.version || 0}-${sello}.json`), cat);
    const archivos = this.listarHistorial();
    for (const viejo of archivos.slice(MAX_HISTORIAL)) fs.rmSync(path.join(this.dirHistorial, viejo.archivo));
  }

  listarHistorial() {
    return fs.readdirSync(this.dirHistorial)
      .filter(f => /^catalogo-v\d+-.+\.json$/.test(f))
      .map(archivo => {
        const st = fs.statSync(path.join(this.dirHistorial, archivo));
        return { archivo, version: Number(archivo.match(/^catalogo-v(\d+)-/)[1]), fecha: st.mtime.toISOString() };
      })
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.version - a.version);
  }

  leerHistorial(archivo) {
    if (!/^catalogo-v\d+-[\w-]+\.json$/.test(archivo)) return null;
    return leerJSON(path.join(this.dirHistorial, archivo), null);
  }

  restaurar(archivo, opciones) {
    const anterior = this.leerHistorial(archivo);
    if (!anterior) return { ok: false, errores: ['No existe esa versión en el historial'] };
    const { version, ...resto } = anterior;
    return this.guardarCatalogo({ ...resto, version: this.catalogo().version }, opciones);
  }

  pedidos() {
    return leerJSON(this.archivoPedidos, []);
  }

  agregarPedido(pedido) {
    const pedidos = this.pedidos();
    const anio = new Date().getFullYear();
    const delAnio = pedidos.filter(p => p.numero && p.numero.startsWith(`DOMO-${anio}-`)).length;
    const nuevo = {
      numero: `DOMO-${anio}-${String(delAnio + 1).padStart(4, '0')}`,
      creado: new Date().toISOString(),
      estado: 'nuevo',
      ...pedido,
    };
    pedidos.push(nuevo);
    escribirJSON(this.archivoPedidos, pedidos);
    return nuevo;
  }

  actualizarPedido(numero, cambios) {
    const pedidos = this.pedidos();
    const p = pedidos.find(x => x.numero === numero);
    if (!p) return null;
    Object.assign(p, cambios, { actualizado: new Date().toISOString() });
    escribirJSON(this.archivoPedidos, pedidos);
    return p;
  }
}

module.exports = { Almacen, leerJSON, escribirJSON };
