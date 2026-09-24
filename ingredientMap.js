// ingredientMap.js
// Diccionario ES -> EN para mapear ingredientes al formato que espera TheMealDB.
// TheMealDB usa nombres en inglés y con "_" en vez de espacios en el parámetro `i`.
// Añade aquí todos los ingredientes que quieras soportar en tu bot.

const INGREDIENT_MAP = {
  // Carnes y proteínas
  "pollo": "chicken",
  "pechuga de pollo": "chicken_breast",
  "ternera": "beef",
  "carne picada": "ground_beef",
  "cerdo": "pork",
  "gambas": "shrimp",
  "langostinos": "shrimp",
  "salmón": "salmon",
  "atún": "tuna",
  "huevo": "eggs",
  "huevos": "eggs",
  "bacon": "bacon",
  "jamón": "ham",

  // Verduras y hortalizas
  "champiñones": "mushrooms",
  "champiñon": "mushrooms",
  "setas": "mushrooms",
  "tomate": "tomatoes",
  "tomates": "tomatoes",
  "cebolla": "onion",
  "cebollas": "onions",
  "ajo": "garlic",
  "pimiento": "bell_pepper",
  "pimiento rojo": "red_bell_pepper",
  "zanahoria": "carrot",
  "zanahorias": "carrots",
  "brócoli": "broccoli",
  "espinacas": "spinach",
  "calabacín": "zucchini",
  "calabaza": "pumpkin",
  "patata": "potato",
  "patatas": "potatoes",
  "aguacate": "avocado",
  "maíz": "corn",
  "guisantes": "peas",

  // Lácteos y quesos
  "queso": "cheese",
  "queso parmesano": "parmesan_cheese",
  "parmesano": "parmesan_cheese",
  "mozzarella": "mozzarella_cheese",
  "queso fresco": "cream_cheese",
  "nata": "heavy_cream",
  "leche": "milk",
  "mantequilla": "butter",
  "yogur": "yogurt",

  // Cereales, pasta y legumbres
  "arroz": "rice",
  "pasta": "pasta",
  "espagueti": "spaghetti",
  "espaguetis": "spaghetti",
  "harina": "flour",
  "pan": "bread",
  "garbanzos": "chickpeas",
  "lentejas": "lentils",
  "judías": "beans",

  // Hierbas, especias y condimentos
  "albahaca": "basil",
  "perejil": "parsley",
  "romero": "rosemary",
  "tomillo": "thyme",
  "orégano": "oregano",
  "jengibre": "ginger",
  "canela": "cinnamon",
  "pimentón": "paprika",
  "limón": "lemon",
  "lima": "lime",
  "vinagre balsámico": "balsamic_vinegar",
  "aceite de oliva": "olive_oil",
  "salsa de soja": "soy_sauce",
  "azúcar": "sugar",
  "azúcar moreno": "brown_sugar",

  // Frutos secos y otros
  "nueces": "walnuts",
  "almendras": "almonds",
  "aceitunas": "olives",
  "vino blanco": "white_wine",
};

/**
 * Normaliza un texto: minúsculas y sin tildes, para hacer el match más robusto
 * ("Champiñones", "champiñones", "CHAMPIÑONES" deben coincidir igual).
 */
function normalize(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita tildes
    .trim();
}

// Versión normalizada del diccionario, para buscar sin depender de tildes exactas
const NORMALIZED_MAP = {};
for (const [es, en] of Object.entries(INGREDIENT_MAP)) {
  NORMALIZED_MAP[normalize(es)] = en;
}

/**
 * Traduce un ingrediente en español al término que espera TheMealDB.
 * Si no se encuentra en el diccionario, devuelve el propio texto en inglés
 * "tal cual" (con espacios -> guion bajo) como último recurso.
 */
function translateIngredient(spanishIngredient) {
  const key = normalize(spanishIngredient);
  if (NORMALIZED_MAP[key]) {
    return NORMALIZED_MAP[key];
  }
  // Fallback: no lo tenemos mapeado, lo dejamos pasar tal cual (mejor que nada)
  return spanishIngredient.trim().replace(/\s+/g, "_");
}

module.exports = { translateIngredient, normalize, INGREDIENT_MAP };
