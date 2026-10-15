/*
 * Visor 3D del configurador. Dibuja una MAQUETA INTERNA: un volumen neutro
 * con las aberturas en sus posiciones declaradas. No representa la forma
 * real de ningún modelo; se reemplaza por el GLB aprobado de cada modelo
 * cuando DOMO BAIRES entregue los archivos.
 *
 * Renderiza solo cuando algo cambia (sin animación permanente).
 */
(function () {
  'use strict';

  const RADIO = 2.6; // m, maqueta
  const ALTO = 2.7; // m, maqueta
  const APOTEMA = RADIO * Math.cos(Math.PI / 8);
  const ANGULO = { frente: 0, derecha: Math.PI / 2, fondo: Math.PI, izquierda: -Math.PI / 2 };
  const movimientoReducido = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function webglDisponible() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) {
      return false;
    }
  }

  function crearVisor(contenedor, opciones) {
    const avisar = opciones.alError || function () {};
    if (!window.THREE || !THREE.OrbitControls) { avisar('sin_libreria'); return null; }
    if (!webglDisponible()) { avisar('sin_webgl'); return null; }

    const escena = new THREE.Scene();
    const camara = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    let render3d;
    try {
      render3d = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch (e) {
      avisar('sin_webgl');
      return null;
    }
    render3d.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    contenedor.prepend(render3d.domElement);
    render3d.domElement.setAttribute('role', 'img');

    const controles = new THREE.OrbitControls(camara, render3d.domElement);
    controles.target.set(0, 1.2, 0);
    controles.minDistance = 5;
    controles.maxDistance = 22;
    controles.maxPolarAngle = Math.PI / 2 - 0.04; // no pasar por debajo del piso
    controles.enablePan = false;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f86, 0.95);
    const sol = new THREE.DirectionalLight(0xffffff, 0.65);
    sol.position.set(6, 10, 7);
    const interior = new THREE.PointLight(0xffc27a, 0, 8);
    interior.position.set(0, 1.4, 0);
    escena.add(hemi, sol, interior);
    const piso = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshLambertMaterial({ color: 0xb4bfae }));
    piso.rotation.x = -Math.PI / 2;
    escena.add(piso);

    let grupo = null;
    let noche = false;
    let vista = 'exterior';
    let animando = null;
    const vidrios = [];

    function dibujar() { render3d.render(escena, camara); }
    controles.addEventListener('change', dibujar);

    function medir() {
      const w = contenedor.clientWidth || 600;
      const h = contenedor.clientHeight || 450;
      render3d.setSize(w, h, false);
      camara.aspect = w / h;
      camara.updateProjectionMatrix();
      dibujar();
    }
    const obs = window.ResizeObserver ? new ResizeObserver(medir) : null;
    if (obs) obs.observe(contenedor); else window.addEventListener('resize', medir);

    function liberar(obj) {
      obj.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) [].concat(o.material).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }

    function caja(w, h, d, color, extra) {
      return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial(Object.assign({ color }, extra || {})));
    }

    function vidrio(w, h) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshPhongMaterial({ color: 0x9fc6d6, transparent: true, opacity: 0.55, side: THREE.DoubleSide, shininess: 90, emissive: 0x000000 }));
      vidrios.push(m.material);
      return m;
    }

    function rotulo(texto) {
      const c = document.createElement('canvas');
      c.width = 768; c.height = 96;
      const x = c.getContext('2d');
      x.fillStyle = 'rgba(251,240,217,0.95)'; x.fillRect(0, 0, 768, 96);
      x.strokeStyle = '#8a5a00'; x.lineWidth = 6; x.strokeRect(3, 3, 762, 90);
      x.fillStyle = '#5a3b00'; x.font = '600 34px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(texto, 384, 50);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
      s.scale.set(4, 0.5, 1);
      return s;
    }

    function enCara(posicion, objeto) {
      const g = new THREE.Group();
      g.rotation.y = ANGULO[posicion] || 0;
      objeto.position.z += APOTEMA + 0.03;
      g.add(objeto);
      return g;
    }

    function puerta(visual) {
      const g = new THREE.Group();
      const ancho = visual.ancho || 0.9;
      const marco = 0.07;
      const madera = 0x6b4a2b;
      g.add(caja(ancho + marco * 2, marco, 0.1, 0x3a3f3c).translateY(2.05));
      g.add(caja(marco, 2.1, 0.1, 0x3a3f3c).translateX(-(ancho / 2 + marco / 2)).translateY(1.05));
      g.add(caja(marco, 2.1, 0.1, 0x3a3f3c).translateX(ancho / 2 + marco / 2).translateY(1.05));
      const hojas = visual.vidrio ? 2 : 1;
      for (let i = 0; i < hojas; i++) {
        const w = ancho / hojas;
        const hoja = new THREE.Group();
        if (visual.vidrio) {
          hoja.add(caja(w, 2.0, 0.05, madera, {}).translateY(1.0).translateZ(-0.02));
          const v = vidrio(w - 0.14, 1.75);
          v.position.set(0, 1.02, 0.02);
          hoja.add(v);
        } else {
          hoja.add(caja(w, 2.0, 0.06, madera).translateY(1.0));
          hoja.add(new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshLambertMaterial({ color: 0xc9b37a })).translateX(w / 2 - 0.1).translateY(1.0).translateZ(0.05));
        }
        hoja.position.x = -ancho / 2 + w * (i + 0.5);
        g.add(hoja);
      }
      return g;
    }

    function ventana(visual) {
      const g = new THREE.Group();
      const w = 1.0, h = 0.9, y = 1.45, m = 0.06, gris = 0x3a3f3c;
      g.add(caja(w + m * 2, m, 0.1, gris).translateY(y + h / 2 + m / 2));
      g.add(caja(w + m * 2, m, 0.1, gris).translateY(y - h / 2 - m / 2));
      g.add(caja(m, h, 0.1, gris).translateX(-w / 2 - m / 2).translateY(y));
      g.add(caja(m, h, 0.1, gris).translateX(w / 2 + m / 2).translateY(y));
      if (visual.apertura) {
        // Hoja con bisagra en el lado izquierdo: el pivote está en el borde, no en el centro.
        const bisagra = new THREE.Group();
        bisagra.position.set(-w / 2, y, 0.02);
        const v = vidrio(w - 0.04, h - 0.04);
        v.position.x = w / 2;
        bisagra.add(v);
        bisagra.add(caja(0.03, h - 0.04, 0.04, gris).translateX(w - 0.03));
        bisagra.rotation.y = -0.45;
        g.add(bisagra);
      } else {
        const v = vidrio(w - 0.02, h - 0.02);
        v.position.y = y;
        g.add(v);
      }
      return g;
    }

    function portico() {
      const g = new THREE.Group();
      const madera = 0x9a6a3a, prof = 1.3, ancho = 2.4, alto = 2.5, s = 0.12;
      [-1, 1].forEach((lado) => {
        g.add(caja(s, alto, s, madera).translateX(lado * ancho / 2).translateY(alto / 2).translateZ(APOTEMA + prof));
        g.add(caja(s, s, prof, madera).translateX(lado * ancho / 2).translateY(alto).translateZ(APOTEMA + prof / 2));
      });
      g.add(caja(ancho + s, s, s, madera).translateY(alto).translateZ(APOTEMA + prof));
      g.add(caja(ancho + 0.4, 0.05, prof + 0.3, 0x5b5f5c).translateY(alto + 0.1).translateZ(APOTEMA + prof / 2 + 0.05));
      return g;
    }

    function construir(datos) {
      if (grupo) { escena.remove(grupo); liberar(grupo); }
      vidrios.length = 0;
      grupo = new THREE.Group();
      const color = new THREE.Color(datos.color || '#8a8f8c');
      const envolvente = new THREE.Mesh(
        new THREE.CylinderGeometry(RADIO, RADIO, ALTO, 8, 1, false),
        new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.92 })
      );
      envolvente.rotation.y = Math.PI / 8;
      envolvente.position.y = ALTO / 2 + 0.15;
      grupo.add(envolvente);
      const aristas = new THREE.LineSegments(new THREE.EdgesGeometry(envolvente.geometry), new THREE.LineBasicMaterial({ color: 0x1c2320, transparent: true, opacity: 0.35 }));
      aristas.rotation.copy(envolvente.rotation); aristas.position.copy(envolvente.position);
      grupo.add(aristas);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(RADIO + 0.15, RADIO + 0.2, 0.15, 8), new THREE.MeshLambertMaterial({ color: 0x9aa09a }));
      base.rotation.y = Math.PI / 8; base.position.y = 0.075;
      grupo.add(base);
      const r = rotulo('MAQUETA · FORMA PENDIENTE');
      r.position.set(0, ALTO + 0.9, 0);
      grupo.add(r);

      for (const a of datos.aberturas) {
        const pieza = a.tipo === 'puerta' ? puerta(a.visual) : ventana(a.visual);
        pieza.position.y = 0.15;
        grupo.add(enCara(a.posicion, pieza));
      }
      if (datos.portico) grupo.add(portico());
      escena.add(grupo);
      aplicarLuz();
      dibujar();
    }

    function aplicarLuz() {
      hemi.intensity = noche ? 0.18 : 0.95;
      sol.intensity = noche ? 0.08 : 0.65;
      interior.intensity = noche ? 1.6 : 0;
      vidrios.forEach((m) => m.emissive.setHex(noche ? 0x6b4a1f : 0x000000));
      piso.material.color.setHex(noche ? 0x2b3330 : 0xb4bfae);
      contenedor.classList.toggle('noche', noche);
    }

    function posicionCamara(direccion, distancia, alto) {
      const ang = ANGULO[direccion] !== undefined ? ANGULO[direccion] : 0.6;
      return new THREE.Vector3(Math.sin(ang) * distancia, alto, Math.cos(ang) * distancia);
    }

    function irA(destino, objetivo) {
      if (animando) cancelAnimationFrame(animando.id);
      if (movimientoReducido()) {
        camara.position.copy(destino); controles.target.copy(objetivo); controles.update(); dibujar();
        return;
      }
      const desde = camara.position.clone(), tDesde = controles.target.clone(), t0 = performance.now(), dur = 650;
      // Interpolamos el ángulo alrededor del objeto para no atravesarlo.
      const r0 = Math.hypot(desde.x, desde.z), r1 = Math.hypot(destino.x, destino.z);
      let a0 = Math.atan2(desde.x, desde.z), a1 = Math.atan2(destino.x, destino.z);
      if (a1 - a0 > Math.PI) a1 -= 2 * Math.PI; else if (a0 - a1 > Math.PI) a1 += 2 * Math.PI;
      const paso = (ahora) => {
        const k = Math.min(1, (ahora - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        const a = a0 + (a1 - a0) * e, r = r0 + (r1 - r0) * e;
        camara.position.set(Math.sin(a) * r, desde.y + (destino.y - desde.y) * e, Math.cos(a) * r);
        controles.target.lerpVectors(tDesde, objetivo, e);
        controles.update(); dibujar();
        animando = k < 1 ? { id: requestAnimationFrame(paso) } : null;
      };
      animando = { id: requestAnimationFrame(paso) };
    }

    function restablecer() {
      vista = 'exterior';
      controles.maxPolarAngle = Math.PI / 2 - 0.04;
      irA(new THREE.Vector3(7.5, 4.6, 9.5), new THREE.Vector3(0, 1.2, 0));
    }

    function mirar(posicion) {
      if (vista !== 'exterior') return;
      irA(posicionCamara(posicion, 10, 3.6), new THREE.Vector3(0, 1.3, 0));
    }

    function cambiarVista(v) {
      vista = v;
      if (v === 'planta') {
        controles.maxPolarAngle = Math.PI / 2 - 0.04;
        irA(new THREE.Vector3(0, 15, 0.01), new THREE.Vector3(0, 0, 0));
      } else {
        restablecer();
      }
    }

    function setNoche(v) { noche = v; aplicarLuz(); dibujar(); }

    function capturar() {
      dibujar();
      try { return render3d.domElement.toDataURL('image/png'); } catch (e) { return null; }
    }

    function activarToque(si) {
      controles.enabled = si;
      contenedor.classList.toggle('activo', si);
    }

    render3d.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); avisar('contexto_perdido'); });

    camara.position.set(7.5, 4.6, 9.5);
    controles.update();
    medir();

    return {
      construir, restablecer, mirar, cambiarVista, setNoche, capturar, activarToque,
      describir: (texto) => render3d.domElement.setAttribute('aria-label', texto),
      destruir() {
        if (obs) obs.disconnect();
        if (grupo) liberar(grupo);
        controles.dispose();
        render3d.dispose();
        render3d.domElement.remove();
      },
    };
  }

  window.DomoVisor = { crearVisor };
})();
