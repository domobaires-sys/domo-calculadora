/*
 * Reglas del configurador de DOMO BAIRES.
 *
 * Funciones puras: reciben el catálogo y un estado de configuración y
 * devuelven datos nuevos, sin tocar la página. Las usan la interfaz, el
 * resumen, la solicitud y las pruebas (y, más adelante, el servidor que
 * reciba las solicitudes, para revalidarlas).
 *
 * Estado de configuración (única fuente de verdad):
 *   { v, modelo, opciones: { trama: 'a', color: 'natural' }, modalidad }
 *
 * Nada de lo que se muestra se inventa: los textos salen del catálogo y las
 * medidas, de los datos que trae cada modelo 3D de DOMO.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.DomoReglas = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PENDIENTE = 'Pendiente de cotización';
  const FORMATO_CODIGO = 'd1';
  const CLAVE_ENTREGA = 'entrega';
  const ID_VALIDO = /^[a-z0-9_]+$/;
  const CODIGO_VALIDO = /^[A-Za-z0-9._-]+$/;

  const copiar = (o) => JSON.parse(JSON.stringify(o));

  // ---------- búsquedas ----------
  function modeloDe(cat, id) { return cat.modelos.find((m) => m.id === id) || null; }
  function modalidadDe(cat, id) { return cat.modalidades.find((x) => x.id === id) || null; }
  function opcionesDe(modelo) { return (modelo && modelo.opciones) || []; }
  function valorDe(opcion, id) { return (opcion && opcion.valores.find((v) => v.id === id)) || null; }

  // ---------- estado ----------
  function crearEstado(cat, modeloId) {
    const m = modeloDe(cat, modeloId) || cat.modelos[0];
    const opciones = {};
    for (const o of opcionesDe(m)) opciones[o.id] = o.predeterminada;
    return { v: cat.version_catalogo, modelo: m.id, opciones, modalidad: null };
  }

  /**
   * Deja el estado coherente con el catálogo: modelo existente, solo las
   * opciones de ese modelo con valores válidos y una modalidad que exista.
   * Devuelve el estado nuevo y la lista de ajustes, en castellano.
   */
  function normalizar(cat, entrada) {
    const e = entrada && typeof entrada === 'object' ? copiar(entrada) : {};
    const cambios = [];
    let m = modeloDe(cat, e.modelo);
    if (!m) {
      if (e.modelo) cambios.push(`El modelo "${e.modelo}" no está en el catálogo; se eligió ${cat.modelos[0].nombre}.`);
      m = cat.modelos[0];
    }
    const antes = e.opciones && typeof e.opciones === 'object' ? e.opciones : {};
    const opciones = {};
    for (const o of opcionesDe(m)) {
      const pedido = antes[o.id];
      if (pedido !== undefined && !valorDe(o, pedido)) {
        cambios.push(`${o.nombre}: la opción guardada ya no existe; se eligió ${valorDe(o, o.predeterminada).nombre}.`);
      }
      opciones[o.id] = valorDe(o, pedido) ? pedido : o.predeterminada;
    }
    for (const k of Object.keys(antes)) {
      if (!opcionesDe(m).some((o) => o.id === k)) cambios.push(`${m.nombre} no tiene la opción "${k}"; se quitó.`);
    }
    let modalidad = e.modalidad || null;
    if (modalidad && !modalidadDe(cat, modalidad)) {
      cambios.push('La modalidad de entrega guardada ya no existe; elegila de nuevo.');
      modalidad = null;
    }
    return { estado: { v: cat.version_catalogo, modelo: m.id, opciones, modalidad }, cambios };
  }

  /** Aplica una acción del cliente y devuelve { estado, cambios } sin modificar el original. */
  function aplicar(cat, estado, accion) {
    const e = normalizar(cat, estado).estado;
    switch (accion && accion.tipo) {
      case 'modelo': {
        if (!modeloDe(cat, accion.modelo)) return { estado: e, cambios: ['Ese modelo no está en el catálogo.'] };
        if (accion.modelo === e.modelo) return { estado: e, cambios: [] };
        // Cada modelo tiene sus propias opciones: las del anterior no se arrastran.
        const nuevo = crearEstado(cat, accion.modelo);
        nuevo.modalidad = e.modalidad;
        return { estado: nuevo, cambios: [] };
      }
      case 'opcion': {
        const o = opcionesDe(modeloDe(cat, e.modelo)).find((x) => x.id === accion.opcion);
        if (!o) return { estado: e, cambios: ['Esa opción no corresponde al modelo elegido.'] };
        if (!valorDe(o, accion.valor)) return { estado: e, cambios: [`${o.nombre}: esa opción no existe.`] };
        e.opciones[o.id] = accion.valor;
        return { estado: e, cambios: [] };
      }
      case 'modalidad': {
        if (!modalidadDe(cat, accion.modalidad)) return { estado: e, cambios: ['Esa modalidad de entrega no existe.'] };
        e.modalidad = accion.modalidad;
        return { estado: e, cambios: [] };
      }
      default:
        throw new Error('Acción desconocida: ' + (accion && accion.tipo));
    }
  }

  // ---------- modelo 3D, color y medidas ----------
  /** Archivo 3D que corresponde a la configuración (la trama del Áureo elige el GLB). */
  function archivo3d(cat, estado) {
    const m = modeloDe(cat, estado.modelo);
    if (!m) return null;
    let id = m.modelo_3d;
    for (const o of opcionesDe(m)) {
      const v = valorDe(o, estado.opciones && estado.opciones[o.id]);
      if (o.tipo === 'modelo_3d' && v && v.archivo_3d) id = v.archivo_3d;
    }
    return (m.archivos_3d || []).find((a) => a.id === id) || null;
  }

  /** Color elegido para un material del modelo 3D, o null si va el color original del archivo. */
  function colorMaterial(cat, estado) {
    const m = modeloDe(cat, estado.modelo);
    for (const o of opcionesDe(m)) {
      if (o.tipo !== 'color_material') continue;
      const v = valorDe(o, estado.opciones && estado.opciones[o.id]);
      return { material: o.material, hex: (v && v.hex) || null };
    }
    return null;
  }

  function medidasDe(cat, estado) {
    const a = archivo3d(cat, estado);
    if (a && a.medidas) return a.medidas;
    const m = modeloDe(cat, estado.modelo);
    return (m && m.medidas) || null;
  }

  /** Número con coma decimal, sin ceros de más: 4.747 → "4,75"; 3 → "3"; 15.48 (1 decimal) → "15,5". */
  function numero(n, decimales) {
    if (typeof n !== 'number' || !isFinite(n)) return '';
    // Redondeo "de manual" (1,795 → 1,80) aunque el número binario quede apenas por debajo.
    const f = Math.pow(10, decimales);
    let s = (Math.round(n * f + 1e-7 * Math.sign(n)) / f).toFixed(decimales);
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s.replace('.', ',');
  }

  function unidadDe(clave) {
    if (/_m2$/.test(clave)) return 'm²';
    if (/_m$/.test(clave)) return 'm';
    return '';
  }

  /** Valor de una medida sin unidad: largos con 2 decimales, superficies con 1, cantidades enteras. */
  function valorMedida(clave, valor) {
    const u = unidadDe(clave);
    return numero(valor, u === 'm²' ? 1 : u === 'm' ? 2 : 0);
  }

  function textoMedida(clave, valor) {
    const u = unidadDe(clave);
    const v = valorMedida(clave, valor);
    return u ? `${v} ${u}` : v;
  }

  /** "7,85 × 7,87 × 4,75 m" (ancho × fondo × alto) o null si el modelo 3D todavía no está. */
  function medidasPrincipales(medidas) {
    if (!medidas || typeof medidas.ancho_m !== 'number') return null;
    return `${valorMedida('ancho_m', medidas.ancho_m)} × ${valorMedida('fondo_m', medidas.fondo_m)} × ${valorMedida('alto_m', medidas.alto_m)} m`;
  }

  /** Medidas extra que el catálogo pide mostrar, en su orden, con su etiqueta. */
  function listaMedidas(cat, medidas) {
    if (!medidas) return [];
    const etiquetas = cat.etiquetas_medidas || {};
    return (cat.medidas_visibles || [])
      .filter((k) => typeof medidas[k] === 'number')
      .map((k) => ({ clave: k, etiqueta: etiquetas[k] || k, texto: textoMedida(k, medidas[k]) }));
  }

  /** Datos disponibles para las plantillas de composición: medidas del modelo 3D y cantidad de puertas. */
  function datosModelo3d(cat, estado) {
    const a = archivo3d(cat, estado);
    const datos = Object.assign({}, medidasDe(cat, estado) || {});
    if (a && typeof a.puertas === 'number') datos.puertas = a.puertas;
    return datos;
  }

  /**
   * Lista "qué incluye" del modelo. Cada elemento puede traer un texto fijo
   * (`valor`) o una `plantilla` con {claves} que se completan con los datos
   * del modelo 3D. Lo que falta o está pendiente se muestra "A confirmar".
   */
  function composicion(cat, estado) {
    const m = modeloDe(cat, estado.modelo);
    const datos = datosModelo3d(cat, estado);
    return ((m && m.composicion) || []).map((c) => {
      let texto = null;
      if (c.estado !== 'pendiente') {
        if (c.plantilla) {
          let falta = false;
          texto = c.plantilla.replace(/\{([\p{L}\p{N}_]+)\}/gu, (_, k) => {
            if (typeof datos[k] !== 'number') { falta = true; return ''; }
            return valorMedida(k, datos[k]);
          });
          if (falta) texto = null;
        } else if (c.valor) {
          texto = c.valor;
        }
      }
      return { id: c.id, nombre: c.nombre, texto: texto || 'A confirmar', pendiente: !texto };
    });
  }

  // ---------- precios ----------
  function miles(n) {
    const [ent, dec] = String(n).split('.');
    const conPuntos = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return dec ? `${conPuntos},${dec}` : conPuntos;
  }

  /** Un precio sin dato, sin moneda o en cero nunca se muestra como número: es "Pendiente de cotización". */
  function textoPrecio(precio) {
    if (!precio || precio.estado !== 'valor') return PENDIENTE;
    if (typeof precio.importe !== 'number' || !(precio.importe > 0) || !precio.moneda) return PENDIENTE;
    const iva = precio.iva === 'incluido' ? ' (IVA incluido)' : precio.iva === 'no_incluido' ? ' + IVA' : '';
    return `${precio.moneda} ${miles(precio.importe)}${iva}`;
  }

  function precioDe(cat, estado) {
    const m = modeloDe(cat, estado.modelo);
    if (!m || !estado.modalidad) return null;
    return (m.precios && m.precios[estado.modalidad]) || null;
  }

  // ---------- resumen ----------
  /** Líneas del resumen, iguales en pantalla y en la solicitud. */
  function resumen(cat, estado) {
    const m = modeloDe(cat, estado.modelo);
    const lineas = [{ clave: 'modelo', etiqueta: 'Modelo', valor: m.nombre }];
    const ops = opcionesDe(m);
    if (!ops.length) lineas.push({ clave: 'diseno', etiqueta: 'Diseño', valor: 'Diseño único' });
    for (const o of ops) {
      const v = valorDe(o, estado.opciones[o.id]);
      lineas.push({ clave: o.id, etiqueta: o.nombre, valor: v ? v.nombre : 'Sin elegir' });
    }
    const med = medidasDe(cat, estado);
    const principales = medidasPrincipales(med);
    lineas.push({
      clave: 'medidas',
      etiqueta: 'Medidas (ancho × fondo × alto)',
      valor: principales ? `${principales}, según el modelo 3D de DOMO` : 'Modelo 3D en preparación',
    });
    if (med && typeof med.piso_area_m2 === 'number') {
      lineas.push({ clave: 'superficie', etiqueta: 'Superficie de piso', valor: textoMedida('piso_area_m2', med.piso_area_m2) });
    }
    const mod = modalidadDe(cat, estado.modalidad);
    lineas.push({ clave: 'entrega', etiqueta: 'Entrega', valor: mod ? mod.nombre : 'Sin elegir' });
    const precio = textoPrecio(precioDe(cat, estado));
    lineas.push({ clave: 'precio', etiqueta: 'Precio', valor: precio });
    return { lineas, precio };
  }

  /** Resumen de una línea para la barra: "Dormi Áureo · Opción A · Natural · Kit". */
  function resumenCorto(cat, estado) {
    const m = modeloDe(cat, estado.modelo);
    const partes = [m.nombre];
    const ops = opcionesDe(m);
    if (!ops.length) partes.push('Diseño único');
    for (const o of ops) { const v = valorDe(o, estado.opciones[o.id]); if (v) partes.push(v.nombre); }
    const mod = modalidadDe(cat, estado.modalidad);
    partes.push(mod ? mod.nombre : 'Entrega sin elegir');
    return partes.join(' · ');
  }

  // ---------- solicitud ----------
  function validarConfiguracion(cat, estado) {
    const errores = [];
    if (!modeloDe(cat, estado && estado.modelo)) errores.push('Elegí un modelo.');
    if (!estado || !modalidadDe(cat, estado.modalidad)) errores.push('Elegí la modalidad de entrega.');
    return errores;
  }

  const limpiar = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

  /** Valida los datos de contacto. Devuelve { ok, errores: { campo: mensaje } }. */
  function validarContacto(datos) {
    const d = datos || {};
    const errores = {};
    const nombre = limpiar(d.nombre);
    const contacto = limpiar(d.contacto);
    const localidad = limpiar(d.localidad);
    const comentario = String(d.comentario == null ? '' : d.comentario).trim();
    if (nombre.length < 2) errores.nombre = 'Escribí tu nombre.';
    else if (nombre.length > 80) errores.nombre = 'El nombre puede tener hasta 80 caracteres.';
    if (!contacto) {
      errores.contacto = 'Dejanos un teléfono o un email.';
    } else if (contacto.includes('@')) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contacto)) errores.contacto = 'Revisá el email: parece incompleto.';
    } else {
      const digitos = contacto.replace(/\D/g, '');
      if (!/^[0-9+()\-.\s]+$/.test(contacto) || digitos.length < 8 || digitos.length > 15) {
        errores.contacto = 'Escribí un teléfono con código de área o un email.';
      }
    }
    if (localidad.length < 2) errores.localidad = 'Indicá la localidad donde va la obra.';
    else if (localidad.length > 80) errores.localidad = 'La localidad puede tener hasta 80 caracteres.';
    if (comentario.length > 1000) errores.comentario = 'El comentario puede tener hasta 1000 caracteres.';
    if (d.consentimiento !== true) errores.consentimiento = 'Para preparar la solicitud tenés que aceptar el uso de tus datos.';
    return { ok: Object.keys(errores).length === 0, errores };
  }

  /** Texto exacto de la solicitud, listo para copiar. No se envía a ningún lado. */
  function textoSolicitud(cat, estado, datos) {
    const r = resumen(cat, estado);
    const comentario = String((datos && datos.comentario) || '').trim().replace(/\r\n?/g, '\n');
    const lineas = [
      'Solicitud de presupuesto · DOMO BAIRES',
      '',
      ...r.lineas.map((l) => `${l.etiqueta}: ${l.valor}`),
      '',
      `Nombre: ${limpiar(datos.nombre)}`,
      `Contacto: ${limpiar(datos.contacto)}`,
      `Localidad de la obra: ${limpiar(datos.localidad)}`,
    ];
    if (comentario) lineas.push(`Comentario: ${comentario}`);
    lineas.push('', `Código de configuración: ${codificar(estado)} (catálogo ${cat.version_catalogo})`);
    return lineas.join('\n');
  }

  // ---------- código de configuración ----------
  /**
   * Código para compartir una configuración: solo letras, números, punto,
   * guion y guion bajo (el visor de páginas privadas solo pasa #códigos simples).
   * Nunca lleva datos personales. Ejemplo: d1.dormi_aureo.trama-b.color-azul.entrega-kit
   */
  function codificar(estado) {
    const partes = [FORMATO_CODIGO, estado.modelo];
    for (const [k, v] of Object.entries(estado.opciones || {})) partes.push(`${k}-${v}`);
    if (estado.modalidad) partes.push(`${CLAVE_ENTREGA}-${estado.modalidad}`);
    return partes.join('.');
  }

  /** Lee un código. Devuelve un estado sin normalizar, o null si el código no es de este formato. */
  function decodificar(texto) {
    if (typeof texto !== 'string' || texto.length > 300 || !CODIGO_VALIDO.test(texto)) return null;
    const partes = texto.split('.');
    if (partes[0] !== FORMATO_CODIGO || !partes[1] || !ID_VALIDO.test(partes[1])) return null;
    const estado = { modelo: partes[1], opciones: {}, modalidad: null };
    for (const p of partes.slice(2)) {
      const i = p.indexOf('-');
      if (i < 1) return null;
      const k = p.slice(0, i);
      const v = p.slice(i + 1);
      if (!ID_VALIDO.test(k) || !ID_VALIDO.test(v)) return null;
      if (k === CLAVE_ENTREGA) estado.modalidad = v;
      else estado.opciones[k] = v;
    }
    return estado;
  }

  /**
   * Abre un código compartido: lo adapta al catálogo actual y explica qué cambió.
   * Con un código viejo o roto vuelve al estado inicial y lo avisa.
   */
  function recuperar(cat, texto) {
    if (!texto) return null;
    const leido = decodificar(texto);
    if (!leido) {
      const viejo = /^c1\./.test(texto);
      return {
        estado: crearEstado(cat),
        avisos: [viejo
          ? 'El enlace es de una versión anterior del configurador y ya no se puede abrir. Empezá una configuración nueva.'
          : 'El código de configuración del enlace no es válido. Empezá una configuración nueva.'],
        valido: false,
      };
    }
    const r = normalizar(cat, leido);
    return { estado: r.estado, avisos: r.cambios, valido: true };
  }

  return {
    PENDIENTE, ID_VALIDO, CODIGO_VALIDO,
    modeloDe, modalidadDe, opcionesDe, valorDe,
    crearEstado, normalizar, aplicar,
    archivo3d, colorMaterial, medidasDe, numero, textoMedida, valorMedida, medidasPrincipales, listaMedidas, composicion,
    textoPrecio, precioDe, resumen, resumenCorto,
    validarConfiguracion, validarContacto, textoSolicitud,
    codificar, decodificar, recuperar,
  };
});
