'use strict';

// Motor de cotización. Es una función pura: recibe el catálogo y la selección
// del cliente y devuelve el desglose completo. El servidor siempre recalcula
// con esta función, nunca confía en precios enviados por el navegador.

function r2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function pasosActivos(catalogo) {
  return (catalogo.pasos || [])
    .filter(p => p.activo !== false)
    .map(p => ({ ...p, opciones: (p.opciones || []).filter(o => o.activo !== false) }))
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
}

// Selección inicial con las opciones predeterminadas de cada paso.
function seleccionInicial(catalogo) {
  const sel = {};
  for (const paso of pasosActivos(catalogo)) {
    if (paso.predeterminada === undefined) continue;
    sel[paso.id] = structuredClone(paso.predeterminada);
  }
  return sel;
}

// Convierte la selección de un paso a una lista [{ id, cantidad }].
function elegidasDelPaso(paso, valor, errores) {
  if (valor === undefined || valor === null || valor === '') return [];
  if (paso.tipo === 'unica') {
    if (typeof valor !== 'string') {
      errores.push({ paso: paso.id, mensaje: `"${paso.titulo}": elegí una sola opción` });
      return [];
    }
    return [{ id: valor, cantidad: 1 }];
  }
  if (paso.tipo === 'multiple') {
    if (!Array.isArray(valor)) {
      errores.push({ paso: paso.id, mensaje: `"${paso.titulo}": la selección debe ser una lista` });
      return [];
    }
    return [...new Set(valor)].map(id => ({ id, cantidad: 1 }));
  }
  // cantidades
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
    errores.push({ paso: paso.id, mensaje: `"${paso.titulo}": indicá la cantidad de cada opción` });
    return [];
  }
  const lista = [];
  for (const [id, cantidad] of Object.entries(valor)) {
    if (!Number.isInteger(cantidad) || cantidad < 0) {
      errores.push({ paso: paso.id, opcion: id, mensaje: `"${paso.titulo}": la cantidad debe ser un número entero` });
      continue;
    }
    if (cantidad > 0) lista.push({ id, cantidad });
  }
  return lista;
}

function lista(nombres) {
  if (nombres.length <= 1) return nombres.join('');
  return `${nombres.slice(0, -1).join(', ')} o ${nombres[nombres.length - 1]}`;
}

// Indica si una opción se puede elegir con el contexto actual y, si no, por qué.
function evaluarDisponibilidad(op, ctx) {
  const reglas = op.reglas || {};
  const nombre = id => ctx.nombres.get(id) || id;
  if (reglas.solo_lineas && ctx.linea && !reglas.solo_lineas.includes(ctx.linea)) {
    return { disponible: false, motivo: `Disponible solo en línea ${lista(reglas.solo_lineas.map(nombre))}` };
  }
  if (reglas.solo_tamanos && ctx.tamano && !reglas.solo_tamanos.includes(ctx.tamano)) {
    return { disponible: false, motivo: `Disponible solo en ${lista(reglas.solo_tamanos.map(nombre))}` };
  }
  if (ctx.diametro !== null) {
    if (reglas.min_diametro !== undefined && ctx.diametro < reglas.min_diametro) {
      return { disponible: false, motivo: `Requiere un diámetro de ${reglas.min_diametro} m o más` };
    }
    if (reglas.max_diametro !== undefined && ctx.diametro > reglas.max_diametro) {
      return { disponible: false, motivo: `Disponible hasta ${reglas.max_diametro} m de diámetro` };
    }
  }
  const choca = (reglas.excluye || []).find(id => id !== op.id && ctx.elegidas.has(id))
    || [...ctx.elegidas].find(id => id !== op.id && (ctx.excluyePor.get(id) || []).includes(op.id));
  if (choca) return { disponible: false, motivo: `No se puede combinar con ${nombre(choca)}` };
  const falta = (reglas.requiere || []).filter(id => !ctx.elegidas.has(id));
  if (falta.length) return { disponible: false, motivo: `Requiere ${falta.map(nombre).join(' y ')}` };
  if (reglas.requiere_alguno && reglas.requiere_alguno.length && !reglas.requiere_alguno.some(id => ctx.elegidas.has(id))) {
    return { disponible: false, motivo: `Requiere ${lista(reglas.requiere_alguno.map(nombre))}` };
  }
  return { disponible: true };
}

function calcularMedidas(diametro, porcion) {
  if (diametro === null) return null;
  const radio = diametro / 2;
  const altura = diametro * porcion; // casquete esférico: h = 2R · porción
  return {
    diametro_m: r2(diametro),
    altura_m: r2(altura),
    area_piso_m2: r2(Math.PI * radio * radio),
    area_cubierta_m2: r2(2 * Math.PI * radio * altura), // 2πRh
  };
}

function limitesDelPaso(paso, linea) {
  const porLinea = (linea && paso.limites_por_linea && paso.limites_por_linea[linea]) || {};
  return {
    min: porLinea.min_total ?? paso.min_total,
    max: porLinea.max_total ?? paso.max_total,
  };
}

function cotizar(catalogo, seleccionCliente = {}, opciones = {}) {
  const ajustes = catalogo.ajustes || {};
  const pasos = pasosActivos(catalogo);
  const errores = [];
  const avisos = [];
  const seleccion = { ...seleccionInicial(catalogo), ...(seleccionCliente || {}) };

  const nombres = new Map();
  const excluyePor = new Map();
  for (const paso of pasos) {
    for (const op of paso.opciones) {
      nombres.set(op.id, op.nombre);
      if (op.reglas && op.reglas.excluye) excluyePor.set(op.id, op.reglas.excluye);
    }
  }

  // 1. Normalizar la selección y descartar ids inexistentes.
  const elegidasPorPaso = new Map();
  for (const paso of pasos) {
    const ids = new Set(paso.opciones.map(o => o.id));
    const elegidas = elegidasDelPaso(paso, seleccion[paso.id], errores).filter(e => {
      if (ids.has(e.id)) return true;
      errores.push({ paso: paso.id, opcion: e.id, mensaje: `"${paso.titulo}": la opción "${e.id}" no existe o no está disponible` });
      return false;
    });
    elegidasPorPaso.set(paso.id, elegidas);
  }

  const elegidaUnica = idPaso => {
    const e = idPaso && elegidasPorPaso.get(idPaso);
    return e && e.length ? e[0].id : null;
  };
  const linea = elegidaUnica(ajustes.paso_linea);
  const tamano = elegidaUnica(ajustes.paso_tamano);
  const pasoTamano = pasos.find(p => p.id === ajustes.paso_tamano);
  const opTamano = pasoTamano && pasoTamano.opciones.find(o => o.id === tamano);
  const diametro = opTamano && typeof opTamano.diametro_m === 'number' ? opTamano.diametro_m : null;
  const medidas = calcularMedidas(diametro, ajustes.porcion_esfera ?? 0.625);

  const ctx = {
    linea,
    tamano,
    diametro,
    nombres,
    excluyePor,
    elegidas: new Set([...elegidasPorPaso.values()].flat().map(e => e.id)),
  };

  // 2. Disponibilidad de cada opción (sirve para habilitar o deshabilitar botones).
  const disponibilidad = {};
  for (const paso of pasos) {
    disponibilidad[paso.id] = {};
    for (const op of paso.opciones) disponibilidad[paso.id][op.id] = evaluarDisponibilidad(op, ctx);
  }

  // 3. Validar requisitos, cantidades y reglas de lo elegido.
  for (const paso of pasos) {
    const elegidas = elegidasPorPaso.get(paso.id);
    if (paso.requerido && elegidas.length === 0 && paso.tipo !== 'cantidades') {
      errores.push({ paso: paso.id, mensaje: `Falta elegir "${paso.titulo}"` });
    }
    if (paso.tipo === 'cantidades') {
      const total = elegidas.reduce((s, e) => s + e.cantidad, 0);
      const { min, max } = limitesDelPaso(paso, linea);
      if (min !== undefined && total < min) errores.push({ paso: paso.id, mensaje: `"${paso.titulo}": elegí al menos ${min}` });
      if (max !== undefined && total > max) errores.push({ paso: paso.id, mensaje: `"${paso.titulo}": el máximo es ${max}${linea && paso.limites_por_linea && paso.limites_por_linea[linea] ? ` en línea ${nombres.get(linea)}` : ''}` });
    }
    for (const e of elegidas) {
      const op = paso.opciones.find(o => o.id === e.id);
      if (op.max !== undefined && e.cantidad > op.max) {
        errores.push({ paso: paso.id, opcion: op.id, mensaje: `"${op.nombre}": el máximo es ${op.max}` });
      }
      const disp = disponibilidad[paso.id][op.id];
      if (!disp.disponible) errores.push({ paso: paso.id, opcion: op.id, mensaje: `"${op.nombre}": ${disp.motivo}` });
    }
  }

  // 4. Precios. Orden del desglose: ítems normales, ajustes por multiplicador
  // (ej. la línea) y al final los porcentajes (ej. montaje).
  const items = [];
  const ajustesMult = [];
  const diferidos = [];
  const multiplicadores = [];
  for (const paso of pasos) {
    for (const e of elegidasPorPaso.get(paso.id)) {
      const op = paso.opciones.find(o => o.id === e.id);
      const precio = op.precio || { modo: 'fijo', valor: 0 };
      const valor = (linea && precio.valor_por_linea && precio.valor_por_linea[linea] !== undefined)
        ? precio.valor_por_linea[linea]
        : precio.valor;
      const item = {
        paso: paso.id,
        paso_titulo: paso.titulo,
        opcion: op.id,
        nombre: op.nombre,
        cantidad: e.cantidad,
        modo: precio.modo,
        precio_unitario: r2(valor),
        importe: 0,
      };
      // Un paso con aplica_multiplicador: false (ej. equipos de terceros)
      // no se ve afectado por el recargo de la línea.
      item.aplica_multiplicador = paso.aplica_multiplicador !== false;
      switch (precio.modo) {
        case 'fijo':
          item.importe = valor * e.cantidad;
          break;
        case 'por_m2_piso':
        case 'por_m2_cubierta': {
          const area = !medidas ? null : precio.modo === 'por_m2_piso' ? medidas.area_piso_m2 : medidas.area_cubierta_m2;
          if (area === null) {
            avisos.push(`"${op.nombre}" se calcula por m²: elegí un tamaño para ver su precio`);
          } else {
            item.unidad = 'm²';
            item.metros = area;
            item.importe = valor * area * e.cantidad;
          }
          break;
        }
        case 'multiplicador':
          if (valor !== 1) multiplicadores.push({ op, valor, paso });
          break;
        case 'porcentaje':
          item.unidad = '%';
          diferidos.push({ item, valor });
          break;
        case 'consultar':
          item.importe = null;
          item.a_consultar = true;
          avisos.push(`"${op.nombre}" se cotiza por proyecto: el total no lo incluye`);
          break;
      }
      if (typeof item.importe === 'number') item.importe = r2(item.importe);
      if (precio.modo !== 'multiplicador' && precio.modo !== 'porcentaje') items.push(item);
    }
  }

  // Los multiplicadores se aplican en cadena sobre los ítems afectados y se
  // muestran como un ajuste, para que el cliente vea el desglose.
  let acumulado = r2(items.filter(i => i.aplica_multiplicador).reduce((s, i) => s + (i.importe || 0), 0));
  for (const { op, valor, paso } of multiplicadores) {
    const pct = r2((valor - 1) * 100);
    ajustesMult.push({
      paso: paso.id,
      paso_titulo: paso.titulo,
      opcion: op.id,
      nombre: `${op.nombre} (${pct > 0 ? '+' : ''}${pct}%)`,
      cantidad: 1,
      modo: 'multiplicador',
      precio_unitario: valor,
      importe: r2(acumulado * (valor - 1)),
    });
    acumulado = r2(acumulado * valor);
  }
  items.push(...ajustesMult);
  const baseParaPorcentajes = r2(items.reduce((s, i) => s + (i.importe || 0), 0));
  for (const { item, valor } of diferidos) {
    item.importe = r2(baseParaPorcentajes * valor / 100 * item.cantidad);
    items.push(item);
  }
  for (const i of items) delete i.aplica_multiplicador;

  const subtotal = r2(items.reduce((s, i) => s + (i.importe || 0), 0));
  const ivaPct = ajustes.iva_porcentaje || 0;
  let neto, iva, total;
  if (ajustes.precios_incluyen_iva) {
    total = subtotal;
    neto = r2(subtotal / (1 + ivaPct / 100));
    iva = r2(total - neto);
  } else {
    neto = subtotal;
    iva = r2(subtotal * ivaPct / 100);
    total = r2(neto + iva);
  }

  const ahora = opciones.ahora ? new Date(opciones.ahora) : new Date();
  const validezDias = ajustes.validez_dias ?? 15;
  const validoHasta = new Date(ahora.getTime() + validezDias * 86400000).toISOString().slice(0, 10);

  return {
    ok: errores.length === 0,
    errores,
    avisos: [...new Set(avisos)],
    seleccion,
    medidas,
    items,
    subtotal,
    neto,
    iva_porcentaje: ivaPct,
    iva,
    total,
    precios_incluyen_iva: !!ajustes.precios_incluyen_iva,
    incluye_items_a_consultar: items.some(i => i.a_consultar),
    moneda: ajustes.moneda,
    simbolo_moneda: ajustes.simbolo_moneda || ajustes.moneda,
    valido_hasta: validoHasta,
    disponibilidad,
  };
}

module.exports = { cotizar, seleccionInicial, pasosActivos, calcularMedidas };
