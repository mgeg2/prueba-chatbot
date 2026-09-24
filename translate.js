// translate.js
// Traduce texto de inglés a español usando LibreTranslate (API gratuita y de código abierto).
//
// Usamos por defecto la instancia pública https://libretranslate.com/translate,
// que tiene un límite de peticiones gratuitas al día. Si vas a tener tráfico
// real, lo ideal es autoalojar tu propia instancia (ver README) o usar otra
// instancia pública de la lista: https://github.com/LibreTranslate/LibreTranslate#mirrors
//
// La URL es configurable por variable de entorno LIBRETRANSLATE_URL, por si
// cambias de instancia o montas la tuya propia (por ejemplo, en Render o Docker).

const LIBRETRANSLATE_URL =
  process.env.LIBRETRANSLATE_URL || "https://libretranslate.com/translate";
const LIBRETRANSLATE_API_KEY = process.env.LIBRETRANSLATE_API_KEY || ""; // vacío si tu instancia no requiere key

// Caché muy simple en memoria para no traducir la misma frase dos veces
// mientras el proceso esté vivo (ahorra peticiones al servicio gratuito).
const cache = new Map();

/**
 * Traduce un único texto de "en" a "es".
 * Si la llamada falla (límite de peticiones, instancia caída, etc.),
 * devuelve el texto original en inglés en vez de romper la respuesta del bot.
 */
async function translateText(text, sourceLang = "en", targetLang = "es") {
  if (!text || !text.trim()) return text;

  const cacheKey = `${sourceLang}->${targetLang}:${text}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  try {
    const body = {
      q: text,
      source: sourceLang,
      target: targetLang,
      format: "text",
    };
    if (LIBRETRANSLATE_API_KEY) body.api_key = LIBRETRANSLATE_API_KEY;

    const res = await fetch(LIBRETRANSLATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn(`LibreTranslate respondió ${res.status}, devuelvo texto original.`);
      return text;
    }

    const data = await res.json();
    const translated = data.translatedText || text;
    cache.set(cacheKey, translated);
    return translated;
  } catch (err) {
    console.warn("Fallo llamando a LibreTranslate, devuelvo texto original:", err.message);
    return text; // fallback: mejor mostrar el texto en inglés que romper la respuesta
  }
}

/**
 * Traduce varios textos en paralelo, respetando el mismo fallback por texto individual.
 */
async function translateMany(texts, sourceLang = "en", targetLang = "es") {
  return Promise.all(texts.map((t) => translateText(t, sourceLang, targetLang)));
}

module.exports = { translateText, translateMany };
