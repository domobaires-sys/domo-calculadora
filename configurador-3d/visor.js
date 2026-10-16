/*
 * Visor 3D del configurador.
 *
 * Dibuja una APROXIMACIÓN de cada modelo hecha a partir de las fotos de
 * DOMO BAIRES (sin medidas): domo geodésico (Dormi Áureo), planta poligonal
 * con techo zome (Dormi Patagónico) y volumen facetado (Cubic). No es la
 * geometría aprobada; se reemplaza por el GLB de cada modelo cuando esté.
 * Las medidas usadas son supuestos visuales, en metros.
 *
 * Renderiza solo cuando algo cambia (sin animación permanente).
 */
(function () {
  'use strict';

  const G = Math.PI / 180;
  // Ángulo de cada posición alrededor del modelo (0 = frente, hacia +Z).
  const ANGULO = {
    frente: 0, derecha: 90 * G, izquierda: -90 * G, fondo: 180 * G,
    fondo_derecha: 135 * G, fondo_izquierda: -135 * G, frente_derecha: 45 * G, frente_izquierda: -45 * G,
  };
  const NEGRO = 0x23262a;
  const MADERA_CLARA = 0xd9c49b;
  const MADERA_INTERIOR = 0xc79a62;
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
    controles.target.set(0, 1.4, 0);
    controles.minDistance = 5;
    controles.maxDistance = 24;
    controles.maxPolarAngle = Math.PI / 2 - 0.04; // no pasar por debajo del piso
    controles.enablePan = false;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f86, 0.95);
    const sol = new THREE.DirectionalLight(0xffffff, 0.65);
    sol.position.set(6, 10, 7);
    const interior = new THREE.PointLight(0xffc27a, 0, 9);
    interior.position.set(0, 1.6, 0);
    escena.add(hemi, sol, interior);
    const piso = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshLambertMaterial({ color: 0x9fac98 }));
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

    // ---------- piezas ----------
    const lambert = (color, extra) => new THREE.MeshLambertMaterial(Object.assign({ color, side: THREE.DoubleSide }, extra || {}));
    function caja(w, h, d, color, extra) {
      return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color, extra));
    }
    function matVidrio() {
      const m = new THREE.MeshPhongMaterial({ color: 0x9fc6d6, transparent: true, opacity: 0.38, side: THREE.DoubleSide, shininess: 90, depthWrite: false });
      vidrios.push(m);
      return m;
    }
    function vidrio(w, h) { return new THREE.Mesh(new THREE.PlaneGeometry(w, h), matVidrio()); }

    /** Barra (perfil, montante o puntal) entre dos puntos. */
    function barra(p, q, grosor, color) {
      const a = new THREE.Vector3(...p), b = new THREE.Vector3(...q);
      const largo = a.distanceTo(b);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(grosor, grosor, largo, 6), lambert(color));
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      return m;
    }

    /** Polígono plano (lista de puntos 3D en orden) como malla. */
    function poligono(puntos, material) {
      const pos = [];
      for (let i = 1; i < puntos.length - 1; i++) pos.push(...puntos[0], ...puntos[i], ...puntos[i + 1]);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      return new THREE.Mesh(g, material);
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

    /** Coloca un objeto armado mirando a +Z en la posición indicada, a cierta distancia del centro. */
    function enPosicion(posicion, distancia, objeto) {
      const g = new THREE.Group();
      g.rotation.y = ANGULO[posicion] || 0;
      objeto.position.z += distancia;
      g.add(objeto);
      return g;
    }

    function puerta(visual) {
      const g = new THREE.Group();
      const ancho = visual.ancho || 0.9;
      const marco = 0.07;
      const madera = 0x6b4a2b;
      g.add(caja(ancho + marco * 2, marco, 0.1, NEGRO).translateY(2.05));
      g.add(caja(marco, 2.1, 0.1, NEGRO).translateX(-(ancho / 2 + marco / 2)).translateY(1.05));
      g.add(caja(marco, 2.1, 0.1, NEGRO).translateX(ancho / 2 + marco / 2).translateY(1.05));
      const hojas = visual.vidrio ? 2 : 1;
      for (let i = 0; i < hojas; i++) {
        const w = ancho / hojas;
        const hoja = new THREE.Group();
        if (visual.vidrio) {
          hoja.add(caja(w, 0.08, 0.05, NEGRO).translateY(0.04));
          hoja.add(caja(w, 0.08, 0.05, NEGRO).translateY(1.96));
          hoja.add(caja(0.06, 2.0, 0.05, NEGRO).translateX(-w / 2 + 0.03).translateY(1.0));
          hoja.add(caja(0.06, 2.0, 0.05, NEGRO).translateX(w / 2 - 0.03).translateY(1.0));
          const v = vidrio(w - 0.12, 1.84);
          v.position.set(0, 1.0, 0);
          hoja.add(v);
        } else {
          hoja.add(caja(w, 2.0, 0.06, madera).translateY(1.0));
          hoja.add(caja(w * 0.5, 0.9, 0.02, 0x5a3d22).translateY(1.05).translateZ(0.035));
        }
        hoja.add(caja(0.025, 0.18, 0.04, 0xc9b37a).translateX(i === 0 && hojas === 2 ? w / 2 - 0.1 : -w / 2 + 0.1).translateY(1.0).translateZ(0.05));
        hoja.position.x = -ancho / 2 + w * (i + 0.5);
        g.add(hoja);
      }
      return g;
    }

    function ventana(visual, medida) {
      const g = new THREE.Group();
      const w = (medida && medida.w) || 1.0, h = (medida && medida.h) || 0.9, y = (medida && medida.y) || 1.45, m = 0.06;
      g.add(caja(w + m * 2, m, 0.1, NEGRO).translateY(y + h / 2 + m / 2));
      g.add(caja(w + m * 2, m, 0.1, NEGRO).translateY(y - h / 2 - m / 2));
      g.add(caja(m, h, 0.1, NEGRO).translateX(-w / 2 - m / 2).translateY(y));
      g.add(caja(m, h, 0.1, NEGRO).translateX(w / 2 + m / 2).translateY(y));
      if (visual.apertura) {
        // Hoja con bisagra en el lado izquierdo: el pivote está en el borde, no en el centro.
        const bisagra = new THREE.Group();
        bisagra.position.set(-w / 2, y, 0.02);
        const v = vidrio(w - 0.04, h - 0.04);
        v.position.x = w / 2;
        bisagra.add(v);
        bisagra.add(caja(0.03, h - 0.04, 0.04, NEGRO).translateX(w - 0.03));
        bisagra.rotation.y = -0.45;
        g.add(bisagra);
      } else {
        const v = vidrio(w - 0.02, h - 0.02);
        v.position.y = y;
        g.add(v);
      }
      return g;
    }

    function portico(distancia) {
      const g = new THREE.Group();
      const madera = 0x9a6a3a, prof = 1.3, ancho = 2.4, alto = 2.5, s = 0.12;
      [-1, 1].forEach((lado) => {
        g.add(caja(s, alto, s, madera).translateX(lado * ancho / 2).translateY(alto / 2).translateZ(distancia + prof));
        g.add(caja(s, s, prof, madera).translateX(lado * ancho / 2).translateY(alto).translateZ(distancia + prof / 2));
      });
      g.add(caja(ancho + s, s, s, madera).translateY(alto).translateZ(distancia + prof));
      g.add(caja(ancho + 0.4, 0.05, prof + 0.3, 0x5b5f5c).translateY(alto + 0.1).translateZ(distancia + prof / 2 + 0.05));
      return g;
    }

    const azimut = (v) => Math.atan2(v.x, v.z);
    const difAng = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

    // ---------- Dormi Áureo: domo geodésico sobre platea (según capturas de Blender) ----------
    function geodesico(datos) {
      const g = new THREE.Group();
      const R = 2.6, base = 0.3;
      const ico = new THREE.IcosahedronGeometry(R, 2); // frecuencia 3
      const t = (1 + Math.sqrt(5)) / 2;
      ico.rotateZ(-Math.atan(1 / t)); // un vértice arriba, simetría de 5 en la cúspide
      const p = ico.attributes.position;
      const tris = [];
      for (let i = 0; i < p.count; i += 3) {
        const v = [0, 1, 2].map((k) => new THREE.Vector3(p.getX(i + k), p.getY(i + k), p.getZ(i + k)));
        const c = v[0].clone().add(v[1]).add(v[2]).divideScalar(3);
        if (c.y > -0.32 * R) tris.push({ v, c });
      }
      ico.dispose();
      let minY = Infinity;
      tris.forEach((t3) => t3.v.forEach((v) => { minY = Math.min(minY, v.y); }));
      const dy = base - minY;
      tris.forEach((t3) => { t3.v.forEach((v) => { v.y += dy; }); t3.c.y += dy; });

      // Platea hexagonal y escalón.
      const platea = new THREE.Mesh(new THREE.CylinderGeometry(R + 1.0, R + 1.0, base, 6), lambert(0x9aa09a));
      platea.position.y = base / 2;
      g.add(platea, caja(1.4, 0.15, 0.5, 0x9aa09a).translateY(0.075).translateZ(R + 1.2));

      const ventanas = datos.aberturas.filter((a) => a.tipo === 'ventana');
      const puertaFrente = datos.aberturas.some((a) => a.tipo === 'puerta' && a.posicion === 'frente');
      // Paños bajos ocupados por la caja de la puerta (frente).
      const bajo = (t3) => t3.c.y < base + 1.55;
      const vidriados = new Map();
      for (const a of ventanas) {
        const ang = ANGULO[a.posicion] || 0;
        const libres = tris.filter((t3) => bajo(t3) && !vidriados.has(t3));
        libres.sort((x, y) => difAng(azimut(x.c), ang) - difAng(azimut(y.c), ang));
        if (libres[0]) vidriados.set(libres[0], a);
      }
      const matPanel = lambert(datos.color || 0x8a6a48);
      for (const t3 of tris) {
        if (puertaFrente && bajo(t3) && difAng(azimut(t3.c), 0) < 0.42) continue;
        const inset = t3.v.map((v) => v.clone().lerp(t3.c, 0.16).toArray());
        const ab = vidriados.get(t3);
        if (ab) {
          g.add(poligono(inset, matVidrio()));
          if (ab.visual.apertura) {
            // Paño con apertura: una hoja triangular más chica, entreabierta desde su lado inferior.
            const sub = t3.v.map((v) => v.clone().lerp(t3.c, 0.45));
            const hoja = new THREE.Group();
            const piv = sub[0].clone().add(sub[1]).multiplyScalar(0.5);
            hoja.position.copy(piv);
            hoja.add(poligono(sub.map((v) => v.clone().sub(piv).toArray()), matVidrio()));
            for (let k = 0; k < 3; k++) hoja.add(barra(sub[k].clone().sub(piv).toArray(), sub[(k + 1) % 3].clone().sub(piv).toArray(), 0.02, NEGRO));
            hoja.rotateOnAxis(sub[1].clone().sub(sub[0]).normalize(), 0.35);
            g.add(hoja);
          }
        } else {
          g.add(poligono(inset, matPanel));
        }
      }
      // Puntales y nodos.
      const aristas = new Map(), nodos = new Map();
      const clave = (v) => v.toArray().map((n) => n.toFixed(3)).join(',');
      for (const t3 of tris) {
        for (let k = 0; k < 3; k++) {
          const a = t3.v[k], b = t3.v[(k + 1) % 3];
          const ka = clave(a), kb = clave(b);
          aristas.set(ka < kb ? ka + '|' + kb : kb + '|' + ka, [a, b]);
          nodos.set(ka, a);
        }
      }
      aristas.forEach(([a, b]) => g.add(barra(a.toArray(), b.toArray(), 0.045, MADERA_CLARA)));
      const geoNodo = new THREE.SphereGeometry(0.075, 10, 8), matNodo = lambert(0x6d7173);
      nodos.forEach((v) => { const n = new THREE.Mesh(geoNodo, matNodo); n.position.copy(v); g.add(n); });
      // Piso interior de madera.
      const pisoInt = new THREE.Mesh(new THREE.CircleGeometry(R * 0.93, 24), lambert(MADERA_INTERIOR));
      pisoInt.rotation.x = -Math.PI / 2; pisoInt.position.y = base + 0.01;
      g.add(pisoInt);

      // Caja de acceso saliente, como en la captura.
      const frenteZ = R * 0.98;
      if (puertaFrente) {
        const caj = new THREE.Group();
        const ap = datos.aberturas.find((a) => a.tipo === 'puerta' && a.posicion === 'frente');
        const w = Math.max(1.3, ((ap && ap.visual.ancho) || 0.9) + 0.35), h = 2.35, d = 0.9;
        caj.add(caja(0.08, h, d, MADERA_CLARA).translateX(-w / 2).translateY(base + h / 2).translateZ(frenteZ - d / 2 + 0.15));
        caj.add(caja(0.08, h, d, MADERA_CLARA).translateX(w / 2).translateY(base + h / 2).translateZ(frenteZ - d / 2 + 0.15));
        caj.add(caja(w + 0.08, 0.1, d, MADERA_CLARA).translateY(base + h).translateZ(frenteZ - d / 2 + 0.15));
        g.add(caj);
      }
      return { grupo: g, anclas: { frente: frenteZ + 0.15 }, base, altura: base + 2 * R * 0.82, alto: 2.5 * R };
    }

    // ---------- Dormi Patagónico: planta octogonal vidriada y techo zome (según imágenes) ----------
    function zome(datos) {
      const g = new THREE.Group();
      const R = 2.9, H = 2.6, base = 0.25, n = 8;
      const apotema = R * Math.cos(Math.PI / n);
      const vert = (k, r, y) => { const a = (k * 360 / n + 180 / n) * G; return [Math.sin(a) * r, y, Math.cos(a) * r]; };
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(R + 1.3, R + 1.3, base, n), lambert(0xa9875f));
      deck.rotation.y = Math.PI / n; deck.position.y = base / 2;
      g.add(deck);
      const pisoInt = new THREE.Mesh(new THREE.CircleGeometry(apotema - 0.05, n), lambert(MADERA_INTERIOR));
      pisoInt.rotation.x = -Math.PI / 2; pisoInt.rotation.z = Math.PI / n; pisoInt.position.y = base + 0.01;
      g.add(pisoInt);

      const ocupadas = new Set(datos.aberturas.map((a) => a.posicion));
      const caraMadera = new Set(['fondo', 'fondo_izquierda', 'fondo_derecha']);
      const nombre = (ang) => Object.keys(ANGULO).find((k) => difAng(ANGULO[k], ang) < 0.01);
      for (let k = 0; k < n; k++) {
        const a = vert(k, R, base), b = vert(k + 1, R, base);
        const ang = ((k + 1) * 360 / n) * G; // centro de la cara
        const cara = nombre(ang);
        g.add(barra(a, [a[0], base + H, a[2]], 0.06, NEGRO));
        g.add(barra(a, b, 0.04, NEGRO), barra([a[0], base + H, a[2]], [b[0], base + H, b[2]], 0.05, NEGRO));
        const quad = [a, b, [b[0], base + H, b[2]], [a[0], base + H, a[2]]];
        if (caraMadera.has(cara)) {
          g.add(poligono(quad, lambert(0xb5834a)));
        } else {
          g.add(poligono(quad, matVidrio()));
          g.add(barra([a[0], base + 2.15, a[2]], [b[0], base + 2.15, b[2]], 0.03, NEGRO));
          if (cara === 'frente' && ocupadas.has('frente')) continue;
          const mx = (a[0] + b[0]) / 2, mz = (a[2] + b[2]) / 2;
          g.add(barra([mx, base, mz], [mx, base + H, mz], 0.03, NEGRO));
        }
      }
      // Techo zome: aleros, rombos (cometas) y tapa.
      const al = 1.06;
      const r0 = (k) => vert(k, R * al, base + H);
      const r1 = (k) => vert(k + 0.5, R * 0.72, base + H + 0.95);
      const r2 = (k) => vert(k, R * 0.36, base + H + 1.6);
      const cima = [0, base + H + 1.95, 0];
      const matTecho = lambert(datos.color || 0x3a3d42);
      for (let k = 0; k < n; k++) {
        g.add(poligono([r0(k), r0(k + 1), r1(k)], matTecho));
        g.add(poligono([r0(k + 1), r1(k + 1), r2(k + 1), r1(k)], matTecho));
        g.add(poligono([r1(k), r2(k + 1), r2(k)], matTecho));
        g.add(poligono([r2(k), r2(k + 1), cima], matTecho));
        [[r0(k), r0(k + 1)], [r0(k + 1), r1(k)], [r0(k + 1), r1(k + 1)], [r1(k), r2(k + 1)], [r1(k + 1), r2(k + 1)], [r1(k), r2(k)], [r2(k), cima]]
          .forEach(([p, q]) => g.add(barra(p, q, 0.025, 0x15171a)));
      }
      return { grupo: g, anclas: { _todas: apotema + 0.02 }, base, alto: base + H + 1.95 };
    }

    // ---------- Cubic: volumen facetado (según fotos) ----------
    function facetado(datos) {
      const g = new THREE.Group();
      const L = 3.6, base = 0.2;
      const perfil = [[-1.6, 0], [1.6, 0], [1.95, 0.9], [1.95, 1.7], [0, 3.1], [-1.95, 1.7], [-1.95, 0.9]];
      const vidrioArista = new Set([3, 4]); // faldones superiores vidriados
      const P = (i, z) => [perfil[i][0], perfil[i][1] + base, z];
      const matOpaco = lambert(datos.color || 0x2f3236);
      const plataforma = caja(4.8, base, L + 1.6, 0xa9875f);
      plataforma.position.set(0, base / 2, 0.4);
      g.add(plataforma);
      const pisoInt = caja(3.1, 0.04, L - 0.1, MADERA_INTERIOR);
      pisoInt.position.y = base + 0.03;
      g.add(pisoInt);
      // Fondo interior de madera, visible a través del vidrio.
      g.add(poligono(perfil.map((_, i) => P(i, -L / 2 + 0.05)), lambert(MADERA_INTERIOR)));
      for (let i = 0; i < perfil.length; i++) {
        const j = (i + 1) % perfil.length;
        if (i === 0) continue; // piso
        const quad = [P(i, -L / 2), P(j, -L / 2), P(j, L / 2), P(i, L / 2)];
        g.add(poligono(quad, vidrioArista.has(i) ? matVidrio() : matOpaco));
      }
      // Frente vidriado y fondo opaco.
      g.add(poligono(perfil.map((_, i) => P(i, L / 2)), matVidrio()));
      g.add(poligono(perfil.map((_, i) => P(i, -L / 2)), matOpaco));
      // Perfilería negra: contornos, aristas longitudinales, montantes del frente y del techo.
      for (let i = 0; i < perfil.length; i++) {
        const j = (i + 1) % perfil.length;
        g.add(barra(P(i, L / 2), P(j, L / 2), 0.06, NEGRO), barra(P(i, -L / 2), P(j, -L / 2), 0.06, NEGRO));
        g.add(barra(P(i, -L / 2), P(i, L / 2), 0.06, NEGRO));
      }
      [-0.65, 0.65].forEach((x) => g.add(barra([x, base, L / 2], [x, base + 3.1 - Math.abs(x) * 1.4 / 1.95, L / 2], 0.04, NEGRO)));
      [-L / 6, L / 6].forEach((z) => {
        g.add(barra(P(3, z), P(4, z), 0.04, NEGRO), barra(P(4, z), P(5, z), 0.04, NEGRO));
      });
      return {
        grupo: g,
        anclas: { frente: L / 2 + 0.02, izquierda: 1.97, derecha: 1.97, fondo: L / 2 + 0.02 },
        ventana: { w: 1.0, h: 0.62, y: 1.3 },
        base, alto: base + 3.1,
      };
    }

    // ---------- Volumen neutro, para un modelo sin forma cargada ----------
    function neutro(datos) {
      const g = new THREE.Group();
      const R = 2.6, A = 2.7, ap = R * Math.cos(Math.PI / 8);
      const env = new THREE.Mesh(new THREE.CylinderGeometry(R, R, A, 8), lambert(datos.color || 0x8a8f8c, { transparent: true, opacity: 0.92 }));
      env.rotation.y = Math.PI / 8; env.position.y = A / 2 + 0.15;
      g.add(env);
      return { grupo: g, anclas: { _todas: ap + 0.03 }, base: 0.15, alto: A + 0.15 };
    }

    const FORMAS = { geodesico, zome, facetado };

    function construir(datos) {
      if (grupo) { escena.remove(grupo); liberar(grupo); }
      vidrios.length = 0;
      const forma = FORMAS[datos.forma] || neutro;
      const r = forma(datos);
      grupo = r.grupo;
      const dist = (pos) => (r.anclas[pos] !== undefined ? r.anclas[pos] : r.anclas._todas);
      for (const a of datos.aberturas) {
        if (forma === geodesico && a.tipo === 'ventana') continue; // se vidria un paño del domo
        const d = dist(a.posicion);
        if (d === undefined) continue;
        const pieza = a.tipo === 'puerta' ? puerta(a.visual) : ventana(a.visual, r.ventana);
        pieza.position.y = r.base;
        grupo.add(enPosicion(a.posicion, d, pieza));
      }
      if (datos.portico) {
        const p = portico(dist('frente') || 3);
        p.position.y = r.base;
        grupo.add(p);
      }
      const cartel = rotulo(forma === neutro ? 'MAQUETA · FORMA PENDIENTE' : 'APROXIMACIÓN · SIN MEDIDAS');
      cartel.position.set(0, r.alto + 0.7, 0);
      grupo.add(cartel);
      escena.add(grupo);
      aplicarLuz();
      dibujar();
    }

    function aplicarLuz() {
      hemi.intensity = noche ? 0.18 : 0.95;
      sol.intensity = noche ? 0.08 : 0.65;
      interior.intensity = noche ? 1.8 : 0;
      vidrios.forEach((m) => m.emissive.setHex(noche ? 0x6b4a1f : 0x000000));
      piso.material.color.setHex(noche ? 0x2b3330 : 0x9fac98);
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
      irA(new THREE.Vector3(8, 4.8, 10), new THREE.Vector3(0, 1.5, 0));
    }

    function mirar(posicion) {
      if (vista !== 'exterior') return;
      irA(posicionCamara(posicion, 12.5, 4.2), new THREE.Vector3(0, 1.6, 0));
    }

    function cambiarVista(v) {
      vista = v;
      if (v === 'planta') {
        controles.maxPolarAngle = Math.PI / 2 - 0.04;
        irA(new THREE.Vector3(0, 16, 0.01), new THREE.Vector3(0, 0, 0));
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

    camara.position.set(8, 4.8, 10);
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
