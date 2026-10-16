#!/usr/bin/env python3
"""
Prepara las fotos de referencia de DOMO para el configurador.

Las tres salen con el mismo recorte (cuadrado, con el Dormi centrado), el mismo
tamaño (400 × 400 px) y la misma compresión, para que se vean como una sola
familia (pedido de DOMO del 16/10). No se retocan colores ni contenido: solo
se recortan y se achican. El marco lo pone la página (estilos.css, .foto-ref).

Uso: python3 scripts/fotos.py <carpeta "referencias" de DOMO>
     (la carpeta tiene las subcarpetas Aureo, Patagonico y Cubic)
Necesita Pillow.
"""
import os
import sys

from PIL import Image

LADO = 400  # px de la imagen final (cuadrada)

# archivo de salida -> (foto de DOMO, recorte cuadrado (izquierda, arriba, derecha, abajo) en px de la foto)
FOTOS = {
    'dormi_aureo.jpg': ('Aureo/Captura de pantalla 2026-10-08 192055.png', (92, 0, 664, 572)),
    'dormi_patagonico.jpg': ('Patagonico/Captura de pantalla 2026-10-15 171600.png', (82, 10, 622, 550)),
    'cubic.jpg': ('Cubic/Captura de pantalla 2026-07-17 153857.png', (0, 104, 355, 459)),
}


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
        if der > foto.width or aba > foto.height:
            sys.exit(f'{salida}: el recorte se sale de la foto ({foto.width} × {foto.height})')
        final = foto.crop(caja).resize((LADO, LADO), Image.LANCZOS)
        ruta = os.path.join(destino, salida)
        final.save(ruta, 'JPEG', quality=84, optimize=True, progressive=True)
        print(f'imagenes/{salida}: {LADO} × {LADO} px, {os.path.getsize(ruta) // 1024} KB (de {archivo})')


if __name__ == '__main__':
    main()
