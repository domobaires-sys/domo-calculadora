"""Funciones comunes para pasar los modelos de Blender de DOMO BAIRES a GLB para la web.

Se usan con Blender como módulo de Python (`pip install bpy`) o con `blender -b --python`.
Convención de salida (ver ../MODELOS.md):
  * metros; en Blender Z arriba (en el GLB queda Y arriba);
  * origen en el centro de la planta, a nivel del terreno (lo más bajo del modelo en z = 0);
  * el frente del modelo (su puerta principal) mira hacia -Y de Blender, que en el GLB es +Z;
  * un grupo (Empty) por parte: estructura, cerramiento, vidrios, puertas, ventanas, cubierta, base, detalles;
  * las mallas de cada grupo se unen por material; los materiales llevan nombres de rol (madera, panel, vidrio...).
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

GRUPOS = ('estructura', 'cerramiento', 'vidrios', 'puertas', 'ventanas', 'cubierta', 'base', 'detalles')


def argumentos():
    """Argumentos después de '--' (blender -b --python x.py -- a b) o los de python (python x.py a b)."""
    if '--' in sys.argv:
        return sys.argv[sys.argv.index('--') + 1:]
    return sys.argv[1:]


def abrir(blend, escena):
    """Abre el .blend y deja solo la escena pedida."""
    bpy.ops.wm.open_mainfile(filepath=blend, load_ui=False)
    for s in list(bpy.data.scenes):
        if s.name != escena:
            bpy.data.scenes.remove(s)
    return bpy.data.scenes[escena]


def colecciones_ocultas(escena):
    ocultas = set()

    def walk(lc, oculta=False):
        oc = oculta or lc.exclude or lc.collection.hide_render
        if oc:
            ocultas.add(lc.collection.name)
        for ch in lc.children:
            walk(ch, oc)
    walk(escena.view_layers[0].layer_collection)
    return ocultas


def descendientes(coleccion):
    out = {coleccion.name}
    for ch in coleccion.children:
        out |= descendientes(ch)
    return out


def objetos(escena, dentro_de=None, excluir_colecciones=(), excluir_materiales=('Suelo', 'Pasto')):
    """Mallas visibles en render de la escena. dentro_de: nombre de colección raíz a la que deben pertenecer."""
    ocultas = colecciones_ocultas(escena)
    permitidas = descendientes(bpy.data.collections[dentro_de]) if dentro_de else None
    excl = set()
    for n in excluir_colecciones:
        excl |= descendientes(bpy.data.collections[n])
    res = []
    for o in escena.objects:
        if o.type != 'MESH' or o.hide_render or not o.data.polygons:
            continue
        cols = {c.name for c in o.users_collection}
        if cols and cols <= ocultas:
            continue
        if permitidas is not None and not (cols & permitidas):
            continue
        if cols & excl:
            continue
        mats = [m.name for m in o.data.materials if m]
        if any(s in m for m in mats for s in excluir_materiales):
            continue
        res.append(o)
    return res


def coleccion_de(o):
    return o.users_collection[0].name if o.users_collection else ''


def puntos(objs):
    return [o.matrix_world @ v.co for o in objs for v in o.data.vertices]


def caja(objs_o_puntos):
    ps = objs_o_puntos if objs_o_puntos and isinstance(objs_o_puntos[0], Vector) else puntos(objs_o_puntos)
    lo = Vector((min(p.x for p in ps), min(p.y for p in ps), min(p.z for p in ps)))
    hi = Vector((max(p.x for p in ps), max(p.y for p in ps), max(p.z for p in ps)))
    return lo, hi


def matriz_marco(centro_xy, z0, direccion_frente_xy):
    """Matriz que lleva el modelo al marco común: centro de planta al origen, piso en z0 -> 0,
    y la dirección del frente (vector XY desde el centro hacia la puerta) a -Y."""
    ang_actual = math.atan2(direccion_frente_xy[1], direccion_frente_xy[0])
    giro = -math.pi / 2 - ang_actual
    return Matrix.Rotation(giro, 4, 'Z') @ Matrix.Translation((-centro_xy[0], -centro_xy[1], -z0))


def material(nombre, color, rugosidad=0.7, metal=0.0, alfa=1.0):
    """Material Principled con nombre de rol. color: (r, g, b) lineales 0..1 o '#rrggbb' (sRGB)."""
    if isinstance(color, str):
        c = color.lstrip('#')
        srgb = [int(c[i:i + 2], 16) / 255 for i in (0, 2, 4)]
        color = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in srgb]
    m = bpy.data.materials.get(nombre) or bpy.data.materials.new(nombre)
    if m.node_tree is None:
        try:
            m.use_nodes = True
        except Exception:
            pass
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (color[0], color[1], color[2], 1)
    b.inputs['Roughness'].default_value = rugosidad
    b.inputs['Metallic'].default_value = metal
    b.inputs['Alpha'].default_value = alfa
    if alfa < 1:
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            m.blend_method = 'BLEND'
    return m


def color_de(mat):
    b = mat.node_tree.nodes.get('Principled BSDF') if mat and mat.node_tree else None
    return tuple(b.inputs['Base Color'].default_value)[:3] if b else tuple(mat.diffuse_color)[:3]


class Armado:
    """Acumula geometría ya transformada al marco común, agrupada por (grupo, material), y la exporta."""

    def __init__(self, nombre_modelo, M):
        self.nombre = nombre_modelo
        self.M = M
        self.partes = {}    # (grupo, nombre_material) -> bmesh
        self.mats = {}      # nombre_material -> Material
        self.sueltos = []   # objetos con pivote propio: (grupo, objeto)

    def _bm(self, grupo, mat):
        assert grupo in GRUPOS, grupo
        self.mats[mat.name] = mat
        k = (grupo, mat.name)
        if k not in self.partes:
            self.partes[k] = bmesh.new()
        return self.partes[k]

    def agregar(self, o, grupo, mat_por_rol, mat_defecto=None):
        """Agrega el objeto o (del .blend) al grupo. mat_por_rol: función(nombre_material_original) -> Material de rol."""
        me = o.data.copy()
        me.transform(self.M @ o.matrix_world)
        if (self.M @ o.matrix_world).determinant() < 0:
            me.flip_normals()
        nombres = [m.name if m else None for m in o.data.materials] or [None]
        for idx, nm in enumerate(nombres):
            destino = mat_por_rol(nm) if nm else mat_defecto
            if destino is None:
                continue
            bm = bmesh.new()
            bm.from_mesh(me)
            if len(nombres) > 1:
                bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != idx], context='FACES')
            for f in bm.faces:
                f.material_index = 0
            tmp = bpy.data.meshes.new('tmp')
            bm.to_mesh(tmp)
            bm.free()
            self._bm(grupo, destino).from_mesh(tmp)
            bpy.data.meshes.remove(tmp)
        bpy.data.meshes.remove(me)

    def agregar_malla(self, grupo, mat, verts, caras):
        """Geometría nueva, ya en el marco común (coordenadas Blender, metros)."""
        me = bpy.data.meshes.new('tmp')
        me.from_pydata([tuple(v) for v in verts], [], caras)
        me.update()
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        self._bm(grupo, mat).from_mesh(me)
        bpy.data.meshes.remove(me)

    def agregar_con_pivote(self, nombre, grupo, verts_caras_mats, pivote):
        """Pieza que se mueve (hoja de puerta): queda como objeto aparte llamado `nombre`, con su origen en `pivote`
        (marco común). verts_caras_mats: lista de (verts, caras, Material)."""
        me = bpy.data.meshes.new(nombre)
        bm = bmesh.new()
        for verts, caras, mat in verts_caras_mats:
            if mat.name not in [m.name for m in me.materials]:
                me.materials.append(mat)
                self.mats[mat.name] = mat
            idx = [m.name for m in me.materials].index(mat.name)
            base = len(bm.verts)
            vs = [bm.verts.new(Vector(v) - Vector(pivote)) for v in verts]
            bm.verts.ensure_lookup_table()
            for c in caras:
                try:
                    f = bm.faces.new([vs[i] for i in c])
                    f.material_index = idx
                except ValueError:
                    pass
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(nombre, me)
        ob.location = Vector(pivote)
        self.sueltos.append((grupo, ob))
        return ob

    def exportar(self, salida, extras):
        """Borra la escena original, arma los grupos y exporta el GLB."""
        esc = bpy.context.scene
        for o in list(esc.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        raiz = bpy.data.objects.new('modelo', None)
        esc.collection.objects.link(raiz)
        vacios = {}

        def vacio(g):
            if g not in vacios:
                e = bpy.data.objects.new(g, None)
                esc.collection.objects.link(e)
                e.parent = raiz
                vacios[g] = e
            return vacios[g]
        for (grupo, nm), bm in sorted(self.partes.items()):
            me = bpy.data.meshes.new(f'{grupo}_{nm}')
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
            bm.to_mesh(me)
            bm.free()
            me.materials.append(self.mats[nm])
            ob = bpy.data.objects.new(f'{grupo}_{nm}', me)
            esc.collection.objects.link(ob)
            ob.parent = vacio(grupo)
        for grupo, ob in self.sueltos:
            esc.collection.objects.link(ob)
            ob.parent = vacio(grupo)
        # medidas del modelo final (sin la base/podio para el alto del volumen habitable no se distingue acá)
        ps = [ob.matrix_world @ v.co for ob in esc.objects if ob.type == 'MESH' for v in ob.data.vertices]
        lo, hi = caja(ps)
        extras = dict(extras)
        extras.setdefault('medidas', {})
        extras['medidas'].update({'ancho_m': round(hi.x - lo.x, 3), 'fondo_m': round(hi.y - lo.y, 3), 'alto_m': round(hi.z - lo.z, 3)})
        for k, v in extras.items():
            raiz[k] = v
        bpy.context.view_layer.update()
        os.makedirs(os.path.dirname(os.path.abspath(salida)), exist_ok=True)
        bpy.ops.export_scene.gltf(filepath=salida, export_format='GLB', export_yup=True, export_apply=True,
                                  export_extras=True, export_cameras=False, export_lights=False,
                                  export_animations=False, export_texcoords=False, export_normals=True)
        tris = sum(len(p.vertices) - 2 for ob in esc.objects if ob.type == 'MESH' for p in ob.data.polygons)
        print(f'@@ {salida}: {os.path.getsize(salida) // 1024} KB, {tris} triángulos, medidas {extras["medidas"]}')
        return extras
