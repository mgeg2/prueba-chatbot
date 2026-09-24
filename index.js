// index.js
// Webhook de fulfillment para el bot "Sazón" (Dialogflow ES).
// Traduce ingredientes ES -> EN y consulta TheMealDB (API gratuita).

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

// --- Construcción de la respuesta para Dialogflow Messenger y Simulador -----------

/**
 * Construye la respuesta con las recetas encontradas.
 * Incluye fulfillmentText plano para que responda la consola/simulador de Dialogflow,
 * e incluye richContent para la interfaz gráfica de Dialogflow Messenger.
 */
function buildRecipeListResponse(meals, ingredientesBuscados) {
  if (!meals || meals.length === 0) {
    const textMsg = `No he encontrado ninguna receta con ${ingredientesBuscados.join(", ")}. ¿Pruebas con otro ingrediente?`;
    return {
      fulfillmentText: textMsg,
      fulfillmentMessages: [
        { text: { text: [textMsg] } },
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

  const summaryText = `He encontrado ${meals.length} receta(s) con ${ingredientesBuscados.join(", ")}:\n` +
    meals.slice(0, MAX_RESULTS).map((m) => `• ${m.strMeal}`).join("\n");

  return {
    fulfillmentText: summaryText,
    fulfillmentMessages: [
      { text: { text: [`He encontrado ${meals.length} receta(s) con ${ingredientesBuscados.join(", ")}:`] } },
      { payload: { richContent: [items] } },
    ],
  };
}

/**
 * Construye la respuesta detallada (ingredientes + instrucciones) de una receta.
 */
async function buildRecipeDetailResponse(meal) {
  const ingredientsEn = getMealIngredients(meal);

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

  const textSummary = `📖 ${meal.strMeal}\n\nIngredientes:\n${ingredientLines.join("\n")}\n\nPreparación:\n${preparacionLines.join("\n")}`;

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
    fulfillmentText: textSummary,
    fulfillmentMessages: [
      { text: { text: [textSummary] } },
      { payload },
    ],
  };
}

// --- Handlers por intent ------------------------------------------------

async function handleBuscarPorIngrediente(parameters) {
  const raw = parameters.ingrediente;
  const ingredientesEs = Array.isArray(raw) ? raw : [raw];

  if (!ingredientesEs.length || !ingredientesEs[0]) {
    const promptText = "¿Qué ingrediente quieres usar? Dime uno y busco recetas.";
    return {
      fulfillmentText: promptText,
      fulfillmentMessages: [
        { text: { text: [promptText] } },
      ],
    };
  }

  const ingredientesEn = ingredientesEs.map(translateIngredient);

  // 1. Buscamos recetas por el primer ingrediente
  const primeraBusqueda = await fetchByIngredient(ingredientesEn[0]);

  let resultados = primeraBusqueda;

  // 2. Si el usuario pidió más de un ingrediente, filtramos localmente.
  // Limitamos a MÁXIMO 3 consultas en paralelo para evitar timeout (>5s) en Dialogflow.
  if (ingredientesEn.length > 1 && primeraBusqueda.length > 0) {
    const detalles = await Promise.all(
      primeraBusqueda.slice(0, 3).map((m) => fetchMealDetail(m.idMeal))
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
    const errText = "No he podido identificar la receta.";
    return { 
      fulfillmentText: errText, 
      fulfillmentMessages: [{ text: { text: [errText] } }] 
    };
  }
  const meal = await fetchMealDetail(idMeal);
  if (!meal) {
    const errText = "No he encontrado el detalle de esa receta.";
    return { 
      fulfillmentText: errText, 
      fulfillmentMessages: [{ text: { text: [errText] } }] 
    };
  }
  return await buildRecipeDetailResponse(meal);
}

async function handleRecetaAleatoria() {
  const res = await fetch(`${MEALDB_BASE}/random.php`);
  const data = await res.json();
  const meal = data.meals && data.meals[0];
  if (!meal) {
    const errText = "No he podido encontrar una receta aleatoria ahora mismo.";
    return { 
      fulfillmentText: errText, 
      fulfillmentMessages: [{ text: { text: [errText] } }] 
    };
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
      case "Ver-receta-detalle": // dispara el evento VER_RECETA definido en la lista
        response = await handleVerReceta(parameters);
        break;
      case "Receta-aleatoria":
        response = await handleRecetaAleatoria();
        break;
      default:
        response = {
          fulfillmentText: "No tengo lógica configurada para este intent todavía.",
          fulfillmentMessages: [
            { text: { text: ["No tengo lógica configurada para este intent todavía."] } },
          ],
        };
    }

    res.json(response);
  } catch (err) {
    console.error("Error en el webhook:", err);
    const failText = "Ups, algo ha fallado buscando la receta. ¿Lo intentamos de nuevo?";
    res.json({
      fulfillmentText: failText,
      fulfillmentMessages: [
        { text: { text: [failText] } },
      ],
    });
  }
});

// Endpoint de salud para comprobar la conexión activa desde el navegador
app.get("/", (req, res) => res.send("Webhook de Sazón funcionando 🍳"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Webhook escuchando en el puerto ${PORT}`));
