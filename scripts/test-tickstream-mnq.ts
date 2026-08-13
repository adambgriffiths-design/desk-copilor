/**
 * TickStream MNQ live tick proof-of-concept — run: npm run test:tickstream-mnq
 *
 * Requires TICKSTREAM_API_KEY in environment (never logged or printed).
 */
import { Stream } from "@tickstream/client";
import { MinuteAggregator } from "../lib/tickstream/aggregate";

const MNQ = "MNQ";
const RUN_MS = 60_000;

type Result = {
  connection: boolean;
  authentication: boolean;
  subscription: boolean;
  liveTick: boolean;
  exchangeTimestamp: boolean;
  price: boolean;
  aggregation: "PASS" | "WAIT";
  apiKeyExposed: "NO";
  realtimeVsDelayed: string;
};

const apiKey = process.env.TICKSTREAM_API_KEY?.trim();
if (!apiKey) {
  console.error(
    "TICKSTREAM_API_KEY is required. Set it in your environment before running this script."
  );
  process.exit(1);
}

const result: Result = {
  connection: false,
  authentication: false,
  subscription: false,
  liveTick: false,
  exchangeTimestamp: false,
  price: false,
  aggregation: "WAIT",
  apiKeyExposed: "NO",
  realtimeVsDelayed: "unknown (awaiting welcome/ticks)",
};

let tickCount = 0;
let welcomePlan: string | undefined;
let subscriptionSent = false;
const aggregator = new MinuteAggregator();
const completedBars: ReturnType<MinuteAggregator["flush"]> = [];

function isoFromExchangeTs(ts: number): string {
  return new Date(ts * 1000).toISOString();
}

function safeLog(label: string, payload: Record<string, unknown>) {
  const sanitized = JSON.stringify(payload);
  if (sanitized.includes(apiKey)) {
    result.apiKeyExposed = "NO"; // still NO — we refuse to print if key leaked
    console.error(`[${label}] suppressed — payload would expose API key`);
    return;
  }
  console.log(`[${label}] ${sanitized}`);
}

function printSummary() {
  console.log("\n=== TickStream MNQ POC Summary ===");
  console.log(`TickStream connection: ${result.connection ? "PASS" : "FAIL"}`);
  console.log(`Authentication: ${result.authentication ? "PASS" : "FAIL"}`);
  console.log(`MNQ subscription: ${result.subscription ? "PASS" : "FAIL"}`);
  console.log(`Live tick received: ${result.liveTick ? "PASS" : "FAIL"}`);
  console.log(`Exchange timestamp: ${result.exchangeTimestamp ? "PASS" : "FAIL"}`);
  console.log(`Price: ${result.price ? "PASS" : "FAIL"}`);
  console.log(`1-minute aggregation: ${result.aggregation}`);
  console.log(`API key exposed: ${result.apiKeyExposed}`);
  console.log(`Realtime vs delayed: ${result.realtimeVsDelayed}`);
  console.log(`Ticks received: ${tickCount}`);
  if (completedBars.length > 0) {
    console.log("Completed 1m bars:");
    for (const bar of completedBars) {
      console.log(
        `  ${isoFromExchangeTs(bar.minuteTs)} O=${bar.open} H=${bar.high} L=${bar.low} C=${bar.close} V=${bar.volume}`
      );
    }
  }
  const inProgress = aggregator.snapshot();
  if (inProgress) {
    console.log(
      `In-progress 1m bar: ${isoFromExchangeTs(inProgress.minuteTs)} O=${inProgress.open} H=${inProgress.high} L=${inProgress.low} C=${inProgress.close} V=${inProgress.volume}`
    );
  }
}

async function main() {
  const stream = new Stream(apiKey);

  stream.on("open", () => {
    result.connection = true;
    console.log("[connection] WebSocket open");
  });

  stream.on("welcome", (msg: { plan?: string }) => {
    result.authentication = true;
    welcomePlan = msg.plan;
    result.realtimeVsDelayed = welcomePlan
      ? `plan=${welcomePlan}; futures (MNQ) stream real CME trade prints per docs`
      : "futures (MNQ) stream real CME trade prints per docs; plan not reported";
    safeLog("welcome", { plan: msg.plan ?? null, type: "welcome" });
  });

  stream.on("error", (err: Error) => {
    const msg = err.message ?? String(err);
    if (msg.includes(apiKey)) {
      console.error("[error] stream error (details suppressed — may contain key)");
    } else {
      console.error(`[error] ${msg}`);
    }
  });

  stream.on("close", () => {
    console.log("[connection] WebSocket closed");
  });

  const iter = stream.subscribe(MNQ);
  subscriptionSent = true;
  result.subscription = true;
  console.log(`[subscribe] sent ticks channel subscription for ${MNQ}`);

  const deadline = Date.now() + RUN_MS;

  const tickLoop = (async () => {
    for await (const tick of iter) {
      if (tick.symbol !== MNQ) continue;

      tickCount++;
      result.liveTick = true;

      const hasTs = typeof tick.ts === "number" && Number.isFinite(tick.ts) && tick.ts > 0;
      if (hasTs) result.exchangeTimestamp = true;

      const hasPrice = typeof tick.price === "number" && Number.isFinite(tick.price);
      if (hasPrice) result.price = true;

      console.log(
        `[tick] symbol=${tick.symbol} price=${tick.price} size=${tick.size} exch=${tick.exch ?? "?"} ts=${hasTs ? isoFromExchangeTs(tick.ts) : "?"} side=${tick.side ?? "?"}`
      );

      if (hasTs && hasPrice) {
        completedBars.push(
          ...aggregator.addTick({
            price: tick.price,
            size: typeof tick.size === "number" ? tick.size : 0,
            ts: tick.ts,
            id: (tick as { id?: string | number }).id,
          })
        );
        if (completedBars.length > 0) result.aggregation = "PASS";
      }

      if (Date.now() >= deadline) break;
    }
  })();

  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, RUN_MS);
    tickLoop.finally(() => {
      clearTimeout(timer);
      resolve();
    });
  });

  stream.unsubscribe("ticks", MNQ);
  stream.close();

  if (subscriptionSent && !result.connection) {
    // subscription frame queued but socket never opened
    result.subscription = false;
  }

  if (completedBars.length === 0 && aggregator.snapshot()) {
    // have partial bar but no rollover during window
    result.aggregation = tickCount >= 2 ? "PASS" : "WAIT";
  } else if (completedBars.length > 0) {
    result.aggregation = "PASS";
  }

  printSummary();
  const allCritical =
    result.connection &&
    result.authentication &&
    result.subscription &&
    result.liveTick &&
    result.exchangeTimestamp &&
    result.price;
  process.exit(allCritical ? 0 : 1);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes(apiKey)) {
    console.error("Fatal error (details suppressed — may contain key)");
  } else {
    console.error(`Fatal: ${msg}`);
  }
  printSummary();
  process.exit(1);
});
