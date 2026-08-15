/**
 * Market-state truth — PDH false-taken, named statuses, PIT, live/replay.
 * Run: npx tsx scripts/test-market-state-truth.ts
 */
import { buildMarketContextAt, formatContextForLiveVerdict } from "../lib/levels";
import {
  aggregateSessionBar,
  cmeSessionDateKeyFromDate,
  getEstDateKey,
} from "../lib/market-data";
import { detectLiquiditySweeps as detectSweeps } from "../lib/structure";
import {
  canProvePdhTaken,
  classifyBidirectionalLevelInteraction,
  classifyLevelInteraction,
  classifyReferenceCloseInteraction,
  formatPdhProvenanceBlock,
  NQ_TICK_SIZE,
} from "../lib/level-interaction";
import { buildMarketObservation, formatObservationNarrative } from "../lib/observation-engine";
import { buildMarketState } from "../lib/market-state-build";
import { buildObservationFacts } from "../lib/observation-facts";
import { buildMarketInterpretation } from "../lib/interpretation-engine";
import { formatIntelligenceForPrompt, type DeskMarketIntelligence } from "../lib/market-intelligence";
import { answerFromIntelligence } from "../lib/conversational-query";
import { createIncrementalMarketEngine } from "../lib/incremental-market-engine";
import { classifyNasdaqRoot, yahooSymbolForRoot } from "../lib/nasdaq-symbol";
import type { Bar } from "../lib/types";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    const msg = detail ? `${name} — ${detail}` : name;
    failures.push(msg);
    console.error(`  ✗ ${msg}`);
  }
}

function bar(iso: string, o: number, h: number, l: number, c: number): Bar {
  return { time: new Date(iso), open: o, high: h, low: l, close: c };
}

/** Synthetic reconstruction of the Aug 14 MNQ class of failure (30,2xx — not 21k placeholder).
 * PDC: Yahoo settlement/calendar close ≠ Globex last-trade close (live 2026-08-13: 30188.50 vs 30216.25).
 */
function falsePdhFixture() {
  const globexPdh = 30280.5;
  const calendarPdh = 30200.0;
  const globexPdc = 30216.25;
  const yahooSettlementPdc = 30188.5;
  const last = 30226.5;
  const m1: Bar[] = [
    bar("2026-08-12T22:30:00.000Z", 30240, globexPdh, 30220, 30250), // Wed 18:30 ET — Globex Thu session high
    bar("2026-08-13T14:00:00.000Z", 30180, calendarPdh, 30150, 30190), // Thu 10:00 ET RTH
    bar("2026-08-13T20:15:00.000Z", 30200, 30210, 30195, 30207.75), // Thu 16:15 ET RTH anchor (not PDC)
    bar("2026-08-13T20:59:00.000Z", 30215.5, 30219.5, 30213.25, globexPdc), // Thu 16:59 ET Globex session close
    bar("2026-08-13T22:30:00.000Z", 30175, 30190, 30170, 30182), // Thu 18:30 ET = Fri Globex open
  ];
  const fridayStart = Date.parse("2026-08-14T11:00:00.000Z");
  for (let i = 0; i < 40; i++) {
    const t = new Date(fridayStart + i * 60_000).toISOString();
    const px = last - (40 - i) * 0.25;
    m1.push(bar(t, px, px + 1, px - 1, last));
  }
  const daily: Bar[] = [
    bar("2026-08-12T20:00:00.000Z", 30100, 30150, 30050, 30120),
    // Yahoo H/L can match Globex while close is settlement — must not become PDC
    bar("2026-08-13T20:00:00.000Z", 30150, calendarPdh, 30140, yahooSettlementPdc),
  ];
  const asOf = new Date("2026-08-14T11:35:00.000Z");
  return { m1, daily, asOf, globexPdh, calendarPdh, globexPdc, yahooSettlementPdc, last };
}

function calendarPrevHigh(daily: Bar[], asOf: Date): number {
  const key = getEstDateKey(asOf);
  const completed = daily.filter((b) => getEstDateKey(b.time) < key);
  return completed.at(-1)!.high;
}

function stateFromCtx(ctx: ReturnType<typeof buildMarketContextAt>, last: number) {
  const t0 = Math.floor(Date.now() / 1000) - 20 * 60;
  const candles = Array.from({ length: 24 }, (_, i) => ({
    t: t0 + i * 60,
    o: last,
    h: last + 1,
    l: last - 1,
    c: last,
  }));
  return buildMarketState({
    ctx,
    chartLastPrice: last,
    chartLastPriceSource: "tradingview_live",
    chartSnapshot: {
      ok: true,
      candles,
      drawings: [],
      source: "research_bars",
      lastPrice: last,
    },
  });
}

console.log("=== 0. reproduce false PDH TAKEN (calendar vs Globex) ===");
{
  const fx = falsePdhFixture();
  const cal = calendarPrevHigh(fx.daily, fx.asOf);
  assert("BEFORE calendar PDH is 30200 (too low)", cal === fx.calendarPdh, `got ${cal}`);
  const calSweeps = detectSweeps(fx.m1, [{ id: "pdh", label: "Previous Day High", price: cal }]);
  assert("BEFORE close > calendar PDH marks sweep", calSweeps.some((s) => s.levelId === "pdh"));

  const ctx = buildMarketContextAt(
    { daily: fx.daily, m15: [], m5: [], m1: fx.m1, symbol: "MNQ=F" },
    fx.asOf,
    undefined,
    fx.last
  );
  assert("AFTER Globex PDH is Wednesday evening high 30280.50", ctx.daily.previousDayHigh === fx.globexPdh, `got ${ctx.daily.previousDayHigh}`);
  assert("pdhSource is cme_session_1m", ctx.daily.pdhSource === "cme_session_1m");
  assert("current session is Friday Globex", ctx.daily.currentDaySessionKey === "2026-08-14");
  assert("previous session is Thursday Globex", ctx.daily.previousDaySessionKey === "2026-08-13");
  assert(
    "PDC is Globex last 1m close not Yahoo settlement",
    ctx.htfPdArrays.previousDay.close === fx.globexPdc,
    `got ${ctx.htfPdArrays.previousDay.close}`
  );
  assert(
    "PDC rejects Yahoo settlement 30188.50",
    ctx.htfPdArrays.previousDay.close !== fx.yahooSettlementPdc,
    `got ${ctx.htfPdArrays.previousDay.close}`
  );
  assert("yahooDailyClose diagnostic retained", ctx.daily.yahooDailyClose === fx.yahooSettlementPdc);
  assert("previousDayClose mirrors Globex PDC", ctx.daily.previousDayClose === fx.globexPdc);
  assert(
    "pdcFormedAt is 16:59 ET source candle",
    ctx.daily.pdcFormedAt === Math.floor(Date.parse("2026-08-13T20:59:00.000Z") / 1000),
    `got ${ctx.daily.pdcFormedAt}`
  );
  assert("no PDH sweep vs true PDH", !ctx.structureFacts.liquiditySweeps.some((s) => s.levelId === "pdh"));
  const pdhIx = ctx.structureFacts.levelInteractions?.find((i) => i.levelId === "pdh");
  assert("named status UNTOUCHED", pdhIx?.status === "UNTOUCHED", `got ${pdhIx?.status}`);

  const state = stateFromCtx(ctx, fx.last);
  const obs = buildMarketObservation(ctx, state);
  const pdh = obs.liquidity.levels.find((l) => l.label === "PDH")!;
  assert("observation taken is not true", pdh.taken !== true, `taken=${pdh.taken}`);
  assert("observation status UNTOUCHED", pdh.status === "UNTOUCHED", `got ${pdh.status}`);
  const facts = buildObservationFacts(ctx, state, obs);
  const pdhFact = facts.find((f) => f.id === "liquidity.pdh");
  assert("fact status is not swept", pdhFact?.status !== "swept", `got ${pdhFact?.status}`);
  const narrative = formatObservationNarrative(obs);
  assert("narrative does not say PDH taken", !/PDH taken/i.test(narrative) && !/previous day high taken/i.test(narrative));
  const pdc = obs.liquidity.levels.find((l) => l.label === "PDC" || l.id === "pdc");
  assert(
    "PDC body close beyond is taken (not a sweep pool)",
    Boolean(pdc && pdc.taken === true && pdc.status === "CLOSED_BEYOND"),
    `pdc taken=${pdc?.taken} status=${pdc?.status}`
  );
  assert(
    "no PDC/PDO/EQ sweep objects",
    !ctx.structureFacts.liquiditySweeps.some((s) => ["pdc", "pdo", "pdeq", "cdo", "cdeq"].includes(s.levelId)),
    ctx.structureFacts.liquiditySweeps.map((s) => s.levelId).join(",")
  );
  assert("no liquidity.sweep.pdh fact", !facts.some((f) => f.id === "liquidity.sweep.pdh" && f.status === "swept"));

  const prove = canProvePdhTaken({
    status: pdh.status!,
    pdhSource: ctx.daily.pdhSource,
    qualifyingTick: pdh.qualifyingTickAt
      ? {
          timestamp: pdh.qualifyingTickAt,
          price: pdh.qualifyingTickPrice ?? pdh.price,
          candleId: pdh.candleId ?? "",
          atLabel: "",
        }
      : undefined,
    dataQuality: obs.data_quality,
  });
  assert("cannot prove PDH taken", prove === false);
  const block = formatPdhProvenanceBlock({
    pdh: pdh.price,
    status: pdh.status!,
    currentPrice: fx.last,
    snapshotId: state.snapshotId,
    snapshotAt: state.updatedAt,
    canProveTaken: prove,
  });
  console.log("\n--- PDH provenance (observed failure class, AFTER fix) ---\n" + block + "\n");
  assert("provenance statement is not 'PDH was taken'", !block.includes("Karen statement:\nPDH was taken\n") || block.includes("not confirmed"));
  assert("provenance uses 30,2xx not 21k placeholder", /302\d{2}/.test(block) && !/21000/.test(block));
  assert("snapshotId present", Boolean(state.snapshotId && state.snapshotId.startsWith("ms_")));
}

console.log("\n=== 1-5 PDH interaction ladder (tick 0.25) ===");
{
  const pdh = 30280.5;
  const asOf = new Date("2026-08-14T11:40:00.000Z");
  const base: Bar[] = [
    bar("2026-08-12T22:30:00.000Z", 30240, pdh, 30220, 30250),
    bar("2026-08-13T21:00:00.000Z", 30170, 30190, 30160, 30180),
  ];
  const daily: Bar[] = [bar("2026-08-13T20:00:00.000Z", 30150, 30200, 30140, 30180)];

  const cases: Array<{ name: string; last: Bar; status: string; taken: boolean | "unknown" }> = [
    {
      name: "1. PDH untouched",
      last: bar("2026-08-14T11:39:00.000Z", 30270, 30271, 30268, 30269.5),
      status: "UNTOUCHED",
      taken: false,
    },
    {
      name: "1b. PDH tested (stop 1 tick below)",
      last: bar("2026-08-14T11:39:00.000Z", 30279, 30280.25, 30278, 30279.5),
      status: "TESTED",
      taken: false,
    },
    {
      name: "2. PDH touched",
      last: bar("2026-08-14T11:39:00.000Z", 30279, 30280.5, 30278, 30279.5),
      status: "TOUCHED",
      taken: false,
    },
    {
      name: "3. PDH breached by one tick (wick, close back)",
      last: bar("2026-08-14T11:39:00.000Z", 30279, 30280.75, 30278, 30279.5),
      status: "BREACHED",
      taken: false,
    },
    {
      name: "4. PDH swept and rejected (wick through, close below) = BREACHED not taken",
      last: bar("2026-08-14T11:39:00.000Z", 30279, 30282, 30278, 30279),
      status: "BREACHED",
      taken: false,
    },
    {
      name: "5. PDH closes above = CLOSED_BEYOND taken",
      last: bar("2026-08-14T11:39:00.000Z", 30280, 30282, 30279.5, 30281),
      status: "CLOSED_BEYOND",
      taken: true,
    },
  ];

  for (const c of cases) {
    const m1 = [...base, c.last];
    const sessionBars = m1.filter((b) => cmeSessionDateKeyFromDate(b.time) === "2026-08-14");
    const ix = classifyLevelInteraction(sessionBars, { id: "pdh", price: pdh }, "high");
    assert(`${c.name} status ${c.status}`, ix.status === c.status, `got ${ix.status}`);
    const ctx = buildMarketContextAt(
      { daily, m15: [], m5: [], m1, symbol: "MNQ=F" },
      asOf,
      undefined,
      c.last.close
    );
    const state = stateFromCtx(ctx, c.last.close);
    const obs = buildMarketObservation(ctx, state);
    const level = obs.liquidity.levels.find((l) => l.label === "PDH")!;
    assert(`${c.name} taken=${c.taken}`, level.taken === c.taken, `got ${level.taken} status=${level.status}`);
    assert(`tick size ${NQ_TICK_SIZE}`, NQ_TICK_SIZE === 0.25);
  }
}

console.log("\n=== 6. PDL equivalents ===");
{
  const pdl = 30100.0;
  const m1: Bar[] = [
    bar("2026-08-12T22:30:00.000Z", 30200, 30210, pdl, 30150),
    bar("2026-08-13T21:00:00.000Z", 30180, 30200, 30140, 30170),
    bar("2026-08-14T11:39:00.000Z", 30120, 30130, 30100.25, 30118),
  ];
  const friday = [bar("2026-08-14T11:39:00.000Z", 30120, 30130, 30100.25, 30118)];
  const ix = classifyLevelInteraction(friday, { id: "pdl", price: pdl }, "low");
  assert("PDL stop 1 tick above is TESTED", ix.status === "TESTED", `got ${ix.status}`);
  const closeThru = [bar("2026-08-14T11:39:00.000Z", 30120, 30122, 30099, 30099.5)];
  const closed = classifyLevelInteraction(closeThru, { id: "pdl", price: pdl }, "low");
  assert("PDL close through is CLOSED_BEYOND", closed.status === "CLOSED_BEYOND", `got ${closed.status}`);
}

console.log("\n=== 7. session boundary (18:00 ET Globex roll) ===");
{
  const before = new Date("2026-08-13T21:59:00.000Z"); // 17:59 ET
  const after = new Date("2026-08-13T22:00:00.000Z"); // 18:00 ET
  assert("17:59 ET session Thu", cmeSessionDateKeyFromDate(before) === "2026-08-13");
  assert("18:00 ET session Fri", cmeSessionDateKeyFromDate(after) === "2026-08-14");
}

console.log("\n=== 8. contract / symbol ===");
{
  assert("MNQU2026 classifies MNQ", classifyNasdaqRoot("MNQU2026") === "MNQ");
  assert("Yahoo root MNQ=F not dated contract", yahooSymbolForRoot("MNQ") === "MNQ=F");
  const fx = falsePdhFixture();
  const ctx = buildMarketContextAt(
    { daily: fx.daily, m15: [], m5: [], m1: fx.m1, symbol: "MNQ=F" },
    fx.asOf,
    undefined,
    fx.last
  );
  assert("ctx.symbol is feed symbol", ctx.symbol === "MNQ=F");
}

console.log("\n=== 9. stale market state ===");
{
  const fx = falsePdhFixture();
  const ctx = buildMarketContextAt(
    { daily: fx.daily, m15: [], m5: [], m1: fx.m1, symbol: "MNQ=F" },
    fx.asOf,
    undefined,
    fx.last
  );
  const state = stateFromCtx(ctx, fx.last);
  state.quality.flag = "stale";
  const obs = buildMarketObservation(ctx, state);
  const pdh = obs.liquidity.levels.find((l) => l.label === "PDH");
  assert("stale → no PDH taken=true", !pdh || pdh.taken !== true);
}

console.log("\n=== 10. future-candle poisoning ===");
{
  const fx = falsePdhFixture();
  const poisoned = {
    ...fx,
    m1: [...fx.m1, bar("2026-08-14T16:00:00.000Z", 30300, 99999, 30300, 30300)],
  };
  const ctx = buildMarketContextAt(
    { daily: poisoned.daily, m15: [], m5: [], m1: poisoned.m1, symbol: "MNQ=F" },
    fx.asOf,
    undefined,
    fx.last
  );
  assert("PIT: future 99999 high excluded from PDH", ctx.daily.previousDayHigh === fx.globexPdh);
  assert("PIT: current day high excludes future", ctx.daily.currentDayHigh < 90000);
  assert("PIT: PDH not taken from future close", !ctx.structureFacts.liquiditySweeps.some((s) => s.levelId === "pdh"));
}

console.log("\n=== 11. live/replay equivalence ===");
{
  const fx = falsePdhFixture();
  const data = { daily: fx.daily, m15: [], m5: [], m1: fx.m1, symbol: "MNQ=F" };
  const replay = buildMarketContextAt(data, fx.asOf, undefined, fx.last);
  const engine = createIncrementalMarketEngine();
  engine.initialize({ data, asOf: fx.asOf, lastPrice: fx.last });
  const live = engine.getContext();
  assert("parity PDH", live.daily.previousDayHigh === replay.daily.previousDayHigh);
  assert("parity PDL", live.daily.previousDayLow === replay.daily.previousDayLow);
  assert("parity last", live.daily.lastClose === replay.daily.lastClose);
  assert("parity pdhSource", live.daily.pdhSource === replay.daily.pdhSource);
}

console.log("\n=== 12. duplicate ticks ===");
{
  const fx = falsePdhFixture();
  const engine = createIncrementalMarketEngine();
  engine.initialize({
    data: { daily: fx.daily, m15: [], m5: [], m1: fx.m1, symbol: "MNQ=F" },
    asOf: fx.asOf,
    lastPrice: fx.last,
  });
  const pdh1 = engine.getContext().daily.previousDayHigh;
  const last = fx.m1.at(-1)!;
  engine.applyClosedBar(last);
  engine.applyClosedBar(last);
  assert("duplicate closed bar does not change PDH", engine.getContext().daily.previousDayHigh === pdh1);
}

console.log("\n=== 13. out-of-order ticks / session aggregate sorts ===");
{
  const unordered: Bar[] = [
    bar("2026-08-13T14:00:00.000Z", 30180, 30200, 30150, 30190),
    bar("2026-08-12T22:30:00.000Z", 30240, 30280.5, 30220, 30250),
  ];
  const agg = aggregateSessionBar(unordered)!;
  assert("session high uses max even if bars unsorted", agg.high === 30280.5);
  assert("session open is earliest bar", agg.open === 30240);
}

console.log("\n=== 14. reconnect / recovery ===");
{
  const fx = falsePdhFixture();
  const data = { daily: fx.daily, m15: [], m5: [], m1: fx.m1, symbol: "MNQ=F" };
  const a = createIncrementalMarketEngine();
  a.initialize({ data, asOf: fx.asOf, lastPrice: fx.last });
  const b = createIncrementalMarketEngine();
  b.initialize({ data, asOf: fx.asOf, lastPrice: fx.last });
  assert("reconnect same PDH", a.getContext().daily.previousDayHigh === b.getContext().daily.previousDayHigh);
  assert("reconnect same snapshot-class last", a.getContext().daily.lastClose === b.getContext().daily.lastClose);
}

console.log("\n=== yahoo fallback must not confidently take PDH ===");
{
  const last = 30226.5;
  const m1: Bar[] = [];
  const fridayStart = Date.parse("2026-08-14T11:00:00.000Z");
  for (let i = 0; i < 40; i++) {
    const t = new Date(fridayStart + i * 60_000).toISOString();
    m1.push(bar(t, last, last + 1, last - 1, last));
  }
  const daily: Bar[] = [bar("2026-08-13T20:00:00.000Z", 30150, 30200, 30140, 30180)];
  const asOf = new Date("2026-08-14T11:35:00.000Z");
  const ctx = buildMarketContextAt({ daily, m15: [], m5: [], m1, symbol: "MNQ=F" }, asOf, undefined, last);
  assert("fallback source when no prior Globex 1m", ctx.daily.pdhSource === "yahoo_daily_fallback");
  const state = stateFromCtx(ctx, last);
  const obs = buildMarketObservation(ctx, state);
  const pdh = obs.liquidity.levels.find((l) => l.label === "PDH")!;
  assert("fallback never taken=true", pdh.taken !== true, `taken=${pdh.taken} status=${pdh.status}`);
}

console.log("\n=== TV vs backend disagreement recorded ===");
{
  const fx = falsePdhFixture();
  const ctx = buildMarketContextAt(
    { daily: fx.daily, m15: [], m5: [], m1: fx.m1, symbol: "MNQ=F" },
    fx.asOf,
    undefined,
    fx.last
  );
  const state = buildMarketState({
    ctx,
    chartLastPrice: 30240,
    chartLastPriceSource: "tradingview_live",
    chartLastPriceTs: fx.asOf.getTime(),
  });
  assert("disagreement flagged when TV last != 1m bar close > 1 tick", state.priceAgreement?.agree === false, `agree=${state.priceAgreement?.agree} diff=${state.priceAgreement?.difference}`);
  assert("snapshot id on state", Boolean(state.snapshotId));
}

console.log("\n=== determinism ===");
{
  const fx = falsePdhFixture();
  const data = { daily: fx.daily, m15: [], m5: [], m1: fx.m1, symbol: "MNQ=F" };
  const a = buildMarketContextAt(data, fx.asOf, undefined, fx.last);
  const b = buildMarketContextAt(data, fx.asOf, undefined, fx.last);
  assert("same OHLC → same PDH", a.daily.previousDayHigh === b.daily.previousDayHigh);
  assert("same OHLC → same PDL", a.daily.previousDayLow === b.daily.previousDayLow);
  assert(
    "same OHLC → same PDH status",
    a.structureFacts.levelInteractions?.find((i) => i.levelId === "pdh")?.status ===
      b.structureFacts.levelInteractions?.find((i) => i.levelId === "pdh")?.status
  );
}

function karenInputClaimsPdhTaken(text: string): boolean {
  for (const line of text.split(/\n/)) {
    if (!/\b(pdh|previous day high)\b/i.test(line)) continue;
    if (/\b(not swept|not confirmed|UNTOUCHED)\b/i.test(line)) continue;
    if (/\b(taken|swept)\b/i.test(line)) return true;
  }
  return false;
}

console.log("\n=== KAREN INPUT must not contain PDH taken (30280.50 / 30226.50) ===");
{
  const fx = falsePdhFixture();
  const ctx = buildMarketContextAt(
    { daily: fx.daily, m15: fx.m1, m5: fx.m1, m1: fx.m1, symbol: "MNQ=F" },
    fx.asOf,
    undefined,
    fx.last
  );
  const state = stateFromCtx(ctx, fx.last);
  const observation = buildMarketObservation(ctx, state);
  const interpretation = buildMarketInterpretation(observation);
  const facts = buildObservationFacts(ctx, state, observation);
  const intel = {
    ctx,
    state,
    observation,
    interpretation,
    facts,
    built_at: ctx.fetchedAt,
    state_hash: state.stateHash,
  } as DeskMarketIntelligence;
  const prompt = formatIntelligenceForPrompt(intel);
  const verdict = formatContextForLiveVerdict(ctx);
  const spoken = answerFromIntelligence(intel, "was PDH taken")?.spoken ?? "";
  assert("intelligence prompt does not claim PDH taken", !karenInputClaimsPdhTaken(prompt), prompt.slice(0, 800));
  assert("live verdict compact does not claim PDH taken", !karenInputClaimsPdhTaken(verdict), verdict.slice(0, 800));
  assert("interpretation does not claim PDH taken", !karenInputClaimsPdhTaken(interpretation.reasoning), interpretation.reasoning.slice(0, 400));
  assert("deterministic spoken is not-swept", /not swept/i.test(spoken) && !/was taken/i.test(spoken), spoken);
}

console.log("\n=== PDC LEVEL PROVENANCE (Globex close ≠ Yahoo settlement) ===");
{
  const fx = falsePdhFixture();
  assert("fixture diverges", fx.globexPdc !== fx.yahooSettlementPdc);
  const ctx = buildMarketContextAt(
    { daily: fx.daily, m15: [], m5: [], m1: fx.m1, symbol: "MNQ=F" },
    fx.asOf,
    undefined,
    fx.last
  );
  assert("Karen PDC = Globex 30216.25", ctx.htfPdArrays.previousDay.close === 30216.25);
  assert("Karen PDC ≠ Yahoo 30188.50", ctx.htfPdArrays.previousDay.close !== 30188.5);
  assert("source cme_session_1m", ctx.daily.pdhSource === "cme_session_1m");
  const state = stateFromCtx(ctx, fx.last);
  assert("market-state pdc is Globex", state.levels.pdc === fx.globexPdc);
  assert("market-state pdcSource cme", state.levels.pdcSource === "cme_session_1m");
  assert("market-state pdcFormedAt set", state.levels.pdcFormedAt === ctx.daily.pdcFormedAt);
  const obs = buildMarketObservation(ctx, state);
  const pdc = obs.liquidity.levels.find((l) => l.id === "pdc")!;
  assert("observation PDC price Globex", pdc.price === fx.globexPdc);
  assert("observation PDC formedAt = close candle", pdc.formedAt === ctx.daily.pdcFormedAt);
  assert("observation PDC source cme", pdc.source === "cme_session_1m");
  const brief = formatContextForLiveVerdict(ctx);
  assert("verdict brief cites Globex PDC", /PDC 30216\.25 \(CME Globex last 1m/i.test(brief), brief.slice(0, 600));
  assert("verdict brief notes Yahoo settlement ignored", /Yahoo settlement 30188\.50 ignored/i.test(brief), brief.slice(0, 800));
}

console.log("\n=== PDC status ladder (30216.25 — interaction not sweep pool) ===");
{
  const pdc = 30216.25;
  const asOf = new Date("2026-08-14T11:40:00.000Z");
  const base: Bar[] = [
    bar("2026-08-13T20:59:00.000Z", 30215.5, 30219.5, 30213.25, pdc),
    bar("2026-08-12T22:30:00.000Z", 30240, 30280.5, 30220, 30250),
  ];
  const daily: Bar[] = [bar("2026-08-13T20:00:00.000Z", 30150, 30200, 30140, 30188.5)];

  const cases: Array<{ name: string; last: Bar; status: string; taken: boolean | "unknown" }> = [
    {
      name: "PDC untouched",
      last: bar("2026-08-14T11:39:00.000Z", 30210, 30212, 30208, 30211),
      status: "UNTOUCHED",
      taken: false,
    },
    {
      name: "PDC wick only (high wick, close below)",
      last: bar("2026-08-14T11:39:00.000Z", 30215, 30217.5, 30214, 30215.5),
      status: "BREACHED",
      taken: false,
    },
    {
      name: "PDC body close above = CLOSED_BEYOND taken",
      last: bar("2026-08-14T11:39:00.000Z", 30216, 30218, 30215, 30217),
      status: "CLOSED_BEYOND",
      taken: true,
    },
    {
      name: "PDC body close below = CLOSED_BEYOND taken",
      last: bar("2026-08-14T11:39:00.000Z", 30216.5, 30216.25, 30214, 30215),
      status: "CLOSED_BEYOND",
      taken: true,
    },
  ];

  for (const c of cases) {
    const m1 = [...base, c.last];
    const sessionBars = m1.filter((b) => cmeSessionDateKeyFromDate(b.time) === "2026-08-14");
    const ix = classifyReferenceCloseInteraction(sessionBars, { id: "pdc", price: pdc });
    assert(`${c.name} status ${c.status}`, ix.status === c.status, `got ${ix.status}`);
    const ctx = buildMarketContextAt(
      { daily, m15: [], m5: [], m1, symbol: "MNQ=F" },
      asOf,
      undefined,
      c.last.close
    );
    const state = stateFromCtx(ctx, c.last.close);
    const obs = buildMarketObservation(ctx, state);
    const level = obs.liquidity.levels.find((l) => l.id === "pdc")!;
    assert(`${c.name} taken=${c.taken}`, level.taken === c.taken, `got ${level.taken} status=${level.status}`);
    assert(`${c.name} no pdc sweep object`, !ctx.structureFacts.liquiditySweeps.some((s) => s.levelId === "pdc"));
  }

  const yahooPrice = 30188.5;
  const closeAtYahoo = bar("2026-08-14T11:39:00.000Z", 30187, 30189, 30186, 30187.5);
  const m1Yahoo = [...base, closeAtYahoo];
  const ixYahoo = classifyBidirectionalLevelInteraction(
    m1Yahoo.filter((b) => cmeSessionDateKeyFromDate(b.time) === "2026-08-14"),
    { id: "pdc", price: yahooPrice }
  );
  assert(
    "Yahoo 30188.50 would show interaction at wrong price",
    ixYahoo.status === "BREACHED" || ixYahoo.status === "CLOSED_BEYOND",
    `got ${ixYahoo.status}`
  );
  const ctxGlobex = buildMarketContextAt(
    { daily, m15: [], m5: [], m1: m1Yahoo, symbol: "MNQ=F" },
    asOf,
    undefined,
    closeAtYahoo.close
  );
  const pdcLevel = buildMarketObservation(ctxGlobex, stateFromCtx(ctxGlobex, closeAtYahoo.close)).liquidity.levels.find(
    (l) => l.id === "pdc"
  )!;
  assert(
    "pipeline PDC price stays Globex 30216.25 not Yahoo",
    pdcLevel.price === pdc && pdcLevel.price !== yahooPrice,
    `got ${pdcLevel.price}`
  );
  assert(
    "Yahoo price does not drive PDC status (close above 30188.5 but below 30216.25)",
    pdcLevel.status === "UNTOUCHED" && pdcLevel.taken === false,
    `status=${pdcLevel.status} taken=${pdcLevel.taken}`
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  console.error(failures.join("\n"));
  process.exit(1);
}
