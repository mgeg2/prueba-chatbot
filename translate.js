// translate.js
// Utilidad de traducción ultra-rápida (ES <-> EN) usando el endpoint público de Google Translate.

/**
 * Traduce un texto de inglés a español (u otro idioma origen/destino)
 */
async function translateText(text, targetLang = "es", sourceLang = "en") {
  if (!text || typeof text !== "string" || text.trim() === "") return text;

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    const data = await res.json();

    // Extraer fragmentos traducidos y unirlos
    if (data && data[0]) {
      return data[0]
        .filter((item) => item && item[0])
        .map((item) => item[0])
        .join("");
    }
    return text;
  } catch (err) {
    console.error("Error en translateText:", err);
    return text; // Fallback al texto original en caso de error
  }
}

/**
 * Traduce un array de textos en paralelo
 */
async function translateMany(arr, targetLang = "es", sourceLang = "en") {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  return Promise.all(arr.map((text) => translateText(text, targetLang, sourceLang)));
}

module.exports = {
  translateText,
  translateMany,
};
