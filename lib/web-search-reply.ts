import OpenAI from "openai";
import type { ChatMessage } from "@/lib/chat-engine";
import { resolveSearchQuestion } from "@/lib/pending-request";
import {
  needsWebSearch,
  buildSearchQuery,
  resolveWebSearchQuestion,
} from "@/lib/web-search-intent";
import { normalizeWeatherStt } from "@/lib/weather-stt";
import { searchWebDetailed, formatSearchHitsForPrompt, type WebSearchContext } from "@/lib/web-search";
import { sanitizeCasualReply, isGenericCasualReply, isTradingRedirect } from "@/lib/casual-chat-intent";
import { formatMemoryForPrompt, normalizeMemory } from "@/lib/desk-memory";
import {
  WEATHER_LOCATION_PROMPT,
  isWeatherDataQuestion,
  isWeatherLocationPrompt,
  weatherAmbiguousPrompt,
  snippetMentionsDifferentPlace,
  isWeatherAmbiguousPrompt,
  hasWeatherLocationDisambiguation,
} from "@/lib/weather-location";
import type { DeskMemory } from "@/lib/desk-memory";
import type { SearchHit } from "@/lib/web-search";

const WEB_SEARCH_REFUSAL =
  /\b(can't|cannot|unable to)\s+(check|browse|look up|access|get|fetch)\b|\b(i don't have (access|live)|no (live|real-time) (data|weather|info))\b|\b(as an ai|language model)\b/i;

const WEB_SEARCH_GUESS =
  /\b(don't keep up with the weather|can't keep up with the weather|can't check the weather|cannot check the weather|don't really follow the weather|not up on the weather|up on the weather reports|don't have the weather|no weather reports|hope it'?s nice|always better with good weather|good weather\b|got any plans for the day|looking pretty nice|perfect for a stroll|typical british weather|mix of clouds|(?:grab|bring|take)\s+(?:an\s+)?umbrella)\b|\b(probably (?:a bit )?(?:typical|rain|sun|cloud|chilly|cold|warm|damp|wet|dry|overcast|grey|gray|miserable|nice|british))\b|\b(probably\b[^.!?]{0,48}\b(?:rain|cloud|sun|damp|wet|overcast|miserable|british))\b|\b(classic mix|might be|i bet it'?s|i imagine it|my guess is|likely (?:rain|sun|cloud|chilly|cold|warm))\b|\b(?:ah,?\s*)?got it!\b.*\b(?:weather|can't check|cannot check|probably|typical|cloud|rain|umbrella|british|stroll|nice today)\b|\b(?:ah,?\s*)?got it!\b/i;

/** Web search / GPT weather — not Open-Meteo-only formatting. */
const LIVE_WEATHER_REPLY =
  /\b\d+(?:\.\d+)?\s*°[cf]\b|\b\d+\s*(?:degrees|°)\b|\b(?:high|low|currently|now|around|about)\s*(?:at|of|near)?\s*\d+\b|\b(clear|overcast|cloudy|partly cloudy|mainly clear|rain|snow|drizzle|foggy|thunderstorm|showers|mixed conditions|feels like|humidity|wind|sunny|forecast)\b|'s at \d+(?:\.\d+)?°[cf]\b|\bfeels like \d+(?:\.\d+)?°[cf]\b/i;

export function isWeatherGuessReply(text: string): boolean {
  return WEB_SEARCH_REFUSAL.test(text) || WEB_SEARCH_GUESS.test(text);
}

export function isLiveWeatherReply(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (isWeatherLocationPrompt(t)) return true;
  if (isWeatherAmbiguousPrompt(t)) return true;
  if (isWeatherGuessReply(t)) return false;
  return LIVE_WEATHER_REPLY.test(t);
}

function isWebSearchRefusal(text: string): boolean {
  return isWeatherGuessReply(text);
}

function placeLabel(location: string): string {
  return location.replace(/^the\s+/i, "").split(/\s+in\s+/i)[0]?.trim() || location;
}

/** Pull a spoken weather line from raw web snippets when GPT synthesis fails. */
export function extractWeatherFromHits(hits: SearchHit[], location: string): string | null {
  const combined = hits.map((h) => `${h.title} ${h.snippet}`).join(" ");
  const tempMatch =
    combined.match(/\b(\d{1,2}(?:\.\d)?)\s*°\s*([cf])\b/i) ||
    combined.match(/\b(\d{1,2}(?:\.\d)?)\s*degrees?\s*(?:f|c|fahrenheit|celsius)?\b/i) ||
    combined.match(/\b(?:currently|now|temperature(?: is)?|temp(?:erature)?(?: is)?)\s*(?:at|of|:)?\s*(\d{1,2}(?:\.\d)?)\b/i);
  if (!tempMatch) return null;
  const temp = tempMatch[1];
  const unit = tempMatch[2]?.toUpperCase() === "F" ? "°F" : "°C";
  const condMatch = combined.match(
    /\b(clear|overcast|cloudy|partly cloudy|mainly clear|rain|snow|drizzle|foggy|thunderstorm|showers|sunny|fine|dry|wet|windy)\b/i
  );
  const place = placeLabel(location);
  let line = `${place}'s at ${temp}${unit}`;
  if (condMatch) line += ` and ${condMatch[1].toLowerCase()}`;
  const feelsMatch = combined.match(/\bfeels?\s*like\s*(\d{1,2}(?:\.\d)?)\s*°?\s*([cf])?\b/i);
  if (feelsMatch) {
    const feelsUnit = feelsMatch[2]?.toUpperCase() === "F" ? "°F" : unit;
    line += ` — feels like ${feelsMatch[1]}${feelsUnit}`;
  }
  return `${line}.`;
}

function searchHitsLookAmbiguous(location: string, hits: SearchHit[]): boolean {
  const mismatches = hits.filter((h) =>
    snippetMentionsDifferentPlace(location, `${h.title} ${h.snippet}`)
  );
  return mismatches.length >= 2;
}

const WEB_SEARCH_PROMPT = `You are Karen — a friendly desk co-pilot answering from LIVE web search results. ChatGPT-like: warm, direct, helpful.

Rules:
- Use ONLY the search results below for factual claims (weather, news, scores, prices, dates, places).
- The user asked about a specific place — stick to results for THAT place; if results disagree on location, say you're not sure which city and ask them to clarify.
- If results are thin, say what you found and note uncertainty — do not invent numbers.
- Answer in 1–4 short spoken sentences.
- Include temperature and conditions when search snippets mention them.
- Use memory about the user naturally when relevant (name, city, preferences).
- Do NOT start replies with your name (Karen:, Karen,) — the chat UI already labels you.
- Do NOT mention charts, Nasdaq, trading, or offer a chart read.
- Do NOT say you cannot browse or that you are an AI.
- No markdown, no bullet lists, no source URLs in the reply (facts only).`;

export type WebSearchReplyOptions = WebSearchContext & {
  memory?: DeskMemory | null;
  searchQuery?: string;
};

function logWebSearchFailure(
  reason: string,
  question: string,
  detail?: Record<string, unknown>
): void {
  console.warn("[desk-copilot:web-search]", reason, {
    question: question.slice(0, 120),
    ...detail,
  });
}

export async function tryWebSearchReply(
  question: string,
  messages?: ChatMessage[],
  opts?: WebSearchReplyOptions
): Promise<string | null> {
  const resolved = normalizeWeatherStt(resolveSearchQuestion(question, messages));
  const normalizedQuestion = normalizeWeatherStt(question);
  const searchQuestion = needsWebSearch(resolved)
    ? resolved
    : needsWebSearch(normalizedQuestion)
      ? normalizedQuestion
      : null;
  if (!searchQuestion) return null;

  const ctx: WebSearchContext = {
    memory: opts?.memory,
    messages: opts?.messages ?? messages,
  };
  const result = await searchWebDetailed(searchQuestion, ctx, opts?.searchQuery);
  const hits = result.hits;

  if (isWeatherDataQuestion(searchQuestion)) {
    if (result.failure === "no_location") return WEATHER_LOCATION_PROMPT;
    if (result.failure === "ambiguous_location" && result.location) {
      return weatherAmbiguousPrompt(result.location);
    }
  }

  if (!hits.length && isWeatherDataQuestion(searchQuestion)) {
    logWebSearchFailure("weather_search_empty", searchQuestion, {
      failure: result.failure,
      location: result.location,
      locationSource: result.locationSource,
      query: result.query,
    });
    return null;
  }

  if (!hits.length) {
    logWebSearchFailure("search_empty", searchQuestion, {
      failure: result.failure,
      query: result.query,
    });
    return null;
  }

  if (
    isWeatherDataQuestion(searchQuestion) &&
    result.location &&
    !hasWeatherLocationDisambiguation(result.location) &&
    searchHitsLookAmbiguous(result.location, hits)
  ) {
    return weatherAmbiguousPrompt(result.location);
  }

  const recentText = (messages || [])
    .slice(-6)
    .map((m) => m.content)
    .join(" ");

  const block = formatSearchHitsForPrompt(hits);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return hits[0]?.snippet?.slice(0, 220) || null;
  }

  try {
    const openai = new OpenAI({ apiKey });
    const history = (messages || [])
      .slice(-4)
      .filter((m) => m.role === "user" || m.role === "assistant");
    const memoryBlock = formatMemoryForPrompt(normalizeMemory(opts?.memory));
    const system = [WEB_SEARCH_PROMPT, memoryBlock].filter(Boolean).join("\n\n");
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 160,
      temperature: 0.35,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Search query: ${buildSearchQuery(searchQuestion)}\nTarget place: ${result.location || "unknown"}\n\nResults:\n${block}\n\nAnswer the user's question using these results.`,
        },
        ...history,
      ],
    });
    const text = response.choices[0]?.message?.content?.trim();
    if (text && !isWebSearchRefusal(text)) {
      const cleaned = sanitizeCasualReply(text, searchQuestion, recentText);
      if (
        cleaned &&
        !isGenericCasualReply(cleaned) &&
        !isTradingRedirect(cleaned) &&
        !isWebSearchRefusal(cleaned)
      ) {
        if (isWeatherDataQuestion(searchQuestion) && !isLiveWeatherReply(cleaned)) {
          logWebSearchFailure("weather_gpt_not_live", searchQuestion, { reply: cleaned.slice(0, 120) });
        } else {
          return cleaned;
        }
      } else if (isWeatherDataQuestion(searchQuestion)) {
        logWebSearchFailure("weather_gpt_rejected", searchQuestion, {
          raw: text.slice(0, 120),
          cleaned: cleaned?.slice(0, 120),
        });
      }
    }
  } catch (err) {
    logWebSearchFailure("weather_gpt_error", searchQuestion, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (isWeatherDataQuestion(searchQuestion)) {
    const extracted = extractWeatherFromHits(hits, result.location || searchQuestion);
    if (extracted && isLiveWeatherReply(extracted)) return extracted;
  }

  const fallback =
    formatSearchHitsForPrompt(hits).slice(0, 220) || hits[0]?.snippet?.slice(0, 220) || null;
  if (fallback && isWeatherDataQuestion(searchQuestion) && !isLiveWeatherReply(fallback)) {
    logWebSearchFailure("weather_snippet_not_live", searchQuestion, { snippet: fallback.slice(0, 120) });
    return null;
  }
  return fallback;
}
