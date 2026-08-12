import { extractUserLocation, type DeskMemory } from "@/lib/desk-memory";
import { normalizeWeatherStt } from "@/lib/weather-stt";

type HistoryMsg = { role: string; content: string };

type CityRegionPair = { city: string; region: string };

/** Countries and major regions that disambiguate a place name. */
const WEATHER_COUNTRIES = new Set([
  "uk",
  "united kingdom",
  "usa",
  "us",
  "united states",
  "italy",
  "france",
  "spain",
  "germany",
  "canada",
  "australia",
  "england",
  "scotland",
  "wales",
  "northern ireland",
  "ireland",
  "netherlands",
  "belgium",
  "portugal",
  "greece",
  "switzerland",
  "austria",
  "poland",
  "sweden",
  "norway",
  "denmark",
  "finland",
  "japan",
  "india",
  "mexico",
  "brazil",
  "new zealand",
]);

/** UK counties and similar admin regions — "Telford Shropshire" is unambiguous. */
const WEATHER_UK_REGIONS = new Set([
  "shropshire",
  "yorkshire",
  "lancashire",
  "hampshire",
  "devon",
  "cornwall",
  "kent",
  "essex",
  "surrey",
  "somerset",
  "norfolk",
  "suffolk",
  "cheshire",
  "staffordshire",
  "worcestershire",
  "gloucestershire",
  "oxfordshire",
  "buckinghamshire",
  "berkshire",
  "wiltshire",
  "dorset",
  "cumbria",
  "northumberland",
  "durham",
  "lincolnshire",
  "nottinghamshire",
  "derbyshire",
  "leicestershire",
  "warwickshire",
  "herefordshire",
  "bedfordshire",
  "cambridgeshire",
  "hertfordshire",
  "northamptonshire",
  "rutland",
  "merseyside",
  "greater manchester",
  "west midlands",
  "east sussex",
  "west sussex",
  "tyne and wear",
  "south yorkshire",
  "west yorkshire",
  "north yorkshire",
  "east yorkshire",
]);

function normalizeRegionToken(token: string): string {
  return token.trim().toLowerCase().replace(/\s+/g, " ");
}

function isWeatherCountry(region: string): boolean {
  return WEATHER_COUNTRIES.has(normalizeRegionToken(region));
}

function isUkWeatherRegion(region: string): boolean {
  const r = normalizeRegionToken(region);
  if (WEATHER_UK_REGIONS.has(r)) return true;
  if (/\bshire$/i.test(r) && r.length > 5) return true;
  if (/\b(middlesex|sussex|essex|wessex)$/i.test(r)) return true;
  return false;
}

function isKnownWeatherRegion(region: string): boolean {
  return isWeatherCountry(region) || isUkWeatherRegion(region);
}

/** Cities with a dominant UK county — bare name is enough for weather search. */
const UK_COUNTY_CITY_PAIRS: Record<string, string> = {
  telford: "shropshire",
  shrewsbury: "shropshire",
};

export function knownUkCountyForCity(city: string): string | null {
  const key = normalizePlaceToken(city);
  return UK_COUNTY_CITY_PAIRS[key] || null;
}

/** Bare UK county-town names → "City County" for search + disambiguation. */
export function enrichKnownUkWeatherLocation(location: string): string {
  const loc = location.replace(/^the\s+/i, "").trim();
  if (!loc || hasWeatherLocationDisambiguation(loc)) return loc;
  const words = loc.split(/\s+/).filter(Boolean);
  if (words.length !== 1) return loc;
  const county = knownUkCountyForCity(loc);
  if (!county) return loc;
  const city = loc.charAt(0).toUpperCase() + loc.slice(1);
  const region = county.charAt(0).toUpperCase() + county.slice(1);
  return `${city} ${region}`;
}

function normalizePlaceToken(token: string): string {
  return token.trim().toLowerCase().replace(/\s+/g, " ");
}

function isKnownUkCountyCityPair(city: string, region: string): boolean {
  return UK_COUNTY_CITY_PAIRS[normalizePlaceToken(city)] === normalizePlaceToken(region);
}

/** Parse city+region in either spoken order when the region or pair is known. */
export function parseCityRegionPair(location: string): CityRegionPair | null {
  const loc = location.replace(/^the\s+/i, "").trim();
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

function locationHasCountry(location: string): boolean {
  return [...WEATHER_COUNTRIES].some((c) => {
    const re = new RegExp(`\\b${c.replace(/\s+/g, "\\s+")}\\b`, "i");
    return re.test(location);
  });
}

/** Strip timing/filler words — keep region and country for search accuracy. */
function stripLocationFiller(raw: string): string {
  return raw
    .replace(/\b(right now|today|currently|now|please)\b/gi, "")
    .replace(/[,.]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLocation(raw: string): string {
  return stripLocationFiller(raw);
}

export function hasWeatherLocationDisambiguation(location: string): boolean {
  const loc = location.trim();
  if (/\bin\s+[A-Za-z]/i.test(loc)) return true;
  if (/,\s*[A-Za-z]{2,}/.test(loc)) return true;
  if (parseCityRegionPair(loc)) return true;
  if (locationHasCountry(loc)) return true;
  return false;
}

/** Single-word or underspecified place names need a region before we trust web results. */
export function isAmbiguousWeatherLocation(location: string): boolean {
  const loc = location.replace(/^the\s+/i, "").trim();
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
  return words.length === 2 && !/\b(uk|usa|italy|france|spain|germany|canada|australia|england|scotland|wales)\b/i.test(loc);
}

export function enrichWeatherLocationForSearch(location: string): string {
  const known = enrichKnownUkWeatherLocation(location);
  const loc = stripLocationFiller(known.replace(/^the\s+/i, ""));
  const pair = parseCityRegionPair(loc);
  let searchLoc = pair ? `${pair.city} ${pair.region}` : loc.replace(/\s+in\s+/gi, " ").trim();
  if (!locationHasCountry(searchLoc) && pair && isUkWeatherRegion(pair.region)) {
    searchLoc = `${searchLoc} England`;
  }
  return searchLoc;
}

export function buildWeatherSearchQuery(location: string): string {
  return `current weather ${enrichWeatherLocationForSearch(location)}`;
}

export function weatherAmbiguousPrompt(location: string): string {
  const place = location.replace(/^the\s+/i, "").trim() || "that place";
  return `There are a few places called ${place} — which city or region did you mean?`;
}

export function snippetMentionsDifferentPlace(requested: string, snippet: string): boolean {
  const loc = requested.replace(/^the\s+/i, "").trim();
  if (!loc) return false;
  // User already named a region/country — trust it; do not re-ask from noisy snippets.
  if (hasWeatherLocationDisambiguation(loc)) return false;

  const req = loc.toLowerCase();
  const text = snippet.toLowerCase();
  const pair = parseCityRegionPair(loc);
  if (pair) {
    const city = pair.city.toLowerCase();
    const region = pair.region.toLowerCase();
    if (text.includes(city) && text.includes(region)) return false;
  }

  const reqCore = req.split(/\s+in\s+/i)[0]?.split(",")[0]?.trim() || req;
  if (!reqCore || reqCore.length < 3) return false;
  if (text.includes(reqCore)) return false;
  const altRe =
    /\b(?:in|for|at)\s+([a-z][a-z\s'-]{2,40}?)(?:[,.\s]|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = altRe.exec(text))) {
    const alt = m[1].trim();
    if (alt.length >= 4 && !alt.includes(reqCore) && !reqCore.includes(alt.split(/\s+/)[0] || "")) {
      return true;
    }
  }
  return false;
}

function isPlausiblePlaceName(loc: string): boolean {
  const t = loc.trim().toLowerCase();
  if (!t || t.length < 2 || t.length > 56) return false;
  return !/\b(weather|whether|wetter|what|how|temperature|forecast)\b/.test(t);
}

function extractCityInRegion(text: string): string | null {
  const matches = [
    ...text.matchAll(
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

function trimLocationCapture(raw: string, fallback?: string | null): string | null {
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

export function extractLocationFromQuestion(question: string): string | null {
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
  let best: string | null = null;
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

/** "Telford in Shropshire" or a lone city after Karen asked which city. */
function extractClarificationLocation(text: string): string | null {
  const q = text.trim();
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

export function isWeatherClarificationPrompt(text: string): boolean {
  return isWeatherLocationPrompt(text) || isWeatherAmbiguousPrompt(text);
}

const WEATHER_SWAP_FOLLOWUP =
  /\b(?:what about|how about)\s+(?:the\s+)?(.+?)[?.!]*$/i;

const WEATHER_SWAP_BLOCK =
  /\b(weather|temperature|forecast|news|chart|trade|stock|bitcoin|ndog|nwog|mss|fvg|pizza|burger|food|music|color|colour|your|my)\b/i;

/** Location swap in a weather thread — "What about Paris?" after Berlin weather. */
export function extractWeatherSwapLocation(text: string): string | null {
  const q = text.trim();
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

export function isWeatherLocationSwapFollowUp(text: string): boolean {
  return extractWeatherSwapLocation(text) != null;
}

function extractLocationFromClarification(
  question: string,
  messages?: HistoryMsg[]
): string | null {
  const lastAssistant = [...(messages || [])]
    .reverse()
    .find((m) => m.role === "assistant")?.content;
  if (!lastAssistant || !isWeatherClarificationPrompt(lastAssistant)) return null;

  const q = normalizeWeatherStt(question).trim();
  const iMean = q.match(/^i\s+mean[,.\s]+(.+)$/i);
  if (iMean?.[1]) {
    const region = normalizeLocation(iMean[1].trim());
    if (region.length >= 2) {
      const cityFromPrompt = lastAssistant.match(/\bplaces called\s+([A-Za-z][A-Za-z\s'-]{0,32})\b/i)?.[1]?.trim();
      const cityFromHistory = extractLocationFromHistory(messages);
      const city = cityFromPrompt || (cityFromHistory && isAmbiguousWeatherLocation(cityFromHistory) ? cityFromHistory : null);
      if (city && region && !/\bin\b/i.test(region)) {
        return normalizeLocation(`${city} ${region}`);
      }
      return region;
    }
  }

  return extractClarificationLocation(q);
}

function extractLocationFromHistory(messages?: HistoryMsg[]): string | null {
  if (!messages?.length) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user") continue;
    const loc = extractLocationFromQuestion(msg.content);
    if (loc) return loc;
  }
  return null;
}

export type WeatherLocationSource = "question" | "memory" | "history";

export function resolveWeatherLocation(
  question: string,
  opts?: { memory?: DeskMemory | null; messages?: HistoryMsg[] }
): { location: string; source: WeatherLocationSource } | null {
  const fromQuestion = extractLocationFromQuestion(question);
  if (fromQuestion) return { location: fromQuestion, source: "question" };

  const fromClarification = extractLocationFromClarification(question, opts?.messages);
  if (fromClarification) return { location: fromClarification, source: "question" };

  const fromMemory = extractUserLocation(opts?.memory);
  if (fromMemory) return { location: fromMemory, source: "memory" };

  const fromHistory = extractLocationFromHistory(opts?.messages);
  if (fromHistory) return { location: fromHistory, source: "history" };

  return null;
}

export function isWeatherDataQuestion(text: string): boolean {
  const normalized = normalizeWeatherStt(text).trim().toLowerCase();
  if (!normalized) return false;
  return (
    /\b(weather|temperature|temp|forecast|rain|snow|how hot|how cold|how warm)\b/.test(normalized) ||
    (/\b(whether|wetter)\b/.test(normalized) &&
      (/\b(?:in|at|for)\s+[a-z]/.test(normalized) ||
        /\bwhat(?:'s|s| is)\b/.test(normalized) ||
        /\bhow(?:'s|s| is)\b/.test(normalized))) ||
    /\b(?:i'?m|im|what)\s+here\s+at\s+(?:the\s+)?(?:weather|whether|wetter)\b/.test(normalized) ||
    /\bhere\s+at\s+(?:the\s+)?(?:weather|whether|wetter)\b/.test(normalized) ||
    /\bwhat(?:'s|s| is)\s+(?:it\s+)?like\s+(?:in|at|for)\s+[a-z]/.test(normalized)
  );
}

/** Weather intent with a parseable place — always route to live search, not casual LLM. */
export function hasWeatherWithLocation(text: string): boolean {
  const q = normalizeWeatherStt(text).trim();
  if (!q || !isWeatherDataQuestion(q)) return false;
  const loc = extractLocationFromQuestion(q);
  return loc != null && loc.length >= 2;
}

export const WEATHER_LOCATION_PROMPT =
  "Which city should I check the weather for?";

export function isWeatherLocationPrompt(text: string): boolean {
  return /\bwhich city\b/i.test(text) && /\bweather\b/i.test(text);
}

export function isWeatherAmbiguousPrompt(text: string): boolean {
  return /\bplaces called\b/i.test(text) && /\bwhich city or region\b/i.test(text);
}
