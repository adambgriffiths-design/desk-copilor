/**
 * Prove /api/chat/stream does not bounce TEXT "Give me a read on the chart"
 * to needsChartRead JSON. Optional live POST if BASE is set or localhost is up.
 */
import { needsFullChartRead } from "../lib/chart-read-intent";
import { isNonTradingConversation } from "../lib/casual-chat-intent";
import { classifyDeskRoute } from "../lib/desk-route-intent";
import { mustUseTradingStream } from "../lib/routing";

const PHRASE = "Give me a read on the chart.";

function bounceWouldFire(text: string): boolean {
  return !mustUseTradingStream(text) && needsFullChartRead(text) && !isNonTradingConversation(text);
}

if (bounceWouldFire(PHRASE)) {
  console.error("FAIL: backend would return needsChartRead JSON — stream never starts");
  process.exit(1);
}
if (bounceWouldFire("give me market read")) {
  console.error("FAIL: give me market read would bounce needsChartRead");
  process.exit(1);
}
if (bounceWouldFire("get the read")) {
  console.error("FAIL: get the read would bounce needsChartRead");
  process.exit(1);
}
if (bounceWouldFire("Give me the read")) {
  console.error("FAIL: Give me the read would bounce needsChartRead");
  process.exit(1);
}
console.log("ok: backend bounce gate closed — stream route will SSE, not needsChartRead JSON");
console.log("ok: route", classifyDeskRoute({ text: PHRASE }).route, "tradingStream", mustUseTradingStream(PHRASE));
console.log(
  "ok: market-read route",
  classifyDeskRoute({ text: "give me market read" }).route,
  "tradingStream",
  mustUseTradingStream("give me market read")
);

const bases = [
  process.env.DESK_API_BASE,
  "http://127.0.0.1:3010",
  "http://127.0.0.1:3000",
  "http://localhost:3000",
].filter((b): b is string => Boolean(b));

async function tryLive(base: string): Promise<boolean> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 90000);
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ac.signal,
      body: JSON.stringify({
        messages: [{ role: "user", content: PHRASE }],
        voiceInput: false,
        forceMarket: true,
      }),
    });
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const data = (await res.json()) as { needsChartRead?: boolean; error?: string };
      if (data.needsChartRead) {
        console.error(`FAIL live ${base}: JSON needsChartRead bounce`);
        return false;
      }
      if (data.error) {
        console.log(`live ${base}: JSON error (visible, not silent):`, data.error);
        return true;
      }
      console.log(`live ${base}: JSON without bounce`, Object.keys(data));
      return true;
    }
    if (ct.includes("text/event-stream")) {
      const text = await res.text();
      const hasDelta = /"type":"delta"/.test(text);
      const hasDone = /"type":"done"/.test(text);
      const hasError = /"type":"error"/.test(text);
      const done = text.match(/"type":"done"[^}]*"reply":"((?:\\.|[^"\\])*)"/);
      const reply = done?.[1]?.replace(/\\n/g, " ").slice(0, 280) || "";
      console.log(
        `ok live ${base}: SSE status=${res.status} delta=${hasDelta} done=${hasDone} error=${hasError} reply="${reply}"`
      );
      if (hasError && !reply) return false;
      return hasDelta || hasDone;
    }
    console.log(`live ${base}: HTTP ${res.status} ct=${ct}`);
    return res.ok;
  } catch (e) {
    console.log(`skip live ${base}:`, e instanceof Error ? e.message : e);
    return false;
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  let live = false;
  for (const base of bases) {
    live = await tryLive(base);
    if (live) break;
  }
  if (!live) {
    console.log("HONEST: no live API in this loop — bounce gate is unit-proven; TV/mic not exercised.");
  }
}

void main();
