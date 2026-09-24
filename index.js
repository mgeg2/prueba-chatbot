// index.js
// Webhook de fulfillment para el bot "Sazón" (Dialogflow ES).
// Traduce ingredientes ES -> EN y consulta TheMealDB (API gratuita).
//
// Cómo probarlo en local:
//   npm install
//   node index.js
//   (por defecto escucha en el puerto 3000, en la ruta POST /webhook)
//
// En Dialogflow ES: Fulfillment > Webhook > URL = https://tu-dominio/webhook
// y en el intent "Buscar-receta-por-ingrediente" activa "Enable webhook call for this intent".

const express = require("express");
const { translateIngredient } = require("./ingredientMap");
const { translateText, translateMany } = require("./translate");

const app = express();
app.use(express.json());

const MEALDB_BASE = "https://www.themealdb.com/api/json/v1/1";
const MAX_RESULTS = 5; // cuántas recetas mostrar como máximo en la respuesta

// --- Utilidades -------------------------------------------------------

/**
 * Llama al endpoint filter.php de TheMealDB para un ingrediente en inglés.
 * Devuelve un array de { idMeal, strMeal, strMealThumb } (puede venir null si no hay resultados).
 */
async function fetchByIngredient(ingredientEn) {
  const url = `${MEALDB_BASE}/filter.php?i=${encodeURIComponent(ingredientEn)}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.meals || [];
}

/**
 * Obtiene el detalle completo de una receta (ingredientes, instrucciones, etc.)
 */
async function fetchMealDetail(idMeal) {
  const url = `${MEALDB_BASE}/lookup.php?i=${encodeURIComponent(idMeal)}`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.meals && data.meals[0]) || null;
}

/**
 * Extrae la lista de ingredientes (strIngredient1..20) de un objeto "meal" de TheMealDB,
 * en minúsculas, para poder comprobar si contiene otros ingredientes pedidos.
 */
function getMealIngredients(meal) {
  const list = [];
  for (let i = 1; i <= 20; i++) {
    const ing = meal[`strIngredient${i}`];
    if (ing && ing.trim() !== "") list.push(ing.trim().toLowerCase());
  }
  return list;
}

// --- Construcción de la respuesta para Dialogflow Messenger -----------

/**
 * Construye el richContent de tipo "list" con las recetas encontradas.
 * (El widget estándar de Dialogflow Messenger sí soporta el tipo "list" con imagen).
 */
function buildRecipeListResponse(meals, ingredientesBuscados) {
  if (!meals || meals.length === 0) {
    return {
      fulfillmentMessages: [
        {
          text: {
            text: [
              `No he encontrado ninguna receta con ${ingredientesBuscados.join(", ")}. ¿Prueba con otro ingrediente?`,
            ],
          },
        },
      ],
    };
  }

  const items = meals.slice(0, MAX_RESULTS).map((meal) => ({
    type: "list",
    title: meal.strMeal,
    image: {
      src: { rawUrl: meal.strMealThumb },
    },
    event: {
      name: "VER_RECETA",
      languageCode: "es",
      parameters: { idMeal: meal.idMeal, nombre: meal.strMeal },
    },
  }));

  return {
    fulfillmentMessages: [
      {
        text: {
          text: [`He encontrado ${meals.length} receta(s) con ${ingredientesBuscados.join(", ")}:`],
        },
      },
      { payload: { richContent: [items] } },
    ],
  };
}

/**
 * Construye la respuesta detallada (ingredientes + instrucciones) de una receta,
 * usando type "description" para poder mandar el texto como array de líneas.
 *
 * Traduce con LibreTranslate tanto los ingredientes como las instrucciones,
 * que en TheMealDB vienen siempre en inglés. Si la traducción falla, se
 * muestra el texto original en inglés (ver fallback en translate.js).
 */
async function buildRecipeDetailResponse(meal) {
  const ingredientsEn = getMealIngredients(meal);

  // Las instrucciones de TheMealDB suelen venir como pasos separados por
  // saltos de línea; traducimos línea a línea para no mandar un bloque
  // gigante de una vez y para conservar mejor la estructura de pasos.
  const stepsEn = meal.strInstructions
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const [ingredientesEs, stepsEs] = await Promise.all([
    translateMany(ingredientsEn),
    translateMany(stepsEn.length ? stepsEn : [meal.strInstructions]),
  ]);

  const ingredientLines = ingredientesEs.map((ing) => `• ${ing}`);
  const preparacionLines = stepsEs.map((step, i) =>
    stepsEs.length > 1 ? `${i + 1}. ${step}` : step
  );

  const payload = {
    richContent: [
      [
        {
          type: "info",
          title: meal.strMeal,
          image: { src: { rawUrl: meal.strMealThumb } },
        },
        {
          type: "description",
          title: "Ingredientes",
          text: ingredientLines,
        },
        {
          type: "description",
          title: "Preparación",
          text: preparacionLines,
        },
      ],
    ],
  };

  return {
    fulfillmentMessages: [{ payload }],
  };
}

// --- Handlers por intent ------------------------------------------------

async function handleBuscarPorIngrediente(parameters) {
  // "ingrediente" se espera como parámetro de tipo lista (array) en Dialogflow.
  const raw = parameters.ingrediente;
  const ingredientesEs = Array.isArray(raw) ? raw : [raw];

  if (!ingredientesEs.length || !ingredientesEs[0]) {
    return {
      fulfillmentMessages: [
        { text: { text: ["¿Qué ingrediente quieres usar? Dime uno y busco recetas."] } },
      ],
    };
  }

  const ingredientesEn = ingredientesEs.map(translateIngredient);

  // TheMealDB (tier gratuito) solo filtra por UN ingrediente a la vez en filter.php.
  // Buscamos por el primero y, si el usuario dio más, filtramos localmente
  // comprobando el detalle de cada receta candidata.
  const primeraBusqueda = await fetchByIngredient(ingredientesEn[0]);

  let resultados = primeraBusqueda;

  if (ingredientesEn.length > 1 && primeraBusqueda.length > 0) {
    const detalles = await Promise.all(
      primeraBusqueda.slice(0, 15).map((m) => fetchMealDetail(m.idMeal))
    );

    resultados = detalles.filter((meal) => {
      if (!meal) return false;
      const mealIngs = getMealIngredients(meal).join(" ");
      return ingredientesEn.every((ing) =>
        mealIngs.includes(ing.replace(/_/g, " ").toLowerCase())
      );
    });
  }

  return buildRecipeListResponse(resultados, ingredientesEs);
}

async function handleVerReceta(parameters) {
  const idMeal = parameters.idMeal;
  if (!idMeal) {
    return { fulfillmentMessages: [{ text: { text: ["No he podido identificar la receta."] } }] };
  }
  const meal = await fetchMealDetail(idMeal);
  if (!meal) {
    return { fulfillmentMessages: [{ text: { text: ["No he encontrado el detalle de esa receta."] } }] };
  }
  return await buildRecipeDetailResponse(meal);
}

async function handleRecetaAleatoria() {
  const res = await fetch(`${MEALDB_BASE}/random.php`);
  const data = await res.json();
  const meal = data.meals && data.meals[0];
  if (!meal) {
    return { fulfillmentMessages: [{ text: { text: ["No he podido encontrar una receta aleatoria ahora mismo."] } }] };
  }
  return await buildRecipeDetailResponse(meal);
}

// --- Endpoint principal ---------------------------------------------------

app.post("/webhook", async (req, res) => {
  try {
    const intentName = req.body.queryResult?.intent?.displayName || "";
    const parameters = req.body.queryResult?.parameters || {};

    let response;

    switch (intentName) {
      case "Buscar-receta-por-ingrediente":
        response = await handleBuscarPorIngrediente(parameters);
        break;
      case "Ver-receta-detalle": // dispara el evento VER_RECETA definido arriba
        response = await handleVerReceta(parameters);
        break;
      case "Receta-aleatoria":
        response = await handleRecetaAleatoria();
        break;
      default:
        response = {
          fulfillmentMessages: [{ text: { text: ["No tengo lógica configurada para este intent todavía."] } }],
        };
    }

    res.json(response);
  } catch (err) {
    console.error("Error en el webhook:", err);
    res.json({
      fulfillmentMessages: [
        { text: { text: ["Ups, algo ha fallado buscando la receta. ¿Lo intentamos de nuevo?"] } },
      ],
    });
  }
});

// Endpoint de salud, útil para comprobar que el servidor está vivo
app.get("/", (req, res) => res.send("Webhook de Sazón funcionando 🍳"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Webhook escuchando en el puerto ${PORT}`));
