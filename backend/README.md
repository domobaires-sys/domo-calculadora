# Backend del configurador DOMO

Servidor del configurador de domos: guarda el **catálogo de opciones** (líneas, tamaños, materiales, terminaciones, puertas, ventanas, pórticos, sistema solar, biodigestor, opcionales, textos y botones), **calcula el presupuesto** de cada configuración y recibe los **pedidos de presupuesto** de los clientes.

Todo se modifica desde un **panel web** (`/admin`), sin tocar código.

## Cómo levantarlo

Requiere Node.js 20 o superior. No usa dependencias externas ni base de datos.

```bash
cd backend
ADMIN_TOKEN=una-clave-larga npm start
```

- Configurador para clientes: http://localhost:3000/
- Panel de opciones: http://localhost:3000/admin (pide la clave `ADMIN_TOKEN`)

| Variable | Para qué sirve | Por defecto |
|---|---|---|
| `ADMIN_TOKEN` | Clave del panel de administración | Se genera una temporal y se muestra en consola |
| `PORT` | Puerto del servidor | `3000` |
| `DATA_DIR` | Carpeta donde se guardan catálogo, historial y pedidos | `backend/data` |
| `CORS_ORIGIN` | Dominio de la web que consume la API (ej. `https://domobaires.com`) | `*` |
| `NOTIFICAR_WEBHOOK_URL` | URL que recibe un aviso (POST JSON) por cada pedido nuevo. Sirve con Zapier, Make, Slack, etc. | sin aviso |

Para respaldar todo, alcanza con copiar la carpeta `data/`.

## Qué se puede modificar desde el panel

- **Pasos**: agregar, quitar, reordenar, ocultar, cambiar título, descripción, si es obligatorio y el tipo de selección:
  - `unica`: el cliente elige una opción (línea, tamaño, terminación, pórtico…).
  - `multiple`: elige varias (opcionales).
  - `cantidades`: botones + / − por opción (puertas, ventanas por formato), con mínimo y máximo total y máximos distintos por línea.
- **Opciones**: nombre, descripción, precio, color, imagen, visible u oculta, duplicar, reordenar.
- **Precios**, por opción:
  - `fijo` (por unidad), `por_m2_piso`, `por_m2_cubierta` (se calculan con el diámetro elegido),
  - `multiplicador` (ej. línea Confort = 1.15 → +15%), `porcentaje` (ej. montaje = 12% del total),
  - `consultar` (se muestra "a consultar" y no suma al total),
  - y precio distinto según la línea.
- **Reglas** que habilitan o deshabilitan botones, con el motivo visible para el cliente: solo en ciertas líneas o tamaños, diámetro mínimo o máximo, "requiere", "requiere alguna de" y "no combina con".
- **Textos y botones**: títulos, etiquetas, textos de botones y avisos.
- **Ajustes**: moneda, IVA, si los precios ya incluyen IVA, validez del presupuesto, porción de esfera (para altura y m² de cubierta).
- **Pedidos**: lista de pedidos recibidos, estado (nuevo, contactado, presupuestado, ganado, perdido), notas internas y descarga a Excel (CSV).
- **Historial**: cada publicación guarda la versión anterior (últimas 50) y se puede restaurar con un clic.
- **Importar / exportar** el catálogo completo en JSON.

Antes de publicar, el servidor valida el catálogo completo y explica en castellano cualquier error (precio vacío, una regla que apunta a una opción borrada, un tamaño sin diámetro…), así un error de carga nunca rompe el configurador. Si dos personas editan a la vez, la segunda recibe un aviso en vez de pisar los cambios de la primera.

Los precios del catálogo inicial (`catalogo-inicial.json`) son **de ejemplo** y hay que reemplazarlos por los reales.

## API

Pública (la usa el configurador web):

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/catalogo` | Pasos y opciones visibles, textos, ajustes y selección inicial |
| POST | `/api/cotizar` | `{ "seleccion": {...} }` → desglose, medidas, IVA, total, errores y disponibilidad de cada botón |
| POST | `/api/presupuestos` | `{ "cliente": { nombre, email, telefono, localidad, comentarios }, "seleccion": {...} }` → guarda el pedido y devuelve su número |
| GET | `/api/salud` | Estado del servidor |

Formato de `seleccion` (las claves son los ids de los pasos; lo que no se envía toma el valor predeterminado):

```json
{
  "linea": "confort",
  "tamano": "d7",
  "terminacion_exterior": "madera_cedro",
  "puertas": { "puerta_simple": 1, "puerta_doble_vidriada": 1 },
  "ventanas": { "ventana_triangular_fija": 3, "claraboya": 1 },
  "portico": "portico_arco",
  "electricidad": "solar_3kw",
  "biodigestor": "biodigestor_600",
  "opcionales": ["platea", "montaje"]
}
```

El precio siempre lo calcula el servidor; nunca se confía en valores enviados por el navegador.

Administración (encabezado `Authorization: Bearer <ADMIN_TOKEN>`):

| Método | Ruta | Descripción |
|---|---|---|
| GET / PUT | `/api/admin/catalogo` | Leer / publicar el catálogo completo |
| POST | `/api/admin/catalogo/validar` | Validar sin publicar |
| GET | `/api/admin/historial` | Versiones anteriores |
| POST | `/api/admin/historial/:archivo/restaurar` | Volver a una versión |
| GET | `/api/admin/presupuestos` | Pedidos recibidos |
| PATCH | `/api/admin/presupuestos/:numero` | `{ estado, notas }` |
| GET | `/api/admin/presupuestos.csv` | Pedidos en CSV |

## Editar el JSON a mano

También se puede editar `data/catalogo.json` con cualquier editor: el servidor lo relee solo. Para revisarlo antes:

```bash
npm run validar              # valida data/catalogo.json
npm run validar -- otro.json # valida otro archivo
```

## Pruebas

```bash
npm test
```

## Estructura

```
backend/
  server.js               arranque del servidor
  catalogo-inicial.json   catálogo de ejemplo (se copia a data/ la primera vez)
  src/cotizador.js        motor de precios y reglas
  src/validador.js        validación del catálogo
  src/almacen.js          guardado en archivos, historial y pedidos
  src/app.js              rutas de la API
  public/admin.html       panel de opciones
  public/configurador.html configurador de ejemplo para clientes
  test/                   pruebas automáticas
```
