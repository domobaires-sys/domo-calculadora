"""Dormi Patagónico: del archivo de Blender de DOMO BAIRES al GLB de la web.

Fuente: DOMO_Dormi_Aureo_y_Patagonico.blend (carpeta "Diseño de domos/modelos_blender" de DOMO),
escena "Zome Dormi octogonal", colección "Zome Dormi octogonal":
  Figura 1..5 (x8)  barras del techo zome            -> estructura (marco_negro)
  Tejas F1..F4 (x8) paños de chapa de la cubierta     -> cubierta (chapa_negra)
  Muros (63)        soleras, montantes y premarcos   -> cerramiento (marco_negro)
  Vidrios (4)       paños fijos de los muros 2, 3, 7, 8 -> vidrios (vidrio)
Planta octogonal; la puerta está en el Muro 1 (premarco M9/M11) y los muros 4, 5 y 6 son cerrados.

Lo que el archivo no trae y se agrega, con medidas sacadas de la geometría del archivo (anotado para DOMO):
  * hoja de la puerta vidriada "puerta_hoja_1" (marco negro + vidrio) que llena el vano del premarco del Muro 1;
    la bisagra a la izquierda (mirando desde afuera) y que abra hacia afuera son supuestos: el archivo no lo dice;
  * los dos huecos de 23 cm del Muro 1, entre el montante de esquina (M3) y el parante entero (M5), quedan
    cerrados como muro, en el negro de la perfilería: en el archivo son huecos del entramado, sin premarco ni
    vidrio (los únicos vidrios del archivo son los 4 de los muros 2, 3, 7 y 8);
  * revestimiento de madera por fuera de los muros cerrados 4, 5 y 6: tablas verticales entre los montantes de
    esquina, del ancho de la sección de madera del archivo (8,8 cm). Que sean de madera sale de los renders de
    DOMO (un muro de tablas verticales); la madera y el ancho de las tablas están a confirmar;
  * piso de madera octogonal dentro de las soleras, del alto de la solera inferior;
  * segunda solera superior que cierra los 4,4 cm abiertos entre los muros y el aro de barras del techo;
  * cielorraso de madera clara apenas por debajo de cada teja (las barras quedan a la vista como nervios negros).

Diferencias con los renders de DOMO (el GLB sigue al archivo; quedan como preguntas para DOMO): en el archivo la
cubierta es de tejas escalonadas con aletas y tiene una corona de puntas de barras en la cumbrera; los triángulos
sobre los muros son de chapa; el frente es una puerta de 0,9 m con dos huecos cerrados a los lados y la diagonal
derecha del frente es de vidrio. En los renders, la cubierta es lisa de paños grandes, sin corona, los triángulos
sobre los muros son vidriados, el frente son dos paños iguales con parante central y travesaño, y la diagonal
derecha es de madera.

Cubierta: las tejas del archivo tienen las normales bien (todas hacia afuera); los paños que se veían blancos en la
exportación cruda eran el brillo especular de la chapa (rugosidad 0,35 en el archivo) sobre paños planos.
Acá la chapa sale más mate (rugosidad 0,7) y conserva el color del archivo.

Uso: python patagonico.py <archivo.blend> <salida.glb>
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import comun  # noqa: E402
from mathutils import Vector  # noqa: E402

blend, salida = comun.argumentos()[:2]
FUENTE = 'DOMO_Dormi_Aureo_y_Patagonico.blend'      # nombre del archivo de DOMO (la copia local puede llamarse distinto)
ESCENA = 'Zome Dormi octogonal'
COL = 'Zome Dormi octogonal'
sc = comun.abrir(blend, ESCENA)
objs = comun.objetos(sc, dentro_de=COL)            # sin 'Suelo' (se excluye por material)

muros = {}                                          # número de muro -> piezas
for o in objs:
    if comun.coleccion_de(o).startswith('Muros'):
        muros.setdefault(int(o['muro']), []).append(o)


def piezas(n, pieza):
    return [o for o in muros[n] if o.get('pieza') == pieza]


# ---------------------------------------------------------------------------
# Marco común: centro = centro de la planta (soleras inferiores); frente = Muro 1 (la puerta) hacia -Y de Blender.
soleras = [o for n in muros for o in piezas(n, 'M1')]
lo, hi = comun.caja(soleras)
centro = (lo + hi) / 2
lo1, hi1 = comun.caja(muros[1])
d = (lo1 + hi1) / 2 - centro
z0 = comun.caja(objs)[0].z
M = comun.matriz_marco((centro.x, centro.y), z0, (d.x, d.y))


def pts(os_):
    return [M @ o.matrix_world @ v.co for o in os_ for v in o.data.vertices]


TAN = math.tan(math.radians(22.5))
lados = {}     # número de muro -> datos del lado del octógono en el marco común
for n in sorted(muros):
    ps = pts(piezas(n, 'M1'))
    c = sum(ps, Vector()) / len(ps)
    ang = round(math.degrees(math.atan2(c.y, c.x)) / 45) * 45          # los lados van cada 45°
    nn = Vector((math.cos(math.radians(ang)), math.sin(math.radians(ang)), 0))
    t = Vector((-nn.y, nn.x, 0))
    pm = pts(muros[n])
    lados[n] = {
        'n': nn, 't': t,
        'a_ext': max(p.dot(nn) for p in ps),          # cara exterior de la solera (apotema)
        'a_int': min(p.dot(nn) for p in ps),          # cara interior de la solera
        'z_bajo': min(p.z for p in pm), 'z_alto': max(p.z for p in pm),
        'solera_inf_alto': max(p.z for p in ps),
    }
L1 = lados[1]
assert L1['n'].y < -0.99, 'el Muro 1 tiene que quedar mirando a -Y (frente)'

a_ext = sum(l['a_ext'] for l in lados.values()) / 8
a_int = sum(l['a_int'] for l in lados.values()) / 8
lado_m = 2 * a_ext * TAN                              # lado exterior del octógono
area_planta = 8 * a_ext ** 2 * TAN                    # octógono por la cara exterior de los muros
area_interior = 8 * a_int ** 2 * TAN                  # octógono por la cara interior de las soleras
alto_muros = max(l['z_alto'] for l in lados.values()) - min(l['z_bajo'] for l in lados.values())

# ---------------------------------------------------------------------------
# Materiales de rol con los colores del archivo de DOMO (las maderas agregadas llevan color de las fotos).
orig = {m.name: m for m in bpy.data.materials}
marco_negro = comun.material('marco_negro', comun.color_de(orig['Dormi · madera negra']), 0.7)
chapa_negra = comun.material('chapa_negra', comun.color_de(orig['Dormi · chapa negra']), 0.7)
vidrio = comun.material('vidrio', comun.color_de(orig['Dormi · vidrio']), 0.05, 0.0, 0.3)
revestimiento = comun.material('revestimiento_madera', '#a8714a', 0.85)     # tablas de cedro (fotos)
piso = comun.material('piso', '#b4875a', 0.75)                              # piso de madera (fotos)
cielorraso = comun.material('cielorraso_madera', '#dcc196', 0.8)            # pino claro (fotos del interior)
ROL = {'Dormi · madera negra': marco_negro, 'Dormi · chapa negra': chapa_negra, 'Dormi · vidrio': vidrio}
rol = ROL.get

A = comun.Armado('Dormi Patagónico', M)
GRUPO = {'Figura': 'estructura', 'Tejas': 'cubierta', 'Muros': 'cerramiento', 'Vidrios': 'vidrios'}
for o in objs:
    col = comun.coleccion_de(o)
    g = next(v for k, v in GRUPO.items() if col.startswith(k))
    A.agregar(o, g, rol)


# ---------------------------------------------------------------------------
# Ayudantes de geometría nueva (marco común, coordenadas de Blender, metros).
def prisma(poligono, za, zb):
    """Prisma vertical: polígono en planta (lista de (x, y), en orden) entre las alturas za y zb."""
    k = len(poligono)
    vs = [(x, y, za) for x, y in poligono] + [(x, y, zb) for x, y in poligono]
    caras = [list(range(k))[::-1], list(range(k, 2 * k))]
    caras += [[i, (i + 1) % k, k + (i + 1) % k, k + i] for i in range(k)]
    return vs, caras


def caja_local(L, t0, t1, a0, a1, za, zb):
    """Caja alineada con un lado: t0..t1 a lo largo del muro, a0..a1 en profundidad (apotema), za..zb en altura."""
    n, t = L['n'], L['t']
    esq = [(t0, a0), (t1, a0), (t1, a1), (t0, a1)]
    return prisma([tuple((n * a + t * u).xy) for u, a in esq], za, zb)


def rango_t(L, os_):
    ps = pts(os_)
    return min(p.dot(L['t']) for p in ps), max(p.dot(L['t']) for p in ps)


def octogono(a):
    r = a / math.cos(math.radians(22.5))
    angs = sorted(math.atan2(l['n'].y, l['n'].x) for l in lados.values())
    return [(r * math.cos(x + math.radians(22.5)), r * math.sin(x + math.radians(22.5))) for x in angs]


# Espesor del vidrio: el de los paños del archivo (en la dirección de su muro).
v2 = [o for o in objs if comun.coleccion_de(o).startswith('Vidrios')]
n_v = int(v2[0].name.split('-')[0].replace('Muro', ''))
pv = pts([v2[0]])
esp_vidrio = max(p.dot(lados[n_v]['n']) for p in pv) - min(p.dot(lados[n_v]['n']) for p in pv)

# --- Piso: octógono por la cara interior de las soleras, del alto de la solera inferior (queda al ras con ella,
#     que es el umbral de la puerta).
alto_piso = min(l['solera_inf_alto'] for l in lados.values())
A.agregar_malla('base', piso, *prisma(octogono(a_int), 0.0, alto_piso))

# --- Revestimiento de madera por fuera de los muros cerrados (los que no tienen vidrio ni puerta: 4, 5 y 6).
#     Tablas verticales entre los montantes de esquina (M3), que quedan a la vista como el marco negro de cada muro,
#     del pie de la solera inferior a la cara de arriba de la solera superior. Ancho de cada tabla: la sección de la
#     madera del archivo (8,8 cm), repartida en partes iguales, con una junta de 4 mm. El archivo no da el espesor:
#     2 cm, con la cara de afuera 5 mm por delante del entramado (solo visual).
ANCHO_TABLA = max(int(x) for x in piezas(1, 'M1')[0]['seccion_mm'].split('x')) / 1000   # 88 mm
ESP_REV, SALIENTE, JUNTA = 0.02, 0.005, 0.004
con_vidrio = {int(o.name.split('-')[0].replace('Muro', '')) for o in v2}
cerrados = [n for n in sorted(muros) if n != 1 and n not in con_vidrio]
tablas_rev = 0
for n in cerrados:
    L = lados[n]
    esquinas = sorted(piezas(n, 'M3'), key=lambda o: rango_t(L, [o])[0])
    t0, t1 = rango_t(L, [esquinas[0]])[1], rango_t(L, [esquinas[1]])[0]
    k = max(1, round((t1 - t0) / ANCHO_TABLA))
    paso = (t1 - t0) / k
    a1 = L['a_ext'] + SALIENTE
    for i in range(k):
        ta = t0 + i * paso + (JUNTA / 2 if i else 0)
        tb = t0 + (i + 1) * paso - (JUNTA / 2 if i < k - 1 else 0)
        A.agregar_malla('cerramiento', revestimiento, *caja_local(L, ta, tb, a1 - ESP_REV, a1, L['z_bajo'], L['z_alto']))
    # fondo de las juntas: una lámina detrás de las tablas, para que las juntas no dejen pasar la luz
    A.agregar_malla('cerramiento', revestimiento,
                    *caja_local(L, t0, t1, a1 - ESP_REV - 0.001 - JUNTA, a1 - ESP_REV - 0.001, L['z_bajo'], L['z_alto']))
    tablas_rev += k

# --- Cierre entre muros y techo: en el archivo, la solera superior termina 4,4 cm por debajo del aro de barras del
#     techo y ese hueco queda abierto alrededor de todo el Dormi. Se cierra con una segunda solera, copia de la
#     solera superior de cada muro estirada en altura hasta el aro (el hueco mide lo mismo que la solera: 44 mm).
z_muros = max(l['z_alto'] for l in lados.values())
z_aro = min(p.z for p in pts([o for o in objs if comun.coleccion_de(o).startswith('Figura')]))
hueco_techo = z_aro - z_muros
if hueco_techo > 0.001:
    for n in sorted(muros):
        for o in piezas(n, 'M2'):
            ps = pts([o])
            zb, za = min(p.z for p in ps), max(p.z for p in ps)
            vs = [(p.x, p.y, z_muros + (p.z - zb) / (za - zb) * hueco_techo) for p in ps]
            A.agregar_malla('cerramiento', marco_negro, vs, [list(f.vertices) for f in o.data.polygons])

# --- Muro 1: vano de la puerta (entre las jambas M9 del premarco, de la solera inferior al cabezal M11).
jambas = sorted(piezas(1, 'M9'), key=lambda o: rango_t(L1, [o])[0])
t_izq = rango_t(L1, [jambas[0]])[1]
t_der = rango_t(L1, [jambas[1]])[0]
z_umbral = L1['solera_inf_alto']
z_cabezal = min(p.z for p in pts(piezas(1, 'M11')))
a_med = (L1['a_ext'] + L1['a_int']) / 2               # mitad del espesor del muro
seccion = sorted(int(x) for x in jambas[0]['seccion_mm'].split('x'))
perfil = seccion[0] / 1000                            # 44 mm: cara de la jamba del premarco
esp_hoja = seccion[0] / 1000                          # hoja de 44 mm de espesor, centrada en el muro

# Huecos a los lados de la puerta, entre el montante de esquina (M3) y el parante entero (M5): en el archivo son
# huecos del entramado (sin premarco ni vidrio). Se cierran como muro, del espesor del muro y en el negro de la
# perfilería, de la solera inferior a la superior.
montantes = sorted(piezas(1, 'M3'), key=lambda o: rango_t(L1, [o])[0])
jambas_ent = sorted(piezas(1, 'M5'), key=lambda o: rango_t(L1, [o])[0])
z_sup = min(p.z for p in pts(piezas(1, 'M2')))      # cara inferior de la solera superior
laterales = [(rango_t(L1, [montantes[0]])[1], rango_t(L1, [jambas_ent[0]])[0]),
             (rango_t(L1, [jambas_ent[1]])[1], rango_t(L1, [montantes[1]])[0])]
for ta, tb in laterales:
    A.agregar_malla('cerramiento', marco_negro, *caja_local(L1, ta, tb, L1['a_int'], L1['a_ext'], z_umbral, z_sup))

# --- Hoja de la puerta: marco negro de 44 mm + vidrio. Bisagra del lado izquierdo mirando desde afuera
#     (el archivo no lo dice), sobre la cara exterior de la hoja: abre hacia afuera.
ancho_hoja = t_der - t_izq
alto_hoja = z_cabezal - z_umbral
ae0, ae1 = a_med - esp_hoja / 2, a_med + esp_hoja / 2
partes = [
    caja_local(L1, t_izq, t_izq + perfil, ae0, ae1, z_umbral, z_cabezal),                       # parante bisagra
    caja_local(L1, t_der - perfil, t_der, ae0, ae1, z_umbral, z_cabezal),                       # parante cierre
    caja_local(L1, t_izq + perfil, t_der - perfil, ae0, ae1, z_umbral, z_umbral + perfil),      # travesaño inferior
    caja_local(L1, t_izq + perfil, t_der - perfil, ae0, ae1, z_cabezal - perfil, z_cabezal),    # travesaño superior
]
vidrio_hoja = caja_local(L1, t_izq + perfil, t_der - perfil, a_med - esp_vidrio / 2, a_med + esp_vidrio / 2,
                         z_umbral + perfil, z_cabezal - perfil)
piv = L1['n'] * ae1 + L1['t'] * t_izq                 # cara exterior (mayor apotema) del lado de la bisagra
hoja = A.agregar_con_pivote('puerta_hoja_1', 'puertas',
                            [(v, c, marco_negro) for v, c in partes] + [(vidrio_hoja[0], vidrio_hoja[1], vidrio)],
                            (piv.x, piv.y, z_umbral))
hoja['bisagra'] = 'izquierda'          # mirando la puerta desde afuera
hoja['abre'] = 'hacia afuera'          # en el GLB: giro negativo sobre Y

# --- Cielorraso: cada teja (sus dos caras principales, sin las aletas) copiada 1 cm hacia adentro, en madera clara.
#     Las barras del techo (8,8 cm de alto, debajo de las tejas) quedan a la vista como nervios negros.
BAJO_TEJA = 0.01
for o in objs:
    if not comun.coleccion_de(o).startswith('Tejas'):
        continue
    mw = M @ o.matrix_world
    principales = sorted(o.data.polygons, key=lambda p: p.area, reverse=True)[:2]
    nrm = sum(((mw.to_3x3() @ p.normal).normalized() for p in principales), Vector()).normalized()
    idx = sorted({i for p in principales for i in p.vertices})
    vs = [mw @ o.data.vertices[i].co - nrm * BAJO_TEJA for i in idx]
    caras = [[idx.index(i) for i in p.vertices] for p in principales]
    A.agregar_malla('cubierta', cielorraso, vs, caras)

extras = {
    'id': 'dormi_patagonico',
    'fuente': FUENTE, 'escena': ESCENA, 'coleccion': COL,
    'puertas': 1,
    'medidas': {
        'alto_muros_m': round(alto_muros, 3),
        'lado_m': round(lado_m, 3),
        'piso_area_m2': round(area_planta, 2),
        'piso_interior_area_m2': round(area_interior, 2),
        'paños_vidriados': len(v2),
        'puerta_ancho_m': round(ancho_hoja, 3),
        'puerta_alto_m': round(alto_hoja, 3),
    },
}
print('@@ lados', {n: (round(l['a_ext'], 4), round(l['a_int'], 4), round(l['z_alto'], 3)) for n, l in lados.items()},
      'cerrados', cerrados, 'vidrio', sorted(con_vidrio), 'esp_vidrio', round(esp_vidrio, 4),
      'huecos cerrados', [(round(a, 3), round(b, 3)) for a, b in laterales], 'tablas', tablas_rev, 'hoja', round(ancho_hoja, 3), round(alto_hoja, 3),
      'hueco muros-techo', round(hueco_techo, 4))
A.exportar(salida, extras)
