/*
 * Reglas del configurador 3D de DOMO BAIRES.
 *
 * Funciones puras: reciben el catálogo y un estado de configuración y
 * devuelven datos nuevos. Las usan la interfaz, el visor 3D, el resumen,
 * la solicitud y las pruebas (y, más adelante, el servidor que reciba
 * las solicitudes, para revalidarlas).
 *
 * Estado de configuración (única fuente de verdad):
 *   { v, modelo, variante, sel: { categoria: id | [ids] }, cant: { categoria: n }, modalidad }
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.DomoReglas = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const copiar = (o) => JSON.parse(JSON.stringify(o));

  function modeloDe(cat, id) { return cat.modelos.find((m) => m.id === id) || null; }
  function varianteDe(modelo, id) { return modelo ? modelo.variantes.find((v) => v.id === id) || null : null; }
  function categoriaDe(cat, id) { return cat.categorias.find((c) => c.id === id) || null; }
  function opcionDe(cat, id) {
    for (const c of cat.categorias) {
      const o = c.opciones.find((x) => x.id === id);
      if (o) return { categoria: c, opcion: o };
    }
    return null;
  }

  function seleccionadas(estado) {
    const ids = [];
    for (const v of Object.values(estado.sel || {})) {
      if (Array.isArray(v)) ids.push(...v);
      else if (v) ids.push(v);
    }
    return ids;
  }

  function limiteCantidad(cat, estado, catId) {
    const c = categoriaDe(cat, catId);
    if (!c || !c.cantidad) return null;
    const m = modeloDe(cat, estado.modelo);
    const v = varianteDe(m, estado.variante);
    let max = c.cantidad.max;
    if (m && m.posiciones && c.posicion && m.posiciones[c.posicion]) max = Math.min(max, m.posiciones[c.posicion].length);
    if (m && m.limites && m.limites[catId] && typeof m.limites[catId].max === 'number') max = Math.min(max, m.limites[catId].max);
    let min = c.cantidad.min;
    let fija = null;
    if (v && v.cantidades_fijas && typeof v.cantidades_fijas[catId] === 'number') {
      fija = Math.min(v.cantidades_fijas[catId], max);
      min = max = fija;
    }
    return { min, max, fija };
  }

  /**
   * Disponibilidad de una opción para el estado actual.
   *  - disponible: false → bloqueo firme (modelo, variante cerrada, retirada).
   *  - cambios: la opción se puede elegir, pero obliga a cambiar otras.
   */
  function evaluarOpcion(cat, estado, catId, opId) {
    const c = categoriaDe(cat, catId);
    const o = c && c.opciones.find((x) => x.id === opId);
    if (!o) return { disponible: false, motivo: 'La opción no existe en el catálogo.' };
    if (o.estado === 'retirado') return { disponible: false, motivo: 'Opción retirada del catálogo.' };
    const m = modeloDe(cat, estado.modelo);
    if (o.modelos && m && !o.modelos.includes(m.id)) {
      return { disponible: false, motivo: `No está disponible para ${m.nombre}.` };
    }
    const v = varianteDe(m, estado.variante);
    if (v && o.variantes && !o.variantes.includes(v.id)) {
      return { disponible: false, motivo: `No está disponible en ${v.nombre}.` };
    }
    if (v && v.fija && v.fija[catId] && v.fija[catId] !== opId) {
      const fija = c.opciones.find((x) => x.id === v.fija[catId]);
      return { disponible: false, motivo: `${v.nombre} es un conjunto cerrado: trae ${fija ? fija.nombre : 'otra opción'}.` };
    }
    if (estado.modalidad && o.modalidades && !o.modalidades.includes(estado.modalidad)) {
      return { disponible: false, motivo: 'No está disponible en la modalidad elegida.' };
    }
    const ya = seleccionadas(estado).includes(opId);
    if (ya) return { disponible: true, cambios: [] };
    const prueba = aplicar(cat, estado, { tipo: 'elegir', categoria: catId, opcion: opId });
    return { disponible: true, cambios: prueba.cambios };
  }

  function conflictoCon(cat, opId, otras) {
    const info = opcionDe(cat, opId);
    if (!info) return null;
    for (const otra of otras) {
      if (otra === opId) continue;
      const oi = opcionDe(cat, otra);
      if (!oi) continue;
      if ((info.opcion.excluye || []).includes(otra)) return { con: otra, motivo: info.opcion.motivo_excluye || `No combina con ${oi.opcion.nombre}.` };
      if ((oi.opcion.excluye || []).includes(opId)) return { con: otra, motivo: oi.opcion.motivo_excluye || `No combina con ${oi.opcion.nombre}.` };
    }
    return null;
  }

  function firme(cat, estado, catId, opId) {
    const c = categoriaDe(cat, catId);
    const o = c && c.opciones.find((x) => x.id === opId);
    if (!o || o.estado === 'retirado') return false;
    const m = modeloDe(cat, estado.modelo);
    if (o.modelos && m && !o.modelos.includes(m.id)) return false;
    const v = varianteDe(m, estado.variante);
    if (v && o.variantes && !o.variantes.includes(v.id)) return false;
    if (v && v.fija && v.fija[catId] && v.fija[catId] !== opId) return false;
    if (estado.modalidad && o.modalidades && !o.modalidades.includes(estado.modalidad)) return false;
    return true;
  }

  function nombreOpcion(cat, id) {
    const i = opcionDe(cat, id);
    return i ? i.opcion.nombre : id;
  }

  /**
   * Deja el estado coherente con el catálogo. Las categorías en `fijas`
   * (lo que el cliente acaba de elegir) se respetan; las demás se adaptan.
   * Devuelve el estado nuevo y la lista de cambios, en castellano.
   */
  function normalizar(cat, entrada, fijas) {
    const estado = copiar(entrada || {});
    const cambios = [];
    const prioridad = new Set(fijas || []);
    estado.v = cat.version_catalogo;
    estado.sel = estado.sel || {};
    estado.cant = estado.cant || {};

    let m = modeloDe(cat, estado.modelo);
    if (!m) {
      if (estado.modelo) cambios.push({ categoria: 'modelo', antes: estado.modelo, despues: cat.modelos[0].id, texto: 'El modelo guardado ya no existe; se eligió el primero de la colección.' });
      m = cat.modelos[0];
      estado.modelo = m.id;
    }
    let v = varianteDe(m, estado.variante);
    if (!v) {
      if (estado.variante) cambios.push({ categoria: 'variante', antes: estado.variante, despues: m.variantes[0].id, texto: `${m.nombre} no tiene esa variante; se eligió ${m.variantes[0].nombre}.` });
      v = m.variantes[0];
      estado.variante = v.id;
    }
    if (estado.modalidad && !(estado.modalidad in (m.modalidades || {}))) {
      cambios.push({ categoria: 'modalidad', antes: estado.modalidad, despues: null, texto: `La modalidad elegida no figura para ${m.nombre}; hay que elegirla de nuevo.` });
      estado.modalidad = null;
    }

    const orden = [...cat.categorias].sort((a, b) => (prioridad.has(b.id) ? 1 : 0) - (prioridad.has(a.id) ? 1 : 0));

    // 1) Requisitos de lo elegido por el cliente: se agregan antes de adaptar el resto.
    for (const c of orden) {
      if (!prioridad.has(c.id)) continue;
      const elegidas = [].concat(estado.sel[c.id] || []);
      for (const id of elegidas) {
        const o = c.opciones.find((x) => x.id === id);
        if (!o || !o.requiere || !o.requiere.length) continue;
        if (o.requiere.some((r) => seleccionadas(estado).includes(r))) continue;
        const req = opcionDe(cat, o.requiere.find((r) => opcionDe(cat, r) && firme(cat, estado, opcionDe(cat, r).categoria.id, r)) || o.requiere[0]);
        if (!req) continue;
        const rc = req.categoria;
        const antes = estado.sel[rc.id];
        if (rc.control === 'multiple') estado.sel[rc.id] = [...new Set([...(antes || []), req.opcion.id])];
        else estado.sel[rc.id] = req.opcion.id;
        prioridad.add(rc.id);
        cambios.push({ categoria: rc.id, antes: antes || null, despues: req.opcion.id, texto: `${rc.nombre}: pasa a ${req.opcion.nombre} (${o.motivo_requiere || `lo requiere ${o.nombre}`}).` });
      }
    }

    // 2) Cada categoría: opción firme, sin conflictos y con sus requisitos.
    for (const c of orden) {
      const respetar = prioridad.has(c.id);
      const otras = () => seleccionadas(estado).filter((id) => !c.opciones.some((o) => o.id === id));
      const valida = (id) => {
        if (!firme(cat, estado, c.id, id)) return false;
        if (!respetar && conflictoCon(cat, id, otras())) return false;
        const o = c.opciones.find((x) => x.id === id);
        if (!respetar && o.requiere && o.requiere.length && !o.requiere.some((r) => seleccionadas(estado).includes(r))) return false;
        return true;
      };
      if (c.control === 'multiple') {
        const antes = Array.isArray(estado.sel[c.id]) ? estado.sel[c.id] : [];
        const despues = antes.filter(valida);
        for (const id of antes) {
          if (!despues.includes(id)) cambios.push({ categoria: c.id, antes: id, despues: null, texto: `${c.nombre}: se quita ${nombreOpcion(cat, id)} porque no es compatible con la nueva elección.` });
        }
        estado.sel[c.id] = despues;
        continue;
      }
      const actual = estado.sel[c.id];
      const fijaVar = v.fija && v.fija[c.id];
      if (fijaVar && actual !== fijaVar) {
        estado.sel[c.id] = fijaVar;
        if (actual !== undefined) cambios.push({ categoria: c.id, antes: actual || null, despues: fijaVar, texto: `${c.nombre}: ${v.nombre} trae ${nombreOpcion(cat, fijaVar)}.` });
        continue;
      }
      if (actual && valida(actual)) continue;
      if (actual === null && !c.requerido) continue;
      const candidatas = [c.predeterminada, ...c.opciones.map((o) => o.id)].filter(Boolean);
      const nueva = candidatas.find(valida) || null;
      const final = nueva;
      if (actual !== undefined && actual !== final) {
        cambios.push({
          categoria: c.id,
          antes: actual || null,
          despues: final,
          texto: final
            ? `${c.nombre}: ${actual ? `${nombreOpcion(cat, actual)} no es compatible; ` : ''}pasa a ${nombreOpcion(cat, final)}.`
            : `${c.nombre}: no queda ninguna opción compatible.`,
        });
      }
      estado.sel[c.id] = final;
    }

    // 3) Cantidades dentro de sus límites.
    for (const c of cat.categorias) {
      if (!c.cantidad) continue;
      const lim = limiteCantidad(cat, estado, c.id);
      const antes = estado.cant[c.id];
      let n = typeof antes === 'number' ? antes : c.cantidad.predeterminada;
      n = Math.max(lim.min, Math.min(lim.max, n));
      if (!estado.sel[c.id]) n = 0;
      if (typeof antes === 'number' && antes !== n) {
        cambios.push({ categoria: c.id, antes, despues: n, texto: `${c.cantidad.nombre}: pasa de ${antes} a ${n} (${lim.fija !== null ? `${v.nombre} trae ${lim.fija}` : `máximo ${lim.max} en ${m.nombre}`}).` });
      }
      estado.cant[c.id] = n;
    }
    return { estado, cambios };
  }

  /** Aplica un cambio del cliente y devuelve { estado, cambios } sin modificar el original. */
  function aplicar(cat, estado, accion) {
    const e = copiar(estado);
    const fijas = [];
    switch (accion.tipo) {
      case 'modelo':
        e.modelo = accion.modelo;
        e.variante = null;
        break;
      case 'variante':
        e.variante = accion.variante;
        break;
      case 'elegir': {
        const c = categoriaDe(cat, accion.categoria);
        if (c.control === 'multiple') {
          const lista = new Set(e.sel[c.id] || []);
          if (lista.has(accion.opcion)) lista.delete(accion.opcion); else lista.add(accion.opcion);
          e.sel[c.id] = [...lista];
        } else {
          e.sel[c.id] = accion.opcion;
        }
        fijas.push(c.id);
        break;
      }
      case 'cantidad':
        e.cant[accion.categoria] = accion.cantidad;
        fijas.push(accion.categoria);
        break;
      case 'modalidad':
        e.modalidad = accion.modalidad;
        break;
      default:
        throw new Error('Acción desconocida: ' + accion.tipo);
    }
    const r = normalizar(cat, e, fijas);
    // El cambio que pidió el cliente no se informa como "cambio forzado".
    r.cambios = r.cambios.filter((x) => !(accion.tipo === 'modelo' && x.categoria === 'variante'));
    return r;
  }

  function crearEstado(cat, modeloId) {
    return normalizar(cat, { modelo: modeloId || cat.modelos[0].id, variante: null, sel: {}, cant: {}, modalidad: null }).estado;
  }

  /** Puertas y ventanas con su posición, para el visor 3D. */
  function aberturas(cat, estado) {
    const m = modeloDe(cat, estado.modelo);
    const lista = [];
    for (const c of cat.categorias) {
      if (!c.posicion || !estado.sel[c.id]) continue;
      const pos = (m.posiciones && m.posiciones[c.posicion]) || [];
      const n = c.cantidad ? estado.cant[c.id] || 0 : 1;
      for (let i = 0; i < Math.min(n, pos.length); i++) {
        const o = c.opciones.find((x) => x.id === estado.sel[c.id]);
        lista.push({ tipo: c.posicion, categoria: c.id, posicion: pos[i], opcion: o.id, visual: o.visual || {} });
      }
    }
    return lista;
  }

  function textoPrecio(cat, precio) {
    if (!precio || precio.estado === 'pendiente') return 'Pendiente de cotización';
    if (precio.estado === 'incluido') return 'Incluido';
    if (precio.estado === 'sin_cargo') return 'Sin cargo';
    if (precio.estado === 'valor' && typeof precio.importe === 'number') {
      const s = (cat.precios && cat.precios.moneda) || '';
      return `${s} ${precio.importe.toLocaleString('es-AR')}`.trim();
    }
    return 'Pendiente de cotización';
  }

  /** Resumen legible y exacto de la configuración, para pantalla y solicitud. */
  function resumen(cat, estado) {
    const m = modeloDe(cat, estado.modelo);
    const v = varianteDe(m, estado.variante);
    const lineas = [];
    lineas.push({ clave: 'modelo', etiqueta: 'Modelo', valor: m.nombre, precio: null, estado: m.estado });
    lineas.push({ clave: 'variante', etiqueta: 'Variante', valor: `${v.nombre} (${v.tipo === 'cerrada' ? 'conjunto cerrado' : 'combinable'})`, precio: null, estado: v.estado });
    let pendientes = 0;
    let total = 0;
    const sumar = (p, n) => {
      if (!p || p.estado === 'pendiente' || (p.estado === 'valor' && typeof p.importe !== 'number')) pendientes++;
      else if (p.estado === 'valor') total += p.importe * (n || 1);
    };
    for (const c of cat.categorias) {
      const val = estado.sel[c.id];
      if (c.control === 'multiple') {
        if (!val || !val.length) { lineas.push({ clave: c.id, etiqueta: c.nombre, valor: 'Ninguno', precio: null, estado: null }); continue; }
        for (const id of val) {
          const o = c.opciones.find((x) => x.id === id);
          sumar(o.precio, 1);
          lineas.push({ clave: c.id, etiqueta: c.nombre, valor: o.nombre, precio: textoPrecio(cat, o.precio), estado: o.estado });
        }
        continue;
      }
      if (!val) { lineas.push({ clave: c.id, etiqueta: c.nombre, valor: c.cantidad ? 'Sin ventanas' : 'Ninguna', precio: null, estado: null }); continue; }
      const o = c.opciones.find((x) => x.id === val);
      const n = c.cantidad ? estado.cant[c.id] || 0 : 1;
      if (c.cantidad && n === 0) { lineas.push({ clave: c.id, etiqueta: c.nombre, valor: 'Sin ventanas', precio: null, estado: null }); continue; }
      sumar(o.precio, n);
      lineas.push({ clave: c.id, etiqueta: c.nombre, valor: c.cantidad ? `${n} × ${o.nombre}` : o.nombre, precio: textoPrecio(cat, o.precio), estado: o.estado });
    }
    const mod = estado.modalidad ? cat.modalidades.find((x) => x.id === estado.modalidad) : null;
    lineas.push({ clave: 'modalidad', etiqueta: 'Modalidad', valor: mod ? mod.nombre : 'Sin elegir', precio: null, estado: mod ? m.modalidades[mod.id] : null });
    return {
      lineas,
      total: pendientes ? { estado: 'pendiente', texto: 'Pendiente de cotización' } : { estado: 'estimado', texto: textoPrecio(cat, { estado: 'valor', importe: total }) },
      version: cat.version_catalogo,
    };
  }

  /** Revalidación completa, antes de generar la solicitud o al recibirla en un servidor. */
  function validar(cat, estado) {
    const errores = [];
    if (!estado || typeof estado !== 'object') return ['La configuración está vacía.'];
    if (estado.v !== cat.version_catalogo) errores.push(`La configuración es de la versión ${estado.v || 'desconocida'} del catálogo; la actual es ${cat.version_catalogo}.`);
    const m = modeloDe(cat, estado.modelo);
    if (!m) return errores.concat('El modelo no existe.');
    if (!varianteDe(m, estado.variante)) errores.push('La variante no corresponde al modelo.');
    if (!estado.modalidad) errores.push('Falta elegir la modalidad de entrega.');
    else if (!(estado.modalidad in (m.modalidades || {}))) errores.push('La modalidad no corresponde al modelo.');
    const r = normalizar(cat, estado, cat.categorias.map((c) => c.id));
    for (const ch of r.cambios) errores.push(ch.texto);
    for (const c of cat.categorias) {
      const val = (estado.sel || {})[c.id];
      for (const id of [].concat(val || [])) {
        if (!c.opciones.some((o) => o.id === id)) errores.push(`${c.nombre}: la opción ${id} no existe.`);
        const conf = conflictoCon(cat, id, seleccionadas(estado));
        if (conf) errores.push(`${c.nombre}: ${conf.motivo}`);
        const o = c.opciones.find((x) => x.id === id);
        if (o && o.requiere && o.requiere.length && !o.requiere.some((x) => seleccionadas(estado).includes(x))) {
          errores.push(`${c.nombre}: ${o.motivo_requiere || 'le falta una opción requerida.'}`);
        }
      }
      if (c.requerido && !val) errores.push(`${c.nombre}: falta elegir una opción.`);
    }
    return [...new Set(errores)];
  }

  // Enlace compartible: solo identificadores y versión, nunca datos personales.
  function codificar(estado) {
    const datos = { v: estado.v, m: estado.modelo, va: estado.variante, s: estado.sel, c: estado.cant, mo: estado.modalidad };
    const json = JSON.stringify(datos);
    const b64 = typeof Buffer !== 'undefined' ? Buffer.from(json, 'utf8').toString('base64') : btoa(unescape(encodeURIComponent(json)));
    return 'c1.' + b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decodificar(texto) {
    if (typeof texto !== 'string' || !texto.startsWith('c1.')) return null;
    try {
      const b64 = texto.slice(3).replace(/-/g, '+').replace(/_/g, '/');
      const json = typeof Buffer !== 'undefined' ? Buffer.from(b64, 'base64').toString('utf8') : decodeURIComponent(escape(atob(b64)));
      const d = JSON.parse(json);
      return { v: d.v, modelo: d.m, variante: d.va, sel: d.s || {}, cant: d.c || {}, modalidad: d.mo || null };
    } catch (e) {
      return null;
    }
  }

  /** Carga una configuración guardada: la adapta al catálogo actual y explica qué cambió. */
  function recuperar(cat, guardado) {
    if (!guardado) return null;
    const avisos = [];
    if (guardado.v !== cat.version_catalogo) avisos.push(`Esta configuración se armó con la versión ${guardado.v || 'desconocida'} del catálogo y se adaptó a la ${cat.version_catalogo}.`);
    const r = normalizar(cat, guardado, cat.categorias.map((c) => c.id));
    return { estado: r.estado, avisos: avisos.concat(r.cambios.map((c) => c.texto)) };
  }

  return {
    modeloDe, varianteDe, categoriaDe, opcionDe,
    limiteCantidad, evaluarOpcion, normalizar, aplicar, crearEstado,
    aberturas, resumen, validar, textoPrecio, codificar, decodificar, recuperar,
  };
});
