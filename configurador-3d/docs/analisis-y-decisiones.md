# Configurador 3D de DOMO BAIRES: análisis, decisiones y pendientes

Fecha: 15/10/2026, actualizado el 17/10/2026 · Catálogo del prototipo: versión 1.0.0 · Estado: **prototipo privado**. Los tres modelos 3D salen de los archivos de Blender de DOMO; faltan las decisiones de la sección 4 y los datos comerciales (modalidades e inclusiones, precios, canal de consulta).

## 1. Qué entendí del pedido

Una sección para la web de DOMO BAIRES donde el cliente elige uno de tres modelos (Dormi Áureo, Dormi Patagónico, Cubic), lo personaliza con opciones compatibles, ve cada cambio en 3D, elige cómo se lo entregan (KIT, Media Obra o Llave en Mano) y pide un presupuesto con esa configuración exacta. El objetivo es recibir consultas mejor calificadas, sin prometer nada que DOMO BAIRES no haya validado (formas, medidas, precios, plazos, prestaciones). Por ahora es un prototipo privado: nada se publica en el dominio comercial sin autorización.

## 2. Inventario: qué hay y qué falta

### Recibido o disponible

| Material | Dónde | Qué aporta | Límite |
|---|---|---|---|
| Prompt maestro | Mensaje del 15/10 | Alcance, reglas y criterios de aceptación | No trae datos de producto |
| Configurador anterior | PR #1, carpeta `backend` | Catálogo editable desde un panel, reglas entre opciones, precios (fijo, por m², %, a consultar), pedidos, 3D de cúpula geodésica | Su catálogo usa líneas Essential/Confort/Design y Dormi con CUBIC, ZOMO, KING, ATMO; precios y medidas de ejemplo |
| Calculadora anterior | `CALCULADORA_PROFESIONAL_COMPLETA_v3_4.html` | Antecedente del 3D | No menciona los tres modelos nuevos |
| Captura del 07/10 | Archivos del proyecto | Muestra el configurador anterior (cúpula, línea Essential) | Es del borrador, no de los modelos nuevos |
| Demo publicada anterior | Artifact del 08/10 | Referencia de recorrido | Mismos datos de ejemplo |
| Archivos de Blender de DOMO (16/10) | Carpeta de DOMO "Diseño de domos\modelos_blender" (no se suben al repositorio) | **Áureo**: `DOMO_Dormi_Aureo_y_Patagonico.blend`, colecciones "Dormi Áureo · opción A" y "opción B". **Patagónico**: el mismo archivo, escena "Zome Dormi octogonal". **Cubic**: `cubica.blend`, escena "Zome N4". Geometría exacta, piezas con nombre y medidas | No traen colores de obra del Patagónico ni del Cubic, hojas de puerta ni pisos (ver "Preguntas sobre los modelos 3D") |
| Calculadora anterior de DOMO (16/10) | "Diseño de domos\configurador_domo" | Colores de paneles del Áureo (Azul Francia, Blanco, Negro) y textos de las modalidades | Describe otro Áureo (modelo B de 2,37 m) |
| Logos de DOMO (16/10) | "Diseño de domos\logos_corregidos" | Logo negro y blanco, usados en la pantalla | Faltan paleta y tipografías oficiales |
| Fotos de los Dormis (16/10) | Carpeta de DOMO "Fotos modelos\Dormis", copiadas en `referencias/` de los archivos del proyecto | **Áureo**: 2 capturas de un modelo en Blender (domo geodésico de paneles triangulares, puerta en caja saliente, platea hexagonal). **Patagónico**: 2 exteriores y 4 interiores (planta octogonal vidriada, un lado de madera, techo zome negro). **Cubic**: 4 fotos (volumen facetado, perfilería negra, vidrio arriba, madera adentro) | Sin medidas. Las de Patagónico parecen imágenes generadas, no fotos de obra. Falta confirmar el origen de las de Cubic y si se pueden usar en la web |

### Falta (bloquea un producto fiel o comercial)

1. **Geometría**: resuelta el 16/10 con los archivos de Blender. Quedan las dudas de cada modelo de la sección 4 (frente, vidrios, colores, puertas).
2. **Superficie y altura que se informan al cliente**: el 3D mide todo, pero falta que DOMO diga cuál superficie y cuál alto publicar (por ejemplo, el Patagónico tiene 15,56 m² por fuera y 14,32 m² por dentro).
3. **Variantes**: hoy solo el Áureo tiene opciones (trama A o B y color de paneles); el Patagónico y el Cubic son de diseño único. Confirmar.
4. **Opciones de aberturas y terminaciones**: no hay ninguna que salga de un archivo de DOMO, así que la pantalla no ofrece ninguna.
5. **Modalidades**: qué modelos se venden en KIT, Media Obra y Llave en Mano, y qué incluye y excluye cada una.
6. **Precios** (si se quieren mostrar): moneda, impuestos, fecha y vigencia, y qué se cotiza aparte.
7. **Identidad visual**: ya está el logo; faltan la paleta y las tipografías oficiales (el PDF de marca de diciembre de 2023).
8. **Sitio actual**: dirección y plataforma (WordPress, Wix, Tienda Nube, a medida…), para decidir cómo se integra.
9. **Canal de consulta**: a dónde tiene que llegar la solicitud (email, WhatsApp verificado, formulario o sistema existente).

### Contradicción a resolver

**Resuelta el 16/10:** DOMO confirmó que solo se usan Dormi Patagónico, Dormi Áureo y Cubic. ZOMO, KING y ATMO (cargados el 08/10 en el borrador anterior) quedan fuera. Ningún otro dato del borrador anterior se toma como validado.

## 3. Matriz de decisiones

Estados: **C** confirmado · **S** supuesto reversible · **P** pendiente de validación. Responsable de validar: DOMO BAIRES (DB) o el equipo de desarrollo (Dev).

| Área | Decisión | Alternativas | Recomendación y motivo | Fuente | Efecto en costo, tiempo, mantenimiento | Estado | Valida |
|---|---|---|---|---|---|---|---|
| Producto | Colección inicial | Los 3 del prompt / los 4 Dormi del 08/10 | Dormi Áureo, Dormi Patagónico y Cubic, con esos nombres exactos | Prompt maestro §1, DOMO 16/10 | Ninguno | C | — |
| Producto | Opciones por modelo | Inventar variantes / solo las de DOMO | Solo las que salen de archivos de DOMO: Áureo, trama A o B (archivo de Blender) y color de paneles en 4 tonos (calculadora anterior); Patagónico y Cubic, diseño único | Pedido de DOMO 16/10 ("opciones concretas") | Agregar una opción es editar el catálogo | S | DB |
| Producto | Aberturas y terminaciones | Ofrecerlas / no | No se ofrecen: ningún archivo de DOMO las define | Pedido de DOMO 16/10 | — | P | DB |
| Producto | Adicionales | Ninguno / los del borrador | Ninguno hasta que DOMO los confirme | Pedido de DOMO 16/10 | — | P | DB |
| Geometría | Qué se ve en 3D | Aproximación / archivos de DOMO | Desde el 16/10: cada modelo sale de su `.blend` pieza por pieza; lo que el archivo no trae se dibuja como en las fotos y queda listado en las preguntas | Archivos de Blender de DOMO | Cambiar la forma es cambiar el `.blend` o el script y regenerar | S | DB (sección 4) |
| Geometría | Formato de entrega web | GLB / OBJ / FBX | GLB (glTF binario) comprimido, un archivo por modelo con piezas separadas y nombres estables | Estándar abierto, lo leen three.js y la mayoría de editores | Requiere preparar cada modelo una vez | S | Dev |
| Geometría | Archivos maestros | Solo GLB / maestro + GLB | El maestro es el `.blend` de DOMO, que queda en su computadora; el repositorio guarda los scripts y los GLB | Prompt §7 | Evita rehacer modelos | C | — |
| Geometría | Posiciones de aberturas | Libres / las del archivo | Las del archivo de cada modelo, sin cambios | Archivos de Blender | — | C | — |
| Interacción | Recorrido | Una página larga / 4 etapas | 4 etapas: modelo, diseño, modalidad, revisión y consulta | Prompt §5 | — | C | — |
| Interacción | Controles | — | Tarjetas de opción única, casillas para adicionales, muestras de color, contador con límites | Prompt §6 | — | C | — |
| Interacción | Cambios que afectan otras elecciones | Aplicar en silencio / avisar | Avisar antes con la lista de cambios y botón "Aplicar"; opciones bloqueadas explican por qué | Prompt §5 y §9 | — | C | — |
| Interacción | 3D en celular | Siempre activo / activar al tocar | Siempre activo: un dedo gira, dos acercan; el panel queda debajo del 3D | Prompt §5 | Probar en celulares reales | S | Dev |
| Interacción | Vistas | Exterior, interior, planta | Frente, 3/4, lateral y desde arriba; abrir y cerrar puertas; el interior se ve acercando la cámara | Prompt §8 | — | S | DB |
| Diseño visual | Identidad | Esperar / provisoria | Logo de DOMO, tipografía Jost (geométrica, como el logo), paleta casi monocroma con acento madera y una misma línea visual en todas las piezas | Logos de DOMO, pedido del 16/10 | Se cambia en un solo archivo de estilos | S | DB |
| Integración web | Forma de insertarlo | Componente dentro del sitio / módulo independiente / iframe | Módulo independiente (archivos estáticos) que se inserta con un iframe o un enlace; se decide al ver la plataforma | Prompt §13 | Bajo mantenimiento, no depende de la plataforma | P (falta ver el sitio) | DB + Dev |
| Integración web | Motor 3D | three.js / Babylon / model-viewer | three.js r128, el mismo del configurador anterior, licencia MIT | Licencia MIT, usado en PR #1 | Sin costo; actualizar versión en una fase posterior | S | Dev |
| Datos | Esquema | Textos en el código / catálogo aparte | Catálogo JSON separado con estado y fuente de cada dato y versión | Prompt §10 | Se edita sin tocar código | C | — |
| Datos | Estado único | — | Una sola configuración alimenta controles, 3D, resumen y solicitud | Prompt §10 | — | C | — |
| Datos | Guardar y compartir | Cuenta / navegador / código | Guardar en el navegador y "código de configuración" con versión, sin datos personales | Prompt §12 | Sin base de datos | C | — |
| Datos | Panel de edición | Panel del PR #1 / editar el JSON | Fase 1: editar el JSON. Fase 2: adaptar el panel del PR #1 a este catálogo | PR #1 | Reutiliza lo hecho | S | DB |
| Rendimiento | Presupuesto de carga | — | Meta inicial: menos de 3 MB por modelo GLB, texturas de 1024 px como máximo, menos de 150 000 triángulos por escena; a medir con modelos reales | Prompt §15 | Condiciona el modelado | P (sin medir) | Dev |
| Rendimiento | Dibujo | Continuo / solo al cambiar | Solo al cambiar (ahorra batería en celular) | Prompt §15 | — | C | — |
| Presupuesto | Precios | Mostrar / ocultar | Todo figura "pendiente de cotización" (nunca cero); el sistema ya distingue incluido, sin cargo, pendiente y con valor | Prompt §11 | Cargar precios es editar el catálogo | P | DB |
| Presupuesto | Modalidades | Asumir las 3 para todos / confirmar | Las 3 visibles para cada modelo, marcadas "a confirmar", sin inclusiones inventadas | Prompt §1 y §11 | — | P | DB |
| Consulta | Canal | Formulario propio / WhatsApp / sistema existente | Recomiendo formulario que llegue al backend del PR #1 (ya guarda pedidos) con aviso por email; WhatsApp como opción adicional, sin mostrarlo como "enviado" | Prompt §12, PR #1 | Requiere alojar el backend | P | DB |
| Consulta | Datos pedidos | — | Nombre, teléfono o email, localidad (obligatorios); uso previsto y unidades (opcionales) | Prompt §12 | — | C | — |
| Publicación | Dónde | Dominio comercial / privado | Solo privado (link de revisión) hasta autorización expresa | Prompt §18 | — | C | DB |
| Métricas | Medir | Ahora / después | Después, con autorización y herramienta definida; sin datos personales | Prompt §17 | — | P | DB |

## 4. Preguntas críticas (agrupadas)

Las necesito para pasar de maqueta a producto real. Mientras tanto sigo con lo que no depende de ellas.

1. **Medidas para el cliente**: ¿qué superficie y qué alto se publican de cada modelo? (El 3D ya las mide; ver la duda 2 de la sección 2.)
2. **Imágenes**: ¿las fotos del Cubic y los renders del Patagónico son propios y se pueden mostrar? ¿Hay un render terminado del Áureo para reemplazar la captura de Blender?
3. **Variantes**: ¿el Áureo se vende con las dos tramas y los cuatro colores? ¿El Patagónico y el Cubic tienen alguna opción?
4. **Modalidades**: ¿qué modelos se venden en KIT, Media Obra y Llave en Mano, y qué incluye cada una?
5. **Precios**: ¿se muestran precios en la web o solo se piden presupuestos?
6. **Web y consulta**: ¿cuál es la dirección del sitio actual y a dónde querés que llegue cada consulta (email, WhatsApp, otro sistema)?
7. **Marca**: ¿podés pasar la paleta y las tipografías del manual de marca?

### Preguntas sobre los modelos 3D

Cada modelo 3D sigue al archivo de Blender de DOMO pieza por pieza. Donde el archivo no dice algo, el 3D lo dibuja como se ve en las fotos y la ficha no lo da por confirmado. Esto es lo que falta que DOMO decida (el detalle de cada agregado está en los scripts de `modelos/fuente/`):

**Dormi Áureo**
1. **Frente.** El archivo rotula P1 "Acceso Principal" y P2 "Acceso Secundaria", pero las dos capturas de DOMO muestran el lado de P2 (la puerta al centro, las persianas arriba y la ventana a la derecha). El 3D pone al frente el lado de las capturas, para que lo primero que se ve coincida con ellas. ¿Cuál es el frente?
2. **Calculadora anterior.** Describía el Dormi Áureo como "modelo B, piso pentagonal de 2,37 m", con 1 puerta y hasta 3 ventanas. El archivo de Blender tiene piso de 3 m de lado, 2 puertas y 1 ventana, y dos tramas (A, la de las capturas, y B). ¿Cuál vale? ¿La trama B de la calculadora es la opción B del archivo?

**Dormi Patagónico** (el 3D es fiel al archivo; los renders de DOMO muestran otra cosa en estos puntos)
3. **Cubierta.** En el archivo es de tejas escalonadas con aletas y tiene una corona de puntas de barras en la cumbrera; en los renders es lisa, de paños grandes, sin corona.
4. **Triángulos sobre los muros.** En el archivo son de chapa; en los renders, vidriados.
5. **Frente.** En el archivo hay una puerta de 0,9 × 2 m con dos huecos de 23 cm a los lados, sin vidrio (el 3D los cierra en negro); en los renders, el frente son dos paños iguales con un parante al centro y un travesaño.
6. **Diagonal derecha del frente.** En el archivo es vidriada; en dos de los renders, de madera.
7. **Muros de atrás.** El archivo trae solo el entramado; el 3D los reviste con tablas verticales de madera, como el muro de madera de los renders. ¿Qué madera, de qué ancho y en qué tono (madera común o cedro)?
8. **Puerta.** ¿Hacia qué lado abre y de qué lado va la bisagra?
9. ¿Cuál de los archivos manda: el `.blend` o los renders?

**Cubic**
10. **Caras vidriadas y cerradas.** El archivo marca 7 caras con panel (los 4 triángulos de abajo, la pared derecha, la del fondo y el rombo del techo de atrás a la derecha) y no trae vidrios. El 3D toma los paneles como caras cerradas (en el Patagónico, los paneles de la misma calculadora son la chapa del techo) y vidria las otras 5, como se ve en las fotos. ¿Es así?
11. **Colores.** En el archivo las tablas son de color madera; en las fotos, negras por fuera y de madera por dentro. El 3D usa los de las fotos.
12. **Puerta.** En el archivo, el vano es el hexágono central del frente (1,56 × 2,11 m), con lados verticales de la mitad del alto. En la foto, la puerta es más angosta: sus lados verticales son unos dos tercios del alto. ¿El hexágono del archivo es la puerta o un paño con la puerta adentro? ¿Hacia dónde abre?

## 5. Estado del prototipo (17/10) y cómo comprobarlo

Hecho:
- **Solo los tres Dormis**, cada uno en 3D desde su archivo de Blender, pieza por pieza (scripts en `modelos/fuente/`, contrato en `modelos/MODELOS.md`). Lo que el archivo no trae (hojas de puerta, pisos, revestimiento y colores de obra del Patagónico y del Cubic) se dibuja como en las fotos y la ficha no lo da por confirmado.
- **Opciones concretas**: Áureo con trama A o B (las dos del archivo) y color de paneles Natural, Azul Francia, Blanco o Negro (calculadora anterior de DOMO). Patagónico y Cubic, diseño único con su ficha "Cómo es".
- **Modalidades** Kit, Media obra y Llave en mano con los textos de la calculadora anterior; todo "Pendiente de cotización".
- **Una misma línea visual** (pedido de DOMO del 16/10): un solo juego de materiales (negro, vidrio, maderas agregadas) definido en el visor, misma luz, sombra y encuadre en el 3D y en las miniaturas, imágenes de referencia con el mismo recorte, y un solo sistema de botones, marcas, iconos y tipografía (Jost, la familia geométrica del logo).
- Visor: abrir y cerrar puertas, vistas de frente, 3/4, lateral y desde arriba, centrar, pantalla completa, tema claro y oscuro, celular con el modelo encuadrado fuera de los botones.
- Solicitud preparada para copiar (no se envía), enlace de configuración sin datos personales, botón Atrás del navegador entre etapas.

Cómo se comprobó: `npm test` (30 pruebas) y `npm run e2e` (37 pasos en Chromium, escritorio 1280 × 860 y celular 390 × 844 y 360 × 740, claro y oscuro, teclado, cambios rápidos de modelo, enlaces y recarga). Además, tres revisiones independientes compararon cada modelo con su archivo y con las fotos, el funcionamiento y el diseño; lo que encontraron está corregido o figura en las preguntas de la sección 4.

No cumple todavía: lo que depende de las respuestas de la sección 4, precios, inclusiones por modalidad, canal de envío, prueba en celulares reales.

## 6. Fases siguientes

1. Con las respuestas de DOMO sobre cada modelo: ajustar el `.blend` o el script y regenerar (`python fuente/<modelo>.py …`, después `npm run medidas`, `npm run miniaturas`, `npm run armar`).
2. Cargar modalidades, inclusiones y precios reales en `catalogo.json`.
3. Conectar la solicitud al canal elegido (recomendado: backend del PR #1) y adaptar su panel para editar este catálogo.
4. Integrar en el sitio, medir carga en celulares reales y recién ahí pedir autorización para publicar.
