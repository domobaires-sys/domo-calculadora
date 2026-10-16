# Configurador 3D de DOMO BAIRES: análisis, decisiones y pendientes

Fecha: 15/10/2026, actualizado el 16/10/2026 · Catálogo del prototipo: versión 0.2.0 · Estado: **prototipo parcial** (el 3D es una aproximación hecha con fotos; faltan medidas, archivos 3D y datos comerciales).

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
| Fotos de los Dormis (16/10) | Carpeta de DOMO "Fotos modelos\Dormis", copiadas en `referencias/` de los archivos del proyecto | **Áureo**: 2 capturas de un modelo en Blender (domo geodésico de paneles triangulares, puerta en caja saliente, platea hexagonal). **Patagónico**: 2 exteriores y 4 interiores (planta octogonal vidriada, un lado de madera, techo zome negro). **Cubic**: 4 fotos (volumen facetado, perfilería negra, vidrio arriba, madera adentro) | Sin medidas. Las de Patagónico parecen imágenes generadas, no fotos de obra. Falta confirmar el origen de las de Cubic y si se pueden usar en la web |

### Falta (bloquea un producto fiel o comercial)

1. **Geometría de cada modelo**: ya hay fotos de los tres (16/10). Faltan las **medidas** (diámetro o lados, altura, superficie) y, si existen, los archivos 3D. Del Áureo hay un modelo en Blender: el archivo `.blend` permitiría usar la forma real.
2. **Superficie, altura y uso previsto** verificados de cada modelo, y en qué se diferencian.
3. **Variantes reales** de cada modelo (cuántas, nombres, si son conjuntos cerrados o combinables).
4. **Opciones reales** de ventanas, pórticos, puertas y terminaciones, y dónde puede ir cada abertura.
5. **Modalidades**: qué modelos se venden en KIT, Media Obra y Llave en Mano, y qué incluye y excluye cada una.
6. **Precios** (si se quieren mostrar): moneda, impuestos, fecha y vigencia, y qué se cotiza aparte.
7. **Identidad visual**: logo, colores y tipografías aprobados.
8. **Sitio actual**: dirección y plataforma (WordPress, Wix, Tienda Nube, a medida…), para decidir cómo se integra.
9. **Canal de consulta**: a dónde tiene que llegar la solicitud (email, WhatsApp verificado, formulario o sistema existente).

### Contradicción a resolver

**Resuelta el 16/10:** DOMO confirmó que solo se usan Dormi Patagónico, Dormi Áureo y Cubic. ZOMO, KING y ATMO (cargados el 08/10 en el borrador anterior) quedan fuera. Ningún otro dato del borrador anterior se toma como validado.

## 3. Matriz de decisiones

Estados: **C** confirmado · **S** supuesto reversible · **P** pendiente de validación. Responsable de validar: DOMO BAIRES (DB) o el equipo de desarrollo (Dev).

| Área | Decisión | Alternativas | Recomendación y motivo | Fuente | Efecto en costo, tiempo, mantenimiento | Estado | Valida |
|---|---|---|---|---|---|---|---|
| Producto | Colección inicial | Los 3 del prompt / los 4 Dormi del 08/10 | Dormi Áureo, Dormi Patagónico y Cubic, con esos nombres exactos | Prompt maestro §1, DOMO 16/10 | Ninguno | C | — |
| Producto | Variantes por modelo | Libres / 2 por modelo | 2 por modelo: una combinable y una cerrada, para probar ambos comportamientos | Prompt §4 | Cambiar es editar el catálogo | S | DB |
| Producto | Alternativas por categoría | Muchas / hasta 2 | Hasta 2 (ventana, puerta, pórtico, terminación), nombres tomados del borrador | Prompt §4, PR #1 | Agregar más es editar el catálogo | P | DB |
| Producto | Adicionales | Ninguno / los del borrador | Sistema autónomo de electricidad y biodigestor, como casillas sin efecto visual | Tema del proyecto, PR #1 | Bajo | P | DB |
| Geometría | Qué se ve en 3D sin archivos | Maqueta neutra / aproximación desde fotos | Desde el 16/10: aproximación de cada modelo dibujada con las fotos (geodésico, zome y facetado), rotulada "aproximación · sin medidas"; medidas supuestas | Prompt §7, fotos de DOMO | Se reemplaza por el GLB real sin tocar la interfaz | S | DB (forma) |
| Geometría | Formato de entrega web | GLB / OBJ / FBX | GLB (glTF binario) comprimido, un archivo por modelo con piezas separadas y nombres estables | Estándar abierto, lo leen three.js y la mayoría de editores | Requiere preparar cada modelo una vez | S | Dev |
| Geometría | Archivos maestros | Solo GLB / maestro + GLB | Conservar el archivo de edición original (el que use DB) y exportar desde él | Prompt §7 | Evita rehacer modelos | P (falta saber qué programa usa DB) | DB |
| Geometría | Posiciones de aberturas | Libres / fijas por modelo | Fijas y declaradas por modelo. Áureo: ventanas vidriando un paño triangular. Patagónico: ventanas en los lados de madera (los demás ya son vidriados). Cubic: ventanas en los laterales | Prompt §9, fotos | Cada modelo real necesita su lista de posiciones | S | DB |
| Interacción | Recorrido | Una página larga / 4 etapas | 4 etapas: modelo, diseño, modalidad, revisión y consulta | Prompt §5 | — | C | — |
| Interacción | Controles | — | Tarjetas de opción única, casillas para adicionales, muestras de color, contador con límites | Prompt §6 | — | C | — |
| Interacción | Cambios que afectan otras elecciones | Aplicar en silencio / avisar | Avisar antes con la lista de cambios y botón "Aplicar"; opciones bloqueadas explican por qué | Prompt §5 y §9 | — | C | — |
| Interacción | 3D en celular | Siempre activo / activar al tocar | Activar con un botón para que el 3D no capture el desplazamiento | Prompt §5 | — | S | Dev |
| Interacción | Vistas | Exterior, interior, planta | Exterior y planta (vista superior del 3D, sin cotas); interior deshabilitado hasta tener contenido aprobado | Prompt §8 | Interior suma trabajo de modelado | S | DB |
| Diseño visual | Identidad | Esperar / provisoria | Sistema provisorio sobrio (verde bosque, madera, tipografía Archivo) marcado como tal | Prompt §14 | Se cambia en un solo archivo de estilos | S | DB |
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

1. **Medidas**: diámetro o largo de los lados, altura y superficie de Dormi Áureo, Dormi Patagónico y Cubic.
2. **Archivos 3D**: el `.blend` del Áureo (y de los otros, si existen). ¿Las fotos del Cubic y las imágenes del Patagónico son propias y se pueden mostrar en la web?
3. **Variantes y aberturas**: para cada modelo, ¿qué variantes existen y en qué lugares puede ir cada ventana, puerta y pórtico?
4. **Modalidades**: ¿qué modelos se venden en KIT, Media Obra y Llave en Mano, y qué incluye cada una?
5. **Precios**: ¿se muestran precios en la web o solo se piden presupuestos?
6. **Web y consulta**: ¿cuál es la dirección del sitio actual y a dónde querés que llegue cada consulta (email, WhatsApp, otro sistema)?
7. **Marca**: ¿tenés logo, colores y tipografías definidos?

## 5. Primera fase (hecha en este PR) y cómo comprobarla

Hecho:
- Recorrido completo en 4 etapas, en computadora y celular, sin cuenta.
- Catálogo separado (`catalogo.json`) con estado y fuente de cada dato, versión y precios pendientes.
- Motor de reglas (`reglas.js`): compatibilidad por modelo y variante, variantes cerradas, "requiere" y "no combina con", límites de cantidad, aviso antes de cambiar otras elecciones, revalidación antes de la solicitud, recuperación de configuraciones viejas.
- Visor 3D (desde el 16/10, con una aproximación de cada modelo hecha con las fotos): puerta, ventanas (fija o con apertura, con bisagra en el borde), pórtico y terminación cambian en el acto; la cámara gira hacia la abertura modificada (salvo si el dispositivo pide menos movimiento); día y noche; vista superior; centrar; pantalla completa; salida clara si el 3D no carga.
- Resumen exacto, imagen de la maqueta, formulario con campos obligatorios explicados y solicitud preparada (no enviada: falta el canal).
- 13 pruebas automáticas de las reglas.

Criterios para comprobarla (todos verificados, ver informe de pruebas en el README):
- Los tres nombres aparecen tal cual y cada uno tiene 2 variantes.
- Cada control habilitado cambia la maqueta o el resumen; los adicionales lo dicen explícitamente.
- Elegir "Puerta doble vidriada" sin pórtico avisa que pasa a "Pórtico recto" antes de aplicarlo (regla de ejemplo).
- La variante cerrada bloquea lo que trae y explica por qué.
- Pasar de un modelo a otro conserva lo compatible y avisa lo que se recorta.
- Ningún precio aparece como cero.
- La solicitud reproduce exactamente el resumen.

No cumple todavía (prototipo parcial): modelos fieles, variantes y opciones reales, modalidades e inclusiones, precios, identidad visual y canal de envío.

## 6. Fases siguientes

1. Con los archivos de DB: preparar un GLB por modelo y reemplazar la maqueta (la interfaz no cambia).
2. Cargar variantes, opciones, posiciones y modalidades reales; volver a correr las pruebas.
3. Conectar la solicitud al canal elegido (recomendado: backend del PR #1) y adaptar su panel para editar este catálogo.
4. Integrar en el sitio, medir carga en celulares reales y recién ahí pedir autorización para publicar.
