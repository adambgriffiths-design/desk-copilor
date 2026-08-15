/**
 * Audit probe — live decision freshness (does not change the engine).
 * Run: npx tsx scripts/test-live-decision-freshness.ts
 */
import type { Bar } from "../lib/types";
import {
  LIVE_CONTEXT_PRICE_EPS,
  buildLiveMarketReuseKey,
  createIncrementalMarketEngine,
  decideLiveMarketReuse,
  followUpClockAllowsReuse,
  liveMarketBarFingerprint,
  liveMarketSessionKey,
  resetSharedLiveEngine,
  syncLiveEngineFromFeed,
  type MarketFeed,
} from "../lib/incremental-market-engine";
import {
  assembleDeskMarketIntelligenceFromEngine,
  rememberLiveDeskIntelligenceCache,
  resetLiveDeskIntelligenceCache,
  tryReuseLiveDeskIntelligence,
} from "../lib/market-intelligence";
import { evaluateAnalysisQualityGate, resetQualityGateCache } from "../lib/analysis-quality-gate";
import { loadReplayFixture } from "../lib/research/replay/fixtures";
import { hydrateChartSnapshotFromBars } from "../lib/chart-snapshot";

function bar(time: Date, o: number, h: number, l: number, c: number): Bar {
  return { time, open: o, high: h, low: l, close: c };
}

function pdhFeed(): { feed: MarketFeed; asOf: Date; last: Bar } {
  const prev: Bar[] = [];
  const prev0 = Date.parse("2026-08-11T14:00:00.000Z");
  for (let i = 0; i < 40; i++) {
    const t = new Date(prev0 + i * 60_000);
    const px = 30170 + i * 0.5;
    const high = i === 22 ? 30216 : px + 1.25;
    prev.push(bar(t, px, high, px - 2, px + 0.25));
  }
  const curr: Bar[] = [];
  const curr0 = Date.parse("2026-08-12T13:30:00.000Z");
  for (let i = 0; i < 12; i++) {
    const t = new Date(curr0 + i * 60_000);
    const close = 30208 + i * 0.5;
    curr.push(bar(t, close - 0.25, close + 0.5, close - 1, close));
  }
  const last = curr[curr.length - 1]!;
  last.open = 30213.75;
  last.high = 30214.25;
  last.low = 30213.5;
  last.close = 30214;
  const m1 = [...prev, ...curr];
  const daily = [
    bar(new Date("2026-08-10T00:00:00.000Z"), 30100, 30200, 30050, 30150),
    bar(new Date("2026-08-11T00:00:00.000Z"), 30150, 30216, 30120, 30190),
    bar(new Date("2026-08-12T00:00:00.000Z"), 30190, 30220, 30180, 30214),
  ];
  const m5: Bar[] = [];
  const m15: Bar[] = [];
  for (let i = 0; i < m1.length; i += 5) {
    const slice = m1.slice(i, i + 5);
    m5.push(
      bar(
        slice[0]!.time,
        slice[0]!.open,
        Math.max(...slice.map((b) => b.high)),
        Math.min(...slice.map((b) => b.low)),
        slice.at(-1)!.close
      )
    );
  }
  for (let i = 0; i < m1.length; i += 15) {
    const slice = m1.slice(i, i + 15);
    m15.push(
      bar(
        slice[0]!.time,
        slice[0]!.open,
        Math.max(...slice.map((b) => b.high)),
        Math.min(...slice.map((b) => b.low)),
        slice.at(-1)!.close
      )
    );
  }
  return {
    feed: { symbol: "MNQ1!", daily, m15, m5, m1 },
    asOf: last.time,
    last,
  };
}

function pdhIx(ctx: { structureFacts: { levelInteractions: Array<{ levelId: string; status: string; why?: string }> } }) {
  return ctx.structureFacts.levelInteractions.find((i) => i.levelId === "pdh");
}

function row(label: string, obj: unknown) {
  console.log(`\n--- ${label} ---`);
  console.log(typeof obj === "string" ? obj : JSON.stringify(obj, null, 2));
}

const findings: string[] = [];
function note(s: string) {
  findings.push(s);
  console.log(`  ${s}`);
}

console.log("=== A–G reuse key (fingerprint, no engine) ===");
{
  const { feed, asOf, last } = pdhFeed();
  const a = buildLiveMarketReuseKey(feed, asOf, 30214);
  const same = buildLiveMarketReuseKey(feed, asOf, 30214);
  note(`A same bar + same print → ${decideLiveMarketReuse(a, same).reason} (want hit)`);

  const subTick = buildLiveMarketReuseKey(feed, asOf, 30214 + LIVE_CONTEXT_PRICE_EPS - 0.01);
  note(`B sub-0.25 print → ${decideLiveMarketReuse(a, subTick).reason} (want hit; decision NOT invalidated)`);

  const tick = buildLiveMarketReuseKey(feed, asOf, 30214.25);
  note(`B 1-tick 0.25 → ${decideLiveMarketReuse(a, tick).reason} (want price)`);

  const acrossPdh = buildLiveMarketReuseKey(feed, asOf, 30217);
  note(`C print 30217 vs cached 30214 → ${decideLiveMarketReuse(a, acrossPdh).reason} (want price)`);

  const back = buildLiveMarketReuseKey(feed, asOf, 30215);
  note(`C return 30215 vs cached 30214 → ${decideLiveMarketReuse(a, back).reason} (want price)`);
  note(`C return 30215 vs cached 30217 → ${decideLiveMarketReuse(acrossPdh, back).reason} (want price)`);

  const nextMinute = new Date(last.time.getTime() + 60_000);
  const closed = {
    ...feed,
    m1: [
      ...feed.m1,
      bar(nextMinute, 30215, 30216, 30214, 30215.25),
    ],
  };
  const newBarKey = buildLiveMarketReuseKey(closed, nextMinute, 30215.25);
  note(`D new 1m close → ${decideLiveMarketReuse(a, newBarKey).reason} (want bars)`);

  const formingOhlc = {
    ...feed,
    m1: feed.m1.map((b, i) =>
      i === feed.m1.length - 1 ? { ...b, high: 30217, close: 30215 } : b
    ),
  };
  const formingKey = buildLiveMarketReuseKey(formingOhlc, asOf, 30214);
  note(
    `E forming OHLC high=30217 same last print → ${decideLiveMarketReuse(a, formingKey).reason} (want hit — wick NOT in key)`
  );

  const nyPm = new Date("2026-08-12T17:40:00.000Z");
  const sess = { ...a, sessionKey: liveMarketSessionKey(nyPm) };
  note(`F session NY AM→PM same bars → ${decideLiveMarketReuse(a, sess).reason} (want session)`);

  const htf = {
    ...feed,
    m15: [...feed.m15, bar(asOf, 30210, 30220, 30200, 30214)],
  };
  const htfKey = buildLiveMarketReuseKey(htf, asOf, 30214);
  note(`G extra 15m bar at asOf (count/lastTime) → ${decideLiveMarketReuse(a, htfKey).reason} (want bars)`);

  const htfForming = {
    ...feed,
    m15: feed.m15.map((b, i) =>
      i === feed.m15.length - 1 ? { ...b, high: b.high + 12, close: b.close + 1 } : b
    ),
  };
  const htfFormingKey = buildLiveMarketReuseKey(htfForming, asOf, 30214);
  note(
    `G forming 15m OHLC only → ${decideLiveMarketReuse(a, htfFormingKey).reason} (want hit — HTF forming OHLC NOT in key)`
  );

  const fp = liveMarketBarFingerprint(feed);
  note(`barFingerprint identity (no OHLC): ${fp}`);
  note(`includes last OHLC? ${/\d+\.\d{2}\|\d+\.\d{2}/.test(fp.split("||")[0] || "")}`);
}

console.log("\n=== Concrete PDH wick: 30214 → 30217 → 30215 (applyTick, no full rebuild) ===");
{
  const { feed, asOf } = pdhFeed();
  const engine = createIncrementalMarketEngine();
  const init = engine.initialize({ data: feed, asOf, lastPrice: 30214 });
  const pdh = init.ctx.htfPdArrays.previousDay.high;
  note(`PDH=${pdh} lastClose=${init.ctx.daily.lastClose} fullRebuilds=${engine.stats().fullRebuilds}`);
  note(`init PDH ix: ${JSON.stringify(pdhIx(init.ctx))}`);

  const t217 = engine.applyTick({ price: 30217, time: asOf });
  const last217 = (engine as unknown as { feed: MarketFeed }).feed?.m1?.at(-1);
  note(
    `tick 30217: lastClose=${t217.ctx.daily.lastClose} formingH=${last217?.high} formingC=${last217?.close} PDH=${JSON.stringify(pdhIx(t217.ctx))} fullRebuilds=${engine.stats().fullRebuilds} structureRebuilds=${engine.stats().structureRebuilds} tickUpdates=${engine.stats().tickUpdates}`
  );
  const events217 = t217.events.map((e) => e.kind);
  note(`events at 30217: ${events217.join(",") || "none"}`);

  const t215 = engine.applyTick({ price: 30215, time: asOf });
  const last215 = (engine as unknown as { feed: MarketFeed }).feed?.m1?.at(-1);
  note(
    `tick 30215: lastClose=${t215.ctx.daily.lastClose} formingH=${last215?.high} formingC=${last215?.close} PDH=${JSON.stringify(pdhIx(t215.ctx))} fullRebuilds=${engine.stats().fullRebuilds}`
  );
  note(`events at 30215: ${t215.events.map((e) => e.kind).join(",") || "none"}`);
}

console.log("\n=== Missed wick: 30214 → 30215 only (never saw 30217; Yahoo high stale) ===");
{
  const { feed, asOf } = pdhFeed();
  const engine = createIncrementalMarketEngine();
  engine.initialize({ data: feed, asOf, lastPrice: 30214 });
  const jumped = engine.applyTick({ price: 30215, time: asOf });
  const last = (engine as unknown as { feed: MarketFeed }).feed?.m1?.at(-1);
  note(
    `jump 30215: formingH=${last?.high} formingC=${last?.close} PDH=${JSON.stringify(pdhIx(jumped.ctx))} fullRebuilds=${engine.stats().fullRebuilds}`
  );
}

console.log("\n=== Shared reuse: HIT skips applyTick (wick never recorded) ===");
{
  resetSharedLiveEngine();
  resetLiveDeskIntelligenceCache();
  const { feed, asOf } = pdhFeed();
  const first = syncLiveEngineFromFeed({ data: feed, asOf, lastPrice: 30214 });
  note(`cold: reuse=${first.contextReuse}/${first.contextReuseReason} lastClose=${first.ctx.daily.lastClose}`);
  const wickInYahoo = {
    ...feed,
    m1: feed.m1.map((b, i) =>
      i === feed.m1.length - 1 ? { ...b, high: 30217, close: 30214 } : b
    ),
  };
  const hit = syncLiveEngineFromFeed({ data: wickInYahoo, asOf, lastPrice: 30214 });
  note(
    `Yahoo high=30217 same print 30214: reuse=${hit.contextReuse}/${hit.contextReuseReason} currentDayHigh=${hit.ctx.daily.currentDayHigh} PDH=${JSON.stringify(pdhIx(hit.ctx))}`
  );

  const missPx = syncLiveEngineFromFeed({ data: feed, asOf, lastPrice: 30217 });
  note(
    `print 30217: reuse=${missPx.contextReuse}/${missPx.contextReuseReason} lastClose=${missPx.ctx.daily.lastClose} PDH=${JSON.stringify(pdhIx(missPx.ctx))}`
  );
}

console.log("\n=== Follow-up clock reuses intel without price check ===");
{
  resetSharedLiveEngine();
  resetLiveDeskIntelligenceCache();
  resetQualityGateCache();
  const { feed, asOf } = pdhFeed();
  const snap = syncLiveEngineFromFeed({ data: feed, asOf, lastPrice: 30214 });
  const intel = assembleDeskMarketIntelligenceFromEngine(snap, { chartLastPrice: 30214 });
  const now = new Date();
  const key = buildLiveMarketReuseKey(feed, asOf, 30214);
  key.sessionKey = liveMarketSessionKey(now);
  rememberLiveDeskIntelligenceCache(intel, key, now.getTime());
  const reused = tryReuseLiveDeskIntelligence(now);
  note(`same-minute tryReuse: ${reused === intel ? "SAME object (ignores later 30217 print)" : "null"}`);
  note(
    `followUpClockAllowsReuse same minute: ${followUpClockAllowsReuse(key.sessionKey, now.getTime(), now)}`
  );
  note(
    `followUpClockAllowsReuse +90s: ${followUpClockAllowsReuse(key.sessionKey, now.getTime(), new Date(now.getTime() + 90_000))}`
  );
}

console.log("\n=== Quality-gate cache key vs structure ===");
{
  resetSharedLiveEngine();
  resetLiveDeskIntelligenceCache();
  resetQualityGateCache();
  const { feed, asOf, last } = pdhFeed();
  const a = syncLiveEngineFromFeed({ data: feed, asOf, lastPrice: 30214 });
  const intelA = assembleDeskMarketIntelligenceFromEngine(a, { chartLastPrice: 30214 });
  const gateA = evaluateAnalysisQualityGate(intelA);
  const nextMinute = new Date(last.time.getTime() + 60_000);
  const closed: MarketFeed = {
    ...feed,
    m1: [...feed.m1, bar(nextMinute, 30214, 30217, 30213, 30214)],
  };
  resetSharedLiveEngine();
  const b = syncLiveEngineFromFeed({ data: closed, asOf: nextMinute, lastPrice: 30214 });
  const intelB = assembleDeskMarketIntelligenceFromEngine(b, { chartLastPrice: 30214 });
  const gateB = evaluateAnalysisQualityGate(intelB);
  note(`state_hash A=${intelA.state_hash} B=${intelB.state_hash} same=${intelA.state_hash === intelB.state_hash}`);
  note(
    `gate envelope identity same object=${gateA.decisionEnvelope === gateB.decisionEnvelope} stanceA=${gateA.decisionEnvelope?.stance} stanceB=${gateB.decisionEnvelope?.stance}`
  );
  note(
    `PDH A=${JSON.stringify(pdhIx(intelA.ctx))} PDH B=${JSON.stringify(pdhIx(intelB.ctx))}`
  );
}

console.log("\n=== Quality-gate with Yahoo-hydrated candles (production-like) ===");
{
  resetQualityGateCache();
  const { feed, asOf, last } = pdhFeed();
  const snapA = hydrateChartSnapshotFromBars(null, feed.m1, { lastPrice: 30214 });
  const engA = createIncrementalMarketEngine();
  const a = engA.initialize({ data: feed, asOf, lastPrice: 30214 });
  const intelA = assembleDeskMarketIntelligenceFromEngine(a, {
    chartLastPrice: 30214,
    chartSnapshot: snapA,
  });
  const gateA = evaluateAnalysisQualityGate(intelA);
  const nextMinute = new Date(last.time.getTime() + 60_000);
  const closed: MarketFeed = {
    ...feed,
    m1: [...feed.m1, bar(nextMinute, 30214, 30217, 30213, 30214)],
  };
  const snapB = hydrateChartSnapshotFromBars(null, closed.m1, { lastPrice: 30214 });
  const engB = createIncrementalMarketEngine();
  const b = engB.initialize({ data: closed, asOf: nextMinute, lastPrice: 30214 });
  const intelB = assembleDeskMarketIntelligenceFromEngine(b, {
    chartLastPrice: 30214,
    chartSnapshot: snapB,
  });
  const gateB = evaluateAnalysisQualityGate(intelB);
  note(
    `hydrated hash A=${intelA.state_hash} B=${intelB.state_hash} same=${intelA.state_hash === intelB.state_hash} envelopeSame=${gateA.decisionEnvelope === gateB.decisionEnvelope}`
  );
  resetQualityGateCache();
  const gateA2 = evaluateAnalysisQualityGate(intelA);
  const staleTv = assembleDeskMarketIntelligenceFromEngine(b, {
    chartLastPrice: 30214,
    chartSnapshot: snapA,
  });
  const gateStaleTv = evaluateAnalysisQualityGate(staleTv);
  note(
    `stale TV snapshot (>=20 candles) + new 1m bar, same lastPrice: hashSame=${intelA.state_hash === staleTv.state_hash} envelopeSame=${gateA2.decisionEnvelope === gateStaleTv.decisionEnvelope} PDH_B=${pdhIx(staleTv.ctx)?.status}`
  );
}

console.log("\n=== HTF count change in syncSeries ===");
{
  const { feed, asOf } = pdhFeed();
  const engine = createIncrementalMarketEngine();
  engine.initialize({ data: feed, asOf, lastPrice: 30214 });
  const before = engine.stats().fullRebuilds;
  const extra15: MarketFeed = {
    ...feed,
    m15: [...feed.m15, bar(asOf, 30210, 30240, 30190, 30214)],
  };
  const snap = engine.syncSeries({ data: extra15, asOf, lastPrice: 30214 });
  note(
    `HTF 15m append: fullRebuilds ${before}→${engine.stats().fullRebuilds} events=${snap.events.map((e) => e.label || e.kind).join(",")}`
  );
  const forming15: MarketFeed = {
    ...extra15,
    m15: extra15.m15.map((b, i) =>
      i === extra15.m15.length - 1 ? { ...b, high: b.high + 30 } : b
    ),
  };
  const before2 = engine.stats().fullRebuilds;
  engine.syncSeries({ data: forming15, asOf, lastPrice: 30214 });
  note(
    `HTF 15m forming high+30 same count: fullRebuilds ${before2}→${engine.stats().fullRebuilds} (0 delta means HTF range not rebuilt)`
  );
}

console.log("\n=== Shared syncSeries: price miss is incremental, session miss is initialize ===");
{
  resetSharedLiveEngine();
  const fixture = loadReplayFixture("synthetic-ny-am");
  const last = fixture.m1.at(-1)!;
  const cold = syncLiveEngineFromFeed({ data: fixture, asOf: last.time, lastPrice: last.close });
  note(`fixture cold: ${cold.contextReuseReason}`);
  const hit = syncLiveEngineFromFeed({ data: fixture, asOf: last.time, lastPrice: last.close });
  note(`same: ${hit.contextReuse}/${hit.contextReuseReason}`);
  const px = syncLiveEngineFromFeed({
    data: fixture,
    asOf: last.time,
    lastPrice: last.close + 1.25,
  });
  note(`+1.25: ${px.contextReuse}/${px.contextReuseReason} (engine path=syncSeries/applyTick, not initialize)`);
  const sess = syncLiveEngineFromFeed({
    data: fixture,
    asOf: new Date("2026-08-12T17:40:00.000Z"),
    lastPrice: last.close,
  });
  note(`NY PM clock: ${sess.contextReuse}/${sess.contextReuseReason} (path=initialize)`);
}

console.log("\n=== FINDINGS ===");
for (const f of findings) console.log(`- ${f}`);
row("eps", { LIVE_CONTEXT_PRICE_EPS });
