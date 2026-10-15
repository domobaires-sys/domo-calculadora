/*
 * Interfaz del configurador. Un único estado (`estado`) alimenta los controles,
 * el visor 3D, el resumen y la solicitud. Toda regla vive en reglas.js.
 */
(function () {
  'use strict';
  const R = window.DomoReglas;
  const CLAVE_GUARDADO = 'domo-configurador-guardado';
  const ETAPAS = ['Elegir modelo', 'Personalizar diseño', 'Modalidad de entrega', 'Revisar y solicitar'];

  let cat = null;
  let estado = null;
  let etapa = 0;
  let visor = null;
  let falloVisor = null;
  let noche = false;
  let vista = 'exterior';
  let avisos = [];
  let solicitud = null;
  const tactil = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  const $ = (id) => document.getElementById(id);
  function h(tag, attrs, ...hijos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of hijos.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : String(c));
    return el;
  }
  const guardar = (fn) => { try { return fn(); } catch (e) { return null; } };

  // ---------- carga ----------
  async function cargarCatalogo() {
    const incrustado = document.getElementById('catalogo-datos');
    if (incrustado) return JSON.parse(incrustado.textContent);
    const r = await fetch('catalogo.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('No se pudo leer el catálogo (' + r.status + ').');
    return r.json();
  }

  async function iniciar() {
    try {
      cat = await cargarCatalogo();
    } catch (e) {
      $('contenido').replaceChildren(h('div', { class: 'aviso error', role: 'alert' },
        h('div', {}, h('strong', {}, 'No se pudo cargar el catálogo. '), e.message),
        h('button', { class: 'btn', onclick: () => location.reload() }, 'Reintentar')));
      return;
    }
    $('sello-version').textContent = `Prototipo privado · catálogo ${cat.version_catalogo} · datos sin validar`;
    estado = R.crearEstado(cat);

    const hash = (location.hash || '').slice(1);
    const compartida = R.decodificar(hash);
    if (compartida) {
      const r = R.recuperar(cat, compartida);
      estado = r.estado;
      etapa = 1;
      avisos.push({ tipo: 'info', texto: 'Estás viendo una copia de una configuración compartida. Lo que cambies acá no modifica la original.', lista: r.avisos });
    } else {
      const guardada = guardar(() => JSON.parse(localStorage.getItem(CLAVE_GUARDADO)));
      if (guardada && guardada.estado) {
        avisos.push({
          tipo: 'info', id: 'recuperar',
          texto: `Tenés una configuración guardada en este dispositivo (${guardada.fecha ? new Date(guardada.fecha).toLocaleDateString('es-AR') : 'sin fecha'}).`,
          acciones: [
            { texto: 'Recuperarla', fn: () => recuperarGuardada(guardada) },
            { texto: 'Descartar', fn: () => { guardar(() => localStorage.removeItem(CLAVE_GUARDADO)); quitarAviso('recuperar'); } },
          ],
        });
      }
    }
    render();
  }

  function recuperarGuardada(g) {
    const r = R.recuperar(cat, g.estado);
    estado = r.estado;
    etapa = 1;
    quitarAviso('recuperar');
    if (r.avisos.length) avisos.push({ tipo: 'pendiente', texto: 'Recuperamos tu configuración con estos ajustes:', lista: r.avisos });
    render();
    enfocar();
  }

  function quitarAviso(id) { avisos = avisos.filter((a) => a.id !== id); renderAvisos(); }

  // ---------- acciones ----------
  function intentar(accion, enfoque) {
    const r = R.aplicar(cat, estado, accion);
    if (r.cambios.length) {
      confirmarCambios(r.cambios, () => aplicarResultado(r, enfoque));
    } else {
      aplicarResultado(r, enfoque);
    }
  }

  function aplicarResultado(r, enfoque) {
    estado = r.estado;
    solicitud = null;
    if (r.cambios.length) avisos = avisos.filter((a) => a.id !== 'cambios').concat({ tipo: 'info', id: 'cambios', texto: 'Se aplicaron estos ajustes:', lista: r.cambios.map((c) => c.texto) });
    render();
    if (visor && enfoque) visor.mirar(enfoque);
  }

  function confirmarCambios(cambios, alAceptar) {
    const cerrar = () => { $('modal').replaceChildren(); };
    const aceptar = h('button', { class: 'btn principal', onclick: () => { cerrar(); alAceptar(); } }, 'Aplicar el cambio');
    const caja = h('div', { class: 'modal-fondo', onclick: (e) => { if (e.target === caja) cerrar(); } },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-titulo', onkeydown: (e) => { if (e.key === 'Escape') cerrar(); } },
        h('h3', { id: 'modal-titulo' }, 'Esta elección cambia otras'),
        h('ul', {}, cambios.map((c) => h('li', {}, c.texto))),
        h('div', { class: 'acciones' }, aceptar, h('button', { class: 'btn', onclick: cerrar }, 'Cancelar'))));
    $('modal').replaceChildren(caja);
    aceptar.focus();
  }

  function irAEtapa(n) {
    etapa = Math.max(0, Math.min(ETAPAS.length - 1, n));
    render();
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  function reiniciar() {
    confirmarCambios([{ texto: 'Se borran todas las elecciones y volvés a la elección de modelo. Lo guardado en este dispositivo no se toca.' }], () => {
      estado = R.crearEstado(cat);
      solicitud = null;
      avisos = avisos.filter((a) => a.id !== 'cambios');
      if (visor) visor.restablecer();
      irAEtapa(0);
    });
  }

  function guardarEnDispositivo() {
    const ok = guardar(() => { localStorage.setItem(CLAVE_GUARDADO, JSON.stringify({ estado, fecha: new Date().toISOString() })); return true; });
    avisos = avisos.filter((a) => a.id !== 'guardado').concat({
      tipo: ok ? 'info' : 'error', id: 'guardado',
      texto: ok ? 'Guardado en este navegador. No es una cuenta: si borrás los datos del navegador o usás otro equipo, no va a estar.' : 'Este navegador no permite guardar. Usá "Copiar código" para conservarla.',
    });
    renderAvisos();
  }

  async function copiarTexto(texto, boton) {
    const original = boton.textContent;
    try {
      await navigator.clipboard.writeText(texto);
      boton.textContent = 'Copiado';
    } catch (e) {
      boton.textContent = 'Seleccioná y copiá';
      const pre = boton.closest('.bloque') && boton.closest('.bloque').querySelector('pre, code');
      if (pre) { const rango = document.createRange(); rango.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(rango); }
    }
    setTimeout(() => { boton.textContent = original; }, 2200);
  }

  // ---------- render ----------
  function render() {
    renderEtapas();
    renderAvisos();
    const cont = $('contenido');
    if (etapa === 0) {
      if (visor) { visor.destruir(); visor = null; }
      cont.replaceChildren(vistaModelos());
    } else {
      let mesa = cont.querySelector('.mesa');
      if (!mesa) {
        mesa = h('div', { class: 'mesa' }, h('div', { class: 'visor', id: 'visor' }), h('div', { class: 'panel', id: 'panel' }));
        cont.replaceChildren(mesa);
        montarVisor();
      }
      renderVisorUI();
      $('panel').replaceChildren(...panelEtapa());
    }
    renderBarra();
  }

  function renderEtapas() {
    $('etapas').replaceChildren(...ETAPAS.map((t, i) => h('li', {},
      h('button', { type: 'button', 'aria-current': i === etapa ? 'step' : null, onclick: () => irAEtapa(i), 'aria-label': `Etapa ${i + 1}: ${t}` }, t))));
  }

  function renderAvisos() {
    $('avisos').replaceChildren(...avisos.map((a) => h('div', { class: `aviso ${a.tipo}`, role: a.tipo === 'error' ? 'alert' : null },
      h('div', {}, a.texto, a.lista && a.lista.length ? h('ul', {}, a.lista.map((x) => h('li', {}, x))) : null),
      h('div', { class: 'acciones' },
        (a.acciones || []).map((ac) => h('button', { class: 'btn', onclick: ac.fn }, ac.texto)),
        !a.acciones ? h('button', { class: 'btn texto', onclick: () => { avisos = avisos.filter((x) => x !== a); renderAvisos(); } }, 'Cerrar') : null))));
  }

  function vistaModelos() {
    return h('section', { 'aria-labelledby': 'titulo-modelos' },
      h('h1', { id: 'titulo-modelos' }, 'Elegí tu modelo'),
      h('p', { class: 'bajada' }, 'Tres modelos de la colección inicial. Después vas a poder personalizar el diseño, elegir cómo te lo entregamos y pedir el presupuesto. No hace falta crear una cuenta.'),
      h('div', { class: 'modelos' }, cat.modelos.map((m) => {
        const elegido = estado.modelo === m.id;
        return h('button', {
          type: 'button', class: 'tarjeta-modelo', 'aria-pressed': elegido ? 'true' : 'false',
          onclick: () => {
            if (estado.modelo !== m.id) {
              const r = R.aplicar(cat, estado, { tipo: 'modelo', modelo: m.id });
              if (r.cambios.length) return confirmarCambios(r.cambios, () => { aplicarResultado(r); irAEtapa(1); });
              estado = r.estado;
            }
            irAEtapa(1);
          },
        },
        h('div', { class: 'imagen-pendiente' }, `Imagen de ${m.nombre} pendiente: falta la referencia aprobada`),
        h('h3', {}, m.nombre),
        h('dl', { class: 'datos' },
          h('dt', {}, 'Superficie'), h('dd', {}, m.superficie_m2 ? `${m.superficie_m2} m²` : 'pendiente'),
          h('dt', {}, 'Altura'), h('dd', {}, m.altura_m ? `${m.altura_m} m` : 'pendiente'),
          h('dt', {}, 'Uso previsto'), h('dd', {}, m.uso || 'pendiente'),
          h('dt', {}, 'Variantes'), h('dd', {}, String(m.variantes.length)),
          h('dt', {}, 'Diferencias'), h('dd', {}, m.diferencias.length ? m.diferencias.join(' · ') : 'a confirmar por DOMO BAIRES')),
        h('span', { class: 'btn principal' }, elegido ? `Seguir con ${m.nombre}` : `Configurar ${m.nombre}`));
      })));
  }

  // ---------- visor ----------
  function montarVisor() {
    const cont = $('visor');
    falloVisor = null;
    visor = window.DomoVisor ? window.DomoVisor.crearVisor(cont, { alError: (motivo) => { falloVisor = motivo; renderVisorUI(); } }) : null;
    if (!visor && !falloVisor) falloVisor = 'sin_libreria';
    if (visor) {
      if (tactil) visor.activarToque(false);
      visor.setNoche(noche);
    }
  }

  function datosVisor() {
    const term = R.categoriaDe(cat, 'terminacion').opciones.find((o) => o.id === estado.sel.terminacion);
    return { color: term && term.color, aberturas: R.aberturas(cat, estado), portico: estado.sel.portico === 'portico_recto' };
  }

  function renderVisorUI() {
    const cont = $('visor');
    if (!cont) return;
    cont.querySelectorAll('.visor-rotulo, .visor-herramientas, .visor-tocar, .visor-estado, .nota-vista').forEach((n) => n.remove());
    const m = R.modeloDe(cat, estado.modelo);
    if (falloVisor) {
      const textos = {
        sin_libreria: 'No se pudo cargar el visor 3D (sin conexión o bloqueado).',
        sin_webgl: 'Este dispositivo o navegador no muestra 3D.',
        contexto_perdido: 'El visor 3D se detuvo (el dispositivo liberó memoria gráfica).',
      };
      cont.append(h('div', { class: 'visor-estado', role: 'status' }, h('div', {},
        h('p', {}, h('strong', {}, textos[falloVisor] || 'El visor 3D no está disponible.')),
        h('p', {}, 'Podés seguir configurando y pedir el presupuesto igual: tu selección se mantiene.'),
        h('button', { class: 'btn', onclick: () => { if (visor) { visor.destruir(); visor = null; } montarVisor(); renderVisorUI(); } }, 'Reintentar'))));
      return;
    }
    visor.construir(datosVisor());
    const ab = R.aberturas(cat, estado);
    visor.describir(`Maqueta interna de ${m.nombre}: ${ab.filter((a) => a.tipo === 'puerta').length} puerta, ${ab.filter((a) => a.tipo === 'ventana').length} ventanas${estado.sel.portico === 'portico_recto' ? ', con pórtico' : ''}. No representa la forma real del modelo.`);
    cont.append(h('div', { class: 'visor-rotulo' },
      h('span', { class: 'chip maqueta' }, `Maqueta interna: no es la forma real de ${m.nombre}`),
      h('span', { class: 'chip vista' }, vista === 'planta' ? 'Vista superior del 3D · sin cotas' : 'Vista exterior')));
    const boton = (texto, activo, fn, extra) => h('button', Object.assign({ type: 'button', 'aria-pressed': activo === null ? null : String(!!activo), onclick: fn }, extra || {}), texto);
    cont.append(h('div', { class: 'visor-herramientas', role: 'toolbar', 'aria-label': 'Controles de visualización (no cambian el presupuesto)' },
      boton('Exterior', vista === 'exterior', () => { vista = 'exterior'; visor.cambiarVista('exterior'); renderVisorUI(); }),
      boton('Planta', vista === 'planta', () => { vista = 'planta'; visor.cambiarVista('planta'); renderVisorUI(); }),
      boton('Interior', false, null, { disabled: true, title: 'Sin contenido interior aprobado todavía' }),
      boton(noche ? 'Día' : 'Noche', null, () => { noche = !noche; visor.setNoche(noche); renderVisorUI(); }),
      boton('Centrar', null, () => { vista = 'exterior'; visor.restablecer(); renderVisorUI(); }),
      document.fullscreenEnabled ? boton('Pantalla completa', null, () => {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else cont.requestFullscreen().catch(() => {});
      }) : null));
    if (tactil) {
      const activo = cont.classList.contains('activo');
      cont.append(h('button', { type: 'button', class: 'visor-tocar', onclick: () => { visor.activarToque(!activo); renderVisorUI(); } }, activo ? 'Listo, volver a desplazar' : 'Tocar para girar el 3D'));
    }
  }

  // ---------- panel ----------
  function panelEtapa() {
    if (etapa === 1) return panelDiseno();
    if (etapa === 2) return panelModalidad();
    return panelRevision();
  }

  function encabezado(titulo, bajada) {
    return h('div', {}, h('h1', {}, titulo), bajada ? h('p', { class: 'bajada' }, bajada) : null);
  }

  function pill(estadoDato) {
    if (!estadoDato || estadoDato === 'confirmado') return null;
    const txt = { pendiente: 'sin validar', supuesto: 'supuesto', ejemplo: 'ejemplo' }[estadoDato] || estadoDato;
    return h('span', { class: 'estado-pill', title: cat.estados[estadoDato] || '' }, txt);
  }

  function grupoRadio(titulo, opciones, seleccion, alElegir, extra) {
    const id = 'g-' + titulo.toLowerCase().replace(/[^a-z]+/g, '-');
    const botones = opciones.map((o, i) => {
      const ev = o.evaluacion || { disponible: true, cambios: [] };
      const marcado = o.id === seleccion;
      return h('button', {
        type: 'button', role: 'radio', class: 'opcion', 'aria-checked': String(marcado),
        'aria-disabled': ev.disponible ? null : 'true', tabindex: marcado || (!seleccion && i === 0) ? '0' : '-1',
        'aria-describedby': ev.disponible ? null : `${id}-${o.id}`,
        onclick: () => { if (ev.disponible && !marcado) alElegir(o.id); },
        onkeydown: (e) => moverFoco(e),
      },
      o.color ? h('span', { class: 'muestra', style: `background:${o.color}`, 'aria-hidden': 'true' }) : null,
      h('span', { class: 'nombre' }, o.nombre, ' ', pill(o.estado)),
      o.detalle ? h('span', { class: 'detalle' }, o.detalle) : null,
      !ev.disponible ? h('span', { class: 'detalle', id: `${id}-${o.id}` }, ev.motivo) : null,
      ev.disponible && ev.cambios && ev.cambios.length && !marcado ? h('span', { class: 'cambia' }, `Cambia ${ev.cambios.length === 1 ? 'otra elección' : ev.cambios.length + ' elecciones'}`) : null);
    });
    return h('section', { class: 'bloque', 'aria-labelledby': id },
      h('h2', { id }, titulo),
      extra && extra.ayuda ? h('p', { class: 'ayuda' }, extra.ayuda) : null,
      h('div', { class: 'opciones', role: 'radiogroup', 'aria-labelledby': id }, botones),
      extra && extra.despues);
  }

  function moverFoco(e) {
    const claves = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!(e.key in claves)) return;
    e.preventDefault();
    const grupo = [...e.currentTarget.parentElement.querySelectorAll('[role="radio"]')];
    const i = grupo.indexOf(e.currentTarget);
    const sig = grupo[(i + claves[e.key] + grupo.length) % grupo.length];
    sig.focus();
  }

  function panelDiseno() {
    const m = R.modeloDe(cat, estado.modelo);
    const v = R.varianteDe(m, estado.variante);
    const bloques = [encabezado(`Personalizá ${m.nombre}`, 'Cada cambio se ve en la maqueta. Las opciones marcadas "sin validar" todavía no están confirmadas por DOMO BAIRES.')];

    bloques.push(grupoRadio('Variante', m.variantes.map((x) => ({ id: x.id, nombre: x.nombre, detalle: x.descripcion, estado: x.estado })), estado.variante,
      (id) => intentar({ tipo: 'variante', variante: id }),
      { ayuda: v.tipo === 'cerrada' ? `${v.nombre} es un conjunto cerrado: lo que trae aparece bloqueado y explica por qué.` : 'Los nombres de las variantes son provisorios.' }));

    for (const c of cat.categorias) {
      const opts = c.opciones.map((o) => ({ id: o.id, nombre: o.nombre, color: o.color, estado: o.estado, detalle: o.descripcion || R.textoPrecio(cat, o.precio), evaluacion: R.evaluarOpcion(cat, estado, c.id, o.id) }));
      const enfoque = c.posicion === 'ventana' ? (m.posiciones.ventana || [])[0] : c.posicion === 'puerta' || c.id === 'portico' ? 'frente' : null;
      if (c.control === 'multiple') {
        bloques.push(h('section', { class: 'bloque', 'aria-labelledby': 'g-' + c.id },
          h('h2', { id: 'g-' + c.id }, c.nombre),
          c.ayuda ? h('p', { class: 'ayuda' }, c.ayuda) : null,
          h('div', { class: 'opciones' }, opts.map((o) => {
            const marcado = (estado.sel[c.id] || []).includes(o.id);
            return h('button', {
              type: 'button', role: 'checkbox', class: 'opcion', 'aria-checked': String(marcado), 'aria-disabled': o.evaluacion.disponible ? null : 'true',
              onclick: () => { if (o.evaluacion.disponible) intentar({ tipo: 'elegir', categoria: c.id, opcion: o.id }); },
            }, h('span', { class: 'nombre' }, o.nombre, ' ', pill(o.estado)), h('span', { class: 'detalle' }, o.detalle),
            h('span', { class: 'detalle' }, `Precio: ${R.textoPrecio(cat, c.opciones.find((x) => x.id === o.id).precio).toLowerCase()}`));
          }))));
        continue;
      }
      let despues = null;
      if (c.cantidad) {
        const lim = R.limiteCantidad(cat, estado, c.id);
        const n = estado.cant[c.id] || 0;
        const cambiar = (k) => intentar({ tipo: 'cantidad', categoria: c.id, cantidad: n + k }, k > 0 ? (m.posiciones.ventana || [])[n] : (m.posiciones.ventana || [])[Math.max(0, n - 2)]);
        despues = h('div', { class: 'contador' },
          h('span', { id: `cant-${c.id}` }, c.cantidad.nombre),
          h('button', { type: 'button', 'aria-label': `Quitar una (${c.cantidad.nombre})`, disabled: n <= lim.min, onclick: () => cambiar(-1) }, '−'),
          h('output', { 'aria-live': 'polite', 'aria-labelledby': `cant-${c.id}` }, String(n)),
          h('button', { type: 'button', 'aria-label': `Agregar una (${c.cantidad.nombre})`, disabled: n >= lim.max, onclick: () => cambiar(1) }, '+'),
          h('span', { class: 'limites' }, lim.fija !== null ? `Fijo en ${v.nombre}` : `De ${lim.min} a ${lim.max} en ${m.nombre} (posiciones: ${(m.posiciones.ventana || []).slice(0, lim.max).join(', ')})`));
      }
      bloques.push(grupoRadio(c.nombre, opts, estado.sel[c.id], (id) => intentar({ tipo: 'elegir', categoria: c.id, opcion: id }, enfoque),
        { ayuda: c.control === 'muestras' ? 'Colores aproximados en pantalla.' : null, despues }));
    }
    bloques.push(h('div', { class: 'acciones' },
      h('button', { class: 'btn', onclick: guardarEnDispositivo }, 'Guardar en este dispositivo'),
      h('button', { class: 'btn texto', onclick: reiniciar }, 'Empezar de nuevo')));
    return bloques;
  }

  function panelModalidad() {
    const m = R.modeloDe(cat, estado.modelo);
    return [
      encabezado('¿Cómo querés recibirlo?', 'La modalidad cambia el alcance de la entrega, no el diseño que armaste.'),
      grupoRadio('Modalidad de entrega', cat.modalidades.filter((x) => x.id in m.modalidades).map((x) => ({
        id: x.id, nombre: x.nombre, estado: m.modalidades[x.id] === 'confirmado' ? null : 'pendiente',
        detalle: m.modalidades[x.id] === 'confirmado' ? x.descripcion : `Disponibilidad para ${m.nombre} e inclusiones a confirmar por DOMO BAIRES.`,
      })), estado.modalidad, (id) => intentar({ tipo: 'modalidad', modalidad: id })),
      estado.modalidad ? (() => {
        const x = cat.modalidades.find((y) => y.id === estado.modalidad);
        return h('section', { class: 'bloque' }, h('h2', {}, `Qué incluye ${x.nombre}`),
          x.incluye.length ? h('ul', {}, x.incluye.map((i) => h('li', {}, i))) : h('p', { class: 'ayuda' }, 'Pendiente: DOMO BAIRES todavía no confirmó qué incluye y qué no. Se va a detallar en el presupuesto.'),
          x.excluye.length ? h('div', {}, h('strong', {}, 'No incluye: '), x.excluye.join(', ')) : null);
      })() : null,
    ];
  }

  function panelRevision() {
    const res = R.resumen(cat, estado);
    const errores = R.validar(cat, estado);
    const img = visor ? visor.capturar() : null;
    const bloques = [encabezado('Revisá y pedí tu presupuesto', 'Esto es exactamente lo que se envía con tu consulta.')];
    bloques.push(h('section', { class: 'bloque', 'aria-labelledby': 'g-resumen' },
      h('h2', { id: 'g-resumen' }, 'Tu configuración'),
      img ? h('img', { class: 'captura', src: img, alt: 'Imagen de la maqueta con la selección actual' }) : null,
      h('table', { class: 'resumen' },
        h('tbody', {}, res.lineas.map((l) => h('tr', {}, h('th', { scope: 'row' }, l.etiqueta), h('td', {}, l.valor, ' ', pill(l.estado)), h('td', { class: 'precio' }, l.precio || '')))),
        h('tfoot', {}, h('tr', {}, h('td', { colspan: '2' }, 'Precio'), h('td', { class: 'precio' }, res.total.texto)))),
      h('p', { class: 'ayuda' }, 'Sin precios validados todavía: el presupuesto lo prepara DOMO BAIRES. Transporte, montaje, fundaciones y trabajos según la ubicación se cotizan aparte. La maqueta no reemplaza el cálculo estructural.'),
      h('div', { class: 'acciones' },
        h('button', { class: 'btn', onclick: guardarEnDispositivo }, 'Guardar en este dispositivo'),
        h('button', { class: 'btn', onclick: (e) => copiarTexto(R.codificar(estado), e.currentTarget) }, 'Copiar código de configuración')),
      h('p', { class: 'ayuda' }, 'El código guarda solo las elecciones y la versión del catálogo, nunca tus datos personales.')));

    if (errores.length) {
      bloques.push(h('div', { class: 'aviso pendiente', role: 'status' }, h('div', {}, 'Antes de pedir el presupuesto falta:', h('ul', {}, errores.map((x) => h('li', {}, x)))),
        !estado.modalidad ? h('button', { class: 'btn', onclick: () => irAEtapa(2) }, 'Elegir modalidad') : null));
    }
    bloques.push(formulario(errores));
    if (solicitud) bloques.push(solicitud);
    return bloques;
  }

  function campo(id, etiqueta, porQue, control) {
    return h('div', { class: 'campo' + (control.dataset.ancho ? ' ancho' : '') },
      h('label', { for: id }, etiqueta, ' ', h('span', { class: 'por-que' }, porQue)), control);
  }

  function formulario(errores) {
    const f = h('form', { class: 'bloque', novalidate: true, 'aria-labelledby': 'g-form', onsubmit: (e) => enviar(e) },
      h('h2', { id: 'g-form' }, 'Tus datos de contacto'),
      h('p', { class: 'ayuda' }, 'Los campos con * son obligatorios. Pedimos solo lo necesario para preparar el presupuesto.'),
      h('div', { class: 'formulario' },
        campo('f-nombre', 'Nombre *', '(para dirigirnos a vos)', h('input', { id: 'f-nombre', name: 'nombre', autocomplete: 'name', required: true })),
        campo('f-contacto', 'Teléfono o email *', '(para enviarte el presupuesto)', h('input', { id: 'f-contacto', name: 'contacto', autocomplete: 'email', required: true })),
        campo('f-localidad', 'Localidad de instalación *', '(cambia transporte y montaje)', h('input', { id: 'f-localidad', name: 'localidad', autocomplete: 'address-level2', required: true })),
        campo('f-unidades', 'Cantidad de unidades', '(opcional)', h('input', { id: 'f-unidades', name: 'unidades', type: 'number', min: '1', max: '50', value: '1', inputmode: 'numeric' })),
        (() => { const s = h('select', { id: 'f-uso', name: 'uso', 'data-ancho': '1' },
          ['Sin especificar', 'Vivienda permanente', 'Segunda vivienda o fin de semana', 'Alojamiento para alquilar', 'Estudio u oficina', 'Otro'].map((x) => h('option', {}, x)));
        return campo('f-uso', 'Uso previsto', '(opcional, ayuda a recomendar)', s); })()),
      h('div', { id: 'f-errores', 'aria-live': 'polite' }),
      h('div', { class: 'acciones' }, h('button', { type: 'submit', class: 'btn principal', 'aria-disabled': errores.length ? 'true' : null }, 'Solicitar presupuesto de esta configuración')));
    return f;
  }

  function enviar(e) {
    e.preventDefault();
    const f = e.currentTarget;
    const datos = Object.fromEntries(new FormData(f).entries());
    const faltan = [];
    for (const [k, t] of [['nombre', 'Nombre'], ['contacto', 'Teléfono o email'], ['localidad', 'Localidad de instalación']]) {
      const vacio = !String(datos[k] || '').trim();
      f.elements[k].setAttribute('aria-invalid', String(vacio));
      if (vacio) faltan.push(`Completá ${t}.`);
    }
    const errores = R.validar(cat, estado).concat(faltan);
    if (errores.length) {
      $('f-errores').replaceChildren(h('div', { class: 'aviso error', role: 'alert' }, h('div', {}, 'No se puede preparar la solicitud todavía:', h('ul', {}, errores.map((x) => h('li', {}, x))))));
      return;
    }
    const res = R.resumen(cat, estado);
    const texto = [
      'Solicitud de presupuesto · DOMO BAIRES',
      `Catálogo ${res.version} · código ${R.codificar(estado)}`,
      '',
      ...res.lineas.map((l) => `${l.etiqueta}: ${l.valor}${l.precio ? ` (${l.precio})` : ''}`),
      `Precio: ${res.total.texto}`,
      '',
      `Nombre: ${datos.nombre}`,
      `Contacto: ${datos.contacto}`,
      `Localidad: ${datos.localidad}`,
      `Uso previsto: ${datos.uso}`,
      `Unidades: ${datos.unidades || 1}`,
    ].join('\n');
    solicitud = h('section', { class: 'bloque', 'aria-labelledby': 'g-sol' },
      h('h2', { id: 'g-sol' }, 'Solicitud preparada (no enviada)'),
      h('div', { class: 'aviso pendiente' }, 'En este prototipo la solicitud no se envía a ningún lado: falta que DOMO BAIRES defina el canal (formulario propio, WhatsApp o el sistema que ya use). Este es el contenido que recibiría.'),
      h('pre', { class: 'solicitud' }, texto),
      h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn', onclick: (ev) => copiarTexto(texto, ev.currentTarget) }, 'Copiar solicitud')));
    render();
    $('g-sol') && $('g-sol').scrollIntoView({ block: 'start' });
  }

  function renderBarra() {
    const m = R.modeloDe(cat, estado.modelo);
    const sig = etapa < ETAPAS.length - 1;
    $('barra').replaceChildren(h('div', { class: 'dentro' },
      etapa > 0 ? h('button', { class: 'btn', onclick: () => irAEtapa(etapa - 1) }, 'Atrás') : h('span', {}),
      h('span', { class: 'que' }, etapa === 0 ? `${cat.modelos.length} modelos` : `${m.nombre} · ${ETAPAS[etapa]}`),
      sig ? h('button', { class: 'btn principal', onclick: () => irAEtapa(etapa + 1) }, etapa === 0 ? `Configurar ${m.nombre}` : h('span', {}, 'Siguiente', h('span', { class: 'largo' }, `: ${ETAPAS[etapa + 1]}`)))
        : h('button', { class: 'btn principal', onclick: () => { const n = $('f-nombre'); if (n) { n.scrollIntoView({ block: 'center' }); n.focus(); } } }, 'Solicitar presupuesto')));
  }

  function enfocar() { const p = $('panel'); if (p) p.scrollTop = 0; }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
