// index.js
// Webhook de fulfillment para el bot "Sazón" (Dialogflow ES).

const express = require("express");
const { translateIngredient } = require("./ingredientMap");
const { translateText, translateMany } = require("./translate");

const app = express();
app.use(express.json());

const MEALDB_BASE = "https://www.themealdb.com/api/json/v1/1";
const MAX_RESULTS = 5;

// --- Utilidades -------------------------------------------------------

async function fetchByIngredient(ingredientEn) {
  const url = `${MEALDB_BASE}/filter.php?i=${encodeURIComponent(ingredientEn)}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.meals || [];
}

async function fetchMealDetail(idMeal) {
  const url = `${MEALDB_BASE}/lookup.php?i=${encodeURIComponent(idMeal)}`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.meals && data.meals[0]) || null;
}

function getMealIngredients(meal) {
  const list = [];
  for (let i = 1; i <= 20; i++) {
    const ing = meal[`strIngredient${i}`];
    if (ing && ing.trim() !== "") list.push(ing.trim().toLowerCase());
  }
  return list;
}

// --- Construcción de Respuestas ---------------------------------------

function buildRecipeListResponse(meals, ingredientesBuscados) {
  if (!meals || meals.length === 0) {
    const textMsg = `No he encontrado ninguna receta con ${ingredientesBuscados.join(", ")}. ¿Pruebas con otro ingrediente?`;
    return {
      fulfillmentText: textMsg,
      fulfillmentMessages: [{ text: { text: [textMsg] } }],
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

  const summaryText =
    `He encontrado ${meals.length} receta(s) con ${ingredientesBuscados.join(", ")}:\n` +
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
 * Construye la respuesta detallada de una receta y guarda el contexto para el seguimiento
 */
async function buildRecipeDetailResponse(meal, session) {
  const ingredientsEn = getMealIngredients(meal);

  const stepsEn = meal.strInstructions
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);

  const [tituloEs, ingredientesEs, stepsEs] = await Promise.all([
    translateText(meal.strMeal),
    translateMany(ingredientsEn),
    translateMany(stepsEn.length ? stepsEn : [meal.strInstructions]),
  ]);

  const ingredientLines = ingredientesEs.map((ing) => `• ${ing}`);
  const preparacionLines = stepsEs.map((step, i) =>
    stepsEs.length > 1 ? `${i + 1}. ${step}` : step
  );

  const pregunta = "¿Quieres hacer esta receta? Responde 'sí' y te preparo la lista de la compra con el supermercado más cercano.";
  const textSummary = `📖 ${tituloEs}\n\nIngredientes:\n${ingredientLines.join("\n")}\n\nPreparación:\n${preparacionLines.join("\n")}\n\n${pregunta}`;

  const payload = {
    richContent: [
      [
        {
          type: "info",
          title: tituloEs,
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
        {
          type: "chips",
          options: [
            { text: "🛒 Sí, hacer lista de la compra" },
            { text: "🎲 Buscar otra receta" },
          ],
        },
      ],
    ],
  };

  // Guardamos los datos traducidos en el contexto de salida
  const outputContexts = [
    {
      name: `${session}/contexts/receta-seleccionada`,
      lifespanCount: 2,
      parameters: {
        idMeal: meal.idMeal,
        strMeal: meal.strMeal,
        tituloEs: tituloEs,
        ingredientesEs: ingredientesEs,
        mealThumb: meal.strMealThumb,
      },
    },
  ];

  return {
    fulfillmentText: textSummary,
    fulfillmentMessages: [{ text: { text: [textSummary] } }, { payload }],
    outputContexts,
  };
}

// --- Handlers por Intent ----------------------------------------------

async function handleBuscarPorIngrediente(parameters) {
  const raw = parameters.ingrediente;
  const ingredientesEs = Array.isArray(raw) ? raw : [raw];

  if (!ingredientesEs.length || !ingredientesEs[0]) {
    const promptText = "¿Qué ingrediente quieres usar? Dime uno y busco recetas.";
    return {
      fulfillmentText: promptText,
      fulfillmentMessages: [{ text: { text: [promptText] } }],
    };
  }

  const ingredientesEn = ingredientesEs.map(translateIngredient);
  const primeraBusqueda = await fetchByIngredient(ingredientesEn[0]);
  let resultados = primeraBusqueda;

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

async function handleVerReceta(parameters, session) {
  const idMeal = parameters.idMeal;
  if (!idMeal) {
    const errText = "No he podido identificar la receta.";
    return { fulfillmentText: errText, fulfillmentMessages: [{ text: { text: [errText] } }] };
  }
  const meal = await fetchMealDetail(idMeal);
  if (!meal) {
    const errText = "No he encontrado el detalle de esa receta.";
    return { fulfillmentText: errText, fulfillmentMessages: [{ text: { text: [errText] } }] };
  }
  return await buildRecipeDetailResponse(meal, session);
}

async function handleRecetaAleatoria(session) {
  const res = await fetch(`${MEALDB_BASE}/random.php`);
  const data = await res.json();
  const meal = data.meals && data.meals[0];
  if (!meal) {
    const errText = "No he podido encontrar una receta aleatoria ahora mismo.";
    return { fulfillmentText: errText, fulfillmentMessages: [{ text: { text: [errText] } }] };
  }
  return await buildRecipeDetailResponse(meal, session);
}

async function handleListaDeLaCompra(parameters) {
  const nombreReceta = parameters.receta;
  const ciudad = typeof parameters.ubicacion === "object"
    ? (parameters.ubicacion.city || parameters.ubicacion["business-name"] || "mi ubicación")
    : (parameters.ubicacion || "tu zona");

  if (!nombreReceta) {
    const promptText = "¿De qué receta quieres que te haga la lista de la compra?";
    return { fulfillmentText: promptText, fulfillmentMessages: [{ text: { text: [promptText] } }] };
  }

  const nombreEn = await translateText(nombreReceta, "en", "es");
  const url = `${MEALDB_BASE}/search.php?s=${encodeURIComponent(nombreEn)}`;
  const res = await fetch(url);
  const data = await res.json();
  const meal = data.meals && data.meals[0];

  if (!meal) {
    const errorText = `No he encontrado la receta de "${nombreReceta}" para generar la lista.`;
    return { fulfillmentText: errorText, fulfillmentMessages: [{ text: { text: [errorText] } }] };
  }

  const ingredientsEn = getMealIngredients(meal);
  const ingredientesEs = await translateMany(ingredientsEn);
  const tituloEs = await translateText(meal.strMeal, "es", "en");

  const listaText = ingredientesEs.map((ing) => `🛒 ${ing}`).join("\n");
  const mapsQuery = encodeURIComponent(`supermercados cerca de ${ciudad}`);
  const mapsUrl = `https://www.google.com/maps/search/${mapsQuery}`;

  const summaryText = `📝 *Lista de la compra para ${tituloEs}:*\n\n${listaText}\n\n📍 *Supermercados cercanos (${ciudad}):*\nPuedes encontrar los ingredientes en tiendas cercanas.\n\nVer mapa: ${mapsUrl}`;

  const payload = {
    richContent: [
      [
        {
          type: "info",
          title: `Lista de la compra: ${tituloEs}`,
          subtitle: `${ingredientesEs.length} ingredientes necesarios`,
          image: { src: { rawUrl: meal.strMealThumb } },
        },
        {
          type: "description",
          title: "Ingredientes para comprar",
          text: ingredientesEs.map((ing) => `🛒 ${ing}`),
        },
        {
          type: "chips",
          options: [
            {
              text: `📍 Ver supermercados cerca de ${ciudad}`,
              link: mapsUrl,
            },
          ],
        },
      ],
    ],
  };

  return {
    fulfillmentText: summaryText,
    fulfillmentMessages: [{ text: { text: [summaryText] } }, { payload }],
  };
}

async function handleConfirmarHacerReceta(req) {
  const queryResult = req.body.queryResult;
  const contexts = queryResult?.outputContexts || [];

  // Leemos la receta del contexto de entrada
  const recetaContext = contexts.find((c) =>
    c.name.endsWith("/contexts/receta-seleccionada")
  );

  const params = recetaContext?.parameters || {};
  const tituloEs = params.tituloEs || "la receta";
  const ingredientesEs = params.ingredientesEs || [];
  const mealThumb = params.mealThumb || "";

  const ubicacionParam = queryResult?.parameters?.ubicacion;
  const ciudad = typeof ubicacionParam === "object"
    ? (ubicacionParam.city || ubicacionParam["business-name"] || "mi ubicación")
    : (ubicacionParam || "tu zona");

  const listaText = ingredientesEs.length
    ? ingredientesEs.map((ing) => `🛒 ${ing}`).join("\n")
    : "No se pudieron cargar los ingredientes.";

  const mapsQuery = encodeURIComponent(`supermercados cerca de ${ciudad}`);
  const mapsUrl = `https://www.google.com/maps/search/${mapsQuery}`;

  const summaryText = `📝 *Lista de la compra para ${tituloEs}:*\n\n${listaText}\n\n📍 *Supermercados cercanos (${ciudad}):*\nPuedes encontrar estos ingredientes en supermercados de tu zona.\n\nVer mapa: ${mapsUrl}`;

  const payload = {
    richContent: [
      [
        {
          type: "info",
          title: `Lista de la compra: ${tituloEs}`,
          subtitle: `${ingredientesEs.length} ingredientes necesarios`,
          image: mealThumb ? { src: { rawUrl: mealThumb } } : undefined,
        },
        {
          type: "description",
          title: "Ingredientes para comprar",
          text: ingredientesEs.map((ing) => `🛒 ${ing}`),
        },
        {
          type: "chips",
          options: [
            {
              text: `📍 Ver supermercados cerca de ${ciudad}`,
              link: mapsUrl,
            },
          ],
        },
      ],
    ],
  };

  return {
    fulfillmentText: summaryText,
    fulfillmentMessages: [{ text: { text: [summaryText] } }, { payload }],
  };
}

// --- Endpoint principal -----------------------------------------------

app.post("/webhook", async (req, res) => {
  try {
    const intentName = req.body.queryResult?.intent?.displayName || "";
    const parameters = req.body.queryResult?.parameters || {};
    const session = req.body.session || "";

    let response;

    switch (intentName) {
      case "Buscar-receta-por-ingrediente":
        response = await handleBuscarPorIngrediente(parameters);
        break;
      case "Ver-receta-detalle":
        response = await handleVerReceta(parameters, session);
        break;
      case "Ver-receta-detalle - yes":
        response = await handleConfirmarHacerReceta(req);
        break;
      case "Receta-aleatoria":
        response = await handleRecetaAleatoria(session);
        break;
      case "Lista-de-la-compra":
        response = await handleListaDeLaCompra(parameters);
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
    const failText = "Ups, algo ha fallado procesando la solicitud. ¿Lo intentamos de nuevo?";
    res.json({
      fulfillmentText: failText,
      fulfillmentMessages: [{ text: { text: [failText] } }],
    });
  }
});

app.get("/", (req, res) => res.send("Webhook de Sazón funcionando 🍳"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Webhook escuchando en el puerto ${PORT}`));
