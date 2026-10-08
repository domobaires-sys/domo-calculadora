'use strict';

// Valida la estructura del catálogo antes de guardarlo, para que un error de
// tipeo en el panel o en el JSON nunca rompa el configurador en producción.

const TIPOS_PASO = ['unica', 'multiple', 'cantidades'];
const MODOS_PRECIO = ['fijo', 'por_m2_piso', 'por_m2_cubierta', 'multiplicador', 'porcentaje', 'consultar'];
const REGLAS_LISTA = ['solo_lineas', 'solo_tamanos', 'requiere', 'requiere_alguno', 'excluye', 'solo_con'];
const REGLAS_NUMERO = ['min_diametro', 'max_diametro'];
const ID_VALIDO = /^[a-z0-9_-]{1,60}$/;

function esObjeto(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function esNumero(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function esEnteroNoNegativo(v) {
  return Number.isInteger(v) && v >= 0;
}

function validarCatalogo(cat) {
  const errores = [];
  const err = (donde, msg) => errores.push(`${donde}: ${msg}`);

  if (!esObjeto(cat)) return ['catálogo: debe ser un objeto JSON'];

  const ajustes = cat.ajustes;
  if (!esObjeto(ajustes)) {
    err('ajustes', 'falta la sección de ajustes');
  } else {
    if (typeof ajustes.moneda !== 'string' || !ajustes.moneda) err('ajustes.moneda', 'debe ser un texto, por ejemplo "USD"');
    if (!esNumero(ajustes.iva_porcentaje) || ajustes.iva_porcentaje < 0 || ajustes.iva_porcentaje > 100) {
      err('ajustes.iva_porcentaje', 'debe ser un número entre 0 y 100');
    }
    if (!esNumero(ajustes.porcion_esfera) || ajustes.porcion_esfera <= 0 || ajustes.porcion_esfera > 1) {
      err('ajustes.porcion_esfera', 'debe ser un número mayor a 0 y hasta 1 (ej. 0.625 = 5/8)');
    }
    if (ajustes.validez_dias !== undefined && !esEnteroNoNegativo(ajustes.validez_dias)) {
      err('ajustes.validez_dias', 'debe ser un número entero de días');
    }
  }

  if (cat.textos !== undefined) {
    if (!esObjeto(cat.textos)) err('textos', 'debe ser un objeto { clave: "texto" }');
    else for (const [k, v] of Object.entries(cat.textos)) {
      if (typeof v !== 'string') err(`textos.${k}`, 'debe ser un texto');
    }
  }

  if (!Array.isArray(cat.pasos) || cat.pasos.length === 0) {
    err('pasos', 'debe haber al menos un paso');
    return errores;
  }

  const idsPaso = new Set();
  const opcionesPorId = new Map(); // id de opción -> id de paso
  for (const [i, paso] of cat.pasos.entries()) {
    const donde = `pasos[${i}]`;
    if (!esObjeto(paso)) { err(donde, 'debe ser un objeto'); continue; }
    if (typeof paso.id !== 'string' || !ID_VALIDO.test(paso.id)) {
      err(donde, 'el id debe usar solo minúsculas, números, "_" o "-"');
    } else if (idsPaso.has(paso.id)) {
      err(donde, `el id "${paso.id}" está repetido`);
    } else {
      idsPaso.add(paso.id);
    }
    if (!Array.isArray(paso.opciones)) { err(`paso "${paso.id}"`, 'falta la lista de opciones'); continue; }
    for (const op of paso.opciones) {
      if (esObjeto(op) && typeof op.id === 'string') {
        if (opcionesPorId.has(op.id)) err(`paso "${paso.id}"`, `el id de opción "${op.id}" ya se usa en el paso "${opcionesPorId.get(op.id)}"`);
        else opcionesPorId.set(op.id, paso.id);
      }
    }
  }

  const pasoLinea = ajustes && ajustes.paso_linea ? cat.pasos.find(p => p && p.id === ajustes.paso_linea) : null;
  const pasoTamano = ajustes && ajustes.paso_tamano ? cat.pasos.find(p => p && p.id === ajustes.paso_tamano) : null;
  if (ajustes && ajustes.paso_linea && !pasoLinea) err('ajustes.paso_linea', `no existe el paso "${ajustes.paso_linea}"`);
  if (ajustes && ajustes.paso_tamano && !pasoTamano) err('ajustes.paso_tamano', `no existe el paso "${ajustes.paso_tamano}"`);
  if (pasoLinea && pasoLinea.tipo !== 'unica') err('ajustes.paso_linea', 'el paso de línea debe ser de tipo "unica"');
  if (pasoTamano && pasoTamano.tipo !== 'unica') err('ajustes.paso_tamano', 'el paso de tamaño debe ser de tipo "unica"');
  const idsLinea = new Set(pasoLinea && Array.isArray(pasoLinea.opciones) ? pasoLinea.opciones.map(o => o && o.id) : []);
  const idsTamano = new Set(pasoTamano && Array.isArray(pasoTamano.opciones) ? pasoTamano.opciones.map(o => o && o.id) : []);

  for (const paso of cat.pasos) {
    if (!esObjeto(paso) || !Array.isArray(paso.opciones)) continue;
    const donde = `paso "${paso.id}"`;
    if (typeof paso.titulo !== 'string' || !paso.titulo.trim()) err(donde, 'falta el título');
    if (!TIPOS_PASO.includes(paso.tipo)) err(donde, `el tipo debe ser uno de: ${TIPOS_PASO.join(', ')}`);
    if (paso.orden !== undefined && !esNumero(paso.orden)) err(donde, 'el orden debe ser un número');
    for (const campo of ['activo', 'requerido', 'aplica_multiplicador']) {
      if (paso[campo] !== undefined && typeof paso[campo] !== 'boolean') err(donde, `${campo} debe ser true o false`);
    }

    if (paso.tipo === 'cantidades') {
      for (const campo of ['min_total', 'max_total']) {
        if (paso[campo] !== undefined && !esEnteroNoNegativo(paso[campo])) err(donde, `${campo} debe ser un entero mayor o igual a 0`);
      }
      if (esEnteroNoNegativo(paso.min_total) && esEnteroNoNegativo(paso.max_total) && paso.min_total > paso.max_total) {
        err(donde, 'min_total no puede ser mayor que max_total');
      }
      if (paso.limites_por_linea !== undefined) {
        if (!esObjeto(paso.limites_por_linea)) err(donde, 'limites_por_linea debe ser un objeto');
        else for (const [linea, lim] of Object.entries(paso.limites_por_linea)) {
          if (!idsLinea.has(linea)) err(donde, `limites_por_linea usa la línea "${linea}" que no existe`);
          if (!esObjeto(lim)) { err(donde, `limites_por_linea.${linea} debe ser un objeto`); continue; }
          for (const campo of ['min_total', 'max_total']) {
            if (lim[campo] !== undefined && !esEnteroNoNegativo(lim[campo])) err(donde, `limites_por_linea.${linea}.${campo} debe ser un entero`);
          }
        }
      }
    }

    if (paso.solo_lineas !== undefined) {
      if (!Array.isArray(paso.solo_lineas)) err(donde, 'solo_lineas debe ser una lista de líneas');
      else if (paso === pasoLinea) err(donde, 'el paso de línea no puede depender de la línea');
      else for (const l of paso.solo_lineas) if (!idsLinea.has(l)) err(donde, `solo_lineas usa "${l}" que no es una línea`);
    }

    const idsDelPaso = new Set(paso.opciones.map(o => o && o.id));
    validarPredeterminada(paso, idsDelPaso, donde, err);

    for (const [j, op] of paso.opciones.entries()) {
      const dondeOp = `${donde}, opción ${op && op.id ? `"${op.id}"` : `#${j + 1}`}`;
      if (!esObjeto(op)) { err(dondeOp, 'debe ser un objeto'); continue; }
      if (typeof op.id !== 'string' || !ID_VALIDO.test(op.id)) err(dondeOp, 'el id debe usar solo minúsculas, números, "_" o "-"');
      if (typeof op.nombre !== 'string' || !op.nombre.trim()) err(dondeOp, 'falta el nombre');
      validarPrecio(op, paso, dondeOp, idsLinea, err);

      if (paso === pasoTamano && (!esNumero(op.diametro_m) || op.diametro_m <= 0)) {
        err(dondeOp, 'las opciones de tamaño necesitan diametro_m (número en metros)');
      }
      if (op.max !== undefined && !esEnteroNoNegativo(op.max)) err(dondeOp, 'max debe ser un entero mayor o igual a 0');
      if (op.imagen !== undefined && (typeof op.imagen !== 'string' || op.imagen.length > 3_000_000)) err(dondeOp, 'la imagen no es válida o es demasiado grande');
      if (op.area_piso_min_m2 !== undefined && (!esNumero(op.area_piso_min_m2) || op.area_piso_min_m2 < 0)) err(dondeOp, 'area_piso_min_m2 debe ser un número de m²');
      if (op.geometria !== undefined) {
        if (!esObjeto(op.geometria)) err(dondeOp, 'geometria debe ser { area_piso_m2, area_cubierta_m2, altura_m }');
        else for (const campo of ['area_piso_m2', 'area_cubierta_m2', 'altura_m']) {
          if (!esNumero(op.geometria[campo]) || op.geometria[campo] <= 0) err(dondeOp, `geometria.${campo} debe ser un número mayor a 0`);
        }
        // Si el paso es exclusivo de líneas con superficie mínima, el modelo debe cumplirla.
        for (const l of (Array.isArray(paso.solo_lineas) ? paso.solo_lineas : [])) {
          const opL = pasoLinea && pasoLinea.opciones.find(o => o && o.id === l);
          const min = opL && opL.area_piso_min_m2;
          if (esNumero(min) && esObjeto(op.geometria) && esNumero(op.geometria.area_piso_m2) && !(op.geometria.area_piso_m2 > min)) {
            err(dondeOp, `la base (${op.geometria.area_piso_m2} m²) debe ser mayor a ${min} m², el mínimo de la línea ${opL.nombre}`);
          }
        }
      }

      if (op.reglas !== undefined) {
        if (!esObjeto(op.reglas)) { err(dondeOp, 'reglas debe ser un objeto'); continue; }
        for (const [clave, valor] of Object.entries(op.reglas)) {
          if (REGLAS_LISTA.includes(clave)) {
            if (!Array.isArray(valor)) { err(dondeOp, `reglas.${clave} debe ser una lista`); continue; }
            for (const ref of valor) {
              if (clave === 'solo_lineas' && !idsLinea.has(ref)) err(dondeOp, `reglas.solo_lineas usa "${ref}" que no es una línea`);
              else if (clave === 'solo_tamanos' && !idsTamano.has(ref)) err(dondeOp, `reglas.solo_tamanos usa "${ref}" que no es un tamaño`);
              else if (!['solo_lineas', 'solo_tamanos'].includes(clave) && !opcionesPorId.has(ref)) err(dondeOp, `reglas.${clave} usa la opción "${ref}" que no existe`);
            }
          } else if (REGLAS_NUMERO.includes(clave)) {
            if (!esNumero(valor) || valor < 0) err(dondeOp, `reglas.${clave} debe ser un número en metros`);
          } else {
            err(dondeOp, `regla desconocida "${clave}" (válidas: ${[...REGLAS_LISTA, ...REGLAS_NUMERO].join(', ')})`);
          }
        }
      }
    }
  }

  return errores;
}

function validarPrecio(op, paso, donde, idsLinea, err) {
  const precio = op.precio;
  if (!esObjeto(precio)) { err(donde, 'falta precio { modo, valor }'); return; }
  if (!MODOS_PRECIO.includes(precio.modo)) { err(donde, `precio.modo debe ser uno de: ${MODOS_PRECIO.join(', ')}`); return; }
  if (!esNumero(precio.valor) || precio.valor < 0) err(donde, 'precio.valor debe ser un número mayor o igual a 0');
  if (precio.modo === 'multiplicador' && paso.tipo === 'cantidades') err(donde, 'un multiplicador no puede usarse en un paso de cantidades');
  if (precio.modo === 'multiplicador' && esNumero(precio.valor) && precio.valor <= 0) err(donde, 'un multiplicador debe ser mayor a 0');
  if (precio.valor_por_linea !== undefined) {
    if (!esObjeto(precio.valor_por_linea)) { err(donde, 'precio.valor_por_linea debe ser un objeto { linea: valor }'); return; }
    for (const [linea, valor] of Object.entries(precio.valor_por_linea)) {
      if (!idsLinea.has(linea)) err(donde, `precio.valor_por_linea usa la línea "${linea}" que no existe`);
      if (!esNumero(valor) || valor < 0) err(donde, `precio.valor_por_linea.${linea} debe ser un número`);
    }
  }
}

function validarPredeterminada(paso, ids, donde, err) {
  const pred = paso.predeterminada;
  if (pred === undefined || pred === null) return;
  if (paso.tipo === 'unica') {
    if (typeof pred !== 'string' || !ids.has(pred)) err(donde, `la opción predeterminada "${pred}" no existe en este paso`);
  } else if (paso.tipo === 'multiple') {
    if (!Array.isArray(pred)) err(donde, 'la predeterminada de un paso múltiple debe ser una lista');
    else for (const id of pred) if (!ids.has(id)) err(donde, `la opción predeterminada "${id}" no existe en este paso`);
  } else if (paso.tipo === 'cantidades') {
    if (!esObjeto(pred)) err(donde, 'la predeterminada de un paso de cantidades debe ser { opcion: cantidad }');
    else for (const [id, n] of Object.entries(pred)) {
      if (!ids.has(id)) err(donde, `la opción predeterminada "${id}" no existe en este paso`);
      if (!esEnteroNoNegativo(n)) err(donde, `la cantidad predeterminada de "${id}" debe ser un entero`);
    }
  }
}

module.exports = { validarCatalogo, TIPOS_PASO, MODOS_PRECIO, REGLAS_LISTA, REGLAS_NUMERO };
