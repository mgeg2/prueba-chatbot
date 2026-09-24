// translate.js
// Traducción ligera usando MyMemory Translation API (Gratuita, sin API Key, resistente a bloqueos)

/**
 * Traduce un texto usando la API de MyMemory
 */
async function translateText(text, targetLang = "es", sourceLang = "en") {
  if (!text || typeof text !== "string" || text.trim() === "") return text;

  try {
    // Reemplazamos saltos de línea por un delimitador temporal para no romper la URL
    const textClean = text.replace(/\r?\n/g, " [BREAK] ");
    const langPair = `${sourceLang}|${targetLang}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(textClean)}&langpair=${encodeURIComponent(langPair)}`;

    const res = await fetch(url);
    if (!res.ok) {
      console.error(`MyMemory respondió con status ${res.status}`);
      return text;
    }

    const data = await res.json();

    if (data && data.responseData && data.responseData.translatedText) {
      let translated = data.responseData.translatedText;
      // Restauramos los saltos de línea
      translated = translated.replace(/\[BREAK\]/g, "\n").replace(/\[BREAK\]/g, "\n");
      return translated;
    }

    return text;
  } catch (err) {
    console.error("Error en translateText (MyMemory):", err.message);
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
