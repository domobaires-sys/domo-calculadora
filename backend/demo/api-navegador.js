'use strict';
// Versión de demostración de la API que corre dentro del navegador, sin
// servidor. Usa el mismo cotizador y validador que el backend real y guarda
// los cambios solo en este navegador (localStorage).
(function () {
  const M = window.__modulos;
  const { cotizar, seleccionInicial, pasosActivos } = M.cotizador;
  const { validarCatalogo } = M.validador;
  const INICIAL = M.catalogoInicial;
  const ESTADOS = ['nuevo', 'contactado', 'presupuestado', 'ganado', 'perdido'];

  const memoria = {};
  const leer = (k, def) => {
    try { const v = localStorage.getItem('domo_demo_' + k); if (v !== null) return JSON.parse(v); } catch {}
    return k in memoria ? structuredClone(memoria[k]) : structuredClone(def);
  };
  const escribir = (k, v) => {
    memoria[k] = structuredClone(v);
    try { localStorage.setItem('domo_demo_' + k, JSON.stringify(v)); } catch {}
  };

  const catalogo = () => leer('catalogo', INICIAL);
  function guardarCatalogo(nuevo) {
    const errores = validarCatalogo(nuevo);
    if (errores.length) return [422, { ok: false, error: 'No se guardó el catálogo', errores }];
    const actual = catalogo();
    if (nuevo.version !== undefined && nuevo.version !== actual.version) {
      return [409, { ok: false, error: 'No se guardó el catálogo', errores: ['El catálogo cambió mientras lo editabas. Recargá la página.'] }];
    }
    const hist = leer('historial', []);
    const archivo = `catalogo-v${actual.version}-${Date.now()}.json`;
    hist.unshift({ archivo, version: actual.version, fecha: new Date().toISOString(), datos: actual });
    escribir('historial', hist.slice(0, 20));
    const guardado = { ...nuevo, version: actual.version + 1, actualizado: new Date().toISOString(), actualizado_por: 'admin' };
    escribir('catalogo', guardado);
    return [200, guardado];
  }

  function csv(pedidos) {
    const c = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return 'numero,creado,estado,nombre,email,telefono,total\n' + pedidos.map(p =>
      [p.numero, p.creado, p.estado, p.cliente.nombre, p.cliente.email, p.cliente.telefono, p.cotizacion.total].map(c).join(',')).join('\n');
  }

  async function manejar(metodo, ruta, cuerpo) {
    let m;
    if (metodo === 'GET' && ruta === '/api/catalogo') {
      const cat = catalogo();
      return [200, { version: cat.version, ajustes: cat.ajustes, textos: cat.textos || {}, pasos: pasosActivos(cat), seleccion_inicial: seleccionInicial(cat) }];
    }
    if (metodo === 'POST' && ruta === '/api/cotizar') return [200, cotizar(catalogo(), cuerpo.seleccion || {})];
    if (metodo === 'POST' && ruta === '/api/presupuestos') {
      const c = cuerpo.cliente || {};
      const faltan = [];
      if (!c.nombre) faltan.push('Ingresá tu nombre');
      if (!c.email && !c.telefono) faltan.push('Dejanos un email o un teléfono');
      if (faltan.length) return [422, { ok: false, error: 'Faltan datos de contacto', errores: faltan }];
      const q = cotizar(catalogo(), cuerpo.seleccion || {});
      if (!q.ok) return [422, { ok: false, error: 'La configuración tiene errores', errores: q.errores.map(e => e.mensaje) }];
      const { disponibilidad, ...guardable } = q;
      const pedidos = leer('pedidos', []);
      const anio = new Date().getFullYear();
      const numero = `DOMO-${anio}-${String(pedidos.length + 1).padStart(4, '0')}`;
      pedidos.push({ numero, creado: new Date().toISOString(), estado: 'nuevo', cliente: c, cotizacion: guardable });
      escribir('pedidos', pedidos);
      return [200, { ok: true, numero, mensaje: catalogo().textos?.mensaje_enviado || 'Pedido recibido' }];
    }
    if (ruta === '/api/admin/catalogo') {
      if (metodo === 'GET') return [200, catalogo()];
      if (metodo === 'PUT') return guardarCatalogo(cuerpo);
    }
    if (metodo === 'POST' && ruta === '/api/admin/catalogo/validar') {
      const errores = validarCatalogo(cuerpo);
      return [200, { ok: !errores.length, errores }];
    }
    if (metodo === 'GET' && ruta === '/api/admin/historial') return [200, leer('historial', []).map(({ datos, ...v }) => v)];
    if ((m = ruta.match(/^\/api\/admin\/historial\/([^/]+)(\/restaurar)?$/))) {
      const v = leer('historial', []).find(x => x.archivo === m[1]);
      if (!v) return [404, { ok: false, error: 'No existe esa versión' }];
      if (!m[2]) return [200, v.datos];
      return guardarCatalogo({ ...v.datos, version: catalogo().version });
    }
    if (metodo === 'GET' && ruta === '/api/admin/presupuestos') return [200, leer('pedidos', []).slice().reverse()];
    if (metodo === 'GET' && ruta === '/api/admin/presupuestos.csv') return [200, csv(leer('pedidos', [])), 'text/csv'];
    if (metodo === 'PATCH' && (m = ruta.match(/^\/api\/admin\/presupuestos\/(.+)$/))) {
      const pedidos = leer('pedidos', []);
      const p = pedidos.find(x => x.numero === m[1]);
      if (!p) return [404, { ok: false, error: 'No existe ese pedido' }];
      if (cuerpo.estado !== undefined && !ESTADOS.includes(cuerpo.estado)) return [422, { ok: false, error: 'Estado inválido' }];
      Object.assign(p, cuerpo);
      escribir('pedidos', pedidos);
      return [200, p];
    }
    return [404, { ok: false, error: 'No encontrado' }];
  }

  const fetchOriginal = window.fetch.bind(window);
  window.fetch = async (url, opciones = {}) => {
    const ruta = new URL(url, location.href).pathname.replace(/^.*(\/api\/)/, '$1');
    if (!ruta.startsWith('/api/')) return fetchOriginal(url, opciones);
    let cuerpo = {};
    try { cuerpo = opciones.body ? JSON.parse(opciones.body) : {}; } catch { return new Response(JSON.stringify({ ok: false, error: 'JSON inválido' }), { status: 400, headers: { 'Content-Type': 'application/json' } }); }
    const [status, datos, tipo] = await manejar((opciones.method || 'GET').toUpperCase(), ruta, cuerpo);
    return new Response(tipo ? datos : JSON.stringify(datos), { status, headers: { 'Content-Type': tipo || 'application/json' } });
  };

  window.domoDemoReiniciar = () => {
    for (const k of ['catalogo', 'historial', 'pedidos']) { delete memoria[k]; try { localStorage.removeItem('domo_demo_' + k); } catch {} }
    location.reload();
  };
})();
