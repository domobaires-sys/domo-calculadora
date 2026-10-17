#!/usr/bin/env python3
"""
Prepara las fotos de referencia de DOMO para el configurador.

Las tres salen con el mismo recorte (cuadrado, con el Dormi centrado), el mismo
tamaño (400 × 400 px) y la misma compresión, para que se vean como una sola
familia (pedido de DOMO del 16/10). No se retocan colores ni contenido: solo
se recortan y se achican. La única excepción es la captura de Blender del
Áureo: se borran los indicadores del editor que quedaron dibujados encima
(cursor 3D, eje Z punteado y punto de origen), rellenando esos pocos píxeles
con el color de alrededor; el modelo, el podio y el fondo quedan como en la
captura. El marco lo pone la página (estilos.css, .foto-ref).

Uso: python3 scripts/fotos.py <carpeta "referencias" de DOMO>
     (la carpeta tiene las subcarpetas Aureo, Patagonico y Cubic)
Necesita Pillow y numpy.
"""
import os
import sys

import numpy as np
from PIL import Image

LADO = 400  # px de la imagen final (cuadrada)

# archivo de salida -> (foto de DOMO, recorte cuadrado (izquierda, arriba, derecha, abajo) en px de la foto)
# Los recortes y las zonas de abajo están medidos sobre cada captura original.
FOTOS = {
    'dormi_aureo.jpg': ('Aureo/Captura de pantalla 2026-10-08 192055.png', (92, 0, 664, 572)),
    'dormi_patagonico.jpg': ('Patagonico/Captura de pantalla 2026-10-15 171600.png', (82, 10, 622, 550)),
    'cubic.jpg': ('Cubic/Captura de pantalla 2026-07-17 153857.png', (0, 104, 355, 459)),
}


# Cursor 3D de Blender en la captura del Áureo: caja que lo contiene (izquierda, arriba,
# derecha, abajo), gris de las tres caras lisas que tapa (fondo, cara superior del podio y
# cara del frente) y recta del borde del podio que lo cruza (y = y0 + pendiente · (x - x0)).
CURSOR_AUREO = {'caja': (595, 364, 634, 412), 'grises': (78.5, 93, 102.5), 'borde': (607, 370, 0.3)}


def vecinos(m):
    return m | np.roll(m, 1, 0) | np.roll(m, -1, 0) | np.roll(m, 1, 1) | np.roll(m, -1, 1)


def sin_indicadores_de_blender(foto):
    """Borra los indicadores del editor de Blender (no son parte del Dormi)."""
    a = np.asarray(foto).astype(float)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    luz = a.mean(-1)
    saturacion = a.max(-1) - a.min(-1)
    alto, ancho = luz.shape
    yy, xx = np.mgrid[0:alto, 0:ancho]
    # Ejes del editor (Z azul punteado, X rojo) y punto de origen naranja.
    ejes = ((b > r + 40) & (b > g + 20)) | ((r > g + 60) & (r > b + 60))
    origen = (r > 200) & (g > 100) & (g < 190) & (b < 90)
    # Cursor 3D: dentro de su caja, todo lo que no es uno de los tres grises lisos,
    # salvo la línea del borde del podio (que se conserva si no está tapada).
    izq, arr, der, aba = CURSOR_AUREO['caja']
    caja = (xx >= izq) & (xx < der) & (yy >= arr) & (yy < aba)
    x0, y0, pendiente = CURSOR_AUREO['borde']
    borde = np.abs(yy - (y0 + pendiente * (xx - x0))) <= 1.6
    distinto = np.abs(luz[..., None] - np.array(CURSOR_AUREO['grises'])).min(-1) > 3
    tapado = (luz < 55) | (luz > 130) | (saturacion > 22)
    cursor = caja & ((distinto & ~borde) | tapado)
    mascara = vecinos(ejes) | vecinos(origen) | (vecinos(cursor) & ~(caja & borde & ~tapado))
    # Relleno: primero con el promedio de los vecinos conocidos (de afuera hacia adentro),
    # después se suaviza para que no queden escalones.
    a[mascara] = np.nan
    direcciones = ((1, 0), (-1, 0), (0, 1), (0, -1))
    for c in range(3):
        canal = a[..., c]
        falta = mascara.copy()
        while falta.any():
            suma = np.zeros_like(canal)
            cuenta = np.zeros_like(canal)
            for d in direcciones:
                v = np.roll(canal, d, (0, 1))
                k = ~np.isnan(v)
                suma += np.where(k, v, 0)
                cuenta += k
            nuevos = falta & (cuenta > 0)
            canal[nuevos] = suma[nuevos] / cuenta[nuevos]
            falta &= ~nuevos
        for _ in range(300):
            prom = sum(np.roll(canal, d, (0, 1)) for d in direcciones) / 4
            canal[mascara] = prom[mascara]
    return Image.fromarray(np.clip(np.rint(a), 0, 255).astype('uint8')), int(mascara.sum())


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    origen = sys.argv[1]
    destino = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'imagenes')
    for salida, (archivo, caja) in FOTOS.items():
        izq, arr, der, aba = caja
        if der - izq != aba - arr:
            sys.exit(f'{salida}: el recorte no es cuadrado')
        foto = Image.open(os.path.join(origen, archivo)).convert('RGB')
        if salida == 'dormi_aureo.jpg':
            foto, borrados = sin_indicadores_de_blender(foto)
            print(f'imagenes/{salida}: {borrados} px de indicadores del editor de Blender borrados')
        if der > foto.width or aba > foto.height:
            sys.exit(f'{salida}: el recorte se sale de la foto ({foto.width} × {foto.height})')
        final = foto.crop(caja).resize((LADO, LADO), Image.LANCZOS)
        ruta = os.path.join(destino, salida)
        final.save(ruta, 'JPEG', quality=84, optimize=True, progressive=True)
        print(f'imagenes/{salida}: {LADO} × {LADO} px, {os.path.getsize(ruta) // 1024} KB (de {archivo})')


if __name__ == '__main__':
    main()
