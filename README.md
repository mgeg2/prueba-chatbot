# Webhook de Sazón (Dialogflow + TheMealDB)

Webhook mínimo que conecta el bot de cocina **Sazón** con la API gratuita
[TheMealDB](https://www.themealdb.com/api.php), traduciendo los ingredientes
de español a inglés antes de consultarla.

## Archivos

- `index.js` — servidor Express con la lógica de los intents.
- `ingredientMap.js` — diccionario de traducción ES → EN de ingredientes (para buscar en TheMealDB).
- `translate.js` — traduce ingredientes e instrucciones de EN → ES usando LibreTranslate.
- `package.json` — dependencias del proyecto.

## Instalación local

```bash
npm install
npm start
```

El servidor arranca en `http://localhost:3000` con el endpoint `POST /webhook`.

## Configurar en Dialogflow ES

1. Ve a **Fulfillment** en el menú lateral y activa **Webhook**, con la URL
   pública de tu servidor + `/webhook` (por ejemplo, `https://tu-app.onrender.com/webhook`).
2. En cada intent que quieras que use el webhook (`Buscar-receta-por-ingrediente`,
   `Receta-aleatoria`, etc.), activa la opción **"Enable webhook call for this intent"**
   al final de la pantalla del intent.
3. Asegúrate de que el parámetro `ingrediente` del intent
   `Buscar-receta-por-ingrediente` esté marcado como **"is list"**, para poder
   capturar varios ingredientes en una sola frase ("champiñones y arroz").

## Dónde desplegarlo gratis

Como no tienes servidor propio, estas opciones tienen plan gratuito y son
sencillas de configurar:

- **Render** (render.com) — "Web Service" gratuito, deploy directo desde GitHub.
- **Railway** (railway.app) — igual de sencillo, tier gratuito con límite de horas.
- **Google Cloud Functions** — si prefieres serverless (requeriría adaptar
  `index.js` a formato de Cloud Function en vez de Express, es un cambio pequeño).

## Traducción de ingredientes e instrucciones (LibreTranslate)

Como TheMealDB solo devuelve el contenido en inglés, `translate.js` traduce
automáticamente al español los ingredientes y las instrucciones antes de
construir la respuesta del bot (se usa en `buildRecipeDetailResponse`, tanto
para `Ver-receta-detalle` como para `Receta-aleatoria`).

Por defecto usa la instancia pública `https://libretranslate.com/translate`.
Puedes cambiarla con variables de entorno:

```bash
LIBRETRANSLATE_URL=https://tu-instancia.com/translate
LIBRETRANSLATE_API_KEY=tu_clave   # solo si tu instancia la requiere
```

**Importante sobre la instancia pública:**
- Tiene un **límite diario de peticiones gratuitas** y, en algunos casos,
  requiere una API key gratuita que puedes pedir en libretranslate.com.
- Si el servicio falla o se agota el límite, el código **no rompe la
  respuesta**: hace fallback automático y muestra el texto en inglés en vez
  de dar error (ver `translate.js`, bloque `catch`).
- Para un uso más fiable (o si vas a tener tráfico real), lo mejor es
  **autoalojar tu propia instancia de LibreTranslate** con Docker:
  ```bash
  docker run -p 5000:5000 libretranslate/libretranslate
  ```
  y luego apuntar `LIBRETRANSLATE_URL=http://localhost:5000/translate` (o la
  URL donde despliegues ese contenedor, por ejemplo en Render).
- Hay una pequeña **caché en memoria** (`translate.js`) para no traducir dos
  veces el mismo texto mientras el proceso esté corriendo — reduce peticiones
  repetidas si varios usuarios piden la misma receta.

## Otras limitaciones a tener en cuenta

- **TheMealDB (API key gratuita `1`) solo permite filtrar por UN ingrediente**
  a la vez en `filter.php`. Si el usuario pide varios ingredientes, el webhook
  busca por el primero y luego filtra en el propio código comprobando el
  detalle de cada receta candidata — funciona, pero hace más llamadas a la API.
- El diccionario `ingredientMap.js` solo cubre los ingredientes más comunes.
  Si el usuario menciona uno que no está mapeado, el webhook lo envía tal
  cual a la API (puede no dar resultados si el término en español no
  coincide por casualidad con el inglés).
- La traducción automática (LibreTranslate) es de calidad razonable pero no
  perfecta, especialmente con términos culinarios muy específicos — normal
  para una demo, pero ten en cuenta que puede haber alguna expresión rara.

## Ejemplo de petición que envía Dialogflow

```json
{
  "queryResult": {
    "intent": { "displayName": "Buscar-receta-por-ingrediente" },
    "parameters": { "ingrediente": ["champiñones", "arroz"] }
  }
}
```
