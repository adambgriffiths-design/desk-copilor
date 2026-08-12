/** Client-side weather STT fixes + location resolution — mirrors lib/weather-*.ts */
(function () {
  const WEATHER_LOCATION_PROMPT = "Which city should I check the weather for?";

  function normalizeWeatherStt(text) {
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

  function normalizeLocation(raw) {
    return String(raw || "")
      .replace(/\b(right now|today|currently|now|please)\b/gi, "")
      .replace(/[,.]\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  const WEATHER_COUNTRIES = new Set([
    "uk", "united kingdom", "usa", "us", "united states", "italy", "france", "spain", "germany",
    "canada", "australia", "england", "scotland", "wales", "northern ireland", "ireland",
    "netherlands", "belgium", "portugal", "greece", "switzerland", "austria", "poland",
    "sweden", "norway", "denmark", "finland", "japan", "india", "mexico", "brazil", "new zealand",
  ]);

  const WEATHER_UK_REGIONS = new Set([
    "shropshire", "yorkshire", "lancashire", "hampshire", "devon", "cornwall", "kent", "essex",
    "surrey", "somerset", "norfolk", "suffolk", "cheshire", "staffordshire", "worcestershire",
    "gloucestershire", "oxfordshire", "buckinghamshire", "berkshire", "wiltshire", "dorset",
    "cumbria", "northumberland", "durham", "lincolnshire", "nottinghamshire", "derbyshire",
    "leicestershire", "warwickshire", "herefordshire", "bedfordshire", "cambridgeshire",
    "hertfordshire", "northamptonshire", "rutland", "merseyside", "greater manchester",
    "west midlands", "east sussex", "west sussex", "tyne and wear", "south yorkshire",
    "west yorkshire", "north yorkshire", "east yorkshire",
  ]);

  function normalizeRegionToken(token) {
    return String(token || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function isWeatherCountry(region) {
    return WEATHER_COUNTRIES.has(normalizeRegionToken(region));
  }

  function isUkWeatherRegion(region) {
    const r = normalizeRegionToken(region);
    if (WEATHER_UK_REGIONS.has(r)) return true;
    if (/\bshire$/i.test(r) && r.length > 5) return true;
    if (/\b(middlesex|sussex|essex|wessex)$/i.test(r)) return true;
    return false;
  }

  function isKnownWeatherRegion(region) {
    return isWeatherCountry(region) || isUkWeatherRegion(region);
  }

  const UK_COUNTY_CITY_PAIRS = {
    telford: "shropshire",
    shrewsbury: "shropshire",
  };

  function knownUkCountyForCity(city) {
    const key = normalizePlaceToken(city);
    return UK_COUNTY_CITY_PAIRS[key] || null;
  }

  function enrichKnownUkWeatherLocation(location) {
    const loc = String(location || "").replace(/^the\s+/i, "").trim();
    if (!loc || hasWeatherLocationDisambiguation(loc)) return loc;
    const words = loc.split(/\s+/).filter(Boolean);
    if (words.length !== 1) return loc;
    const county = knownUkCountyForCity(loc);
    if (!county) return loc;
    const city = loc.charAt(0).toUpperCase() + loc.slice(1);
    const region = county.charAt(0).toUpperCase() + county.slice(1);
    return `${city} ${region}`;
  }

  function normalizePlaceToken(token) {
    return String(token || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function isKnownUkCountyCityPair(city, region) {
    return UK_COUNTY_CITY_PAIRS[normalizePlaceToken(city)] === normalizePlaceToken(region);
  }

  function parseCityRegionPair(location) {
    const loc = String(location || "").replace(/^the\s+/i, "").trim();
    if (!loc) return null;

    const inMatch = loc.match(/^(.+?)\s+in\s+(.+)$/i);
    if (inMatch) {
      const city = inMatch[1].trim();
      const region = inMatch[2].trim();
      if (city && region && isKnownWeatherRegion(region)) return { city, region };
    }

    const commaMatch = loc.match(/^(.+?),\s*(.+)$/);
    if (commaMatch) {
      const first = commaMatch[1].trim();
      const second = commaMatch[2].trim();
      if (first && second && isKnownWeatherRegion(second)) return { city: first, region: second };
      if (first && second && isUkWeatherRegion(first) && isKnownUkCountyCityPair(second, first)) {
        return { city: second, region: first };
      }
    }

    const words = loc.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      for (let n = Math.min(3, words.length - 1); n >= 1; n--) {
        const region = words.slice(-n).join(" ");
        const city = words.slice(0, -n).join(" ");
        if (city && isKnownWeatherRegion(region)) return { city, region };
      }
      for (let n = Math.min(3, words.length - 1); n >= 1; n--) {
        const region = words.slice(0, n).join(" ");
        const city = words.slice(n).join(" ");
        if (city && isUkWeatherRegion(region) && isKnownUkCountyCityPair(city, region)) {
          return { city, region };
        }
      }
    }

    return null;
  }

  function locationHasCountry(location) {
    const loc = String(location || "");
    for (const c of WEATHER_COUNTRIES) {
      const re = new RegExp(`\\b${c.replace(/\s+/g, "\\s+")}\\b`, "i");
      if (re.test(loc)) return true;
    }
    return false;
  }

  function hasWeatherLocationDisambiguation(location) {
    const loc = String(location || "").trim();
    if (/\bin\s+[A-Za-z]/i.test(loc)) return true;
    if (/,\s*[A-Za-z]{2,}/.test(loc)) return true;
    if (parseCityRegionPair(loc)) return true;
    if (locationHasCountry(loc)) return true;
    return false;
  }

  function isAmbiguousWeatherLocation(location) {
    const loc = String(location || "")
      .replace(/^the\s+/i, "")
      .trim();
    if (!loc || hasWeatherLocationDisambiguation(loc)) return false;
    const words = loc.split(/\s+/).filter(Boolean);
    if (words.length >= 3) return false;
    if (words.length === 2 && /^(north|south|east|west|new|san|saint|st\.?|los|las|el)\s/i.test(loc)) {
      return false;
    }
    if (/\b(coast|bay|beach|island|lake|mount|mountain|carolina|virginia|hampshire|shire)\b/i.test(loc)) {
      return false;
    }
    if (words.length === 1 && knownUkCountyForCity(loc)) return false;
    if (words.length === 1) return true;
    return (
      words.length === 2 &&
      !/\b(uk|usa|italy|france|spain|germany|canada|australia|england|scotland|wales)\b/i.test(loc)
    );
  }

  function enrichWeatherLocationForSearch(location) {
    const known = enrichKnownUkWeatherLocation(location);
    const loc = normalizeLocation(String(known || "").replace(/^the\s+/i, ""));
    const pair = parseCityRegionPair(loc);
    let searchLoc = pair ? `${pair.city} ${pair.region}` : loc.replace(/\s+in\s+/gi, " ").trim();
    if (!locationHasCountry(searchLoc) && pair && isUkWeatherRegion(pair.region)) {
      searchLoc = `${searchLoc} England`;
    }
    return searchLoc;
  }

  function buildWeatherSearchQuery(location) {
    return `current weather ${enrichWeatherLocationForSearch(location)}`;
  }

  function weatherAmbiguousPrompt(location) {
    const place = String(location || "")
      .replace(/^the\s+/i, "")
      .trim() || "that place";
    return `There are a few places called ${place} — which city or region did you mean?`;
  }

  function isWeatherLocationPrompt(text) {
    return /\bwhich city\b/i.test(String(text || "")) && /\bweather\b/i.test(String(text || ""));
  }

  function isPlausiblePlaceName(loc) {
    const t = String(loc || "").trim().toLowerCase();
    if (!t || t.length < 2 || t.length > 56) return false;
    return !/\b(weather|whether|wetter|what|how|temperature|forecast)\b/.test(t);
  }

  function extractCityInRegion(text) {
    const matches = [
      ...String(text || "").matchAll(
        /\b((?:the\s+)?[A-Za-z][a-z'-]*(?:\s+[A-Za-z][a-z'-]*){0,4})\s+in\s+([A-Za-z][a-z'-]*(?:\s+[A-Za-z][a-z'-]*){0,3})\b/gi
      ),
    ];
    if (!matches.length) return null;
    let best = "";
    for (const m of matches) {
      const left = m[1].trim().replace(/^the\s+/i, "");
      if (/\b(weather|whether|wetter|what|how|temperature|forecast)\b/i.test(left)) continue;
      const loc = normalizeLocation(`${left} in ${m[2].trim()}`);
      if (!isPlausiblePlaceName(loc)) continue;
      if (loc.length > best.length) best = loc;
    }
    return best.length >= 2 ? best : null;
  }

  function trimLocationCapture(raw, fallback) {
    let loc = normalizeLocation(raw).replace(/^the\s+/i, "");
    const nested = extractCityInRegion(loc);
    if (nested && (!/\bin\b/i.test(loc) || nested.length >= loc.length * 0.75)) {
      return nested;
    }
    if (fallback && loc.length > 40) return fallback;
    loc = loc.replace(/\b(what|how|is|the|weather|whether|wetter|mean|please)\b.*$/i, "").trim();
    const tail = extractCityInRegion(loc);
    if (tail && tail.length >= (nested?.length || 0)) return tail;
    if (loc.length >= 2 && loc.length <= 64) return loc;
    return fallback && fallback.length >= 2 ? fallback : null;
  }

  function extractClarificationLocation(text) {
    const q = String(text || "").trim();
    if (!q || q.length > 120) return null;
    const cityInRegion = extractCityInRegion(q);
    if (cityInRegion) return cityInRegion;
    if (/\b(weather|temperature|forecast|news|chart|trade|stock|bitcoin)\b/i.test(q)) return null;

    const inRegion = q.match(/^([a-z][a-z\s,'-]{0,40})\s+in\s+([a-z][a-z\s,'-]{0,32})$/i);
    if (inRegion) {
      const loc = normalizeLocation(`${inRegion[1].trim()} in ${inRegion[2].trim()}`);
      if (loc.length >= 2) return loc;
    }

    if (/^[a-z][a-z\s,'-]{1,40}$/i.test(q) && !/\b(the|what|how|is|are|and|or|please|thanks)\b/i.test(q)) {
      const loc = normalizeLocation(q);
      if (loc.length >= 2) return loc;
    }

    return null;
  }

  const WEATHER_SWAP_FOLLOWUP =
    /\b(?:what about|how about)\s+(?:the\s+)?(.+?)[?.!]*$/i;
  const WEATHER_SWAP_BLOCK =
    /\b(weather|temperature|forecast|news|chart|trade|stock|bitcoin|ndog|nwog|mss|fvg|pizza|burger|food|music|color|colour|your|my)\b/i;

  function extractWeatherSwapLocation(text) {
    const q = String(text || "").trim();
    const m = q.match(WEATHER_SWAP_FOLLOWUP);
    if (!m?.[1]) return null;
    const target = m[1].trim();
    if (!target || target.length > 48) return null;
    if (WEATHER_SWAP_BLOCK.test(target)) return null;
    const fromClarification = extractClarificationLocation(target);
    if (fromClarification) return fromClarification;
    const normalized = normalizeLocation(target.replace(/^the\s+/i, ""));
    if (normalized.length >= 2 && isPlausiblePlaceName(normalized)) return normalized;
    return null;
  }

  function isWeatherLocationSwapFollowUp(text) {
    return extractWeatherSwapLocation(text) != null;
  }

  function extractLocation(question) {
    const q = normalizeWeatherStt(question).trim();
    const cityInRegion = extractCityInRegion(q);

    const clarification = extractClarificationLocation(q);
    if (clarification && !/\b(?:weather|temperature|temp|forecast)\b/i.test(q)) {
      return clarification;
    }

    const patterns = [
      /\b(?:i'?m|im|what)?\s*here\s+at\s+(?:the\s+)?(?:weather|whether|wetter)\s+(?:in|at|for)\s+(.+?)(?:\?|$)/i,
      /\b(?:weather|temperature|temp|forecast)\s+(?:in|at|for)\s+(.+?)(?:\?|$)/i,
      /\b(?:i mean|no[, ]+|actually)\s+(?:in|at|for)\s+([A-Za-z][a-z'-]+(?:\s+in\s+[A-Za-z][a-z'-]+)?)/i,
      /\bweather\s+([A-Za-z][a-z'-]+(?:\s+in\s+[A-Za-z][a-z'-]+)?)/i,
      /\b(?:in|at|for)\s+([A-Za-z][a-z'-]+)(?:\s+what|\s+how|\?|$)/i,
      /\b(temperature|weather)\s*:\s*(.+)$/i,
    ];
    let best = null;
    for (const p of patterns) {
      const m = q.match(p);
      if (m?.[1]) {
        const loc = trimLocationCapture(m[1], cityInRegion);
        if (loc && isPlausiblePlaceName(loc)) {
          if (!best || loc.length > best.length) best = loc;
        }
      }
    }
    if (best) {
      if (cityInRegion && isPlausiblePlaceName(cityInRegion) && cityInRegion.length > best.length) {
        return cityInRegion;
      }
      return best;
    }
    if (cityInRegion && isPlausiblePlaceName(cityInRegion)) return cityInRegion;
    return clarification;
  }

  function extractLocationFromClarification(question, history) {
    if (!Array.isArray(history) || !history.length) return null;
    const lastAssistant = [...history].reverse().find((m) => m?.role === "assistant")?.content;
    if (!lastAssistant || !isWeatherLocationPrompt(lastAssistant)) return null;
    return extractClarificationLocation(normalizeWeatherStt(question).trim());
  }

  function extractUserLocation(memory) {
    const notes = memory?.userNotes || [];
    const patterns = [
      /\b(?:i live in|i'm from|im from|i am from|based in|located in)\s+(.+?)(?:[.?!,]|$)/i,
      /\b(?:my (?:home|office|town|city) is)\s+(.+?)(?:[.?!,]|$)/i,
    ];
    for (const note of notes) {
      for (const re of patterns) {
        const m = String(note || "").match(re);
        if (m?.[1]) {
          const loc = normalizeLocation(m[1]);
          if (loc.length >= 2 && loc.length <= 48) return loc;
        }
      }
    }
    return null;
  }

  function extractLocationFromHistory(history) {
    if (!Array.isArray(history) || !history.length) return null;
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      if (msg?.role !== "user") continue;
      const loc = extractLocation(msg.content);
      if (loc) return loc;
    }
    return null;
  }

  function resolveWeatherLocation(question, opts) {
    const fromQuestion = extractLocation(question);
    if (fromQuestion) return { location: fromQuestion, source: "question" };

    const fromClarification = extractLocationFromClarification(question, opts?.history);
    if (fromClarification) return { location: fromClarification, source: "question" };

    const fromMemory = extractUserLocation(opts?.memory);
    if (fromMemory) return { location: fromMemory, source: "memory" };

    const fromHistory = extractLocationFromHistory(opts?.history);
    if (fromHistory) return { location: fromHistory, source: "history" };

    return null;
  }

  function isWeatherIntent(text) {
    const q = normalizeWeatherStt(String(text || ""))
      .trim()
      .toLowerCase()
      .replace(/[\u2018\u2019\u2032]/g, "'")
      .replace(/\s+/g, " ");
    if (!q || q.length < 4) return false;
    if (/\b(weather|temperature|temp|forecast|rain|snow|humidity|wind|celsius|fahrenheit)\b/.test(q)) {
      return true;
    }
    if (/\b(whether|wetter)\b/.test(q) && /\b(?:in|at|for)\s+[a-z]/.test(q)) return true;
    if (/\bweird\s+(?:in|at|for)\s+[a-z]/.test(q)) return true;
    if (/\b(how hot|how cold|how warm)\b/.test(q)) return true;
    if (
      /\bwhat(?:'s|s| is)\s+(?:the\s+)?(?:whether|wetter|weird|weather|temperature|temp|forecast)\b/.test(
        q
      )
    ) {
      return true;
    }
    if (
      /\bhow(?:'s|s| is)\s+(?:the\s+)?(?:whether|wetter|weird|weather|temperature|temp)\b/.test(q)
    ) {
      return true;
    }
    if (/\bwhat(?:'s|s| is)\s+(?:it\s+)?like\s+(?:in|at|for)\s+[a-z]/.test(q)) return true;
    if (/\bhow(?:'s|s| is)\s+it\s+(?:in|at|for)\s+[a-z]/.test(q)) return true;
    if (/\b(?:i'?m|im|what)\s+here\s+at\s+(?:the\s+)?(?:weather|whether|wetter)\b/.test(q)) return true;
    if (/\bhere\s+at\s+(?:the\s+)?(?:weather|whether|wetter)\b/.test(q)) return true;
    return false;
  }

  function hasWeatherWithLocation(text) {
    const q = normalizeWeatherStt(String(text || "")).trim();
    if (!q || !isWeatherIntent(q)) return false;
    const loc = extractLocation(q);
    return loc != null && loc.length >= 2;
  }

  function buildSearchQuery(question) {
    let q = normalizeWeatherStt(question).trim().replace(/\?+$/, "").trim();
    q = q.replace(/^(hey karen|karen|please|can you|could you|tell me)\b[,.]?\s*/i, "");
    return q || normalizeWeatherStt(question).trim();
  }

  /** Location resolution only — actual weather comes from CHAT web search. */
  async function tryLocalWeatherReply(question, opts) {
    const normalized = normalizeWeatherStt(question);
    if (!isWeatherIntent(normalized)) return { error: "not_weather" };

    const resolved = resolveWeatherLocation(normalized, opts);
    if (!resolved) {
      return { reply: WEATHER_LOCATION_PROMPT, error: "no_location" };
    }

    if (isAmbiguousWeatherLocation(resolved.location)) {
      return {
        reply: weatherAmbiguousPrompt(resolved.location),
        error: "ambiguous_location",
        location: resolved.location,
      };
    }

    return {
      location: resolved.location,
      source: resolved.source,
      searchQuery: buildWeatherSearchQuery(resolved.location),
      needsWebSearch: true,
    };
  }

  window.DeskCopilotWeather = {
    normalizeWeatherStt,
    isWeatherIntent,
    hasWeatherWithLocation,
    buildSearchQuery,
    buildWeatherSearchQuery,
    extractUserLocation,
    resolveWeatherLocation,
    isAmbiguousWeatherLocation,
    isWeatherLocationPrompt,
    weatherAmbiguousPrompt,
    extractWeatherSwapLocation,
    isWeatherLocationSwapFollowUp,
    tryLocalWeatherReply,
    WEATHER_LOCATION_PROMPT,
  };
})();
