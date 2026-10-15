# Configurador 3D de DOMO BAIRES (prototipo privado)

Sección para que el cliente elija un modelo (Dormi Áureo, Dormi Patagónico o Cubic), lo personalice, vea los cambios en 3D, elija la modalidad de entrega y pida un presupuesto.

**Estado: prototipo parcial.** El 3D es una maqueta interna rotulada; no representa la forma de ningún modelo. Opciones, modalidades y precios están marcados como pendientes de validación. El análisis, la matriz de decisiones y las preguntas abiertas están en [`docs/analisis-y-decisiones.md`](docs/analisis-y-decisiones.md).

## Archivos

| Archivo | Qué es |
|---|---|
| `catalogo.json` | Datos: modelos, variantes, posiciones, opciones, reglas, modalidades, precios, estado y fuente de cada dato, versión |
| `reglas.js` | Reglas de compatibilidad, resumen y validación (funciones puras; sirven en el navegador y en un servidor) |
| `visor.js` | Visor 3D (three.js r128, licencia MIT) |
| `app.js` | Interfaz: etapas, controles, resumen y formulario |
| `estilos.css` | Diseño visual (provisorio hasta tener la identidad aprobada) |
| `index.html` | Página para servir los archivos tal cual |
| `scripts/armar-prototipo.js` | Une todo en un solo HTML (`dist/prototipo.html`) para revisión |
| `test/reglas.test.js` | Pruebas automáticas de las reglas |

## Cómo verlo

- Sin instalar nada: abrir el link del prototipo privado que se comparte en el hilo del proyecto.
- Local: servir la carpeta con cualquier servidor estático (por ejemplo `npx serve .`) y abrir `index.html`. Abrir el archivo con doble clic no carga el catálogo; para eso usar `npm run armar` y abrir `dist/prototipo.html`.
- Pruebas: `npm test` (Node 18 o superior, sin dependencias).

Una configuración compartida se abre agregando su código al final de la dirección: `index.html#c1.…`. El código guarda solo identificadores y versión del catálogo, nunca datos personales.

## Cómo modificar el catálogo

Todo se edita en `catalogo.json`; después correr `npm test`.

- **Cambiar un nombre o descripción**: editar `nombre` / `descripcion`. Los `id` no se cambian nunca (las configuraciones guardadas dependen de ellos).
- **Cargar un precio**: `"precio": { "estado": "valor", "importe": 1234 }` y completar `precios.moneda`, `impuestos` y `vigencia`. Otros estados: `"pendiente"` (por defecto, se muestra "Pendiente de cotización"), `"incluido"`, `"sin_cargo"`. Un precio faltante nunca es cero.
- **Validar un dato**: cambiar su `estado` a `"confirmado"` (desaparece la etiqueta "sin validar").
- **Limitar una opción**: `"modelos": ["cubic"]`, `"variantes": [...]`, `"modalidades": [...]`.
- **Dependencias**: `"requiere": ["id"]` (alcanza con una de la lista; se agrega sola, avisando antes) y `"excluye": ["id"]` (funciona en los dos sentidos). Con `motivo_requiere` / `motivo_excluye` se escribe la explicación que ve el cliente.
- **Variante cerrada**: en la variante, `"fija": { "categoria": "id_opcion" }` y `"cantidades_fijas": { "ventana": 2 }`.
- **Cantidades**: `cantidad.min/max` en la categoría; el máximo real también queda limitado por las posiciones del modelo y por `limites` del modelo.
- **Retirar una opción**: `"estado": "retirado"` (no la borres: las configuraciones viejas se adaptan y avisan).
- Cada cambio de contenido sube `version_catalogo`.

### Agregar un modelo

1. Copiar un bloque de `modelos` con un `id` nuevo, nombre, posiciones de puerta y ventanas, modalidades y sus variantes.
2. Si tiene archivo 3D, completar `geometria.archivo` (ver abajo).
3. Correr `npm test` y revisar en el navegador.

## Modelos 3D: cadena de trabajo propuesta

1. **Maestro**: el archivo original de DOMO BAIRES (el programa que usen), en metros, con el origen en el centro del piso y el frente mirando hacia +Z.
2. **Piezas separadas** con nombres estables: `estructura`, `envolvente`, `panos`, `marcos`, `puerta_<posicion>`, `ventana_<posicion>`, `portico`, y opcionales. Hojas que abren con el pivote en la bisagra.
3. **Exportación web**: GLB (glTF binario), simplificado sin deformar, compresión Draco o Meshopt, texturas de 1024 px como máximo.
4. **Metas iniciales** (a medir con los modelos reales en un celular de gama media y red 4G): menos de 3 MB por modelo y menos de 150 000 triángulos en escena. Nada de esto está medido todavía.
5. El visor carga solo el modelo elegido y libera el anterior al cambiar.

Importante: todo archivo 3D que se sirve en una web puede descargarse. Para el sitio usar versiones visuales sin detalles de fabricación.

## Integración con la web y la consulta

- Recomendado: alojar esta carpeta como módulo independiente e insertarlo en el sitio con un iframe o un enlace (se define al conocer la plataforma del sitio).
- La solicitud hoy se **prepara pero no se envía**. Para enviarla, conectarla a `POST /api/presupuestos` del backend del PR #1 (o al canal que elija DOMO BAIRES) y revalidarla en el servidor con `reglas.validar` antes de guardarla.
- No hay cuentas, pagos, base de datos ni analítica en esta fase.

## Informe de pruebas (15/10/2026)

**Verificado por código** (`npm test`, 13 pruebas, todas pasan): tres modelos con dos variantes; ningún precio en cero; estado inicial válido; variante cerrada; "requiere" con aviso previo y vuelta atrás; exclusiones en ambos sentidos; cambio de modelo conservando lo compatible; límites de cantidad; posiciones de las aberturas; resumen exacto; suma con precios cargados y estado pendiente; código de configuración; recuperación de configuraciones viejas o rotas.

**Comprobado en navegador** (Chromium sin interfaz, render 3D por software, escritorio 1280×860 y celular 390×844): recorrido completo de las 4 etapas; aviso al elegir puerta doble y al pasar a variante cerrada; día y noche; formulario con campos faltantes y solicitud preparada; sin desplazamiento horizontal en celular; sin errores de código en la consola (solo fallaron las tipografías externas, bloqueadas en el entorno de prueba).

**Pendiente**: celulares y tablets reales, lectores de pantalla, navegación completa con teclado, carga lenta real, pérdida del contexto gráfico en un dispositivo real, y todo lo que depende de los modelos y datos de DOMO BAIRES.
