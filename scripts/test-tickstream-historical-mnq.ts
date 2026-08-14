/**
 * TickStream Historical MNQ POC — run: npm run test:tickstream-historical-mnq
 *
 * Requires TICKSTREAM_API_KEY in environment (never logged or printed).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Client, Stream } from "@tickstream/client";
import { aggregateTicksTo1m, type MinuteBar } from "../lib/tickstream/aggregate";
import {
  fetchHistoricalTicks,
  HistoricalApiError,
  type NormalizedTick,
} from "../lib/tickstream/historical";
import {
  aggregateHtfFrom1m,
  tradeCountsFromTicks,
  type HtfBar,
} from "../lib/tickstream/htf-aggregate";

const MNQ = "MNQ";
const POC_DIR = join(process.cwd(), "tmp");
const POC_REPORT = join(POC_DIR, "tickstream-historical-mnq-report.json");

/** One trading hour inside the documented free sample window (Feb–Mar 2025). */
const PROBE_START = "2025-03-03T14:30:00Z";
const PROBE_END = "2025-03-03T15:30:00Z";

/** ~1 week explicit range (within sample-era archive). */
const WEEK_START = "2025-03-03";
const WEEK_END = "2025-03-10";

type Check = "PASS" | "FAIL" | "SKIP" | "STOP";

type Report = {
  generatedAt: string;
  currentPriceCheck: {
    source: string;
    result: Check;
    evidence: string;
    quote?: { price?: number; ts?: number; symbol?: string };
  };
  step1_probe: {
    result: Check;
    symbol: string;
    start: string;
    end: string;
    tickCount: number;
    evidence: string;
    sampleTick?: NormalizedTick;
    error?: string;
  };
  step2_week: {
    result: Check;
    start: string;
    end: string;
    tickCount: number;
    range: { firstTs: number | null; lastTs: number | null };
    stats: Record<string, unknown>;
    evidence: string;
    error?: string;
  };
  step3_aggregate1m: {
    result: Check;
    candleCount: number;
    firstCandle: MinuteBar | null;
    lastCandle: MinuteBar | null;
    evidence: string;
  };
  step5_htf: {
    result: Check;
    counts: Record<string, number>;
    monthly: { result: Check; reason: string };
    evidence: string;
  };
  step6_storage: { path: string; result: Check };
  step7_realtimeVsDelayed: {
    welcomePlan: string | null;
    determination: string;
    evidence: string[];
  };
  blockers: string[];
};

const apiKey = process.env.TICKSTREAM_API_KEY?.trim();

function iso(ts: number): string {
  return new Date(ts * 1000).toISOString();
}

function fmtBar(label: string, bar: MinuteBar | HtfBar): string {
  const ts = "minuteTs" in bar ? bar.minuteTs : bar.bucketTs;
  const tc = "tradeCount" in bar ? ` trades=${bar.tradeCount}` : "";
  return `${label} ${iso(ts)} O=${bar.open} H=${bar.high} L=${bar.low} C=${bar.close} V=${bar.volume}${tc}`;
}

function printReport(r: Report) {
  console.log("\n=== TickStream Historical MNQ POC ===\n");

  console.log("--- Current price check (first) ---");
  console.log(`Source: ${r.currentPriceCheck.source}`);
  console.log(`Result: ${r.currentPriceCheck.result}`);
  console.log(`Evidence: ${r.currentPriceCheck.evidence}`);
  if (r.currentPriceCheck.quote?.price != null) {
    console.log(
      `Quote: symbol=${r.currentPriceCheck.quote.symbol} price=${r.currentPriceCheck.quote.price} ts=${r.currentPriceCheck.quote.ts != null ? iso(r.currentPriceCheck.quote.ts) : "?"}`
    );
  }

  console.log("\n--- Step 1: Small historical request ---");
  console.log(`Result: ${r.step1_probe.result}`);
  console.log(`Symbol: ${r.step1_probe.symbol}  Range: ${r.step1_probe.start} → ${r.step1_probe.end}`);
  console.log(`Ticks: ${r.step1_probe.tickCount}`);
  console.log(`Evidence: ${r.step1_probe.evidence}`);
  if (r.step1_probe.sampleTick) {
    const t = r.step1_probe.sampleTick;
    console.log(
      `Sample: price=${t.price} size=${t.size} side=${t.side} exchange=${t.exchange} ts=${iso(t.timestamp)}`
    );
  }
  if (r.step1_probe.error) console.log(`Error: ${r.step1_probe.error}`);

  console.log("\n--- Step 2: One week historical ---");
  console.log(`Result: ${r.step2_week.result}`);
  console.log(`Range: ${r.step2_week.start} → ${r.step2_week.end}`);
  console.log(`Tick count: ${r.step2_week.tickCount}`);
  if (r.step2_week.range.firstTs != null) {
    console.log(
      `Tick range: ${iso(r.step2_week.range.firstTs)} → ${iso(r.step2_week.range.lastTs!)}`
    );
  }
  console.log(`Stats: ${JSON.stringify(r.step2_week.stats)}`);
  if (r.step2_week.error) console.log(`Error: ${r.step2_week.error}`);

  console.log("\n--- Step 3: 1m aggregation (aggregate.ts) ---");
  console.log(`Result: ${r.step3_aggregate1m.result}`);
  console.log(`1m candles: ${r.step3_aggregate1m.candleCount}`);
  if (r.step3_aggregate1m.firstCandle) {
    console.log(fmtBar("First:", r.step3_aggregate1m.firstCandle));
  }
  if (r.step3_aggregate1m.lastCandle) {
    console.log(fmtBar("Last:", r.step3_aggregate1m.lastCandle));
  }

  console.log("\n--- Step 5: HTF aggregation ---");
  console.log(`Result: ${r.step5_htf.result}`);
  console.log(`Counts: ${JSON.stringify(r.step5_htf.counts)}`);
  console.log(`Monthly: ${r.step5_htf.monthly.result} — ${r.step5_htf.monthly.reason}`);

  console.log("\n--- Step 6: Storage ---");
  console.log(`${r.step6_storage.result}: ${r.step6_storage.path}`);

  console.log("\n--- Step 7: Realtime vs delayed ---");
  console.log(`Welcome plan: ${r.step7_realtimeVsDelayed.welcomePlan ?? "n/a"}`);
  console.log(`Determination: ${r.step7_realtimeVsDelayed.determination}`);
  for (const e of r.step7_realtimeVsDelayed.evidence) console.log(`  • ${e}`);

  if (r.blockers.length) {
    console.log("\n--- Blockers ---");
    for (const b of r.blockers) console.log(`  • ${b}`);
  }
}

async function checkCurrentPrice(client: Client): Promise<Report["currentPriceCheck"]> {
  // Historical archive docs: no current/last price — use GET /quote (REST) or WebSocket stream.
  try {
    const quote = (await client.quote(MNQ)) as {
      symbol?: string;
      price?: number;
      ts?: number;
    };
    const ok =
      typeof quote.price === "number" &&
      Number.isFinite(quote.price) &&
      typeof quote.ts === "number";
    return {
      source: "GET /quote (REST — latest trade; historical API is archive-only)",
      result: ok ? "PASS" : "FAIL",
      evidence: ok
        ? "Current/last price available via REST /quote, not via /history/ticks"
        : "Quote response missing price or ts",
      quote: { symbol: quote.symbol, price: quote.price, ts: quote.ts },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      source: "GET /quote",
      result: "FAIL",
      evidence: `Quote failed: ${msg}. Historical API does not expose current price per docs.`,
    };
  }
}

async function probeWelcomePlan(): Promise<string | null> {
  if (!apiKey) return null;
  return new Promise((resolve) => {
    const stream = new Stream(apiKey);
    let plan: string | null = null;
    const timer = setTimeout(() => {
      stream.close();
      resolve(plan);
    }, 5000);
    stream.on("welcome", (msg: { plan?: string }) => {
      plan = msg.plan ?? null;
      clearTimeout(timer);
      stream.close();
      resolve(plan);
    });
    stream.on("error", () => {
      clearTimeout(timer);
      stream.close();
      resolve(plan);
    });
    stream.subscribe(MNQ);
  });
}

async function main() {
  if (!apiKey) {
    console.error(
      "TICKSTREAM_API_KEY is required for live run. Set it in your environment.\n" +
        "Delivering code only — run: npm run test:tickstream-historical-unit for offline tests."
    );
    process.exit(1);
  }

  const client = new Client(apiKey);
  const blockers: string[] = [];

  const report: Report = {
    generatedAt: new Date().toISOString(),
    currentPriceCheck: await checkCurrentPrice(client),
    step1_probe: {
      result: "SKIP",
      symbol: MNQ,
      start: PROBE_START,
      end: PROBE_END,
      tickCount: 0,
      evidence: "",
    },
    step2_week: {
      result: "SKIP",
      start: WEEK_START,
      end: WEEK_END,
      tickCount: 0,
      range: { firstTs: null, lastTs: null },
      stats: {},
      evidence: "",
    },
    step3_aggregate1m: {
      result: "SKIP",
      candleCount: 0,
      firstCandle: null,
      lastCandle: null,
      evidence: "",
    },
    step5_htf: {
      result: "SKIP",
      counts: {},
      monthly: {
        result: "STOP",
        reason:
          "No established monthly session boundary in lib/ — daily uses 6 PM ET CME open, weekly uses Sunday 6 PM ET (cmeWeekSundayKey). Monthly calendar decision required before implementation.",
      },
      evidence: "",
    },
    step6_storage: { path: POC_REPORT, result: "SKIP" },
    step7_realtimeVsDelayed: {
      welcomePlan: null,
      determination: "",
      evidence: [],
    },
    blockers,
  };

  // Verify MNQ in symbol catalog
  try {
    const symbolsResp = (await client.symbols()) as {
      symbols?: Array<{ symbol: string; exchange?: string; name?: string }>;
      futures?: Array<{ symbol: string; exchange?: string; name?: string }>;
    };
    const syms =
      symbolsResp.symbols ??
      symbolsResp.futures ??
      (Array.isArray(symbolsResp) ? symbolsResp : []);
    const mnqEntry = syms.find((s) => s.symbol === MNQ);
    if (!mnqEntry) {
      report.step1_probe.result = "STOP";
      report.step1_probe.error = `MNQ not found in /symbols catalog (${syms.length} symbols returned)`;
      report.blockers.push("MNQ not listed in symbol catalog — historical MNQ may not be supported");
      printReport(report);
      process.exit(1);
    }
    report.step1_probe.evidence = `MNQ listed: ${mnqEntry.name ?? MNQ} exchange=${mnqEntry.exchange ?? "CME"}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    report.blockers.push(`Symbol catalog check failed: ${msg}`);
  }

  // Step 1 — smallest practical probe
  let weekTicks: NormalizedTick[] = [];
  try {
    const probe = await fetchHistoricalTicks({
      apiKey,
      symbol: MNQ,
      start: PROBE_START,
      end: PROBE_END,
      limit: 10_000,
      exchange: "CME",
    });

    report.step1_probe.tickCount = probe.ticks.length;
    report.step1_probe.symbol = probe.symbolQueried;
    report.step1_probe.sampleTick = probe.ticks[0] ?? undefined;

    if (probe.ticks.length === 0) {
      report.step1_probe.result = "FAIL";
      report.step1_probe.error = "Zero ticks returned for probe window";
      report.blockers.push("Step 1 probe returned no ticks — check entitlement or date range");
      printReport(report);
      process.exit(1);
    }

    const t0 = probe.ticks[0];
    const authOk = probe.lastPage != null;
    const formatOk =
      Number.isFinite(t0.price) &&
      Number.isFinite(t0.size) &&
      Number.isFinite(t0.timestamp) &&
      (t0.side === "buy" || t0.side === "sell" || t0.side === "unknown");

    report.step1_probe.result = authOk && formatOk ? "PASS" : "FAIL";
    report.step1_probe.evidence = [
      report.step1_probe.evidence,
      `auth=PASS endpoint=/history/ticks`,
      `pages=${probe.stats.pages} raw=${probe.stats.rawCount} normalized=${probe.stats.normalizedCount}`,
      `malformed=${probe.stats.malformedCount} dupSkipped=${probe.stats.duplicatesSkipped}`,
      probe.lastPage?.snapshot_until
        ? `snapshot_until=${iso(probe.lastPage.snapshot_until)}`
        : null,
    ]
      .filter(Boolean)
      .join("; ");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    report.step1_probe.result = "STOP";
    report.step1_probe.error = msg;
    if (err instanceof HistoricalApiError) {
      report.blockers.push(`Historical API error ${err.status}: ${msg}`);
      if (err.status === 401 || err.status === 403) {
        report.blockers.push("Auth/entitlement failure — NQ ticks archive plan may be required");
      }
    } else {
      report.blockers.push(msg);
    }
    printReport(report);
    process.exit(1);
  }

  // Step 2 — one week
  try {
    const week = await fetchHistoricalTicks({
      apiKey,
      symbol: MNQ,
      start: WEEK_START,
      end: WEEK_END,
      limit: 50_000,
      exchange: "CME",
      onPage: (page, i) => {
        console.log(
          `[week page ${i}] count=${page.count} truncated=${page.truncated} ticks=${page.ticks.length}`
        );
      },
    });
    weekTicks = week.ticks;
    report.step2_week.tickCount = week.ticks.length;
    report.step2_week.stats = week.stats as unknown as Record<string, unknown>;
    if (week.ticks.length > 0) {
      report.step2_week.range = {
        firstTs: week.ticks[0].timestamp,
        lastTs: week.ticks[week.ticks.length - 1].timestamp,
      };
    }
    report.step2_week.result = week.ticks.length > 0 ? "PASS" : "FAIL";
    report.step2_week.evidence = `pages=${week.stats.pages} dupSkipped=${week.stats.duplicatesSkipped} malformed=${week.stats.malformedCount} outOfOrderFixed=${week.stats.outOfOrderCorrected}`;
    if (week.stats.malformedCount > 0) {
      report.blockers.push(
        `Malformed ticks: ${week.stats.malformedCount} (${week.stats.malformedSamples.join("; ")})`
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    report.step2_week.result = "FAIL";
    report.step2_week.error = msg;
    report.blockers.push(`Week fetch failed: ${msg}`);
    printReport(report);
    process.exit(1);
  }

  // Step 3 — aggregate via shared aggregate.ts
  const tickInputs = weekTicks.map((t) => ({
    price: t.price,
    size: t.size,
    ts: t.timestamp,
    id: `${t.timestamp}:${t.price}:${t.size}:${t.side}`,
  }));
  const bars1m = aggregateTicksTo1m(tickInputs);
  const tradeCounts = tradeCountsFromTicks(weekTicks);

  report.step3_aggregate1m.candleCount = bars1m.length;
  report.step3_aggregate1m.firstCandle = bars1m[0] ?? null;
  report.step3_aggregate1m.lastCandle = bars1m.at(-1) ?? null;
  report.step3_aggregate1m.result = bars1m.length > 0 ? "PASS" : "FAIL";
  report.step3_aggregate1m.evidence = `aggregate.ts MinuteAggregator; tradeCount tracked separately (${tradeCounts.size} minute buckets)`;

  // Step 5 — HTF (skip Monthly)
  if (bars1m.length > 0) {
    const htf = aggregateHtfFrom1m(bars1m, tradeCounts, ["5m", "15m", "1H", "4H", "D", "W"]);
    report.step5_htf.counts = Object.fromEntries(
      Object.entries(htf).map(([k, v]) => [k, v.length])
    );
    report.step5_htf.result = "PASS";
    report.step5_htf.evidence =
      "5m/15m/1H/4H via fixed UTC buckets; D via cmeSessionDateKey (6 PM ET rollover); W via cmeWeekSundayKey";
  }

  // Step 6 — local file storage
  try {
    mkdirSync(POC_DIR, { recursive: true });
    writeFileSync(
      POC_REPORT,
      JSON.stringify(
        {
          report,
          bars1mCount: bars1m.length,
          bars1mSample: bars1m.slice(0, 3),
          tickSample: weekTicks.slice(0, 5),
        },
        null,
        2
      )
    );
    report.step6_storage.result = "PASS";
  } catch (err) {
    report.step6_storage.result = "FAIL";
    report.blockers.push(`Storage write failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Step 7 — realtime vs delayed
  const welcomePlan = await probeWelcomePlan();
  report.step7_realtimeVsDelayed.welcomePlan = welcomePlan;
  report.step7_realtimeVsDelayed.evidence = [
    "Docs/streaming: futures tick frames include exch=CME and are real trade prints (https://tick-stream.xyz/docs/streaming)",
    "Docs/quickstart: free Delayed plan delivers the same ticks 15 minutes behind; Realtime plan is live (https://tick-stream.xyz/docs/quickstart)",
    "Docs/intro: Realtime ticks — every print from the matching engine, in order (https://tick-stream.xyz/docs)",
    welcomePlan ? `WebSocket welcome plan=${welcomePlan}` : "WebSocket welcome plan not captured within 5s",
  ];
  report.step7_realtimeVsDelayed.determination =
    welcomePlan === "delayed"
      ? "Data are genuine CME trade prints (price/size/side/exch) but streaming delivery is 15 min delayed on the Delayed plan — not synthetic/delayed quotes."
      : welcomePlan === "realtime"
        ? "Live CME trade prints with realtime delivery."
        : welcomePlan
          ? `Plan=${welcomePlan}; futures stream real CME prints per docs — delay behavior follows plan tier.`
          : "Futures stream real CME trade prints per docs; plan tier controls delivery delay (15m on Delayed).";

  printReport(report);

  const criticalFail =
    report.step1_probe.result === "FAIL" ||
    report.step1_probe.result === "STOP" ||
    report.step2_week.result === "FAIL" ||
    report.step3_aggregate1m.result === "FAIL";
  process.exit(criticalFail ? 1 : 0);
}

main().catch((err) => {
  console.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
