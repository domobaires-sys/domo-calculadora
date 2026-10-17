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
 *
 * Dirección e historial: la dirección lleva siempre el código de la
 * configuración (después de "#"). Cada etapa es una entrada del historial,
 * así el botón Atrás del navegador (o el gesto de volver del celular) vuelve
 * a la etapa anterior. Un código nuevo pegado en la dirección (o un enlace
 * compartido abierto en esta misma pestaña) abre esa configuración.
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
  const CAMPOS = ['nombre', 'telefono', 'email', 'localidad', 'uso', 'unidades', 'comentario', 'consentimiento'];

  let cat = null;
  let estado = null;
  let etapa = 0;
  let alcanzada = 0;
  let avisos = [];
  let visor = null;
  let fallo3d = null;          // 'sin_libreria' | 'sin_webgl' | 'contexto_perdido'
  let estado3d = 'cargando';   // 'cargando' | 'listo' | 'faltante' | 'error'
  let relojCarga = 0;
  let vistaElegida = 'tres_cuartos'; // null cuando la persona giró el modelo a mano
  let solicitud = null;        // texto preparado (se actualiza si cambian los datos)
  let errores = {};
  const form = { nombre: '', telefono: '', email: '', localidad: '', uso: '', unidades: String(R.UNIDADES_MIN), comentario: '', consentimiento: false };

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
  const SVG = 'http://www.w3.org/2000/svg';
  /** Icono de la familia única de index.html (trazo de 1,5 px, puntas rectas). */
  function icono(nombre) {
    const s = document.createElementNS(SVG, 'svg');
    s.setAttribute('class', 'icono');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    const u = document.createElementNS(SVG, 'use');
    u.setAttribute('href', '#i-' + nombre);
    s.append(u);
    return s;
  }
  /** Marca de selección: la misma en tarjetas, tramas, colores, modalidades y la casilla del formulario. */
  const marca = () => h('span', { class: 'marca-seleccion', 'aria-hidden': 'true' }, icono('tilde'));
  /** Texto largo y corto de un mismo botón (el corto se ve cuando falta lugar). */
  const largoCorto = (largo, corto) => [h('span', { class: 'texto-largo' }, largo), h('span', { class: 'texto-corto', 'aria-hidden': 'true' }, corto)];
  /** Imagen de referencia de DOMO: mismo recorte cuadrado y mismo marco en todos lados. */
  function fotoReferencia(m, conLeyenda) {
    return h('figure', { class: 'foto-ref' },
      h('img', { src: m.imagen.archivo, alt: m.imagen.alt || `Imagen de referencia de ${m.nombre}`, width: '400', height: '400', loading: 'lazy' }),
      conLeyenda === false ? null : h('figcaption', {}, 'Imagen de referencia'));
  }
  /** Reemplaza el contenido de un elemento; ignora los huecos (null, false). */
  function poner(el, ...hijos) { el.replaceChildren(...hijos.flat().filter((x) => x !== null && x !== undefined && x !== false)); }
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
  const limitar = (n) => Math.max(0, Math.min(ETAPAS.length - 1, n | 0));

  /*
   * Foco: cada vez que se vuelve a dibujar una parte de la pantalla, el control que
   * tenía el foco se reemplaza por uno nuevo. Para que quien usa teclado o lector de
   * pantalla no pierda su lugar, se anota cuál era (por su id o por su dato) y se le
   * devuelve el foco al nuevo.
   */
  const DATOS_FOCO = ['data-modelo', 'data-valor', 'data-modalidad', 'data-vista', 'data-etapa', 'data-aviso'];
  function selectorFoco(el) {
    if (!el || el === document.body || el === document.documentElement || !el.getAttribute) return null;
    if (el.id) return '#' + CSS.escape(el.id);
    const dato = DATOS_FOCO.find((a) => el.hasAttribute(a));
    if (!dato) return null;
    const clase = el.classList && el.classList[0] ? '.' + CSS.escape(el.classList[0]) : '';
    return `${el.tagName.toLowerCase()}${clase}[${dato}="${CSS.escape(el.getAttribute(dato))}"]`;
  }
  function conservandoFoco(dibujar) {
    const selector = selectorFoco(document.activeElement);
    dibujar();
    if (!selector) return;
    const ahora = document.activeElement;
    if (ahora && ahora !== document.body && ahora.isConnected) return;
    const nuevo = document.querySelector(selector);
    if (nuevo) nuevo.focus({ preventScroll: true });
  }

  // ---------- miniaturas ----------
  /*
   * Cada archivo 3D tiene su miniatura (catálogo: archivos_3d[].miniatura) y sus
   * variantes, generadas por scripts/miniaturas.js con el mismo visor: "-oscuro"
   * para el modo oscuro y "-<color>" para cada color de los paneles del Áureo.
   * En el HTML armado vienen ya incrustadas en archivos_3d[].miniaturas.
   */
  function rutaMiniatura(base, color, oscuro) {
    return base.replace(/(\.\w+)$/, `${color ? '-' + color : ''}${oscuro ? '-oscuro' : ''}$1`);
  }
  function miniaturasDe(a, color) {
    if (!a || !a.miniatura) return null;
    const sufijo = color ? '-' + color : '';
    if (a.miniaturas) {
      const t = a.miniaturas;
      return { claro: t[sufijo] || t[''] || a.miniatura, oscuro: t[sufijo + '-oscuro'] || t['-oscuro'] || t[sufijo] || t[''] || a.miniatura, base: t[''] || a.miniatura };
    }
    return { claro: rutaMiniatura(a.miniatura, color, false), oscuro: rutaMiniatura(a.miniatura, color, true), base: a.miniatura };
  }
  /** Color elegido de los paneles (id del valor) si tiene variante de miniatura, o null (color natural). */
  function colorMiniatura(m, est) {
    const o = (m.opciones || []).find((x) => x.tipo === 'color_material');
    if (!o || !est || est.modelo !== m.id) return null;
    const v = R.valorDe(o, est.opciones[o.id]);
    return v && v.hex ? v.id : null;
  }
  /** Las dos imágenes de una miniatura (tema claro y oscuro); si una falta, cae a la base y después a la foto. */
  function imagenesMiniatura(fuentes, m) {
    const img = (src, clase) => h('img', {
      src, alt: '', class: clase, loading: 'lazy', width: '360', height: '270',
      onerror: (ev) => {
        const el = ev.currentTarget;
        if (el.src !== fuentes.base && !el.dataset.base) { el.dataset.base = '1'; el.src = fuentes.base; return; }
        if (el.dataset.foto || !m) return;
        el.dataset.foto = '1';
        el.src = m.imagen.archivo;
        if (el.parentElement) el.parentElement.classList.add('es-foto');
      },
    });
    return [img(fuentes.claro, 'solo-claro'), img(fuentes.oscuro, 'solo-oscuro')];
  }

  // ---------- inicio ----------
  async function cargarCatalogo() {
    const incrustado = $('catalogo-datos');
    if (incrustado) return JSON.parse(incrustado.textContent);
    const r = await fetch('catalogo.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('No se pudo leer el catálogo (' + r.status + ').');
    return r.json();
  }

  const codigoDeDireccion = () => {
    try { return decodeURIComponent((location.hash || '').slice(1)); } catch (e) { return (location.hash || '').slice(1); }
  };

  /** Abre una configuración que vino en la dirección (enlace compartido). */
  function abrirCodigo(codigo) {
    const r = R.recuperar(cat, codigo);
    if (!r) return false;
    estado = r.estado;
    solicitud = null;
    errores = {};
    avisos = avisos.filter((a) => a.id !== 'compartida' && a.id !== 'codigo');
    if (r.valido) {
      etapa = estado.modalidad ? 3 : 1;
      avisos.push({ id: 'compartida', texto: 'Abriste una configuración compartida. Podés cambiar lo que quieras.', lista: r.avisos });
    } else {
      etapa = 0;
      avisos.push({ id: 'codigo', tipo: 'error', texto: r.avisos[0] });
    }
    alcanzada = Math.max(alcanzada, etapa);
    return true;
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
    const codigo = codigoDeDireccion();
    const guardado = local.leer();
    const recuperarGuardado = () => {
      const r = R.recuperar(cat, guardado.codigo);
      if (!r || !r.valido) return false;
      estado = r.estado;
      etapa = limitar(guardado.etapa);
      alcanzada = Math.max(etapa, limitar(guardado.alcanzada));
      return true;
    };
    if (codigo && guardado && guardado.codigo === codigo && recuperarGuardado()) {
      // Recarga de la página: la dirección tiene el código que guardó este mismo
      // navegador. Se vuelve a la etapa en la que estaba, sin avisos.
    } else if (codigo) {
      abrirCodigo(codigo);
    } else if (guardado && guardado.codigo) {
      recuperarGuardado();
    }
    alcanzada = Math.max(alcanzada, etapa);
    guardarLocal('reemplazar');
    escucharDireccion();
    escucharTema();
    // El panel se dibuja primero; el visor 3D (y la lectura del modelo) arranca
    // después de que el navegador lo pintó, así nunca se ve una página vacía.
    render();
    requestAnimationFrame(() => setTimeout(() => { montarVisor(); sincronizar3d(); }, 0));
  }

  function escucharDireccion() {
    // Atrás y Adelante del navegador: cada entrada propia guarda su etapa.
    window.addEventListener('popstate', (ev) => {
      const s = ev.state;
      if (!s || !s.domo) return; // una dirección escrita a mano: la atiende hashchange
      const n = Math.min(limitar(s.etapa), alcanzada);
      if (n !== etapa) irA(n, { forzar: true, historial: false });
      else guardarLocal('reemplazar');
    });
    // Un código nuevo en la dirección (pegado a mano o un enlace abierto en esta pestaña).
    window.addEventListener('hashchange', () => {
      if (history.state && history.state.domo) return;
      const codigo = codigoDeDireccion();
      if (!codigo || codigo === R.codificar(estado)) { guardarLocal('reemplazar'); return; }
      abrirCodigo(codigo);
      guardarLocal('reemplazar');
      render();
      sincronizar3d();
      window.scrollTo({ top: 0, behavior: reducido() ? 'auto' : 'smooth' });
      const t = document.querySelector('#etapa h1');
      if (t) t.focus({ preventScroll: true });
    });
  }

  // ---------- visor 3D ----------
  function montarVisor() {
    fallo3d = null;
    if (!window.DomoVisor) { fallo3d = 'sin_libreria'; estado3d = 'error'; renderVisorUI(); return; }
    visor = window.DomoVisor.crear($('visor'), { alEstado: alEstado3d, alGirar, soloIncrustados: ARMADO });
    if (visor) visor.tema(temaOscuro());
    if (visor && window.ResizeObserver) {
      const obs = new ResizeObserver(() => medirReserva());
      for (const id of ['visor', 'visor-rotulo', 'visor-acciones', 'visor-vistas']) obs.observe($(id));
    }
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

  /** La persona giró o acercó el modelo: ya no está en ninguna de las vistas con nombre. */
  function alGirar() {
    if (vistaElegida === null) return;
    vistaElegida = null;
    marcarVista();
  }

  function sincronizar3d() {
    if (!visor) { renderVisorUI(); return; }
    const a = R.archivo3d(cat, estado);
    if (!a) { estado3d = 'faltante'; renderVisorUI(); return; }
    visor.describir(descripcion3d());
    visor.mostrar({ id: a.id, url: a.archivo, color: R.colorMaterial(cat, estado) }).then((r) => {
      // Respaldo del aviso del visor: si el pedido que terminó sigue siendo el de la
      // configuración actual, su resultado es el estado del 3D.
      const ahora = R.archivo3d(cat, estado);
      if (r && r.estado !== 'descartado' && ahora && ahora.id === a.id && !fallo3d) estado3d = r.estado;
      renderVisorUI();
    });
    renderVisorUI();
  }

  function descripcion3d() {
    const m = modelo();
    const diseno = (m.opciones || []).map((o) => (R.valorDe(o, estado.opciones[o.id]) || {}).nombre).filter(Boolean);
    const med = R.medidasPrincipales(R.medidasDe(cat, estado));
    const nota = R.notaMedidas(m);
    return `Modelo 3D de ${[m.nombre, ...diseno].join(', ')}${med ? `; mide ${med} de ancho por fondo por alto${nota ? `, ${nota}` : ''}` : ''}. Arrastrá para girarlo; con la rueda o con dos dedos te acercás.`;
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

  /**
   * Franjas del visor tapadas por el rótulo y los botones: el visor encuadra el
   * modelo entre ellas, así nunca queda debajo de un botón (sobre todo en celular).
   */
  function medirReserva() {
    if (!visor || !visor.reservar) return;
    const caja = $('visor').getBoundingClientRect();
    if (!caja.height) return;
    let arriba = 0;
    let abajo = 0;
    for (const id of ['visor-rotulo', 'visor-acciones']) {
      const el = $(id);
      if (!el || !el.childElementCount) continue;
      const r = el.getBoundingClientRect();
      if (r.height) arriba = Math.max(arriba, r.bottom - caja.top);
    }
    const v = $('visor-vistas');
    if (v && v.childElementCount) {
      const r = v.getBoundingClientRect();
      if (r.height) abajo = Math.max(abajo, caja.bottom - r.top);
    }
    visor.reservar({ arriba, abajo });
  }

  /** Marca la vista elegida sin volver a dibujar los botones. */
  function marcarVista() {
    document.querySelectorAll('#visor-vistas [data-vista]').forEach((b) => {
      if (b.dataset.vista !== 'centrar') b.setAttribute('aria-pressed', String(vistaElegida === b.dataset.vista));
    });
  }

  function renderVisorUI() {
    if (!cat) return;
    conservandoFoco(dibujarVisorUI);
    medirReserva();
  }

  function dibujarVisorUI() {
    const m = modelo();
    const med = R.medidasDe(cat, estado);
    const principales = R.medidasPrincipales(med);
    const nota = R.notaMedidas(m);
    const a = R.archivo3d(cat, estado);
    const opcionTrama = (m.opciones || []).find((o) => o.tipo === 'modelo_3d');
    const trama = opcionTrama ? R.valorDe(opcionTrama, estado.opciones[opcionTrama.id]) : null;

    poner($('visor-rotulo'),
      h('span', { class: 'rotulo-nombre' }, m.nombre, trama ? h('span', { class: 'rotulo-variante' }, ` · ${trama.nombre}`) : null),
      principales ? h('span', { class: 'rotulo-medidas' },
        h('span', { class: 'solo-lectores' }, 'Ancho por fondo por alto: '),
        h('span', { class: 'rotulo-cifra' }, principales),
        nota ? h('span', { class: 'rotulo-nota' }, nota) : null) : null);

    const listo = !fallo3d && estado3d === 'listo' && visor;
    const capa = $('visor-capa');
    if (fallo3d || estado3d === 'faltante' || estado3d === 'error') {
      const textos = {
        sin_webgl: ['Tu navegador no puede mostrar el 3D', 'Te mostramos una imagen de referencia de DOMO. Podés seguir configurando igual.'],
        sin_libreria: ['No se pudo cargar el visor 3D', 'Puede ser la conexión. Mientras tanto, esta es una imagen de referencia de DOMO.'],
        contexto_perdido: ['El visor 3D se detuvo', 'El dispositivo liberó memoria gráfica. Esta es una imagen de referencia de DOMO.'],
        faltante: ['Modelo 3D en preparación', 'Lo estamos armando desde el archivo de DOMO. Mientras tanto, esta es una imagen de referencia.'],
        error: ['No se pudo abrir el modelo 3D', 'Probá de nuevo. Mientras tanto, esta es una imagen de referencia de DOMO.'],
      };
      const [titulo, texto] = textos[fallo3d || estado3d] || textos.error;
      capa.className = 'visor-capa visor-capa-aviso';
      capa.replaceChildren(h('div', { class: 'visor-aviso', role: 'status' },
        m.imagen && m.imagen.archivo ? fotoReferencia(m) : null,
        h('div', { class: 'visor-aviso-texto' },
          h('p', { class: 'visor-aviso-titulo' }, titulo),
          h('p', {}, texto),
          (estado3d === 'error' && !fallo3d) || fallo3d === 'contexto_perdido'
            ? h('button', { type: 'button', class: 'boton boton-chico', id: 'boton-reintentar', onclick: reintentar3d }, 'Reintentar') : null)));
    } else if (estado3d === 'cargando' && !(visor && visor.modeloActual && a && visor.modeloActual === a.id)) {
      capa.className = 'visor-capa visor-capa-carga';
      capa.replaceChildren(h('div', { class: 'visor-carga', role: 'status' }, h('span', { class: 'visor-carga-barra', 'aria-hidden': 'true' }), 'Cargando modelo 3D'));
    } else {
      capa.className = 'visor-capa';
      capa.replaceChildren();
    }

    const puertas = listo ? visor.cantidadPuertas : 0;
    const abiertas = !!(listo && visor.puertasAbiertas);
    const plural = puertas > 1 ? 'puertas' : 'puerta';
    const enPantalla = !!(document.fullscreenElement || document.webkitFullscreenElement);
    // Los dos textos ("Abrir…" y "Cerrar…") ocupan el mismo lugar: el botón no cambia de
    // ancho al abrir o cerrar, y los botones de arriba nunca saltan de renglón.
    const textoPuerta = (abrir) => h('span', { class: abrir === !abiertas ? null : 'oculto' },
      largoCorto(`${abrir ? 'Abrir' : 'Cerrar'} ${plural}`, abrir ? 'Abrir' : 'Cerrar'));
    poner($('visor-acciones'),
      puertas ? h('button', {
        type: 'button', class: 'boton-visor', 'aria-pressed': String(abiertas), id: 'boton-puerta',
        'aria-label': `${abiertas ? 'Cerrar' : 'Abrir'} ${plural}`,
        onclick: () => { visor.alternarPuertas(); renderVisorUI(); },
      }, icono('puerta'), h('span', { class: 'boton-texto alterna' }, textoPuerta(true), textoPuerta(false))) : null,
      listo && hayPantallaCompleta() ? h('button', {
        type: 'button', class: 'boton-visor', id: 'boton-pantalla', onclick: pantallaCompleta,
        'aria-label': enPantalla ? 'Salir de pantalla completa' : 'Pantalla completa', title: enPantalla ? 'Salir de pantalla completa' : 'Pantalla completa',
      }, icono(enPantalla ? 'reducir' : 'ampliar'), h('span', { class: 'texto-largo', 'aria-hidden': 'true' }, enPantalla ? 'Salir' : 'Pantalla completa')) : null);

    poner($('visor-vistas'), listo ? [
      h('div', { class: 'vistas-grupo', role: 'group', 'aria-label': 'Vistas' }, VISTAS.map((v) => h('button', {
        type: 'button', class: 'boton-visor', 'aria-pressed': String(vistaElegida === v.id), 'aria-label': v.texto, 'data-vista': v.id,
        onclick: () => { vistaElegida = v.id; visor.vista(v.id); marcarVista(); },
      }, v.corto ? largoCorto(v.texto, v.corto) : v.texto))),
      // Centrar es una acción, no una vista: va aparte.
      h('button', {
        type: 'button', class: 'boton-visor boton-centrar', 'data-vista': 'centrar', 'aria-label': 'Centrar el modelo', title: 'Centrar el modelo',
        onclick: () => { visor.vista('centrar'); },
      }, icono('centrar'), h('span', { class: 'texto-largo', 'aria-hidden': 'true' }, 'Centrar')),
    ] : []);
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
    guardarLocal('reemplazar');
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
    const antes = etapa;
    errores = {};
    etapa = limitar(n);
    alcanzada = Math.max(alcanzada, etapa);
    // El aviso de "configuración compartida" ya cumplió: no se arrastra a las otras etapas.
    if (etapa !== antes) avisos = avisos.filter((a) => a.id !== 'compartida' && a.id !== 'codigo');
    guardarLocal(etapa !== antes && op.historial !== false ? 'agregar' : 'reemplazar');
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

  /**
   * Guarda el código y la etapa en el navegador y en la dirección.
   * modo "agregar": una entrada nueva en el historial (cambio de etapa);
   * modo "reemplazar": actualiza la entrada actual (cambio de configuración).
   */
  function guardarLocal(modo) {
    const codigo = R.codificar(estado);
    local.guardar({ codigo, etapa, alcanzada });
    try {
      const datos = { domo: true, etapa };
      if (modo === 'agregar') history.pushState(datos, '', '#' + codigo);
      else history.replaceState(datos, '', '#' + codigo);
    } catch (e) { /* el visor de la página puede no permitirlo */ }
  }

  function avisar(id, texto, tipo) {
    avisos = avisos.filter((a) => a.id !== id).concat({ id, texto, tipo: tipo || 'info' });
    renderAvisos();
  }

  /** Botón con icono y texto (el texto se puede cambiar sin perder el icono). */
  function botonConIcono(attrs, nombreIcono, texto) {
    return h('button', attrs, icono(nombreIcono), h('span', { class: 'boton-texto' }, texto));
  }

  /** Devuelve un botón de copiar a su texto e icono originales. */
  function restaurarBoton(boton) {
    if (!boton || !boton.dataset.texto) return;
    clearTimeout(boton._reloj);
    const etiqueta = boton.querySelector('.boton-texto') || boton;
    const uso = boton.querySelector('use');
    etiqueta.textContent = boton.dataset.texto;
    if (uso && boton.dataset.icono) uso.setAttribute('href', boton.dataset.icono);
    boton.classList.remove('copiado');
  }

  async function copiar(texto, boton, seleccionable) {
    const etiqueta = boton.querySelector('.boton-texto') || boton;
    const uso = boton.querySelector('use');
    if (!boton.dataset.texto) { boton.dataset.texto = etiqueta.textContent; boton.dataset.icono = uso ? uso.getAttribute('href') : ''; }
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
    etiqueta.textContent = ok ? 'Copiado' : 'Seleccionado: copialo';
    if (uso && ok) uso.setAttribute('href', '#i-tilde');
    boton.classList.toggle('copiado', ok);
    clearTimeout(boton._reloj);
    boton._reloj = setTimeout(() => restaurarBoton(boton), 2400);
  }

  // ---------- render ----------
  function render() {
    conservandoFoco(() => {
      renderEtapas();
      dibujarAvisos();
      const cont = $('etapa');
      const vistas = [etapaModelo, etapaDiseno, etapaEntrega, etapaSolicitud];
      cont.replaceChildren(...[].concat(vistas[etapa]()).filter(Boolean));
      cont.dataset.etapa = ETAPAS[etapa].id;
      renderPie();
    });
    renderVisorUI();
  }

  function renderEtapas() {
    $('etapas').replaceChildren(...ETAPAS.map((e, i) => {
      const actual = i === etapa;
      const disponible = i <= alcanzada;
      return h('li', { class: (i < etapa ? 'hecha' : '') + (actual ? ' actual' : '') },
        h('button', {
          type: 'button', 'aria-current': actual ? 'step' : null, disabled: !disponible, 'data-etapa': String(i),
          onclick: () => { if (disponible && !actual) irA(i, { forzar: true }); },
        }, h('span', { class: 'etapa-num' }, String(i + 1).padStart(2, '0')), h('span', { class: 'etapa-nombre' }, e.nombre)));
    }));
  }

  function renderAvisos() { conservandoFoco(dibujarAvisos); }

  function dibujarAvisos() {
    $('avisos').replaceChildren(...avisos.map((a) => h('div', { class: `aviso aviso-${a.tipo || 'info'}`, role: a.tipo === 'error' ? 'alert' : 'status' },
      h('div', { class: 'aviso-texto' }, a.texto, a.lista && a.lista.length ? h('ul', {}, a.lista.map((x) => h('li', {}, x))) : null),
      h('button', {
        type: 'button', class: 'boton-icono aviso-cerrar', 'aria-label': 'Cerrar aviso', title: 'Cerrar aviso', 'data-aviso': a.id,
        onclick: () => {
          avisos = avisos.filter((x) => x !== a);
          dibujarAvisos();
          // El foco vuelve al título de la etapa (el botón que lo tenía ya no existe).
          const t = document.querySelector('#etapa h1');
          if (t) t.focus({ preventScroll: true });
        },
      }, icono('cerrar')))));
  }

  function cabeza(antetitulo, titulo, bajada, foto) {
    return h('header', { class: 'etapa-cabeza' },
      h('div', { class: 'etapa-cabeza-texto' },
        h('p', { class: 'antetitulo' }, antetitulo),
        h('h1', { tabindex: '-1' }, titulo),
        bajada ? h('p', { class: 'bajada' }, bajada) : null),
      foto || null);
  }

  /** Medidas principales con su aclaración ("con el podio"), en la tipografía de las cifras. */
  function medidasConNota(m, med, clase) {
    const principales = R.medidasPrincipales(med);
    if (!principales) return null;
    const nota = R.notaMedidas(m);
    return h('span', { class: clase || 'medidas' }, h('span', { class: 'cifra-principal' }, principales), nota ? h('span', { class: 'cifra-nota' }, nota) : null);
  }

  // Etapa 1: modelo
  function etapaModelo() {
    return [
      cabeza(`Paso 1 de 4 · ${ETAPAS[0].nombre}`, 'Elegí tu Dormi', 'Tres modelos de DOMO BAIRES. Girá el 3D para verlo por todos lados.'),
      h('div', { class: 'modelos', role: 'group', 'aria-label': 'Modelos' }, cat.modelos.map((m) => {
        const elegido = m.id === estado.modelo;
        // La tarjeta del modelo elegido muestra su trama y su color; las otras, el diseño predeterminado.
        const a = elegido ? R.archivo3d(cat, estado) : (m.archivos_3d || []).find((x) => x.id === m.modelo_3d);
        const pred = (m.archivos_3d || []).find((x) => x.id === m.modelo_3d);
        const med = pred && pred.medidas;
        const fuentes = miniaturasDe(a, colorMiniatura(m, estado));
        return h('button', {
          type: 'button', class: 'tarjeta-modelo', 'aria-pressed': String(elegido), 'data-modelo': m.id,
          onclick: () => { if (!elegido) cambiar({ tipo: 'modelo', modelo: m.id }); },
        },
        h('span', { class: 'miniatura' + (fuentes ? '' : ' es-foto') },
          fuentes ? imagenesMiniatura(fuentes, m) : h('img', { src: m.imagen.archivo, alt: '', loading: 'lazy', width: '400', height: '400' })),
        h('span', { class: 'tm-texto' },
          h('span', { class: 'tm-nombre' }, m.nombre),
          h('span', { class: 'tm-desc' }, m.descripcion),
          medidasConNota(m, med, 'tm-medidas') || h('span', { class: 'tm-medidas' }, 'Modelo 3D en preparación')),
        marca());
      })),
      h('p', { class: 'nota' }, 'Ancho × fondo × alto totales, según el modelo 3D de DOMO. Las superficies, en el paso siguiente.'),
    ];
  }

  // Etapa 2: diseño
  function etapaDiseno() {
    const m = modelo();
    const ops = m.opciones || [];
    const partes = [cabeza(`Paso 2 de 4 · ${ETAPAS[1].nombre}`, m.nombre,
      ops.length ? 'Elegí la trama y el color de los paneles. Cada cambio se ve en el 3D.' : m.descripcion,
      fotoReferencia(m))];
    if (!ops.length) {
      partes.push(h('div', { class: 'diseno-unico' },
        h('p', { class: 'diseno-unico-titulo' }, 'Diseño único'),
        h('p', {}, 'No tiene variantes de diseño para elegir.')));
    }
    const color = colorMiniatura(m, estado);
    for (const o of ops) {
      const idTitulo = `op-${o.id}`;
      const valor = estado.opciones[o.id];
      if (o.tipo === 'modelo_3d') {
        partes.push(h('section', { class: 'grupo', 'aria-labelledby': idTitulo },
          h('h2', { id: idTitulo, class: 'grupo-titulo' }, o.nombre),
          h('div', { class: 'tramas', role: 'group', 'aria-labelledby': idTitulo }, o.valores.map((v) => {
            // Cada trama se muestra en el color de paneles elegido, con el mismo encuadre que las tarjetas.
            const fuentes = miniaturasDe((m.archivos_3d || []).find((x) => x.id === v.archivo_3d), color);
            return h('button', {
              type: 'button', class: 'opcion opcion-trama', 'aria-pressed': String(valor === v.id), 'data-valor': v.id,
              onclick: () => { if (valor !== v.id) cambiar({ tipo: 'opcion', opcion: o.id, valor: v.id }); },
            },
            fuentes ? h('span', { class: 'miniatura' }, imagenesMiniatura(fuentes, null)) : null,
            h('span', { class: 'ot-texto' }, h('span', { class: 'opcion-nombre' }, v.nombre), v.detalle ? h('span', { class: 'opcion-detalle' }, v.detalle) : null),
            marca());
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
            h('span', { class: 'muestra-color' + (hex ? '' : ' muestra-sin-dato'), style: hex ? { backgroundColor: hex } : null }, marca()),
            h('span', { class: 'muestra-nombre' }, v.nombre));
          }))));
      }
    }
    partes.push(ficha(m));
    return partes;
  }

  function ficha(m) {
    const comp = R.composicion(cat, estado);
    const med = R.medidasDe(cat, estado);
    const extra = R.listaMedidas(cat, med, m);
    const principales = medidasConNota(m, med, 'cifra');
    return h('section', { class: 'ficha', 'aria-labelledby': 'ficha-titulo' },
      h('h2', { id: 'ficha-titulo', class: 'grupo-titulo' }, 'Cómo es'),
      h('dl', { class: 'tabla' }, comp.map((c) => h('div', { class: 'fila' + (c.pendiente ? ' fila-pendiente' : '') },
        h('dt', {}, c.nombre), h('dd', {}, c.texto)))),
      h('h2', { class: 'grupo-titulo' }, 'Medidas'),
      principales
        ? h('dl', { class: 'tabla tabla-cifras' },
          h('div', { class: 'fila' }, h('dt', {}, 'Ancho × fondo × alto'), h('dd', {}, principales)),
          extra.map((x) => h('div', { class: 'fila' }, h('dt', {}, x.etiqueta), h('dd', { class: 'cifra' }, x.texto))))
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
        marca());
      })),
      errores.modalidad ? h('p', { class: 'error-campo', id: 'error-modalidad', tabindex: '-1', role: 'alert' }, errores.modalidad) : null,
      h('p', { class: 'nota' }, 'Los precios los confirma DOMO BAIRES en el presupuesto.'),
    ];
  }

  // ---------- formulario ----------
  /**
   * Cada vez que cambia un dato del formulario: si la solicitud ya estaba preparada,
   * se actualiza en el acto (si los datos siguen siendo válidos) o se retira (si no),
   * para que nunca se copie un texto viejo o sin consentimiento.
   */
  function alCambiarDatos() {
    if (!solicitud) return;
    const v = R.validarContacto(form);
    const seccion = document.querySelector('.solicitud');
    if (v.ok && !R.validarConfiguracion(cat, estado).length) {
      solicitud = R.textoSolicitud(cat, estado, form);
      const pre = $('solicitud-texto');
      if (pre) pre.textContent = solicitud;
      restaurarBoton($('boton-copiar'));
      return;
    }
    solicitud = null;
    if (seccion) seccion.remove();
    renderPie();
  }

  function cambiarUnidades(paso) {
    const n = Math.max(R.UNIDADES_MIN, Math.min(R.UNIDADES_MAX, (R.unidadesDe(form.unidades) || R.UNIDADES_MIN) + paso));
    form.unidades = String(n);
    const entrada = $('f-unidades');
    if (entrada) entrada.value = form.unidades;
    actualizarContador();
    alCambiarDatos();
  }
  /** Los botones − y + muestran sus límites (aria-disabled: así no pierden el foco). */
  function actualizarContador() {
    const n = R.unidadesDe(form.unidades);
    const menos = $('boton-menos');
    const mas = $('boton-mas');
    if (menos) menos.setAttribute('aria-disabled', String(n !== null && n <= R.UNIDADES_MIN));
    if (mas) mas.setAttribute('aria-disabled', String(n !== null && n >= R.UNIDADES_MAX));
  }

  // Etapa 4: solicitud
  function etapaSolicitud() {
    const res = R.resumen(cat, estado);
    const faltan = R.validarConfiguracion(cat, estado);
    const codigo = R.codificar(estado);
    const describe = (...ids) => ids.filter(Boolean).join(' ') || null;
    const campo = (id, etiqueta, control, ayuda) => h('div', { class: 'campo' + (errores[id] ? ' campo-error' : '') },
      h('label', { for: `f-${id}` }, etiqueta),
      control,
      ayuda ? h('p', { class: 'campo-ayuda', id: `ayuda-${id}` }, ayuda) : null,
      errores[id] ? h('p', { class: 'error-campo', id: `error-${id}` }, errores[id]) : null);
    const entrada = (id, extra) => {
      const ex = extra || {};
      const invalido = errores[id] || (ex.grupo && errores[ex.grupo]);
      return h('input', Object.assign({
        id: `f-${id}`, name: id, value: form[id], 'aria-invalid': invalido ? 'true' : null,
        'aria-describedby': describe(errores[id] ? `error-${id}` : null, ex.grupo && errores[ex.grupo] ? `error-${ex.grupo}` : null, ex.ayuda ? `ayuda-${ex.ayuda === true ? id : ex.ayuda}` : null),
        oninput: (ev) => { form[id] = ev.currentTarget.value; if (id === 'unidades') actualizarContador(); alCambiarDatos(); },
      }, ex.attrs || {}));
    };
    const nUnidades = R.unidadesDe(form.unidades);

    const formulario = h('form', { class: 'formulario', novalidate: true, id: 'formulario', 'aria-labelledby': 'form-titulo', onsubmit: (ev) => { ev.preventDefault(); preparar(); } },
      h('h2', { class: 'grupo-titulo', id: 'form-titulo' }, 'Tus datos'),
      campo('nombre', 'Nombre', entrada('nombre', { attrs: { autocomplete: 'name', maxlength: '80' } })),
      // Teléfono y email por separado: cada uno abre su teclado en el celular. Con uno alcanza.
      h('fieldset', { class: 'grupo-campos' + (errores.contacto ? ' campo-error' : ''), 'aria-describedby': describe('ayuda-contacto', errores.contacto ? 'error-contacto' : null) },
        h('legend', {}, '¿Cómo te contactamos?'),
        h('p', { class: 'campo-ayuda', id: 'ayuda-contacto' }, 'Con un teléfono o un email alcanza. Es para mandarte el presupuesto.'),
        campo('telefono', 'Teléfono', entrada('telefono', { grupo: 'contacto', attrs: { type: 'tel', autocomplete: 'tel', inputmode: 'tel', maxlength: '30' } })),
        campo('email', 'Email', entrada('email', { grupo: 'contacto', attrs: { type: 'email', autocomplete: 'email', inputmode: 'email', maxlength: '120', spellcheck: 'false', autocapitalize: 'off' } })),
        errores.contacto ? h('p', { class: 'error-campo', id: 'error-contacto' }, errores.contacto) : null),
      campo('localidad', 'Localidad de la obra', entrada('localidad', { ayuda: true, attrs: { autocomplete: 'address-level2', maxlength: '80' } }), 'Cambia el transporte y el montaje.'),
      campo('uso', 'Uso previsto (opcional)', entrada('uso', { ayuda: true, attrs: { maxlength: '120', autocomplete: 'off' } }), 'Para qué lo vas a usar. Nos ayuda a preparar el presupuesto.'),
      campo('unidades', 'Cantidad de unidades', h('div', { class: 'contador' },
        h('button', { type: 'button', class: 'boton-icono contador-boton', id: 'boton-menos', 'aria-label': 'Una unidad menos', 'aria-controls': 'f-unidades', 'aria-disabled': String(nUnidades !== null && nUnidades <= R.UNIDADES_MIN), onclick: (ev) => { if (ev.currentTarget.getAttribute('aria-disabled') !== 'true') cambiarUnidades(-1); } }, icono('menos')),
        entrada('unidades', { ayuda: true, attrs: { inputmode: 'numeric', pattern: '[0-9]*', maxlength: '2', autocomplete: 'off', class: 'contador-valor' } }),
        h('button', { type: 'button', class: 'boton-icono contador-boton', id: 'boton-mas', 'aria-label': 'Una unidad más', 'aria-controls': 'f-unidades', 'aria-disabled': String(nUnidades !== null && nUnidades >= R.UNIDADES_MAX), onclick: (ev) => { if (ev.currentTarget.getAttribute('aria-disabled') !== 'true') cambiarUnidades(1); } }, icono('mas'))),
      `Cuántos querés presupuestar, de ${R.UNIDADES_MIN} a ${R.UNIDADES_MAX}.`),
      campo('comentario', 'Comentario (opcional)', h('textarea', {
        id: 'f-comentario', name: 'comentario', rows: '3', maxlength: '1000', 'aria-invalid': errores.comentario ? 'true' : null,
        'aria-describedby': errores.comentario ? 'error-comentario' : null,
        oninput: (ev) => { form.comentario = ev.currentTarget.value; alCambiarDatos(); },
      }, form.comentario)),
      // Casilla propia (el mismo cuadro y el mismo tilde que la marca de selección), sobre la casilla real.
      h('div', { class: 'casilla' + (errores.consentimiento ? ' campo-error' : '') },
        h('span', { class: 'casilla-caja' },
          h('input', {
            type: 'checkbox', id: 'f-consentimiento', name: 'consentimiento', class: 'casilla-control', checked: form.consentimiento,
            'aria-invalid': errores.consentimiento ? 'true' : null, 'aria-describedby': errores.consentimiento ? 'error-consentimiento' : null,
            onchange: (ev) => { form.consentimiento = ev.currentTarget.checked; alCambiarDatos(); },
          }),
          marca()),
        h('label', { for: 'f-consentimiento' }, 'Acepto que DOMO BAIRES use estos datos solo para responder esta consulta.'),
        errores.consentimiento ? h('p', { class: 'error-campo', id: 'error-consentimiento' }, errores.consentimiento) : null),
      faltan.length ? h('div', { class: 'aviso aviso-error', role: 'alert', id: 'error-config', tabindex: '-1' },
        h('div', { class: 'aviso-texto' }, faltan.join(' ')),
        !estado.modalidad ? h('button', { type: 'button', class: 'boton boton-chico', onclick: () => irA(2, { forzar: true }) }, 'Elegir entrega') : null) : null,
      h('button', { type: 'submit', class: 'boton boton-primario boton-ancho', id: 'boton-preparar' }, 'Preparar solicitud'),
      h('p', { class: 'nota' }, 'No se envía nada desde esta página: la solicitud se prepara para que la copies.'));

    const partes = [
      cabeza(`Paso 4 de 4 · ${ETAPAS[3].nombre}`, 'Pedí tu presupuesto', 'Revisá tu configuración, dejá tus datos y prepará la solicitud para mandarla a DOMO BAIRES.'),
      h('section', { class: 'resumen', 'aria-labelledby': 'resumen-titulo' },
        h('h2', { class: 'grupo-titulo', id: 'resumen-titulo' }, 'Tu configuración'),
        h('dl', { class: 'tabla' }, res.lineas.map((l) => h('div', { class: 'fila fila-' + l.clave },
          h('dt', {}, l.etiqueta), ddResumen(l))))),
      formulario,
    ];
    if (solicitud) {
      const pre = h('pre', { class: 'solicitud-texto', id: 'solicitud-texto', tabindex: '0' }, solicitud);
      partes.push(h('section', { class: 'solicitud', 'aria-labelledby': 'solicitud-titulo' },
        h('h2', { class: 'grupo-titulo', id: 'solicitud-titulo', tabindex: '-1' }, 'Solicitud lista para copiar'),
        pre,
        botonConIcono({ type: 'button', class: 'boton boton-primario boton-ancho', id: 'boton-copiar', onclick: (ev) => { if (solicitud) copiar(solicitud, ev.currentTarget, pre); } }, 'copiar', 'Copiar'),
        h('p', { class: 'nota' }, 'Si cambiás tus datos, el texto se actualiza solo. Pegala en un mensaje o un correo a DOMO BAIRES, por el medio que uses habitualmente.')));
    }
    const enlace = /^https?:$/.test(location.protocol) ? location.href.split('#')[0] + '#' + codigo : null;
    const codigoEl = h('code', { class: 'codigo', id: 'codigo-config' }, codigo);
    partes.push(h('section', { class: 'compartir', 'aria-labelledby': 'compartir-titulo' },
      h('h2', { class: 'grupo-titulo', id: 'compartir-titulo' }, 'Compartir esta configuración'),
      h('p', { class: 'ayuda' }, 'El enlace guarda el modelo y las opciones elegidas, nunca tus datos.'),
      codigoEl,
      botonConIcono({ type: 'button', class: 'boton boton-ancho', id: 'boton-enlace', onclick: (ev) => copiar(enlace || codigo, ev.currentTarget, codigoEl) }, 'enlace', 'Copiar enlace de esta configuración'),
      enlace ? null : h('p', { class: 'nota' }, 'Si copiás solo el código, agregalo al final de la dirección del configurador, después de "#".')));
    return partes;
  }

  /** Valor de una línea del resumen: las cifras en la tipografía técnica. */
  function ddResumen(l) {
    if (l.clave === 'medidas') {
      const m = modelo();
      const med = medidasConNota(m, R.medidasDe(cat, estado), 'cifra');
      if (med) return h('dd', {}, med, h('span', { class: 'dd-nota' }, 'según el modelo 3D de DOMO'));
    }
    return h('dd', { class: l.clave === 'superficie' ? 'cifra' : null }, l.valor);
  }

  /** Primer campo con error (o el par teléfono/email si faltan los dos). */
  function primerError() {
    if (errores.nombre) return $('f-nombre');
    if (errores.contacto || errores.telefono) return $('f-telefono');
    for (const k of CAMPOS) if (errores[k]) return $(`f-${k}`);
    return null;
  }

  function preparar() {
    const v = R.validarContacto(form);
    const faltan = R.validarConfiguracion(cat, estado);
    errores = v.errores;
    if (!v.ok || faltan.length) {
      solicitud = null;
      render();
      const el = primerError() || $('error-config');
      if (el) { el.focus(); if (el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: reducido() ? 'auto' : 'smooth' }); }
      return;
    }
    solicitud = R.textoSolicitud(cat, estado, form);
    render();
    const t = $('solicitud-titulo');
    if (t) { t.focus({ preventScroll: true }); t.scrollIntoView({ block: 'start', behavior: reducido() ? 'auto' : 'smooth' }); }
  }

  /** Botón del pie en la etapa 4: lleva al formulario (o a la solicitud ya preparada). */
  function irAlFormulario() {
    const mover = (el, bloque) => {
      if (!el) return;
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: bloque, behavior: reducido() ? 'auto' : 'smooth' });
    };
    if (solicitud) { mover($('solicitud-titulo'), 'start'); return; }
    const v = R.validarContacto(form);
    const vacio = ['nombre', 'telefono', 'localidad'].find((k) => !String(form[k] || '').trim() && !(k === 'telefono' && String(form.email || '').trim()));
    if (vacio) { mover($(`f-${vacio}`), 'center'); return; }
    if (!v.ok && v.errores.consentimiento && Object.keys(v.errores).length === 1) { mover($('f-consentimiento'), 'center'); return; }
    mover($('boton-preparar'), 'center');
  }

  function renderPie() {
    const m = modelo();
    const ops = m.opciones || [];
    const diseno = ops.length ? ops.map((o) => (R.valorDe(o, estado.opciones[o.id]) || {}).nombre).filter(Boolean).join(' · ') : 'Diseño único';
    const mod = R.modalidadDe(cat, estado.modalidad);
    const precio = R.textoPrecio(R.precioDe(cat, estado));
    const siguiente = etapa < ETAPAS.length - 1;
    // Cada parte del detalle es un bloque que no se corta: si no entra, pasa entera al renglón siguiente.
    const partes = diseno.split(' · ').concat(mod ? mod.nombre : 'Entrega sin elegir');
    poner($('pie'),
      h('p', { class: 'pie-modelo' }, m.nombre),
      h('p', { class: 'pie-detalle' }, partes.map((p, i) => h('span', { class: 'pie-parte' }, p + (i < partes.length - 1 ? ' · ' : '')))),
      h('p', { class: 'pie-precio' }, precio),
      h('div', { class: 'pie-acciones' },
        etapa > 0 ? h('button', { type: 'button', class: 'boton', id: 'boton-atras', 'aria-label': 'Atrás', title: 'Atrás', onclick: () => irA(etapa - 1, { forzar: true }) },
          icono('flecha-izq'), h('span', { class: 'texto-largo', 'aria-hidden': 'true' }, 'Atrás')) : null,
        siguiente
          ? h('button', { type: 'button', class: 'boton boton-primario', id: 'boton-siguiente', onclick: () => irA(etapa + 1) },
            h('span', {}, 'Siguiente', h('span', { class: 'texto-largo' }, `: ${ETAPAS[etapa + 1].nombre}`)), icono('flecha-der'))
          // En la etapa 4 el botón principal es "Preparar solicitud", el del formulario: el del pie solo lleva hasta ahí.
          : h('button', { type: 'button', class: 'boton', id: 'boton-siguiente', onclick: irAlFormulario },
            solicitud ? 'Ver solicitud' : largoCorto('Completar tus datos', 'Tus datos'))));
  }

  // Acceso de solo lectura para las pruebas automáticas (no expone datos personales).
  window.DomoConfigurador = {
    get estado() { return estado ? JSON.parse(JSON.stringify(estado)) : null; },
    get etapa() { return etapa; },
    get visor() { return visor; },
    get estado3d() { return fallo3d || estado3d; },
    get vista() { return vistaElegida; },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
