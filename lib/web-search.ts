import { buildSearchQuery } from "@/lib/web-search-intent";
import { normalizeWeatherStt } from "@/lib/weather-stt";
import {
  isWeatherDataQuestion,
  resolveWeatherLocation,
  buildWeatherSearchQuery,
  isAmbiguousWeatherLocation,
  type WeatherLocationSource,
} from "@/lib/weather-location";
import type { DeskMemory } from "@/lib/desk-memory";

export type SearchHit = {
  title: string;
  snippet: string;
  url: string;
  source?: string;
};

export type WebSearchFailure = "not_weather" | "no_location" | "ambiguous_location" | "search_empty";

export type WebSearchContext = {
  memory?: DeskMemory | null;
  messages?: Array<{ role: string; content: string }>;
};

export type WebSearchResult = {
  hits: SearchHit[];
  failure?: WebSearchFailure;
  location?: string;
  locationSource?: WeatherLocationSource;
  query?: string;
};

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function hasExplicitLocation(question: string): boolean {
  const q = normalizeWeatherStt(question).trim();
  return /\b(?:weather|temperature|temp|forecast)\s+(?:in|at|for)\s+/i.test(q) ||
    /\b(?:in|at|for)\s+[a-z]/i.test(q) ||
    /\bwhat(?:'s|s| is)\s+(?:it\s+)?like\s+(?:in|at|for)\s+/i.test(q) ||
    /\bhow(?:'s|s| is)\s+it\s+(?:in|at|for)\s+/i.test(q);
}

/** Build a web search query — inject resolved city when the user omitted it. */
function buildWebSearchQuery(question: string, ctx?: WebSearchContext): WebSearchResult & { query: string } {
  const normalized = normalizeWeatherStt(question);
  const query = buildSearchQuery(normalized);

  if (!isWeatherDataQuestion(normalized)) {
    return { query, hits: [] };
  }

  const resolved = resolveWeatherLocation(normalized, ctx);
  if (!resolved) {
    return { query, hits: [], failure: "no_location" };
  }

  if (isAmbiguousWeatherLocation(resolved.location)) {
    return {
      query: buildWeatherSearchQuery(resolved.location),
      hits: [],
      failure: "ambiguous_location",
      location: resolved.location,
      locationSource: resolved.source,
    };
  }

  const enrichedQuery = hasExplicitLocation(normalized)
    ? buildWeatherSearchQuery(resolved.location)
    : buildWeatherSearchQuery(resolved.location);

  return {
    query: enrichedQuery,
    hits: [],
    location: resolved.location,
    locationSource: resolved.source,
  };
}

async function searchBrave(query: string, apiKey: string): Promise<SearchHit[]> {
  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
    {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
    }
  );
  if (!res.ok) throw new Error(`Brave HTTP ${res.status}`);
  const data = (await res.json()) as {
    web?: { results?: Array<{ title?: string; description?: string; url?: string }> };
  };
  return (data.web?.results || [])
    .map((r) => ({
      title: String(r.title || "").trim(),
      snippet: String(r.description || "").trim().slice(0, 400),
      url: String(r.url || "").trim(),
      source: "Brave",
    }))
    .filter((h) => h.title && h.snippet);
}

async function searchDuckDuckGoLite(query: string): Promise<SearchHit[]> {
  const res = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`DuckDuckGo Lite HTTP ${res.status}`);
  const html = await res.text();
  const hits: SearchHit[] = [];
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const row of rows) {
    const block = row[1];
    const link = block.match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const snippetCell = block.match(/<td[^>]*class="[^"]*result-snippet[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
    if (!link || !snippetCell) continue;
    const title = decodeHtml(link[2].replace(/<[^>]+>/g, ""));
    const snippet = decodeHtml(snippetCell[1].replace(/<[^>]+>/g, ""));
    let url = decodeHtml(link[1]);
    if (url.startsWith("//")) url = `https:${url}`;
    if (title && snippet && snippet.length > 20) {
      hits.push({ title, snippet: snippet.slice(0, 400), url, source: "DuckDuckGo" });
    }
    if (hits.length >= 5) break;
  }
  return hits;
}

/** Search the web via Tavily / Serper / Brave / DuckDuckGo — no dedicated weather APIs. */
async function searchTavily(query: string, apiKey: string): Promise<SearchHit[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: 5,
      include_answer: false,
    }),
  });
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
  const data = (await res.json()) as {
    results?: Array<{ title?: string; content?: string; url?: string }>;
  };
  return (data.results || [])
    .map((r) => ({
      title: String(r.title || "").trim(),
      snippet: String(r.content || "").trim().slice(0, 400),
      url: String(r.url || "").trim(),
      source: "Tavily",
    }))
    .filter((h) => h.title && h.snippet);
}

async function searchSerper(query: string, apiKey: string): Promise<SearchHit[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({ q: query, num: 5 }),
  });
  if (!res.ok) throw new Error(`Serper HTTP ${res.status}`);
  const data = (await res.json()) as {
    organic?: Array<{ title?: string; snippet?: string; link?: string }>;
    answerBox?: { answer?: string; snippet?: string; title?: string };
  };
  const hits: SearchHit[] = [];
  if (data.answerBox?.answer || data.answerBox?.snippet) {
    hits.push({
      title: data.answerBox.title || "Quick answer",
      snippet: String(data.answerBox.answer || data.answerBox.snippet || "").trim(),
      url: "https://google.com/search?q=" + encodeURIComponent(query),
      source: "Serper",
    });
  }
  for (const r of data.organic || []) {
    hits.push({
      title: String(r.title || "").trim(),
      snippet: String(r.snippet || "").trim(),
      url: String(r.link || "").trim(),
      source: "Serper",
    });
  }
  return hits.filter((h) => h.title && h.snippet).slice(0, 5);
}

function decodeDdgHref(href: string): string {
  try {
    const raw = decodeHtml(href);
    if (raw.includes("uddg=")) {
      const full = raw.startsWith("http") ? raw : `https://duckduckgo.com${raw.startsWith("/") ? raw : `/${raw}`}`;
      const u = new URL(full);
      const uddg = u.searchParams.get("uddg");
      if (uddg) return decodeURIComponent(uddg);
    }
    if (raw.startsWith("//")) return `https:${raw}`;
    return raw;
  } catch {
    return href;
  }
}

async function searchDuckDuckGoHtml(query: string): Promise<SearchHit[]> {
  const res = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "DeskCopilot/1.0 (+https://desk-copilor.vercel.app)",
    },
    body: `q=${encodeURIComponent(query)}&b=`,
  });
  if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`);
  const html = await res.text();
  const hits: SearchHit[] = [];
  const blockRe =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>|<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>)/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) && hits.length < 5) {
    const url = decodeDdgHref(m[1]);
    const title = decodeHtml(m[2].replace(/<[^>]+>/g, ""));
    const snippet = decodeHtml((m[3] || m[4] || "").replace(/<[^>]+>/g, ""));
    if (title && snippet) hits.push({ title, snippet, url, source: "DuckDuckGo" });
  }
  return hits;
}

export function formatSearchHitsForPrompt(hits: SearchHit[]): string {
  if (!hits.length) return "";
  return hits
    .map((h, i) => `[${i + 1}] ${h.title}\n${h.snippet}${h.url ? `\nSource: ${h.url}` : ""}`)
    .join("\n\n");
}

/** Search the web via Tavily / Serper / Brave / DuckDuckGo (+ weather web page fallback). */
export async function searchWeb(question: string, ctx?: WebSearchContext): Promise<SearchHit[]> {
  return (await searchWebDetailed(question, ctx)).hits;
}

export async function searchWebDetailed(
  question: string,
  ctx?: WebSearchContext,
  queryOverride?: string
): Promise<WebSearchResult> {
  const prepared = buildWebSearchQuery(question, ctx);
  const query = (queryOverride || prepared.query).trim();

  if (prepared.failure === "no_location" || prepared.failure === "ambiguous_location") {
    return {
      hits: [],
      failure: prepared.failure,
      location: prepared.location,
      locationSource: prepared.locationSource,
      query,
    };
  }

  const tavilyKey = process.env.TAVILY_API_KEY?.trim();
  if (tavilyKey) {
    try {
      const hits = await searchTavily(query, tavilyKey);
      if (hits.length) {
        return {
          hits,
          location: prepared.location,
          locationSource: prepared.locationSource,
          query,
        };
      }
    } catch (err) {
      console.warn("[desk-copilot:web-search] Tavily failed:", err instanceof Error ? err.message : err);
    }
  }

  const serperKey = process.env.SERPER_API_KEY?.trim();
  if (serperKey) {
    try {
      const hits = await searchSerper(query, serperKey);
      if (hits.length) {
        return {
          hits,
          location: prepared.location,
          locationSource: prepared.locationSource,
          query,
        };
      }
    } catch (err) {
      console.warn("[desk-copilot:web-search] Serper failed:", err instanceof Error ? err.message : err);
    }
  }

  const braveKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (braveKey) {
    try {
      const hits = await searchBrave(query, braveKey);
      if (hits.length) {
        return {
          hits,
          location: prepared.location,
          locationSource: prepared.locationSource,
          query,
        };
      }
    } catch (err) {
      console.warn("[desk-copilot:web-search] Brave failed:", err instanceof Error ? err.message : err);
    }
  }

  try {
    const hits = await searchDuckDuckGoHtml(query);
    if (hits.length) {
      return {
        hits,
        location: prepared.location,
        locationSource: prepared.locationSource,
        query,
      };
    }
  } catch (err) {
    console.warn("[desk-copilot:web-search] DuckDuckGo HTML failed:", err instanceof Error ? err.message : err);
  }

  try {
    const hits = await searchDuckDuckGoLite(query);
    if (hits.length) {
      return {
        hits,
        location: prepared.location,
        locationSource: prepared.locationSource,
        query,
      };
    }
  } catch (err) {
    console.warn("[desk-copilot:web-search] DuckDuckGo Lite failed:", err instanceof Error ? err.message : err);
  }

  return {
    hits: [],
    failure: isWeatherDataQuestion(normalizeWeatherStt(question)) ? "search_empty" : undefined,
    location: prepared.location,
    locationSource: prepared.locationSource,
    query,
  };
}
