"""Cubic: del archivo de Blender de DOMO BAIRES al GLB de la web.

Fuente: cubica.blend (carpeta "Diseño de domos/modelos_blender" de DOMO), escena "Zome N4",
colección "EDB · Zome N4 · …" (exportación de la calculadora EDB). La otra escena del archivo ("Scene")
es un cubo de prueba y no se usa.

Qué trae el archivo:
  * Estructura: "Figura 0" = las 4 vigas de base (zócalo) que forman el piso en rombo;
    "Figura 1" a "Figura 7" = los marcos de tablas de cada cara del zome de 4 lados
    (4 triángulos bajos, 4 rombos verticales y 4 rombos de techo).
  * Paneles: un paño ("Panel-F<figura>-<n>") sobre las figuras que DOMO marcó como cerradas.
    En las exportaciones EDB los paneles son el cerramiento de cada figura (en el Dormi Patagónico
    todas las figuras llevan panel y los vidrios van aparte); las figuras sin panel son las vidriadas.
    Las fotos de DOMO lo confirman: los triángulos bajos se ven opacos (negros por fuera) y el frente
    y el techo del frente, vidriados.

Qué se agrega (no está en el archivo; medidas tomadas de su geometría):
  * vidrio en las figuras sin panel, dentro del espesor de las tablas;
  * chapa negra por fuera y revestimiento de madera por dentro en las figuras con panel;
  * la hoja de la puerta (hexágono vidriado con marco negro) en el vano hexagonal del frente;
  * el piso de madera sobre las vigas de base.

Uso: python cubic.py <archivo.blend> <salida.glb>
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import comun  # noqa: E402
import numpy as np  # noqa: E402  (viene con bpy)
from mathutils import Matrix, Vector  # noqa: E402

blend, salida = comun.argumentos()[:2]
ESCENA = 'Zome N4'
sc = comun.abrir(blend, ESCENA)
COL = next(c.name for c in sc.collection.children
           if any(h.name.startswith('Estructura') for h in c.children))
objs = comun.objetos(sc, dentro_de=COL)          # sin el suelo del entorno (material "Suelo")

# ---------------------------------------------------------------------------------------------
# Geometría plana (2D) para las caras: polígonos convexos en coordenadas (u, v) del plano de cada figura.


def casco(ps):
    """Envolvente convexa (cadena monótona), en sentido antihorario."""
    ps = sorted(set((round(p[0], 6), round(p[1], 6)) for p in ps))

    def cruz(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for p in ps:
        while len(lo) >= 2 and cruz(lo[-2], lo[-1], p) <= 1e-12:
            lo.pop()
        lo.append(p)
    for p in reversed(ps):
        while len(hi) >= 2 and cruz(hi[-2], hi[-1], p) <= 1e-12:
            hi.pop()
        hi.append(p)
    return lo[:-1] + hi[:-1]


def corte(a, b, c, d):
    """Intersección de la recta a-b con la recta c-d."""
    r = (b[0] - a[0], b[1] - a[1])
    s = (d[0] - c[0], d[1] - c[1])
    den = r[0] * s[1] - r[1] * s[0]
    t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den
    return (a[0] + t * r[0], a[1] + t * r[1])


def contorno_limpio(poli, minimo=0.25):
    """Del casco de los extremos de las tablas, quedarse con los lados largos (los bordes de la figura)
    y cortarlos entre sí: saca los chaflanes chicos que dejan los cortes a inglete en las esquinas."""
    n = len(poli)
    lados = [(poli[i], poli[(i + 1) % n]) for i in range(n)]
    largos = [l for l in lados if math.dist(*l) >= minimo]
    # unir lados largos casi alineados
    unidos = []
    for a, b in largos:
        if unidos:
            pa, pb = unidos[-1]
            ang = math.atan2(b[1] - a[1], b[0] - a[0]) - math.atan2(pb[1] - pa[1], pb[0] - pa[0])
            if abs(math.sin(ang)) < 0.02:
                unidos[-1] = (pa, b)
                continue
        unidos.append((a, b))
    k = len(unidos)
    return [corte(*unidos[i - 1], *unidos[i]) for i in range(k)]


def recortar(poli, a, b, c):
    """Recorte de Sutherland-Hodgman: deja la parte del polígono con a*u + b*v <= c."""
    out = []
    n = len(poli)
    for i in range(n):
        p, q = poli[i], poli[(i + 1) % n]
        fp, fq = a * p[0] + b * p[1] - c, a * q[0] + b * q[1] - c
        if fp <= 0:
            out.append(p)
        if fp * fq < 0:
            t = fp / (fp - fq)
            out.append((p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])))
    return out


def area(poli):
    return 0.5 * sum(poli[i][0] * poli[(i + 1) % len(poli)][1] - poli[(i + 1) % len(poli)][0] * poli[i][1]
                     for i in range(len(poli)))


def achicar(poli, d):
    """Desplaza hacia adentro cada lado de un polígono convexo antihorario una distancia d."""
    n = len(poli)
    lineas = []
    for i in range(n):
        p, q = poli[i], poli[(i + 1) % n]
        L = math.dist(p, q)
        nx, ny = -(q[1] - p[1]) / L, (q[0] - p[0]) / L          # normal hacia adentro (polígono antihorario)
        lineas.append(((p[0] + nx * d, p[1] + ny * d), (q[0] + nx * d, q[1] + ny * d)))
    return [corte(*lineas[i - 1], *lineas[i]) for i in range(n)]


# ---------------------------------------------------------------------------------------------
# Figuras: tablas agrupadas por instancia ("F2-04-E" -> figura "F2-04") y su plano.

tablas, paneles = {}, {}
for o in objs:
    if o.name.startswith('Panel-'):
        paneles[o.name[len('Panel-'):]] = o
    elif o.get('tipo', '').startswith('Figura'):
        tablas.setdefault(o.name.rsplit('-', 1)[0], []).append(o)

todos = [o.matrix_world @ v.co for f in tablas.values() for o in f for v in o.data.vertices]
centro_vol = sum(todos, Vector()) / len(todos)


def plano(obs):
    """Normal hacia afuera del volumen (mínimos cuadrados), base (U, V) del plano y caras exterior/interior."""
    P = np.array([tuple(o.matrix_world @ v.co) for o in obs for v in o.data.vertices])
    c = P.mean(0)
    w, vec = np.linalg.eigh(np.cov((P - c).T))
    n = Vector(vec[:, 0]).normalized()
    if n.dot(Vector(c) - centro_vol) < 0:
        n = -n
    U = Vector((0, 0, 1)).cross(n).normalized()       # horizontal, a la derecha mirando la cara desde afuera
    V = n.cross(U)                                      # "arriba" dentro del plano
    s = [n.dot(Vector(p)) for p in P]
    return n, U, V, max(s), min(s)


class Figura:
    def __init__(self, nombre, obs):
        self.nombre, self.obs = nombre, obs
        self.n, self.U, self.V, self.ext, self.int = plano(obs)
        self.prof = self.ext - self.int                  # espesor de las tablas (8,8 cm en el archivo)
        uv = [self.uv(o.matrix_world @ v.co) for o in obs for v in o.data.vertices]
        self.contorno = contorno_limpio(casco(uv))

    def uv(self, p):
        return (self.U.dot(p), self.V.dot(p))

    def p3(self, uv, s):
        """Punto 3D (coordenadas del .blend) a partir de (u, v) y la distancia s del plano al origen."""
        return self.U * uv[0] + self.V * uv[1] + self.n * s

    def tabla_uv(self, o):
        """Huella de una tabla proyectada en el plano de la figura (polígono convexo)."""
        ps = [self.uv(o.matrix_world @ v.co) for v in o.data.vertices]
        return casco(ps)


figs = {k: Figura(k, obs) for k, obs in tablas.items() if not k.startswith('F0')}
base = [o for k, obs in tablas.items() if k.startswith('F0') for o in obs]

# Control: el contorno calculado de las tablas coincide con el panel que trae el archivo.
for k, pan in paneles.items():
    f = figs[k]
    pv = [f.uv(pan.matrix_world @ v.co) for v in pan.data.vertices]
    err = max(min(math.dist(a, b) for b in f.contorno) for a in pv)
    print(f'@@ control {k}: contorno vs Panel-{k}: {err * 100:.1f} cm')

# ---------------------------------------------------------------------------------------------
# El frente: la única cara vertical con montantes verticales a los costados del eje (los lados del
# vano hexagonal de la puerta). En el archivo es la figura F2, que ya mira a -Y.


def u_centro(f, o):
    h = f.tabla_uv(o)
    return sum(q[0] for q in h) / len(h)


def es_vertical(o, f):
    ps = [o.matrix_world @ v.co for v in o.data.vertices]
    zs = [p.z for p in ps]
    us = [f.U.dot(p) for p in ps]
    return (max(zs) - min(zs)) > 0.5 and (max(us) - min(us)) < 0.1


puertas = []
for k, f in figs.items():
    if abs(f.n.z) > 0.1:
        continue
    eje_u = sum(p[0] for p in f.contorno) / len(f.contorno)
    lados = [o for o in f.obs if es_vertical(o, f) and abs(u_centro(f, o) - eje_u) > 0.3]
    if lados:
        puertas.append((k, lados, eje_u))
assert len(puertas) == 1, puertas
K_PUERTA, montantes, eje_u = puertas[0]
fp = figs[K_PUERTA]
print(f'@@ frente: figura {K_PUERTA}, normal {tuple(round(x, 3) for x in fp.n)}')

# Marco común: centro = centro del piso (rombo de las vigas de base); frente = la cara de la puerta.
tope = max((o.matrix_world @ v.co).z for o in base for v in o.data.vertices)
piso_xy = casco([(p.x, p.y) for o in base for p in (o.matrix_world @ v.co for v in o.data.vertices)
                 if p.z > tope - 0.002])
piso_c = (sum(p[0] for p in piso_xy) / len(piso_xy), sum(p[1] for p in piso_xy) / len(piso_xy))
z0 = comun.caja(objs)[0].z
M = comun.matriz_marco(piso_c, z0, (fp.n.x, fp.n.y))

# ---------------------------------------------------------------------------------------------
# Materiales de rol. Barras negras como en las fotos; maderas con los colores del archivo.
orig = {m.name: m for m in bpy.data.materials}
marco = comun.material('marco_negro', '#1d1e20', 0.55)
chapa = comun.material('chapa_negra', '#27282b', 0.6, 0.1)
revest = comun.material('revestimiento_madera', comun.color_de(orig['Figura 1']), 0.75)
piso = comun.material('piso', comun.color_de(orig['Figura 0']), 0.7)
vidrio = comun.material('vidrio', '#bcd9e6', 0.05, 0.0, 0.35)

A = comun.Armado('Cubic', M)


def poligono(grupo, mat, pts3d):
    A.agregar_malla(grupo, mat, [M @ p for p in pts3d], [list(range(len(pts3d)))])


# Estructura: todas las tablas de las figuras, tal cual el archivo.
for f in figs.values():
    for o in f.obs:
        A.agregar(o, 'estructura', lambda nm: marco)
# Base: vigas de zócalo (Figura 0) y piso.
for o in base:
    A.agregar(o, 'base', lambda nm: marco)
poligono('base', piso, [Vector((x, y, tope)) for x, y in piso_xy])
piso_area = abs(area(piso_xy))

# Cerramientos: figuras con panel (el mismo polígono del panel del archivo) -> chapa por fuera y
# revestimiento de madera por dentro, los dos entre las tablas, a 1 cm de sus caras: las tablas negras
# quedan a la vista de los dos lados, como en los renders del Dormi Patagónico de DOMO.
# El revestimiento termina 2 cm antes del borde de la figura (queda tapado por las tablas del borde)
# para que no asome por la junta entre figuras vecinas.
SEP = 0.01
for k, pan in paneles.items():
    f = figs[k]
    uv = [f.uv(pan.matrix_world @ v.co) for v in pan.data.vertices]
    if area(uv) < 0:
        uv.reverse()
    poligono('cerramiento', chapa, [f.p3(q, f.ext - SEP) for q in uv])
    poligono('cerramiento', revest, [f.p3(q, f.int + SEP) for q in achicar(uv, 0.02)])

# Vidrios: figuras sin panel, a mitad del espesor de las tablas (las tablas tapan los bordes).
for k, f in figs.items():
    if k in paneles or k == K_PUERTA:
        continue
    poligono('vidrios', vidrio, [f.p3(q, f.ext - f.prof / 2) for q in f.contorno])

# Frente: los dos triángulos a los costados del vano son vidrio; el hexágono central es la puerta.
izq = [o for o in montantes if u_centro(fp, o) < eje_u]
der = [o for o in montantes if u_centro(fp, o) > eje_u]


def u_extremos(obs):
    us = [q[0] for o in obs for q in fp.tabla_uv(o)]
    return min(us), max(us)


def u_medio(o):
    return u_centro(fp, o)


# Cada lado del vano tiene dos montantes pegados: el del triángulo (afuera) y el del hexágono (adentro).
iz_tri, iz_hex = sorted(izq, key=u_medio)
de_hex, de_tri = sorted(der, key=u_medio)
u_corte_iz = u_extremos([iz_tri])[1]           # línea entre los dos montantes de la izquierda
u_corte_de = u_extremos([de_tri])[0]
s_vid = fp.ext - fp.prof / 2
tri_iz = recortar(fp.contorno, 1, 0, u_corte_iz)
tri_de = recortar(fp.contorno, -1, 0, -u_corte_de)
for t in (tri_iz, tri_de):
    poligono('vidrios', vidrio, [fp.p3(q, s_vid) for q in t])

# Vano libre de la puerta: el hexágono entre las caras interiores de sus tablas.
vano = recortar(recortar(fp.contorno, -1, 0, -u_extremos([iz_hex])[1]), 1, 0, u_extremos([de_hex])[0])
cen = (sum(q[0] for q in vano) / len(vano), sum(q[1] for q in vano) / len(vano))
u_min, u_max = min(q[0] for q in vano), max(q[0] for q in vano)
for o in fp.obs:
    h = fp.tabla_uv(o)
    um = sum(q[0] for q in h) / len(h)
    if o in montantes or not (u_min < um < u_max):      # solo las tablas inclinadas del hexágono
        continue
    # lado largo de la tabla más cercano al centro del vano -> semiplano que deja el centro adentro
    lados = sorted(((h[i], h[(i + 1) % len(h)]) for i in range(len(h))), key=lambda l: -math.dist(*l))[:2]
    mejor = None
    for a, b in lados:
        nx, ny = -(b[1] - a[1]), (b[0] - a[0])
        c = nx * a[0] + ny * a[1]
        val = nx * cen[0] + ny * cen[1] - c
        dist = abs(val) / math.hypot(nx, ny)
        if mejor is None or dist < mejor[0]:
            mejor = (dist, (nx, ny, c) if val <= 0 else (-nx, -ny, -c))
    vano = recortar(vano, *mejor[1])
ancho_vano = max(q[0] for q in vano) - min(q[0] for q in vano)
alto_vano = max(q[1] for q in vano) - min(q[1] for q in vano)
print(f'@@ vano de la puerta: {len(vano)} lados, {ancho_vano:.3f} x {alto_vano:.3f} m')

# Hoja de la puerta: hexágono del vano con 3 mm de holgura, marco negro del ancho de una tabla
# (4,4 cm, la cara visible de las tablas del archivo) y vidrio. Va del lado de afuera del muro
# (abre hacia afuera, como en las fotos) y la bisagra está en el lado vertical derecho mirando desde afuera.
if area(vano) < 0:
    vano.reverse()
ancho_tabla = u_extremos([iz_hex])[1] - u_extremos([iz_hex])[0]
hoja = achicar(vano, 0.003)
hoja_in = achicar(hoja, ancho_tabla)
vid_h = achicar(hoja, ancho_tabla - 0.01)
s_a, s_b = fp.ext - 0.003, fp.ext - 0.003 - ancho_tabla
n6 = len(hoja)
vs = [fp.p3(q, s_a) for q in hoja] + [fp.p3(q, s_a) for q in hoja_in] + \
     [fp.p3(q, s_b) for q in hoja] + [fp.p3(q, s_b) for q in hoja_in]
caras = []
for i in range(n6):
    j = (i + 1) % n6
    caras += [[i, j, n6 + j, n6 + i],                              # frente del marco
              [2 * n6 + i, 3 * n6 + i, 3 * n6 + j, 2 * n6 + j],    # dorso del marco
              [i, 2 * n6 + i, 2 * n6 + j, j],                      # canto exterior
              [n6 + i, n6 + j, 3 * n6 + j, 3 * n6 + i]]            # canto interior
vid = [fp.p3(q, (s_a + s_b) / 2) for q in vid_h]
u_bis = max(q[0] for q in hoja)
v_bis = min(q[1] for q in hoja)                    # a la altura de la punta de abajo de la hoja
pivote = M @ fp.p3((u_bis, v_bis), s_a)            # eje de giro: vertical, por el canto exterior del lado derecho
ob_hoja = A.agregar_con_pivote('puerta_hoja_1', 'puertas',
                     [([M @ p for p in vs], caras, marco), ([M @ p for p in vid], [list(range(len(vid)))], vidrio)],
                     pivote)
ob_hoja.matrix_world = Matrix.Translation(pivote)  # así las medidas de exportar ya la ven en su lugar
ob_hoja['bisagra'] = 'derecha'                     # mirando la puerta desde afuera
ob_hoja['abre'] = 'hacia afuera'                   # en el GLB: giro positivo sobre Y

# Lado del rombo del piso: promedio de sus 4 lados (los más largos del contorno de las vigas de base).
lados_piso = sorted(math.dist(piso_xy[i], piso_xy[(i + 1) % len(piso_xy)]) for i in range(len(piso_xy)))[-4:]
print(f'@@ lados del piso: {[round(x, 3) for x in lados_piso]}')
extras = {
    'id': 'cubic',
    'fuente': os.path.basename(blend), 'escena': ESCENA, 'coleccion': COL,
    'puertas': 1,
    # Paso libre de la puerta: el vano hexagonal medido entre las caras interiores de sus tablas.
    'medidas': {'piso_area_m2': round(piso_area, 2), 'piso_lado_m': round(sum(lados_piso) / 4, 3),
                'puerta_ancho_m': round(ancho_vano, 3), 'puerta_alto_m': round(alto_vano, 3)},
}
A.exportar(salida, extras)
