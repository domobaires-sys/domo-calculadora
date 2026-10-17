# Configurador 3D de DOMO BAIRES (prototipo privado)

Pantalla para que el cliente elija uno de los tres Dormis de DOMO (**Dormi Áureo**, **Dormi Patagónico** y **Cubic**), lo vea en 3D, elija cómo recibirlo y prepare una solicitud de presupuesto para copiar y mandar.

Cada modelo 3D sale del archivo de Blender de DOMO (ver [`modelos/MODELOS.md`](modelos/MODELOS.md)). Nada de lo que se muestra se inventa: cada dato del catálogo dice de qué archivo de DOMO sale, las medidas se leen de los modelos 3D y los precios que faltan se muestran "Pendiente de cotización", nunca 0.

## El recorrido

1. **Modelo**: tres tarjetas con miniatura 3D, una línea de descripción y las medidas. Elegir una cambia el 3D.
2. **Diseño**: el Dormi Áureo tiene dos opciones (la trama, A con los rombos cruzados en X o B con los rombos partidos en dos, las dos del archivo de DOMO; y el color de los paneles: Natural, Azul Francia, Blanco o Negro). El Patagónico y el Cubic son de diseño único: se muestra qué incluyen. Acá está también la foto de referencia de DOMO.
3. **Entrega**: Kit, Media obra o Llave en mano, con su descripción. Precio: pendiente de cotización.
4. **Solicitud**: resumen completo, datos de contacto y botón "Preparar solicitud", que arma el texto para copiar. **No se envía nada desde la página.** El enlace de la configuración guarda solo el modelo y las opciones, nunca datos personales.

El visor 3D se gira con el mouse o con un dedo (dos dedos para acercarse), tiene vistas de Frente, 3/4, Lateral y Desde arriba, abre y cierra las puertas y pasa a pantalla completa. Si un modelo 3D todavía no está, muestra "Modelo 3D en preparación" con la foto de referencia; si el navegador no puede mostrar 3D, también.

## Una misma línea visual

Pedido de DOMO del 16/10: "la estética de las piezas visuales debe mantener una misma línea". Por eso:

- **Materiales**: los tres modelos usan un único negro (perfilería y chapa), un único vidrio y una misma madera (pisos, revestimientos y cielorrasos). Están definidos una sola vez en `visor.js` (`MATERIALES`), por nombre de rol, y salen de los archivos de DOMO: la madera es la del piso del Áureo, el negro y el vidrio son los del archivo del Patagónico. Los colores que fija el archivo del Áureo (maderas de la estructura, paneles, incrustaciones, puertas) quedan como están.
- **Presentación**: mismo visor, misma luz, sombra, fondo, altura y ángulo de cámara, y el modelo centrado y encuadrado igual. Las miniaturas se generan con ese mismo visor.
- **Fotos de referencia**: las tres con el mismo recorte cuadrado (400 × 400 px) y el mismo marco.
- **Interfaz**: una sola escala de tipografía (Jost para el texto, IBM Plex Mono para cifras y rótulos), un solo radio, bordes de 1 px sin sombras, un solo estilo de iconos (trazo de 1,5 px) y los mismos estados (elegido, foco, pasar el mouse) en todas las etapas, en escritorio y en celular, con modo claro y oscuro.

## Archivos

| Archivo | Qué es |
|---|---|
| `catalogo.json` | Datos: los tres modelos, sus opciones, la composición, las modalidades y los precios. Cada dato dice su fuente. |
| `reglas.js` | Reglas del configurador (estado, cambios, medidas, resumen, validación, texto de la solicitud y código de configuración). Funciones puras, sirven en el navegador y en un servidor. |
| `visor.js` | Visor 3D (three.js r128, licencia MIT): carga los GLB, aplica el lenguaje de materiales, encuadra, abre puertas y cambia el color de los paneles. |
| `app.js` | Interfaz: las cuatro etapas, el resumen siempre visible y la solicitud. |
| `estilos.css` | Diseño. Todos los colores son variables, con modo oscuro propio. |
| `index.html` | Página para servir la carpeta tal cual. Trae los iconos y las marcas que usa el armado. |
| `modelos/` | Modelos 3D (GLB) y los scripts que los arman desde los archivos de Blender de DOMO. |
| `imagenes/` | Logo de DOMO (negro y blanco), fotos de referencia y miniaturas de los modelos. |
| `scripts/armar-prototipo.js` | Une todo en un solo HTML (`dist/prototipo.html`) para publicarlo como página privada. |
| `scripts/medidas.js` | Copia al catálogo las medidas, puertas y colores de cada GLB. |
| `scripts/miniaturas.js` | Genera las miniaturas con el mismo visor 3D. |
| `scripts/fotos.py` | Recorta las fotos de referencia de DOMO, todas iguales. |
| `scripts/probar-e2e.js` | Prueba de punta a punta en un navegador (escritorio y celular) con capturas. |
| `test/` | Pruebas automáticas (`npm test`). |

## Cómo verlo

- **Página privada**: `npm run armar` genera `dist/prototipo.html`, con todo incrustado (estilos, catálogo, imágenes, modelos 3D y código). Es lo que se publica. No lleva `<!doctype>`, `<html>`, `<head>` ni `<body>`: el visor de páginas los agrega.
- **Local**: servir esta carpeta con cualquier servidor estático (por ejemplo `npx serve .`) y abrir `index.html`. Abierto con doble clic no carga el catálogo; para eso está `dist/prototipo.html`.
- Las librerías de three.js y las tipografías se cargan de internet (cdnjs, jsDelivr y Google Fonts, con versiones fijas). Sin conexión se ve la tipografía de respaldo.

## Pruebas

- `npm test` (Node 18 o superior, sin dependencias): los tres modelos y sus nombres, el GLB de cada uno, las opciones exactas del Áureo, el Patagónico y el Cubic sin opciones, ningún precio en 0 y todos pendientes, estado inicial, cambio de modelo, código de configuración (ida y vuelta, códigos viejos o rotos), formulario, texto exacto de la solicitud, medidas del catálogo iguales a las de los GLB, lenguaje de materiales común, fotos y miniaturas del mismo tamaño, colores solo como variables, contrato del HTML armado y que ningún archivo use palabras prohibidas.
- `npm run e2e`: arma el prototipo y lo recorre en Chromium (1280 × 860 y 390 × 844): las cuatro etapas, puertas, trama, color, solicitud, copiar, modo oscuro, modelo faltante, enlace compartido o viejo y navegador sin 3D. Verifica cero errores en la consola y que no haya desplazamiento horizontal, y guarda capturas `ui_*.png`. Necesita Playwright y Chromium (no son dependencias del proyecto; ver las variables al principio del script).

## Cómo actualizar

### Medidas (cuando cambia un modelo 3D)

1. Regenerar el GLB (ver `modelos/MODELOS.md`).
2. `npm run medidas`: lee el nodo `modelo` de cada GLB y escribe en `catalogo.json` las medidas (ancho, fondo, alto y las demás que traiga), las puertas y los colores. Si un GLB falta, ese archivo queda "en preparación" y no se inventa ninguna medida.
3. `npm test` comprueba que el catálogo coincide con los GLB.

En pantalla las medidas se escriben con coma decimal ("4,75 m", "15,5 m²") y con la aclaración "según el modelo 3D de DOMO".

### Miniaturas

`npm run miniaturas` (o `node scripts/miniaturas.js dormi_patagonico` para una sola) genera `imagenes/miniatura_<id>.png` (640 × 480, fondo transparente) con el mismo visor y la misma vista 3/4 de la página. Si un GLB todavía no existe, lo saltea y avisa. Después, `npm run armar`.

### Fotos de referencia

`python3 scripts/fotos.py "<carpeta referencias de DOMO>"` recorta las tres fotos al mismo cuadrado de 400 × 400 px. Los recortes elegidos están escritos en el script. En la captura de Blender del Áureo borra además los indicadores del editor (cursor 3D, eje Z y punto de origen); el resto de la imagen queda como la mandó DOMO.

### Precios

Hoy están todos pendientes. En `catalogo.json`, cada modelo tiene `precios` con una entrada por modalidad (`kit`, `media_obra`, `llave_en_mano`). Para cargar uno, reemplazar `{ "estado": "pendiente" }` por:

```json
{ "estado": "valor", "importe": 1000000, "moneda": "ARS", "iva": "incluido", "vigencia": "2026-12-31", "fuente": "Lista de precios de DOMO de la fecha" }
```

`iva` puede ser `"incluido"` o `"no_incluido"`. Un precio sin importe, en 0 o sin moneda se sigue mostrando "Pendiente de cotización". Después correr `npm test` y `npm run armar`, y subir `version_catalogo`.

### Composición de cada modelo

La ficha de cada modelo está en `modelos[].composicion`. Cada fila tiene un `valor` fijo o una `plantilla` con datos del modelo 3D (por ejemplo `"{paños_vidriados}"`), su `fuente` y su `estado`: lo que todavía no está confirmado va con `"estado": "pendiente"` y se muestra "A confirmar". Una fila puede llevar una `nota` interna (no se muestra) que explica de dónde sale o qué falta confirmar.

En la ficha figura, como confirmado, solo lo que trae el archivo de Blender de DOMO o se calcula de su geometría. Las cifras salen de los GLB por plantilla: las escriben los scripts de `modelos/fuente/` leyendo el archivo (por ejemplo, en el Áureo la superficie de la ventana y los rombos con persianas; en el Cubic, el lado del piso).

Lo que el 3D dibuja a partir de las fotos de DOMO, porque el archivo no lo trae, no figura como confirmado (el detalle está en cada script de `modelos/fuente/`):

- **Patagónico**: la hoja de la puerta, el revestimiento de tablas de madera de los 3 muros de atrás, el piso, el cielorraso de madera y los dos huecos de 23 cm a los lados de la puerta, que se cierran en negro como muro.
- **Cubic**: los vidrios (el archivo no trae ninguno: el 3D vidria las 5 caras sin panel, como se ve en las fotos; esa fila queda "A confirmar"), los colores (negro por fuera, madera por dentro; en el archivo las tablas son de color madera), la hoja de la puerta y el piso.

Las dudas para DOMO están en [`docs/analisis-y-decisiones.md`](docs/analisis-y-decisiones.md), sección "Preguntas sobre los modelos 3D".

## Privacidad

- No hay cuentas, pagos, base de datos ni analítica. La página no envía nada a ningún servicio: la solicitud se prepara para copiar.
- En el navegador solo se guarda (si se puede) el código de la configuración y la etapa, nunca datos personales. El enlace compartido tampoco lleva datos personales.
- Todo GLB que se sirve en una web puede descargarse: estos modelos son versiones visuales, sin planos ni listas de corte.

El análisis y las decisiones del proyecto están en [`docs/analisis-y-decisiones.md`](docs/analisis-y-decisiones.md).
