/*
 * Visor 3D del configurador de DOMO BAIRES (three.js r128, licencia MIT).
 *
 * Muestra los modelos 3D (GLB) armados desde los archivos de Blender de DOMO.
 * No dibuja nada propio del modelo: solo lo ilumina, lo encuadra, cambia el
 * color del material de los paneles cuando se pide y abre las hojas de puerta
 * ("puerta_hoja_N", que traen el origen sobre el eje de la bisagra).
 *
 * Los GLB se leen de <script type="application/octet-stream" id="glb-ID">
 * (base64, en el HTML armado) o, si no están, de la carpeta modelos/.
 * Si un GLB falta, avisa "faltante" y la página muestra "Modelo 3D en preparación".
 *
 * Uso:
 *   const v = DomoVisor.crear(contenedor, { alEstado(estado, datos) {} });
 *   await v.mostrar({ id, url, color: { material: 'panel', hex: '#1f3f8f' } });
 *   v.colorear(color); v.vista('tres_cuartos'); v.alternarPuertas(); v.tema(true);
 */
(function () {
  'use strict';

  const G = Math.PI / 180;
  // Ángulos de cámara: azimut (0 = de frente, hacia +Z) y elevación, en grados.
  const VISTAS = {
    frente: { az: 0, el: 9 },
    tres_cuartos: { az: 38, el: 17 },
    lateral: { az: 90, el: 9 },
    arriba: { az: 0, el: 86 },
  };
  const APERTURA_PUERTA = 100 * G;
  const MARGEN = 0.76;  // parte del cuadro que ocupa el modelo
  const ENTORNO = 0.62; // cuánto ilumina el entorno de estudio frente al sol (más bajo = más volumen)
  const MAX_EN_MEMORIA = 3;
  const reducido = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const suave = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function webglDisponible() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) {
      return false;
    }
  }

  function base64ABuffer(texto) {
    const bin = atob(texto.replace(/\s+/g, ''));
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }

  /** Mancha suave para el contacto con el suelo (textura radial, sin imágenes externas). */
  function texturaContacto() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  function crear(contenedor, opciones) {
    const op = opciones || {};
    const avisar = op.alEstado || function () {};
    if (!window.THREE || !THREE.GLTFLoader || !THREE.OrbitControls) { avisar('sin_libreria'); return null; }
    if (!webglDisponible()) { avisar('sin_webgl'); return null; }

    let r3;
    try {
      r3 = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: !!op.conservarImagen });
    } catch (e) {
      avisar('sin_webgl');
      return null;
    }
    r3.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r3.outputEncoding = THREE.sRGBEncoding;
    r3.toneMapping = THREE.ACESFilmicToneMapping;
    r3.toneMappingExposure = 1.0;
    r3.physicallyCorrectLights = true;
    r3.shadowMap.enabled = true;
    r3.shadowMap.type = THREE.PCFSoftShadowMap;
    r3.setClearColor(0x000000, 0);
    const lienzo = r3.domElement;
    lienzo.className = 'visor-lienzo';
    lienzo.setAttribute('role', 'img');
    contenedor.prepend(lienzo);

    const escena = new THREE.Scene();
    // Reflejos suaves de estudio: el vidrio y el acero se ven con brillo real.
    const pmrem = new THREE.PMREMGenerator(r3);
    let entorno = null;
    if (THREE.RoomEnvironment) {
      entorno = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
      escena.environment = entorno;
    } else {
      escena.add(new THREE.HemisphereLight(0xffffff, 0x9a958c, 1.6));
    }

    const camara = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    const controles = new THREE.OrbitControls(camara, lienzo);
    controles.enableDamping = true;
    controles.dampingFactor = 0.09;
    controles.enablePan = false;
    controles.rotateSpeed = 0.75;
    controles.zoomSpeed = 0.8;
    controles.maxPolarAngle = 87 * G; // la cámara nunca baja del suelo
    controles.minPolarAngle = 2 * G;
    controles.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

    // Sol cálido con sombra suave, solo del modelo sobre un plano que no se ve.
    const sol = new THREE.DirectionalLight(0xffe9d4, 3.4);
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    sol.shadow.bias = -0.0004;
    sol.shadow.normalBias = 0.02;
    escena.add(sol, sol.target);

    const matSombra = new THREE.ShadowMaterial({ opacity: 0.2 });
    matSombra.depthWrite = false;
    const sombra = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), matSombra);
    sombra.rotation.x = -Math.PI / 2;
    sombra.position.y = -0.003;
    sombra.receiveShadow = true;
    sombra.renderOrder = -2;
    const matContacto = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.1, depthWrite: false, alphaMap: texturaContacto() });
    const contacto = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), matContacto);
    contacto.rotation.x = -Math.PI / 2;
    contacto.position.y = -0.002;
    contacto.renderOrder = -1;
    escena.add(sombra, contacto);

    // ---------- estado ----------
    const cache = new Map(); // id -> { promesa, objeto }
    let actual = null;       // { id, objeto, caja, puertas: [...] }
    let pedido = 0;          // para ignorar cargas viejas si se cambia rápido de modelo
    let color = null;
    let abiertas = false;
    let vistaActual = 'tres_cuartos';
    let encuadreAutomatico = true;
    let sucio = true;
    let destruido = false;
    const animaciones = new Set();

    function animar(duracion, paso, alTerminar) {
      if (reducido() || duracion <= 0) { paso(1); if (alTerminar) alTerminar(); sucio = true; return; }
      const a = { inicio: performance.now(), duracion, paso, alTerminar };
      animaciones.add(a);
    }

    // ---------- bucle: dibuja solo cuando algo cambia ----------
    let rafId = 0;
    function cuadro(t) {
      rafId = requestAnimationFrame(cuadro);
      for (const a of [...animaciones]) {
        const k = Math.min(1, (t - a.inicio) / a.duracion);
        a.paso(suave(Math.max(0, k)));
        if (k >= 1) { animaciones.delete(a); if (a.alTerminar) a.alTerminar(); }
        sucio = true;
      }
      if (controles.update()) sucio = true;
      if (sucio) { r3.render(escena, camara); sucio = false; }
    }
    rafId = requestAnimationFrame(cuadro);
    controles.addEventListener('start', () => { encuadreAutomatico = false; });
    controles.addEventListener('change', () => { sucio = true; });

    function medir() {
      const w = Math.max(1, contenedor.clientWidth);
      const h = Math.max(1, contenedor.clientHeight);
      r3.setSize(w, h, false);
      camara.aspect = w / h;
      camara.updateProjectionMatrix();
      if (actual && encuadreAutomatico) encuadrar(vistaActual, false);
      sucio = true;
    }
    const obs = window.ResizeObserver ? new ResizeObserver(medir) : null;
    if (obs) obs.observe(contenedor); else window.addEventListener('resize', medir);
    medir();

    lienzo.addEventListener('webglcontextlost', (e) => { e.preventDefault(); avisar('contexto_perdido'); });

    // ---------- carga ----------
    function liberar(obj) {
      obj.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) [].concat(o.material).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }

    function recortarCache() {
      const ids = [...cache.keys()];
      while (cache.size > MAX_EN_MEMORIA) {
        const id = ids.shift();
        if (actual && actual.id === id) continue;
        const e = cache.get(id);
        cache.delete(id);
        if (e && e.objeto) liberar(e.objeto);
      }
    }

    async function leerBuffer(id, url) {
      const incrustado = document.getElementById('glb-' + id);
      if (incrustado) return base64ABuffer(incrustado.textContent);
      if (op.soloIncrustados || !url) { const e = new Error('Sin modelo 3D'); e.faltante = true; throw e; }
      let r;
      try {
        r = await fetch(url);
      } catch (e) {
        e.faltante = true; // sin servidor (archivo abierto con doble clic) o sin conexión
        throw e;
      }
      if (!r.ok) { const e = new Error('HTTP ' + r.status); e.faltante = r.status === 404; throw e; }
      return r.arrayBuffer();
    }

    /** Ajusta materiales y prepara las puertas de un modelo recién leído. */
    function preparar(raiz) {
      raiz.updateMatrixWorld(true);
      const caja = new THREE.Box3().setFromObject(raiz);
      const centro = caja.getCenter(new THREE.Vector3());
      const vidrios = new Map();
      raiz.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = false;
        const m = o.material;
        if (!m) return;
        if (m.name === 'vidrio') {
          if (!vidrios.has(m)) {
            const v = new THREE.MeshPhysicalMaterial({
              name: 'vidrio', color: m.color.clone().lerp(new THREE.Color(1, 1, 1), 0.35), metalness: 0, roughness: 0.04,
              transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.4, reflectivity: 0.6,
            });
            vidrios.set(m, v);
            m.dispose();
          }
          o.material = vidrios.get(m);
          o.castShadow = false;
          o.renderOrder = 10;
          return;
        }
        m.side = THREE.DoubleSide;
        m.envMapIntensity = ENTORNO;
        if (m.name === 'incrustacion' || m.name === 'puerta_detalle') {
          // Van apoyadas sobre paneles y puertas: se adelantan apenas para que nunca parpadeen.
          m.polygonOffset = true;
          m.polygonOffsetFactor = -1;
          m.polygonOffsetUnits = -2;
        }
        if (m.name === 'acero') { m.metalness = Math.max(m.metalness, 0.75); m.roughness = Math.min(m.roughness, 0.4); }
        if (!m.userData.colorOriginal) m.userData.colorOriginal = m.color.clone();
      });
      // Puntos de la geometría (muestreados) para encuadrar justo lo que se ve, no la caja.
      const puntos = [];
      const v = new THREE.Vector3();
      raiz.traverse((o) => {
        if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
        const pos = o.geometry.attributes.position;
        const paso = Math.max(1, Math.floor(pos.count / 1500));
        for (let i = 0; i < pos.count; i += paso) puntos.push(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).clone());
      });
      // Hojas de puerta: sentido de giro hacia afuera según de qué lado está la bisagra.
      const puertas = [];
      raiz.traverse((o) => {
        if (!/^puerta_hoja_\d+$/.test(o.name)) return;
        const p = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
        const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
        const d = c.sub(p);                                    // de la bisagra hacia el borde libre
        const n = new THREE.Vector3(p.x - centro.x, 0, p.z - centro.z).normalize(); // hacia afuera
        let signo = Math.sign(d.z * n.x - d.x * n.z) || 1;
        const abre = o.userData && o.userData.abre;
        if (abre && /adentro/.test(abre)) signo = -signo;
        puertas.push({ objeto: o, base: o.rotation.y, signo, angulo: 0 });
      });
      return { caja, puertas, puntos };
    }

    function obtener(id, url) {
      if (cache.has(id)) return cache.get(id).promesa;
      const entrada = { promesa: null, objeto: null };
      entrada.promesa = (async () => {
        const buffer = await leerBuffer(id, url);
        const gltf = await new Promise((ok, no) => new THREE.GLTFLoader().parse(buffer, '', ok, no));
        const raiz = gltf.scene;
        raiz.userData.datos = preparar(raiz);
        entrada.objeto = raiz;
        return raiz;
      })();
      cache.set(id, entrada);
      entrada.promesa.catch(() => cache.delete(id));
      return entrada.promesa;
    }

    // ---------- color ----------
    function aplicarColor(objeto, c, animado) {
      const destino = c && c.hex ? new THREE.Color(c.hex).convertSRGBToLinear() : null;
      const material = (c && c.material) || 'panel';
      const vistos = new Set();
      objeto.traverse((o) => {
        if (!o.isMesh || !o.material || o.material.name !== material || vistos.has(o.material)) return;
        const m = o.material;
        vistos.add(m);
        const desde = m.color.clone();
        const hasta = destino || m.userData.colorOriginal;
        if (!animado) { m.color.copy(hasta); return; }
        animar(320, (k) => { m.color.copy(desde).lerp(hasta, k); });
      });
      sucio = true;
    }

    // ---------- cámara ----------
    function orientacionActual() {
      const v = camara.position.clone().sub(controles.target);
      const dist = v.length() || 1;
      return { az: Math.atan2(v.x, v.z) / G, el: Math.asin(Math.max(-1, Math.min(1, v.y / dist))) / G, dist };
    }

    /**
     * Encuadre mirando desde (az, el): sube o baja el punto de mira para centrar
     * el modelo en altura y calcula la distancia para que todo entre en cuadro.
     */
    function encuadreDesde(puntos, objetivo, az, el) {
      const dir = new THREE.Vector3(Math.sin(az * G) * Math.cos(el * G), Math.sin(el * G), Math.cos(az * G) * Math.cos(el * G));
      const atras = dir.clone();
      const derecha = new THREE.Vector3(0, 1, 0).cross(atras);
      if (derecha.lengthSq() < 1e-6) derecha.set(1, 0, 0);
      derecha.normalize();
      const arriba = atras.clone().cross(derecha).normalize();
      const tanV = Math.tan((camara.fov * G) / 2) * MARGEN;
      const tanH = tanV * camara.aspect;
      const q = new THREE.Vector3();
      if (el < 60) {
        let lo = Infinity, hi = -Infinity;
        for (const p of puntos) { const u = q.copy(p).sub(objetivo).dot(arriba); lo = Math.min(lo, u); hi = Math.max(hi, u); }
        objetivo.y += ((lo + hi) / 2) / arriba.y;
      }
      let d = 0;
      for (const p of puntos) {
        q.copy(p).sub(objetivo);
        const z = q.dot(atras);
        d = Math.max(d, z + Math.abs(q.dot(derecha)) / tanH, z + Math.abs(q.dot(arriba)) / tanV);
      }
      return { dist: d, dir, objetivo };
    }

    function encuadrar(nombre, animado) {
      if (!actual) return;
      const caja = actual.caja;
      const tam = caja.getSize(new THREE.Vector3());
      const objetivo = caja.getCenter(new THREE.Vector3());
      objetivo.y = caja.min.y + tam.y * 0.45;
      let ang;
      if (nombre === 'centrar') {
        const o = orientacionActual();
        ang = { az: o.az, el: Math.max(6, Math.min(60, o.el)) };
      } else {
        ang = VISTAS[nombre] || VISTAS.tres_cuartos;
        vistaActual = nombre;
      }
      const { dist, dir } = encuadreDesde(actual.puntos, objetivo, ang.az, ang.el);
      const radio = tam.length() / 2;
      controles.minDistance = Math.max(0.5, Math.min(dist * 0.45, radio * 1.1));
      controles.maxDistance = dist * 2.4;
      const destino = objetivo.clone().add(dir.multiplyScalar(dist));
      if (!animado) {
        controles.target.copy(objetivo);
        camara.position.copy(destino);
        controles.update();
        sucio = true;
        return;
      }
      // Recorrido por ángulos (no en línea recta) para que la cámara rodee el modelo.
      const o = orientacionActual();
      const t0 = controles.target.clone();
      let daz = ang.az - o.az;
      while (daz > 180) daz -= 360;
      while (daz < -180) daz += 360;
      controles.enabled = false;
      animar(750, (k) => {
        const az = o.az + daz * k;
        const el = o.el + (ang.el - o.el) * k;
        const di = o.dist + (dist - o.dist) * k;
        const t = t0.clone().lerp(objetivo, k);
        controles.target.copy(t);
        camara.position.set(
          t.x + Math.sin(az * G) * Math.cos(el * G) * di,
          t.y + Math.sin(el * G) * di,
          t.z + Math.cos(az * G) * Math.cos(el * G) * di);
        camara.lookAt(t);
      }, () => { controles.enabled = true; controles.update(); });
    }

    function ubicarLuces(caja) {
      const tam = caja.getSize(new THREE.Vector3());
      const centro = caja.getCenter(new THREE.Vector3());
      const radio = Math.max(tam.x, tam.y, tam.z);
      sol.target.position.set(centro.x, 0, centro.z);
      sol.position.set(centro.x - radio * 1.1, radio * 2.2, centro.z + radio * 1.5);
      const cam = sol.shadow.camera;
      const lado = radio * 1.25;
      cam.left = -lado; cam.right = lado; cam.top = lado; cam.bottom = -lado;
      cam.near = 0.1; cam.far = radio * 6;
      cam.updateProjectionMatrix();
      sombra.scale.set(radio * 6, radio * 6, 1);
      sombra.position.x = centro.x; sombra.position.z = centro.z;
      contacto.scale.set(tam.x * 1.1, tam.z * 1.1, 1);
      contacto.position.x = centro.x; contacto.position.z = centro.z;
    }

    // ---------- puertas ----------
    function moverPuertas(abrir, animado) {
      if (!actual) return;
      abiertas = abrir;
      for (const p of actual.puertas) {
        const desde = p.angulo;
        const hasta = abrir ? APERTURA_PUERTA : 0;
        const fijar = (k) => { p.angulo = desde + (hasta - desde) * k; p.objeto.rotation.y = p.base + p.signo * p.angulo; };
        if (animado) animar(900, fijar); else fijar(1);
      }
      sucio = true;
    }

    // ---------- API ----------
    /**
     * Muestra un modelo. Devuelve una promesa con { estado: 'listo' | 'faltante' | 'error', puertas }.
     * Si mientras carga se pide otro, este se descarta en silencio ({ estado: 'descartado' }).
     */
    async function mostrar(datos) {
      const n = ++pedido;
      enCurso = true;
      try {
        return await mostrarSinMarca(datos, n);
      } finally {
        if (n === pedido) enCurso = false;
      }
    }
    let enCurso = false;

    async function mostrarSinMarca(datos, n) {
      color = datos.color || null;
      if (actual && actual.id === datos.id) {
        aplicarColor(actual.objeto, color, true);
        return { estado: 'listo', puertas: actual.puertas.length };
      }
      const yaEnMemoria = cache.has(datos.id) && cache.get(datos.id).objeto;
      if (!yaEnMemoria) avisar('cargando', { id: datos.id });
      let objeto;
      try {
        objeto = await obtener(datos.id, datos.url);
      } catch (e) {
        if (n !== pedido || destruido) return { estado: 'descartado' };
        quitarActual();
        const estado = e && e.faltante ? 'faltante' : 'error';
        avisar(estado, { id: datos.id, error: e });
        return { estado };
      }
      if (n !== pedido || destruido) return { estado: 'descartado' };
      const cambio = () => {
        quitarActual();
        const d = objeto.userData.datos;
        actual = { id: datos.id, objeto, caja: d.caja, puertas: d.puertas, puntos: d.puntos };
        for (const p of d.puertas) { p.angulo = 0; p.objeto.rotation.y = p.base; }
        abiertas = false;
        aplicarColor(objeto, color, false);
        escena.add(objeto);
        ubicarLuces(d.caja);
        if (primera || encuadreAutomatico) encuadrar(vistaActual, false);
        else encuadrar('centrar', false);
        primera = false;
        recortarCache();
        sucio = true;
      };
      const primera0 = !actual;
      if (primera0 || reducido()) {
        cambio();
      } else {
        // Transición suave: el lienzo se apaga, cambia el modelo y vuelve.
        lienzo.classList.add('visor-cambiando');
        await new Promise((ok) => setTimeout(ok, 180));
        if (n !== pedido || destruido) return { estado: 'descartado' };
        cambio();
        requestAnimationFrame(() => lienzo.classList.remove('visor-cambiando'));
      }
      avisar('listo', { id: datos.id, puertas: actual.puertas.length });
      return { estado: 'listo', puertas: actual.puertas.length };
    }
    let primera = true;

    function quitarActual() {
      if (actual) escena.remove(actual.objeto);
      actual = null;
      sucio = true;
    }

    return {
      mostrar,
      colorear(c) { color = c || null; if (actual) aplicarColor(actual.objeto, color, true); },
      vista(nombre) { encuadreAutomatico = nombre !== 'centrar' ? true : encuadreAutomatico; encuadrar(nombre, true); },
      alternarPuertas() { moverPuertas(!abiertas, true); return abiertas; },
      cerrarPuertas() { moverPuertas(false, false); },
      get puertasAbiertas() { return abiertas; },
      get cantidadPuertas() { return actual ? actual.puertas.length : 0; },
      get modeloActual() { return actual ? actual.id : null; },
      get ocupado() { return enCurso || animaciones.size > 0; },
      tema(oscuro) {
        matSombra.opacity = oscuro ? 0.42 : 0.2;
        matContacto.opacity = oscuro ? 0.32 : 0.1;
        r3.toneMappingExposure = oscuro ? 0.95 : 1.0;
        sucio = true;
      },
      describir(texto) { lienzo.setAttribute('aria-label', texto); },
      /** Color actual de un material, en hexadecimal sRGB (para pruebas). */
      colorDe(material) {
        let hex = null;
        if (actual) actual.objeto.traverse((o) => { if (!hex && o.isMesh && o.material && o.material.name === material) hex = '#' + o.material.color.clone().convertLinearToSRGB().getHexString(); });
        return hex;
      },
      /** Ángulo de apertura de cada hoja de puerta, en grados con signo (para pruebas). */
      angulosPuertas() { return actual ? actual.puertas.map((p) => Math.round(((p.objeto.rotation.y - p.base) / G) * 10) / 10) : []; },
      /** Imagen PNG del cuadro actual (para miniaturas y capturas). */
      capturar() { r3.render(escena, camara); return lienzo.toDataURL('image/png'); },
      destruir() {
        destruido = true;
        cancelAnimationFrame(rafId);
        if (obs) obs.disconnect(); else window.removeEventListener('resize', medir);
        controles.dispose();
        for (const e of cache.values()) if (e.objeto) liberar(e.objeto);
        cache.clear();
        if (entorno) entorno.dispose();
        pmrem.dispose();
        sombra.geometry.dispose(); matSombra.dispose();
        contacto.geometry.dispose(); if (matContacto.alphaMap) matContacto.alphaMap.dispose(); matContacto.dispose();
        r3.dispose();
        lienzo.remove();
      },
    };
  }

  window.DomoVisor = { crear, webglDisponible, VISTAS };
})();
