// translate.js
// Módulo de traducción robusto con fallback para evitar error 429 (Too Many Requests)

/**
 * Traduce un texto usando la interfaz móvil de Google Translate (resistente a rate limits)
 */
async function translateText(text, targetLang = "es", sourceLang = "en") {
  if (!text || typeof text !== "string" || text.trim() === "") return text;

  try {
    // Usamos el endpoint client=gtx con parámetros de consulta formateados
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    
    const res = await fetch(url, {
      headers: {
        // Rotación básica de cliente para evitar ser detectado como bot de scraping
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8"
      },
    });

    // Si Google responde con 429 (Rate Limit), intentamos endpoint secundario gratuito
    if (res.status === 429) {
      console.warn("Google Translate dio 429. Usando fallback ligero...");
      return await translateFallback(text, targetLang, sourceLang);
    }

    if (!res.ok) {
      console.error(`Google Translate respondió con status ${res.status}`);
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
    console.error("Error en translateText:", err.message);
    return text;
  }
}

/**
 * Endpoint de respaldo (Fallback) en caso de que el principal alcance el límite 429
 */
async function translateFallback(text, targetLang = "es", sourceLang = "en") {
  try {
    const url = `https://translate.google.com/m?sl=${sourceLang}&tl=${targetLang}&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
      }
    });
    
    if (!res.ok) return text;

    const html = await res.text();
    // Extraer el texto traducido del HTML que devuelve la versión móvil
    const match = html.match(/class="result-container">(.*?)<\/div>/s);
    if (match && match[1]) {
      // Decodificar entidades HTML básicas
      return match[1]
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
    }
    return text;
  } catch (e) {
    return text;
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
