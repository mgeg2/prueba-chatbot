// --- Construcción de la respuesta para Dialogflow Messenger y Simulador -----------

/**
 * Construye el richContent de tipo "list" con las recetas encontradas,
 * e incluye siempre fulfillmentText para que el simulador de Dialogflow responda.
 */
function buildRecipeListResponse(meals, ingredientesBuscados) {
  if (!meals || meals.length === 0) {
    const textMsg = `No he encontrado ninguna receta con ${ingredientesBuscados.join(", ")}. ¿Pruebas con otro ingrediente?`;
    return {
      fulfillmentText: textMsg,
      fulfillmentMessages: [
        { text: { text: [textMsg] } }
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

  const mainText = `He encontrado ${meals.length} receta(s) con ${ingredientesBuscados.join(", ")}:\n` +
    meals.slice(0, MAX_RESULTS).map(m => `• ${m.strMeal}`).join("\n");

  return {
    // ESTO HACE QUE EL SIMULADOR DE DIALOGFLOW CONTESTE:
    fulfillmentText: mainText,
    fulfillmentMessages: [
      { text: { text: [`He encontrado ${meals.length} receta(s) con ${ingredientesBuscados.join(", ")}:`] } },
      { payload: { richContent: [items] } },
    ],
  };
}

/**
 * Construye la respuesta detallada de una receta.
 */
async function buildRecipeDetailResponse(meal) {
  const ingredientsEn = getMealIngredients(meal);

  const stepsEn = meal.strInstructions
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Intentar traducir; si tarda mucho o falla, translateMany usará el fallback
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
