/*
 * Interfaz del configurador de DOMO BAIRES.
 *
 * Un único estado de configuración (`estado`, ver reglas.js) alimenta el
 * visor 3D, las cuatro etapas, el resumen y la solicitud. Las reglas viven
 * en reglas.js; acá solo se dibuja y se responde a lo que hace la persona.
 *
 * Nada se envía a ningún servicio: la solicitud se prepara para copiarla.
 * En el navegador solo se guarda (si se puede) el código de la configuración
 * y la etapa, nunca datos personales.
 */
(function () {
  'use strict';
  const R = window.DomoReglas;
  const CLAVE_LOCAL = 'domo-configurador-v1';
  const ETAPAS = [
    { id: 'modelo', nombre: 'Modelo' },
    { id: 'diseno', nombre: 'Diseño' },
    { id: 'entrega', nombre: 'Entrega' },
    { id: 'solicitud', nombre: 'Solicitud' },
  ];
  const VISTAS = [
    { id: 'frente', texto: 'Frente' },
    { id: 'tres_cuartos', texto: '3/4' },
    { id: 'lateral', texto: 'Lateral' },
    { id: 'arriba', texto: 'Desde arriba', corto: 'Arriba' },
  ];
  const ARMADO = !!document.getElementById('catalogo-datos');

  let cat = null;
  let estado = null;
  let etapa = 0;
  let alcanzada = 0;
  let avisos = [];
  let visor = null;
  let fallo3d = null;          // 'sin_libreria' | 'sin_webgl' | 'contexto_perdido'
  let estado3d = 'cargando';   // 'cargando' | 'listo' | 'faltante' | 'error'
  let relojCarga = 0;
  let vistaElegida = 'tres_cuartos';
  let solicitud = null;        // texto preparado
  let errores = {};
  const form = { nombre: '', contacto: '', localidad: '', comentario: '', consentimiento: false };

  // ---------- utilidades ----------
  const $ = (id) => document.getElementById(id);
  function h(tag, attrs, ...hijos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of hijos.flat(3)) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : String(c));
    return el;
  }
  const local = {
    leer() { try { return JSON.parse(window.localStorage.getItem(CLAVE_LOCAL) || 'null'); } catch (e) { return null; } },
    guardar(v) { try { window.localStorage.setItem(CLAVE_LOCAL, JSON.stringify(v)); } catch (e) { /* sin almacenamiento: no pasa nada */ } },
  };
  const reducido = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const esCelular = () => !!(window.matchMedia && window.matchMedia('(max-width: 899px)').matches);
  function temaOscuro() {
    const t = document.documentElement.getAttribute('data-theme');
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  const modelo = () => R.modeloDe(cat, estado.modelo);
  function miniaturaDe(m, archivoId) {
    const a = (m.archivos_3d || []).find((x) => x.id === (archivoId || m.modelo_3d));
    return (a && a.miniatura) || null;
  }

  // ---------- inicio ----------
  async function cargarCatalogo() {
    const incrustado = $('catalogo-datos');
    if (incrustado) return JSON.parse(incrustado.textContent);
    const r = await fetch('catalogo.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('No se pudo leer el catálogo (' + r.status + ').');
    return r.json();
  }

  async function iniciar() {
    try {
      cat = await cargarCatalogo();
    } catch (e) {
      $('etapa').replaceChildren(h('div', { class: 'aviso aviso-error', role: 'alert' },
        h('p', {}, 'No se pudo cargar el configurador. ', e.message),
        h('button', { type: 'button', class: 'boton', onclick: () => location.reload() }, 'Reintentar')));
      return;
    }
    estado = R.crearEstado(cat);
    const codigo = decodeURIComponent((location.hash || '').slice(1));
    const guardado = local.leer();
    if (codigo) {
      const r = R.recuperar(cat, codigo);
      estado = r.estado;
      if (r.valido) {
        etapa = estado.modalidad ? 3 : 1;
        avisos.push({ id: 'compartida', texto: 'Abriste una configuración compartida. Podés cambiar lo que quieras.', lista: r.avisos });
      } else {
        avisos.push({ id: 'codigo', tipo: 'error', texto: r.avisos[0] });
      }
    } else if (guardado && guardado.codigo) {
      const r = R.recuperar(cat, guardado.codigo);
      if (r && r.valido) {
        estado = r.estado;
        etapa = Math.max(0, Math.min(ETAPAS.length - 1, guardado.etapa | 0));
      }
    }
    alcanzada = etapa;
    montarVisor();
    escucharTema();
    render();
    sincronizar3d();
  }

  // ---------- visor 3D ----------
  function montarVisor() {
    fallo3d = null;
    if (!window.DomoVisor) { fallo3d = 'sin_libreria'; return; }
    visor = window.DomoVisor.crear($('visor'), { alEstado: alEstado3d, soloIncrustados: ARMADO });
    if (visor) visor.tema(temaOscuro());
  }

  function alEstado3d(e) {
    if (e === 'sin_libreria' || e === 'sin_webgl' || e === 'contexto_perdido') {
      fallo3d = e;
      estado3d = 'error';
    } else {
      estado3d = e;
    }
    clearTimeout(relojCarga);
    if (e === 'cargando') {
      // El indicador aparece solo si la carga se demora: así no parpadea.
      relojCarga = setTimeout(renderVisorUI, 160);
      return;
    }
    renderVisorUI();
  }

  function sincronizar3d() {
    if (!visor) { renderVisorUI(); return; }
    const a = R.archivo3d(cat, estado);
    if (!a) { estado3d = 'faltante'; renderVisorUI(); return; }
    visor.describir(descripcion3d());
    visor.mostrar({ id: a.id, url: a.archivo, color: R.colorMaterial(cat, estado) }).then(() => renderVisorUI());
    renderVisorUI();
  }

  function descripcion3d() {
    const m = modelo();
    const diseno = (m.opciones || []).map((o) => (R.valorDe(o, estado.opciones[o.id]) || {}).nombre).filter(Boolean);
    const med = R.medidasPrincipales(R.medidasDe(cat, estado));
    return `Modelo 3D de ${[m.nombre, ...diseno].join(', ')}${med ? `; ${med} de ancho por fondo por alto` : ''}. Arrastrá para girarlo; con la rueda o con dos dedos te acercás.`;
  }

  function escucharTema() {
    const aplicar = () => { if (visor) visor.tema(temaOscuro()); };
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', aplicar); else if (mq.addListener) mq.addListener(aplicar);
    }
    if (window.MutationObserver) new MutationObserver(aplicar).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  function pantallaCompleta() {
    const el = document.querySelector('.escenario');
    const activo = document.fullscreenElement || document.webkitFullscreenElement;
    try {
      const p = activo
        ? (document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen())
        : (el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen());
      if (p && p.catch) p.catch(() => avisar('pantalla', 'Este navegador no permitió la pantalla completa.'));
    } catch (e) {
      avisar('pantalla', 'Este navegador no permitió la pantalla completa.');
    }
  }
  const hayPantallaCompleta = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  document.addEventListener('fullscreenchange', () => renderVisorUI());
  document.addEventListener('webkitfullscreenchange', () => renderVisorUI());

  function renderVisorUI() {
    if (!cat) return;
    const m = modelo();
    const med = R.medidasDe(cat, estado);
    const principales = R.medidasPrincipales(med);
    const a = R.archivo3d(cat, estado);
    const opcionTrama = (m.opciones || []).find((o) => o.tipo === 'modelo_3d');
    const trama = opcionTrama ? R.valorDe(opcionTrama, estado.opciones[opcionTrama.id]) : null;

    $('visor-rotulo').replaceChildren(
      h('span', { class: 'rotulo-nombre' }, m.nombre, trama ? h('span', { class: 'rotulo-variante' }, ` · ${trama.nombre}`) : null),
      principales ? h('span', { class: 'rotulo-medidas', title: 'Ancho × fondo × alto, según el modelo 3D de DOMO' },
        h('span', { class: 'solo-lectores' }, 'Ancho por fondo por alto: '), principales) : null);

    const listo = !fallo3d && estado3d === 'listo' && visor;
    const capa = $('visor-capa');
    if (fallo3d || estado3d === 'faltante' || estado3d === 'error') {
      const textos = {
        sin_webgl: ['Tu navegador no puede mostrar el 3D', 'Te mostramos una foto de referencia de DOMO. Podés seguir configurando igual.'],
        sin_libreria: ['No se pudo cargar el visor 3D', 'Puede ser la conexión. Mientras tanto, esta es una foto de referencia de DOMO.'],
        contexto_perdido: ['El visor 3D se detuvo', 'El dispositivo liberó memoria gráfica. Esta es una foto de referencia de DOMO.'],
        faltante: ['Modelo 3D en preparación', 'Lo estamos armando desde el archivo de DOMO. Mientras tanto, esta es una foto de referencia.'],
        error: ['No se pudo abrir el modelo 3D', 'Probá de nuevo. Mientras tanto, esta es una foto de referencia de DOMO.'],
      };
      const [titulo, texto] = textos[fallo3d || estado3d] || textos.error;
      capa.className = 'visor-capa visor-capa-aviso';
      capa.replaceChildren(h('div', { class: 'visor-aviso', role: 'status' },
        m.imagen && m.imagen.archivo ? h('img', { src: m.imagen.archivo, alt: m.imagen.alt || `Foto de referencia de ${m.nombre}` }) : null,
        h('div', { class: 'visor-aviso-texto' },
          h('p', { class: 'visor-aviso-titulo' }, titulo),
          h('p', {}, texto),
          (estado3d === 'error' && !fallo3d) || fallo3d === 'contexto_perdido'
            ? h('button', { type: 'button', class: 'boton boton-chico', onclick: reintentar3d }, 'Reintentar') : null)));
    } else if (estado3d === 'cargando' && !(visor && visor.modeloActual && a && visor.modeloActual === a.id)) {
      capa.className = 'visor-capa visor-capa-carga';
      capa.replaceChildren(h('div', { class: 'visor-carga', role: 'status' }, h('span', { class: 'visor-carga-barra', 'aria-hidden': 'true' }), 'Cargando modelo 3D'));
    } else {
      capa.className = 'visor-capa';
      capa.replaceChildren();
    }

    const puertas = listo ? visor.cantidadPuertas : 0;
    const abiertas = listo && visor.puertasAbiertas;
    const plural = puertas > 1 ? 'puertas' : 'puerta';
    const enPantalla = !!(document.fullscreenElement || document.webkitFullscreenElement);
    $('visor-acciones').replaceChildren(
      puertas ? h('button', {
        type: 'button', class: 'boton-visor', 'aria-pressed': String(!!abiertas), id: 'boton-puerta',
        onclick: () => { visor.alternarPuertas(); renderVisorUI(); },
      }, abiertas ? `Cerrar ${plural}` : `Abrir ${plural}`) : null,
      listo && hayPantallaCompleta() ? h('button', { type: 'button', class: 'boton-visor', id: 'boton-pantalla', onclick: pantallaCompleta, 'aria-label': enPantalla ? 'Salir de pantalla completa' : 'Pantalla completa' },
        h('span', { class: 'texto-largo' }, enPantalla ? 'Salir de pantalla completa' : 'Pantalla completa'),
        h('span', { class: 'texto-corto', 'aria-hidden': 'true' }, enPantalla ? 'Salir' : 'Ampliar')) : null);

    $('visor-vistas').replaceChildren(...(listo ? [
      ...VISTAS.map((v) => h('button', {
        type: 'button', class: 'boton-visor', 'aria-pressed': String(vistaElegida === v.id), 'aria-label': v.texto,
        onclick: () => { vistaElegida = v.id; visor.vista(v.id); renderVisorUI(); },
      }, v.corto ? [h('span', { class: 'texto-largo' }, v.texto), h('span', { class: 'texto-corto', 'aria-hidden': 'true' }, v.corto)] : v.texto)),
      h('button', { type: 'button', class: 'boton-visor', onclick: () => { visor.vista('centrar'); } }, 'Centrar'),
    ] : []));
  }

  function reintentar3d() {
    if (fallo3d === 'contexto_perdido' && visor) { visor.destruir(); visor = null; }
    if (!visor) montarVisor();
    estado3d = 'cargando';
    sincronizar3d();
  }

  // ---------- acciones ----------
  function cambiar(accion) {
    const antes = R.archivo3d(cat, estado);
    const r = R.aplicar(cat, estado, accion);
    estado = r.estado;
    solicitud = null;
    if (r.cambios.length) avisar('cambios', r.cambios.join(' '));
    guardarLocal();
    render();
    const despues = R.archivo3d(cat, estado);
    if (!antes || !despues || antes.id !== despues.id) sincronizar3d();
    else if (visor) { visor.colorear(R.colorMaterial(cat, estado)); visor.describir(descripcion3d()); }
  }

  function irA(n, opciones) {
    const op = opciones || {};
    if (n === 3 && etapa === 2 && !estado.modalidad && !op.forzar) {
      errores = { modalidad: 'Elegí una modalidad de entrega para seguir.' };
      render();
      const e = $('error-modalidad');
      if (e) e.focus();
      return;
    }
    errores = {};
    etapa = Math.max(0, Math.min(ETAPAS.length - 1, n));
    alcanzada = Math.max(alcanzada, etapa);
    guardarLocal();
    render();
    // Al cambiar de etapa: arriba de todo (el 3D a la vista), salvo el formulario en celular.
    if (esCelular() && etapa === 3) {
      const p = document.querySelector('.panel');
      if (p) p.scrollIntoView({ block: 'start', behavior: reducido() ? 'auto' : 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: reducido() ? 'auto' : 'smooth' });
    }
    const t = document.querySelector('#etapa h1');
    if (t) t.focus({ preventScroll: true });
  }

  function guardarLocal() {
    const codigo = R.codificar(estado);
    local.guardar({ codigo, etapa });
    try { history.replaceState(null, '', '#' + codigo); } catch (e) { /* el visor de la página puede no permitirlo */ }
  }

  function avisar(id, texto, tipo) {
    avisos = avisos.filter((a) => a.id !== id).concat({ id, texto, tipo: tipo || 'info' });
    renderAvisos();
  }

  async function copiar(texto, boton, seleccionable) {
    const original = boton.dataset.texto || boton.textContent;
    boton.dataset.texto = original;
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(texto); ok = true; }
    } catch (e) { ok = false; }
    if (!ok && seleccionable) {
      // Respaldo: dejar el texto seleccionado para copiarlo a mano.
      const rango = document.createRange();
      rango.selectNodeContents(seleccionable);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(rango);
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    }
    boton.textContent = ok ? 'Copiado' : 'Seleccionado: copialo';
    boton.classList.toggle('copiado', ok);
    clearTimeout(boton._reloj);
    boton._reloj = setTimeout(() => { boton.textContent = original; boton.classList.remove('copiado'); }, 2400);
  }

  // ---------- render ----------
  function render() {
    renderEtapas();
    renderAvisos();
    const cont = $('etapa');
    const vistas = [etapaModelo, etapaDiseno, etapaEntrega, etapaSolicitud];
    cont.replaceChildren(...[].concat(vistas[etapa]()).filter(Boolean));
    cont.dataset.etapa = ETAPAS[etapa].id;
    renderPie();
    renderVisorUI();
  }

  function renderEtapas() {
    $('etapas').replaceChildren(...ETAPAS.map((e, i) => {
      const actual = i === etapa;
      const disponible = i <= alcanzada;
      return h('li', { class: (i < etapa ? 'hecha' : '') + (actual ? ' actual' : '') },
        h('button', {
          type: 'button', 'aria-current': actual ? 'step' : null, disabled: !disponible,
          onclick: () => { if (disponible && !actual) irA(i, { forzar: true }); },
        }, h('span', { class: 'etapa-num' }, String(i + 1).padStart(2, '0')), h('span', { class: 'etapa-nombre' }, e.nombre)));
    }));
  }

  function renderAvisos() {
    $('avisos').replaceChildren(...avisos.map((a) => h('div', { class: `aviso aviso-${a.tipo || 'info'}`, role: a.tipo === 'error' ? 'alert' : 'status' },
      h('div', { class: 'aviso-texto' }, a.texto, a.lista && a.lista.length ? h('ul', {}, a.lista.map((x) => h('li', {}, x))) : null),
      h('button', { type: 'button', class: 'aviso-cerrar', 'aria-label': 'Cerrar aviso', onclick: () => { avisos = avisos.filter((x) => x !== a); renderAvisos(); } }, 'Cerrar'))));
  }

  function cabeza(antetitulo, titulo, bajada) {
    return h('header', { class: 'etapa-cabeza' },
      h('p', { class: 'antetitulo' }, antetitulo),
      h('h1', { tabindex: '-1' }, titulo),
      bajada ? h('p', { class: 'bajada' }, bajada) : null);
  }

  // Etapa 1: modelo
  function etapaModelo() {
    return [
      cabeza(`Paso 1 de 4 · ${ETAPAS[0].nombre}`, 'Elegí tu Dormi', 'Tres modelos, cada uno igual a su archivo de diseño. Girá el 3D para verlo por todos lados.'),
      h('div', { class: 'modelos', role: 'group', 'aria-label': 'Modelos' }, cat.modelos.map((m) => {
        const elegido = m.id === estado.modelo;
        const pred = (m.archivos_3d || []).find((a) => a.id === m.modelo_3d);
        const med = pred && pred.medidas;
        const principales = R.medidasPrincipales(med);
        const mini = miniaturaDe(m);
        return h('button', {
          type: 'button', class: 'tarjeta-modelo', 'aria-pressed': String(elegido), 'data-modelo': m.id,
          onclick: () => { if (!elegido) cambiar({ tipo: 'modelo', modelo: m.id }); },
        },
        h('span', { class: 'tm-imagen' + (mini ? '' : ' tm-foto') },
          h('img', {
            src: mini || m.imagen.archivo, alt: '', loading: 'lazy', width: '640', height: '480',
            onerror: (ev) => { const img = ev.currentTarget; if (img.dataset.foto) return; img.dataset.foto = '1'; img.src = m.imagen.archivo; img.parentElement.classList.add('tm-foto'); },
          })),
        h('span', { class: 'tm-texto' },
          h('span', { class: 'tm-nombre' }, m.nombre),
          h('span', { class: 'tm-desc' }, m.descripcion),
          h('span', { class: 'tm-medidas' }, principales
            ? [h('span', { class: 'tm-principal' }, principales), med.piso_area_m2 ? h('span', { class: 'tm-sup' }, ` · ${R.textoMedida('piso_area_m2', med.piso_area_m2)}`) : null]
            : 'Modelo 3D en preparación')),
        h('span', { class: 'marca-seleccion', 'aria-hidden': 'true' }));
      })),
      h('p', { class: 'nota' }, 'Medidas exteriores totales (ancho × fondo × alto) y superficie de piso, según el modelo 3D de DOMO.'),
    ];
  }

  // Etapa 2: diseño
  function etapaDiseno() {
    const m = modelo();
    const ops = m.opciones || [];
    const partes = [cabeza(`Paso 2 de 4 · ${ETAPAS[1].nombre}`, m.nombre,
      ops.length ? 'Elegí la trama y el color de los paneles. Cada cambio se ve en el 3D.' : null)];
    if (!ops.length) {
      partes.push(h('div', { class: 'diseno-unico' },
        h('p', { class: 'diseno-unico-titulo' }, 'Diseño único'),
        h('p', {}, `${m.nombre} se fabrica tal como lo ves en el 3D: no tiene variantes de diseño.`)));
    }
    for (const o of ops) {
      const idTitulo = `op-${o.id}`;
      const valor = estado.opciones[o.id];
      if (o.tipo === 'modelo_3d') {
        partes.push(h('section', { class: 'grupo', 'aria-labelledby': idTitulo },
          h('h2', { id: idTitulo, class: 'grupo-titulo' }, o.nombre),
          h('div', { class: 'tramas', role: 'group', 'aria-labelledby': idTitulo }, o.valores.map((v) => {
            const mini = miniaturaDe(m, v.archivo_3d);
            return h('button', {
              type: 'button', class: 'opcion opcion-trama', 'aria-pressed': String(valor === v.id), 'data-valor': v.id,
              onclick: () => { if (valor !== v.id) cambiar({ tipo: 'opcion', opcion: o.id, valor: v.id }); },
            },
            mini ? h('span', { class: 'ot-imagen' }, h('img', { src: mini, alt: '', width: '640', height: '480', onerror: (ev) => { ev.currentTarget.parentElement.remove(); } })) : null,
            h('span', { class: 'ot-texto' }, h('span', { class: 'opcion-nombre' }, v.nombre), v.detalle ? h('span', { class: 'opcion-detalle' }, v.detalle) : null),
            h('span', { class: 'marca-seleccion', 'aria-hidden': 'true' }));
          }))));
      } else if (o.tipo === 'color_material') {
        const a = R.archivo3d(cat, estado);
        const natural = a && a.colores && a.colores[o.material];
        partes.push(h('section', { class: 'grupo', 'aria-labelledby': idTitulo },
          h('h2', { id: idTitulo, class: 'grupo-titulo' }, o.nombre),
          o.ayuda ? h('p', { class: 'ayuda' }, o.ayuda) : null,
          h('div', { class: 'colores', role: 'group', 'aria-labelledby': idTitulo }, o.valores.map((v) => {
            const hex = v.hex || natural || null;
            return h('button', {
              type: 'button', class: 'muestra', 'aria-pressed': String(valor === v.id), 'data-valor': v.id,
              onclick: () => { if (valor !== v.id) cambiar({ tipo: 'opcion', opcion: o.id, valor: v.id }); },
            },
            h('span', { class: 'muestra-color' + (hex ? '' : ' muestra-sin-dato'), style: hex ? { backgroundColor: hex } : null, 'aria-hidden': 'true' }),
            h('span', { class: 'muestra-nombre' }, v.nombre));
          }))));
      }
    }
    partes.push(ficha(m));
    partes.push(h('figure', { class: 'referencia' },
      h('img', { src: m.imagen.archivo, alt: m.imagen.alt || `Foto de referencia de ${m.nombre}`, loading: 'lazy' }),
      h('figcaption', {}, 'Foto de referencia')));
    return partes;
  }

  function ficha(m) {
    const comp = R.composicion(cat, estado);
    const med = R.medidasDe(cat, estado);
    const principales = R.medidasPrincipales(med);
    const extra = R.listaMedidas(cat, med);
    return h('section', { class: 'ficha', 'aria-labelledby': 'ficha-titulo' },
      h('h2', { id: 'ficha-titulo', class: 'grupo-titulo' }, 'Qué incluye'),
      h('dl', { class: 'tabla' }, comp.map((c) => h('div', { class: 'fila' + (c.pendiente ? ' fila-pendiente' : '') },
        h('dt', {}, c.nombre), h('dd', {}, c.texto)))),
      h('h2', { class: 'grupo-titulo' }, 'Medidas'),
      principales
        ? h('dl', { class: 'tabla tabla-cifras' },
          h('div', { class: 'fila' }, h('dt', {}, 'Ancho × fondo × alto'), h('dd', {}, principales)),
          extra.map((x) => h('div', { class: 'fila' }, h('dt', {}, x.etiqueta), h('dd', {}, x.texto))))
        : h('p', { class: 'ayuda' }, 'Modelo 3D en preparación: las medidas aparecen cuando esté listo.'),
      h('p', { class: 'nota' }, 'Según el modelo 3D de DOMO.'));
  }

  // Etapa 3: entrega
  function etapaEntrega() {
    const m = modelo();
    return [
      cabeza(`Paso 3 de 4 · ${ETAPAS[2].nombre}`, '¿Cómo lo querés recibir?', `Elegí la modalidad para tu ${m.nombre}.`),
      h('div', { class: 'modalidades', role: 'group', 'aria-label': 'Modalidades de entrega' }, cat.modalidades.map((x) => {
        const elegido = estado.modalidad === x.id;
        return h('button', {
          type: 'button', class: 'opcion opcion-entrega', 'aria-pressed': String(elegido), 'data-modalidad': x.id,
          onclick: () => { errores = {}; if (!elegido) cambiar({ tipo: 'modalidad', modalidad: x.id }); },
        },
        h('span', { class: 'oe-texto' },
          h('span', { class: 'opcion-nombre' }, x.nombre),
          h('span', { class: 'opcion-detalle' }, x.descripcion),
          h('span', { class: 'precio' }, R.textoPrecio(m.precios && m.precios[x.id]))),
        h('span', { class: 'marca-seleccion', 'aria-hidden': 'true' }));
      })),
      errores.modalidad ? h('p', { class: 'error-campo', id: 'error-modalidad', tabindex: '-1', role: 'alert' }, errores.modalidad) : null,
      h('p', { class: 'nota' }, 'Los precios los confirma DOMO BAIRES en el presupuesto.'),
    ];
  }

  // Etapa 4: solicitud
  function etapaSolicitud() {
    const res = R.resumen(cat, estado);
    const faltan = R.validarConfiguracion(cat, estado);
    const codigo = R.codificar(estado);
    const campo = (id, etiqueta, control, ayuda) => h('div', { class: 'campo' + (errores[id] ? ' campo-error' : '') },
      h('label', { for: `f-${id}` }, etiqueta),
      control,
      ayuda ? h('p', { class: 'campo-ayuda', id: `ayuda-${id}` }, ayuda) : null,
      errores[id] ? h('p', { class: 'error-campo', id: `error-${id}` }, errores[id]) : null);
    const entrada = (id, extra) => h('input', Object.assign({
      id: `f-${id}`, name: id, value: form[id], 'aria-invalid': errores[id] ? 'true' : null,
      'aria-describedby': [errores[id] ? `error-${id}` : null, extra && extra.ayuda ? `ayuda-${id}` : null].filter(Boolean).join(' ') || null,
      oninput: (ev) => { form[id] = ev.currentTarget.value; },
    }, (extra && extra.attrs) || {}));

    const formulario = h('form', { class: 'formulario', novalidate: true, id: 'formulario', 'aria-labelledby': 'form-titulo', onsubmit: (ev) => { ev.preventDefault(); preparar(); } },
      h('h2', { class: 'grupo-titulo', id: 'form-titulo' }, 'Tus datos'),
      campo('nombre', 'Nombre', entrada('nombre', { attrs: { autocomplete: 'name', maxlength: '80' } })),
      campo('contacto', 'Teléfono o email', entrada('contacto', { ayuda: true, attrs: { autocomplete: 'email', maxlength: '120', inputmode: 'email' } }), 'Para mandarte el presupuesto.'),
      campo('localidad', 'Localidad de la obra', entrada('localidad', { ayuda: true, attrs: { autocomplete: 'address-level2', maxlength: '80' } }), 'Cambia el transporte y el montaje.'),
      campo('comentario', 'Comentario (opcional)', h('textarea', {
        id: 'f-comentario', name: 'comentario', rows: '3', maxlength: '1000', 'aria-invalid': errores.comentario ? 'true' : null,
        oninput: (ev) => { form.comentario = ev.currentTarget.value; },
      }, form.comentario)),
      h('div', { class: 'casilla' + (errores.consentimiento ? ' campo-error' : '') },
        h('input', {
          type: 'checkbox', id: 'f-consentimiento', name: 'consentimiento', checked: form.consentimiento,
          'aria-invalid': errores.consentimiento ? 'true' : null, 'aria-describedby': errores.consentimiento ? 'error-consentimiento' : null,
          onchange: (ev) => { form.consentimiento = ev.currentTarget.checked; },
        }),
        h('label', { for: 'f-consentimiento' }, 'Acepto que DOMO BAIRES use estos datos solo para responder esta consulta.'),
        errores.consentimiento ? h('p', { class: 'error-campo', id: 'error-consentimiento' }, errores.consentimiento) : null),
      faltan.length ? h('div', { class: 'aviso aviso-error', role: 'alert', id: 'error-config' },
        h('div', { class: 'aviso-texto' }, faltan.join(' ')),
        !estado.modalidad ? h('button', { type: 'button', class: 'boton boton-chico', onclick: () => irA(2, { forzar: true }) }, 'Elegir entrega') : null) : null,
      h('button', { type: 'submit', class: 'boton boton-primario boton-ancho', id: 'boton-preparar' }, 'Preparar solicitud'),
      h('p', { class: 'nota' }, 'No se envía nada desde esta página: la solicitud se prepara para que la copies.'));

    const partes = [
      cabeza(`Paso 4 de 4 · ${ETAPAS[3].nombre}`, 'Pedí tu presupuesto', 'Revisá tu configuración, dejá tus datos y prepará la solicitud para mandarla a DOMO BAIRES.'),
      h('section', { class: 'resumen', 'aria-labelledby': 'resumen-titulo' },
        h('h2', { class: 'grupo-titulo', id: 'resumen-titulo' }, 'Tu configuración'),
        h('dl', { class: 'tabla' }, res.lineas.map((l) => h('div', { class: 'fila fila-' + l.clave },
          h('dt', {}, l.etiqueta), h('dd', {}, l.valor))))),
      formulario,
    ];
    if (solicitud) {
      const pre = h('pre', { class: 'solicitud-texto', id: 'solicitud-texto', tabindex: '0' }, solicitud);
      partes.push(h('section', { class: 'solicitud', 'aria-labelledby': 'solicitud-titulo' },
        h('h2', { class: 'grupo-titulo', id: 'solicitud-titulo', tabindex: '-1' }, 'Solicitud lista para copiar'),
        pre,
        h('button', { type: 'button', class: 'boton boton-primario boton-ancho', id: 'boton-copiar', onclick: (ev) => copiar(solicitud, ev.currentTarget, pre) }, 'Copiar'),
        h('p', { class: 'nota' }, 'Pegala en un mensaje o un correo a DOMO BAIRES, por el medio que uses habitualmente.')));
    }
    const enlace = /^https?:$/.test(location.protocol) ? location.href.split('#')[0] + '#' + codigo : null;
    const codigoEl = h('code', { class: 'codigo', id: 'codigo-config' }, codigo);
    partes.push(h('section', { class: 'compartir', 'aria-labelledby': 'compartir-titulo' },
      h('h2', { class: 'grupo-titulo', id: 'compartir-titulo' }, 'Compartir esta configuración'),
      h('p', { class: 'ayuda' }, 'El enlace guarda el modelo y las opciones elegidas, nunca tus datos.'),
      codigoEl,
      h('button', { type: 'button', class: 'boton boton-ancho', id: 'boton-enlace', onclick: (ev) => copiar(enlace || codigo, ev.currentTarget, codigoEl) }, 'Copiar enlace de esta configuración'),
      enlace ? null : h('p', { class: 'nota' }, 'Si copiás solo el código, agregalo al final de la dirección del configurador, después de "#".')));
    return partes;
  }

  function preparar() {
    const v = R.validarContacto(form);
    const faltan = R.validarConfiguracion(cat, estado);
    errores = v.errores;
    if (!v.ok || faltan.length) {
      solicitud = null;
      render();
      const primero = ['nombre', 'contacto', 'localidad', 'comentario', 'consentimiento'].find((k) => errores[k]);
      const el = primero ? $(`f-${primero}`) : $('error-config');
      if (el) { el.focus(); if (el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: reducido() ? 'auto' : 'smooth' }); }
      return;
    }
    solicitud = R.textoSolicitud(cat, estado, form);
    render();
    const t = $('solicitud-titulo');
    if (t) { t.focus({ preventScroll: true }); t.scrollIntoView({ block: 'start', behavior: reducido() ? 'auto' : 'smooth' }); }
  }

  function renderPie() {
    const m = modelo();
    const ops = m.opciones || [];
    const diseno = ops.length ? ops.map((o) => (R.valorDe(o, estado.opciones[o.id]) || {}).nombre).filter(Boolean).join(' · ') : 'Diseño único';
    const mod = R.modalidadDe(cat, estado.modalidad);
    const precio = R.textoPrecio(R.precioDe(cat, estado));
    const siguiente = etapa < ETAPAS.length - 1;
    $('pie').replaceChildren(
      h('p', { class: 'pie-modelo' }, m.nombre),
      h('p', { class: 'pie-detalle' }, `${diseno} · ${mod ? mod.nombre : 'Entrega sin elegir'}`),
      h('p', { class: 'pie-precio' }, precio),
      h('div', { class: 'pie-acciones' },
        etapa > 0 ? h('button', { type: 'button', class: 'boton', id: 'boton-atras', onclick: () => irA(etapa - 1, { forzar: true }) }, 'Atrás') : null,
        siguiente
          ? h('button', { type: 'button', class: 'boton boton-primario', id: 'boton-siguiente', onclick: () => irA(etapa + 1) },
            'Siguiente', h('span', { class: 'texto-largo' }, `: ${ETAPAS[etapa + 1].nombre}`))
          : h('button', { type: 'button', class: 'boton boton-primario', id: 'boton-siguiente', onclick: () => {
            if (!solicitud) { preparar(); return; }
            const t = $('solicitud-titulo');
            if (t) { t.focus({ preventScroll: true }); t.scrollIntoView({ block: 'start', behavior: reducido() ? 'auto' : 'smooth' }); }
          } }, solicitud ? 'Ver solicitud' : 'Preparar solicitud')));
  }

  // Acceso de solo lectura para las pruebas automáticas (no expone datos personales).
  window.DomoConfigurador = {
    get estado() { return estado ? JSON.parse(JSON.stringify(estado)) : null; },
    get etapa() { return etapa; },
    get visor() { return visor; },
    get estado3d() { return fallo3d || estado3d; },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
