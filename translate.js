// translate.js
// Utilidad de traducción ultra-rápida (ES <-> EN) adaptada para servidores Node.js en Railway.

/**
 * Traduce un texto de inglés a español (u otro idioma origen/destino)
 */
async function translateText(text, targetLang = "es", sourceLang = "en") {
  if (!text || typeof text !== "string" || text.trim() === "") return text;

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    
    // Se añade User-Agent para evitar que Google bloquee peticiones de servidores
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) {
      console.error(`Google Translate API respondió con status ${res.status}`);
      return text;
    }

    const data = await res.json();

    if (data && data[0]) {
      return data[0]
        .filter((item) => item && item[0])
        .map((item) => item[0])
        .join("");
    }
    return text;
  } catch (err) {
    console.error("Error en translateText:", err);
    return text; // Fallback al texto original si hay algún fallo
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
