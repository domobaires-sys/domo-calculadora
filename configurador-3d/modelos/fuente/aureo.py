"""Dormi Áureo: del archivo de Blender de DOMO BAIRES al GLB de la web.

Fuente: DOMO_Dormi_Aureo_y_Patagonico.blend (carpeta "Diseño de domos/modelos_blender" de DOMO),
escena "DOMO Baires · Dormi Áureo y Patagónico", colección "Dormi Áureo · opción A" u "opción B".
Las capturas de referencia de DOMO (carpeta "Fotos modelos/Dormis") muestran la opción A.

Uso: python aureo.py <archivo.blend> <A|B> <salida.glb>
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import comun  # noqa: E402
from mathutils import Vector  # noqa: E402

blend, opcion, salida = comun.argumentos()[:3]
ESCENA = 'DOMO Baires · Dormi Áureo y Patagónico'
COL = f'Dormi Áureo · opción {opcion}'
sc = comun.abrir(blend, ESCENA)
objs = comun.objetos(sc, dentro_de=COL, excluir_colecciones=[f'Entorno {opcion}'])
por_nombre = {o.name: o for o in objs}

# Marco común: centro = centro del piso pentagonal; frente = puerta principal (P1).
piso = por_nombre[f'Piso {opcion}']
c = sum((piso.matrix_world @ v.co for v in piso.data.vertices), Vector()) / len(piso.data.vertices)
p1 = comun.caja([por_nombre[f'P1-Hoja {opcion}']])
d = (p1[0] + p1[1]) / 2 - c
z0 = comun.caja(objs)[0].z
M = comun.matriz_marco((c.x, c.y), z0, (d.x, d.y))

# Materiales de rol con los colores del archivo de DOMO.
orig = {m.name: m for m in bpy.data.materials}
ROLES = {
    'Áurea · Madera icosaedro': ('madera_icosaedro', 0.65),
    'Áurea · Madera dodecaedro': ('madera_dodecaedro', 0.65),
    'Áurea · Incrustación': ('incrustacion', 0.8),
    'Áurea · Nodos acero': ('acero', 0.35, 0.8),
    'Áurea · Panel macizo': ('panel', 0.8),
    'Áurea · Persiana': ('persiana', 0.7),
    'Áurea · Puerta': ('puerta', 0.6),
    'Áurea · Podio': ('podio', 0.9),
    'Áurea · Piso de madera': ('piso', 0.7),
}
mats = {}
for n, (rol, rug, *met) in ROLES.items():
    mats[n] = comun.material(rol, comun.color_de(orig[n]), rug, met[0] if met else 0.0)
mats['Áurea · Vidrio'] = comun.material('vidrio', '#bcd9e6', 0.05, 0.0, 0.35)
mat_det_puerta = comun.material('puerta_detalle', comun.color_de(orig['Áurea · Incrustación']), 0.8)
rol = mats.get

GRUPO = {
    'Icosaedro': 'estructura', 'Dodecaedro': 'estructura', 'Aristas': 'estructura',
    'Nodos': 'detalles', 'Paredes': 'cerramiento', 'Incrustaciones': 'cerramiento',
    'Ventana': 'ventanas', 'Ventilación': 'detalles', 'Accesos': 'puertas', 'Podio': 'base',
}
A = comun.Armado(f'Dormi Áureo {opcion}', M)
hojas = {}
for o in objs:
    col = comun.coleccion_de(o)
    g = next(v for k, v in GRUPO.items() if col.startswith(k))
    base = o.name.rsplit(' ', 1)[0].split('-')                # 'P1-Hoja-rect-1 A' -> ['P1', 'Hoja', 'rect', '1']
    if g == 'puertas' and base[1] in ('Hoja', 'Tirador'):
        hojas.setdefault(base[0], []).append(o)               # P1 / P2: va a la hoja con pivote
        continue
    A.agregar(o, g, rol)

# Hojas de puerta: un objeto por puerta, con el pivote en la bisagra (lado opuesto al tirador).
for i, (pn, partes) in enumerate(sorted(hojas.items()), 1):
    piezas = []
    for o in partes:
        mw = M @ o.matrix_world
        vs = [mw @ v.co for v in o.data.vertices]
        caras = [list(p.vertices) for p in o.data.polygons]
        m0 = o.data.materials[0].name
        mat = mat_det_puerta if 'rect' in o.name else rol(m0)
        piezas.append((vs, caras, mat, o.name))
    hoja = next(p for p in piezas if p[3] == f'{pn}-Hoja {opcion}')
    tir = next(p for p in piezas if 'Tirador' in p[3])
    hv = hoja[0]
    # eje horizontal de la hoja: dirección de mayor extensión en planta
    best = max(((a, b) for a in hv for b in hv), key=lambda ab: (ab[0].xy - ab[1].xy).length)
    eje = (best[1].xy - best[0].xy).normalized()
    cen = sum(hv, Vector()) / len(hv)
    t = (sum(tir[0], Vector()) / len(tir[0])).xy - cen.xy
    lado = -1 if t.dot(eje) > 0 else 1          # la bisagra va del lado contrario al tirador
    ext = max((v.xy - cen.xy).dot(eje) * lado for v in hv)
    piv = cen.xy + eje * lado * ext
    pivote = (piv.x, piv.y, min(v.z for v in hv))
    A.agregar_con_pivote(f'puerta_hoja_{i}', 'puertas', [(p[0], p[1], p[2]) for p in piezas], pivote)

extras = {
    'id': f'dormi_aureo_{opcion.lower()}',
    'fuente': os.path.basename(blend), 'escena': ESCENA, 'coleccion': COL,
    'puertas': len(hojas),
    'medidas': {},
}
# datos de diseño guardados por DOMO en el archivo
for o in objs:
    for k in ('Piso', 'Podio'):
        if o.name == f'{k} {opcion}':
            extras['medidas'][f'{k.lower()}_lado_m'] = round(float(o.get('lado_m', 0)), 3)
            if 'area_m2' in o.keys():
                extras['medidas'][f'{k.lower()}_area_m2'] = round(float(o['area_m2']), 2)
A.exportar(salida, extras)
