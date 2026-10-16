# Modelos 3D del configurador

Cada Dormi se arma **desde el archivo de Blender de DOMO BAIRES** con un script de `fuente/` y se guarda como GLB (glTF binario) para la web. Los archivos `.blend` no se suben al repositorio: quedan en la computadora de DOMO, en `C:\Users\jonas\Diseño de domos\modelos_blender\`.

| Modelo | GLB | Archivo de DOMO | Escena / colección | Script |
|---|---|---|---|---|
| Dormi Áureo, trama A | `dormi_aureo_a.glb` | `DOMO_Dormi_Aureo_y_Patagonico.blend` | "DOMO Baires · Dormi Áureo y Patagónico" / "Dormi Áureo · opción A" | `fuente/aureo.py … A` |
| Dormi Áureo, trama B | `dormi_aureo_b.glb` | ídem | ídem / "Dormi Áureo · opción B" | `fuente/aureo.py … B` |
| Dormi Patagónico | `dormi_patagonico.glb` | `DOMO_Dormi_Aureo_y_Patagonico.blend` | "Zome Dormi octogonal" | `fuente/patagonico.py` |
| Cubic | `cubic.glb` | `cubica.blend` | "Zome N4" | `fuente/cubic.py` |

## Cómo regenerarlos

1. Blender 5.1 o superior (o `pip install bpy`, que es Blender como módulo de Python).
2. Los `.blend` de DOMO vienen comprimidos (zstd). Blender los abre directo; `bpy` también.
3. Correr, desde esta carpeta:
   ```
   python fuente/aureo.py "<ruta>/DOMO_Dormi_Aureo_y_Patagonico.blend" A dormi_aureo_a.glb
   python fuente/aureo.py "<ruta>/DOMO_Dormi_Aureo_y_Patagonico.blend" B dormi_aureo_b.glb
   python fuente/patagonico.py "<ruta>/DOMO_Dormi_Aureo_y_Patagonico.blend" dormi_patagonico.glb
   python fuente/cubic.py "<ruta>/cubica.blend" cubic.glb
   ```
   Con Blender instalado: `blender -b --python fuente/aureo.py -- <archivo> A dormi_aureo_a.glb`.

## Convención (contrato con el visor)

- **Unidades**: metros. **Arriba**: Y en el GLB (Z en Blender).
- **Origen**: centro de la planta, a nivel del terreno (lo más bajo del modelo queda en 0).
- **Frente**: la puerta principal mira hacia **+Z** del GLB (−Y en Blender). Las vistas "frente" y "3/4" del visor dependen de esto.
- **Nodo raíz** `modelo`, con datos (`extras`): `id`, `fuente`, `escena`, `coleccion`, `puertas`, `medidas` (`ancho_m`, `fondo_m`, `alto_m` y las que el archivo de DOMO trae, como `piso_lado_m`, `piso_area_m2`).
- **Grupos** (hijos de `modelo`): `estructura`, `cerramiento`, `vidrios`, `puertas`, `ventanas`, `cubierta`, `base`, `detalles`. Cada grupo une sus mallas por material.
- **Hojas de puerta**: objetos `puerta_hoja_1`, `puerta_hoja_2`… con el origen sobre el eje de la bisagra (vertical). El visor las abre girándolas sobre Y.
- **Materiales con nombre de rol**: `madera_icosaedro`, `madera_dodecaedro`, `panel`, `incrustacion`, `acero`, `persiana`, `puerta`, `puerta_detalle`, `podio`, `piso`, `vidrio`, `marco_negro`, `chapa_negra`, `revestimiento_madera`. El visor cambia `panel` e `incrustacion` según el color elegido del Áureo y trata `vidrio` como vidrio.
- **Peso**: menos de 600 KB por modelo, sin texturas.

Importante: todo GLB que se sirve en una web puede descargarse. Estos son versiones visuales: no llevan planos ni listas de corte.
