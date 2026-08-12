/** Fix common STT mishears for weather questions before intent routing / search. */
export function normalizeWeatherStt(text: string): string {
  let t = String(text || "").trim();
  if (!t) return t;

  t = t.replace(/\bwhat(?:'s|s| is)\s+(?:the\s+)?whether\b/gi, "what's the weather");
  t = t.replace(/\bhow(?:'s|s| is)\s+(?:the\s+)?whether\b/gi, "how's the weather");
  t = t.replace(/\b(?:the\s+)?whether\s+(?:in|at|for)\b/gi, (m) => m.replace(/whether/gi, "weather"));

  t = t.replace(/\bwhat(?:'s|s| is)\s+(?:the\s+)?wetter\b/gi, "what's the weather");
  t = t.replace(/\bhow(?:'s|s| is)\s+(?:the\s+)?wetter\b/gi, "how's the weather");
  t = t.replace(/\bwetter\s+(?:in|at|for)\b/gi, "weather in");

  t = t.replace(/\bwhat(?:'s|s| is)\s+(?:the\s+)?weird\s+(?:in|at|for)\b/gi, "what's the weather in");
  t = t.replace(/\bhow(?:'s|s| is)\s+(?:the\s+)?weird\s+(?:in|at|for)\b/gi, "how's the weather in");

  // STT often hears "what's the weather" as "I'm here at weather" / "what here at weather".
  t = t.replace(
    /\b(?:i'?m|im|what)\s+here\s+at\s+(?:the\s+)?(?:weather|whether|wetter)\s+(?:in|at|for)\b/gi,
    "what's the weather in"
  );
  t = t.replace(
    /\b(?:i'?m|im|what)\s+here\s+at\s+(?:the\s+)?(?:weather|whether|wetter)\b/gi,
    "what's the weather"
  );
  t = t.replace(/\bhere\s+at\s+(?:the\s+)?(?:weather|whether|wetter)\s+(?:in|at|for)\b/gi, "weather in");
  t = t.replace(/\bhere\s+at\s+(?:the\s+)?(?:weather|whether|wetter)\b/gi, "weather");

  t = t.replace(/\balamalfi coast\b/gi, "Amalfi Coast");
  t = t.replace(/\balamalfi\b/gi, "Amalfi");

  return t.replace(/\s+/g, " ").trim();
}

export function isWeatherSttMishear(text: string): boolean {
  const q = String(text || "").trim().toLowerCase();
  if (!q) return false;
  return (
    /\bwhether\b/.test(q) ||
    /\bwetter\b/.test(q) ||
    /\bweird\s+(?:in|at|for)\s+[a-z]/.test(q) ||
    /\b(?:i'?m|im|what)\s+here\s+at\s+(?:the\s+)?(?:weather|whether|wetter)\b/.test(q) ||
    /\bhere\s+at\s+(?:the\s+)?(?:weather|whether|wetter)\b/.test(q)
  );
}
