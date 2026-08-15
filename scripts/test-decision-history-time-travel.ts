/**
 * Decision history / what-changed time-travel regression.
 * Run: npm run test:decision-history-time-travel
 *
 * Uses synthetic-ny-am in-process. No large replay marathon.
 */
import { ReplayDataCutoff } from "../lib/research/replay/cutoff";
import { loadReplayFixture } from "../lib/research/replay/fixtures";
import {
  answerHistoricalDecisionTimeTravel,
  answerLiveDecisionHistoryQuery,
  compareDecisionSnapshots,
  findFixtureBarAtOrBeforeClock,
  lookupHistoricalDecisionAtClock,
  lookupRecordedHistoricalAtClock,
  lookupRecordedHistoricalStrictlyBefore,
} from "../lib/decision-time-travel";
import {
  extractClockTimes,
  parseDecisionHistoryQuery,
} from "../lib/decision-history-query";
import {
  clearDecisionEnvelopeHistory,
  getDecisionEnvelopeHistory,
  latestDecisionEnvelope,
  recordDecisionEnvelopeHistory,
} from "../lib/decision-envelope-history";
import {
  getLastPipelineResult,
  replaceLastPipelineResult,
} from "../lib/desk-pipeline";
import {
  cmeSessionDateKeyFromDate,
  formatEst,
} from "../lib/market-data";
import type { DecisionEnvelope } from "../lib/decision-envelope";
import type { Bar } from "../lib/types";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

/** Optional live-context cache helpers — may be thinner in clean shipset. */
type LiveIntelApi = {
  peekLiveDeskIntelligenceCache: () => unknown;
  resetLiveDeskIntelligenceCache: () => void;
};
const liveIntelApi: LiveIntelApi = (() => {
  try {
    const mod = require("../lib/market-intelligence") as Partial<LiveIntelApi>;
    return {
      peekLiveDeskIntelligenceCache:
        typeof mod.peekLiveDeskIntelligenceCache === "function"
          ? mod.peekLiveDeskIntelligenceCache
          : () => null,
      resetLiveDeskIntelligenceCache:
        typeof mod.resetLiveDeskIntelligenceCache === "function"
          ? mod.resetLiveDeskIntelligenceCache
          : () => {},
    };
  } catch {
    return {
      peekLiveDeskIntelligenceCache: () => null,
      resetLiveDeskIntelligenceCache: () => {},
    };
  }
})();
const peekLiveDeskIntelligenceCache = liveIntelApi.peekLiveDeskIntelligenceCache;
const resetLiveDeskIntelligenceCache = liveIntelApi.resetLiveDeskIntelligenceCache;

/** Optional — excluded from clean six-feature shipset. */
type HistUi = {
  clearHistoricalFixtureSession: () => void;
  buildHistoricalFixtureIntelligence: (opts: {
    fixtureId: string;
    barIndex: number;
  }) => unknown;
};
const histUi: HistUi = (() => {
  try {
    return require("../lib/research/replay/historical-ui") as HistUi;
  } catch {
    return {
      clearHistoricalFixtureSession: () => {},
      buildHistoricalFixtureIntelligence: () => {
        throw new Error("historical-ui not in shipset");
      },
    };
  }
})();
const clearHistoricalFixtureSession = histUi.clearHistoricalFixtureSession;
const buildHistoricalFixtureIntelligence = histUi.buildHistoricalFixtureIntelligence;
const hasHistoricalUi = (() => {
  try {
    require.resolve("../lib/research/replay/historical-ui");
    return true;
  } catch {
    return false;
  }
})();

let passed = 0;
let failed = 0;

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function clock(raw: string) {
  const [h, m] = raw.split(":").map(Number);
  return { hour: h!, minute: m!, raw };
}

function main() {
  console.log("\n=== Decision history / what-changed (synthetic-ny-am) ===\n");
  clearDecisionEnvelopeHistory();
  clearHistoricalFixtureSession();
  resetLiveDeskIntelligenceCache();
  replaceLastPipelineResult(null);

  const fixture = loadReplayFixture("synthetic-ny-am");
  assert("fixture loaded", fixture.m1.length >= 70, `m1=${fixture.m1.length}`);

  console.log("\n0. query parse");
  {
    const at = parseDecisionHistoryQuery("What was your decision at 09:31?");
    assert("parse at_time", at.kind === "at_time" && at.time?.raw === "09:31");
    const since = parseDecisionHistoryQuery("What changed since 09:31?");
    assert("parse since", since.kind === "since" && since.time?.raw === "09:31");
    const between = parseDecisionHistoryQuery(
      "What was different between 09:31 and 09:41?"
    );
    assert(
      "parse between",
      between.kind === "between" &&
        between.from?.raw === "09:31" &&
        between.to?.raw === "09:41"
    );
    const why = parseDecisionHistoryQuery("Why did your decision change since 09:31?");
    assert("parse why_changed", why.kind === "why_changed" && why.time?.raw === "09:31");
    assert("extract clocks", extractClockTimes("at 8:31 and 8:41").length === 2);
  }

  console.log("\n1. exact timestamp");
  {
    const hit = findFixtureBarAtOrBeforeClock(fixture, clock("09:31"));
    assert("bar at 09:31 exists", !!hit && hit.match === "exact" && hit.barIndex === 1);
    const liveBefore = peekLiveDeskIntelligenceCache();
    const pipeBefore = getLastPipelineResult();
    const lookup = lookupHistoricalDecisionAtClock(clock("09:31"), {
      fixtureId: "synthetic-ny-am",
    });
    assert("exact lookup ok", lookup.ok === true);
    if (lookup.ok) {
      assert("exact match flag", lookup.match === "exact");
      assert("exact asOf", lookup.asOf === fixture.m1[1]!.time.toISOString());
      assert("exact requested clock", lookup.requestedClock === "09:31");
      assert("exact has stance", typeof lookup.envelope.stance === "string");
      assert("exact has evidence", typeof lookup.evidence === "string");
      assert("exact has thesis", !!lookup.envelope.thesis);
      assert("exact has conflicts", !!lookup.envelope.conflictLog);
      assert("exact has invalidation", !!lookup.envelope.invalidation);
      assert("exact market snapshot", lookup.marketState.price != null);
      assert(
        "exact decisionKey",
        typeof lookup.decisionKey === "string" &&
          lookup.decisionKey.includes("synthetic-ny-am@1")
      );
    }
    assert("live cache untouched (exact)", peekLiveDeskIntelligenceCache() === liveBefore);
    assert("live pipeline untouched (exact)", getLastPipelineResult() === pipeBefore);
  }

  console.log("\n2. nearest previous decision");
  {
    // Continuous fixture has an exact 09:32 bar — verify exact first.
    const exactHit = findFixtureBarAtOrBeforeClock(fixture, clock("09:32"));
    assert(
      "09:32 exact bar exists",
      !!exactHit && exactHit.match === "exact" && exactHit.barIndex === 2
    );
    // Remove 09:32 bar so 09:32 resolves to nearest previous (09:31).
    const sparse = {
      ...fixture,
      m1: fixture.m1.filter((_, i) => i !== 2),
    };
    const hit = findFixtureBarAtOrBeforeClock(sparse, clock("09:32"));
    assert(
      "nearest previous finds 09:31 bar",
      !!hit && hit.match === "nearest_previous" && hit.barIndex === 1
    );
    const lookup = lookupHistoricalDecisionAtClock(
      clock("09:32"),
      { fixtureId: "synthetic-ny-am" },
      { fixtureData: sparse }
    );
    assert("nearest lookup ok", lookup.ok === true);
    if (lookup.ok) {
      assert("nearest match flag", lookup.match === "nearest_previous");
      assert(
        "nearest asOf is 09:31 bar",
        lookup.asOf === fixture.m1[1]!.time.toISOString()
      );
    }
  }

  console.log("\n3. no decision available");
  {
    const hit = findFixtureBarAtOrBeforeClock(fixture, clock("08:31"));
    assert("08:31 has no bar", hit == null);
    const lookup = lookupHistoricalDecisionAtClock(clock("08:31"), {
      fixtureId: "synthetic-ny-am",
    });
    assert("08:31 missing", lookup.ok === false);
    if (!lookup.ok) {
      assert("missing reason", lookup.reason === "no_decision_available");
      assert("missing mentions clock", lookup.detail.includes("08:31"));
    }
    const answered = answerHistoricalDecisionTimeTravel(
      "What was your decision at 08:31?",
      { fixtureId: "synthetic-ny-am", barIndex: 50 }
    );
    assert("missing reply present", !!answered?.reply);
    assert(
      "missing reply says no decision recorded",
      /no decision was recorded at 08:31/i.test(answered?.reply || "")
    );
    assert("missing labeled HISTORICAL", /HISTORICAL/i.test(answered?.reply || ""));
  }

  console.log("\n4. decision changed");
  {
    const a = lookupHistoricalDecisionAtClock(clock("09:31"), {
      fixtureId: "synthetic-ny-am",
    });
    const b = lookupHistoricalDecisionAtClock(clock("10:20"), {
      fixtureId: "synthetic-ny-am",
    });
    assert("changed pair ok", !!(a.ok && b.ok));
    if (a.ok && b.ok) {
      const cmp = compareDecisionSnapshots(a, b, "HISTORICAL");
      assert("decision changed YES", cmp.decisionChanged === true);
      assert(
        "has market state section",
        cmp.formatted.includes("1. WHAT CHANGED IN MARKET STATE")
      );
      assert(
        "has interpretation section",
        cmp.formatted.includes("2. WHAT CHANGED IN INTERPRETATION")
      );
      assert(
        "has decision section",
        cmp.formatted.includes("3. WHAT CHANGED IN DECISION")
      );
      assert("has decisionChanges", cmp.decisionChanges.length > 0);
      assert(
        "earlier before later",
        new Date(a.asOf).getTime() < new Date(b.asOf).getTime()
      );
    }
    const answered = answerHistoricalDecisionTimeTravel(
      "What was different between 09:31 and 10:20?",
      { fixtureId: "synthetic-ny-am", barIndex: 50 }
    );
    assert("between changed reply", !!answered?.compare?.decisionChanged);
  }

  console.log("\n5. decision unchanged");
  {
    const a = lookupHistoricalDecisionAtClock(clock("09:31"), {
      fixtureId: "synthetic-ny-am",
    });
    const b = lookupHistoricalDecisionAtClock(clock("09:41"), {
      fixtureId: "synthetic-ny-am",
    });
    assert("unchanged pair ok", !!(a.ok && b.ok));
    if (a.ok && b.ok) {
      assert("stance same 09:31→09:41", a.envelope.stance === b.envelope.stance);
      const cmp = compareDecisionSnapshots(a, b, "HISTORICAL");
      assert(
        "stance not listed as changed",
        !cmp.decisionChanges.some((l) => l.startsWith("stance:"))
      );
    }
  }

  console.log("\n6. future-data leakage");
  {
    const earlyAsOf = fixture.m1[11]!.time; // 09:41
    const cutoff = new ReplayDataCutoff(fixture, earlyAsOf);
    cutoff.assertNoFutureLeak();
    assert("baseline assertNoFutureLeak passes", true);

    const futureBar: Bar = {
      ...fixture.m1[80]!,
      time: new Date(earlyAsOf.getTime() + 60_000),
    };

    class LeakyCutoff extends ReplayDataCutoff {
      slicedM1(): Bar[] {
        return [...super.slicedM1(), futureBar];
      }
    }
    const leaky = new LeakyCutoff(fixture, earlyAsOf);
    let threw = false;
    try {
      leaky.assertNoFutureLeak();
    } catch (e) {
      threw = /Future leak/i.test(String(e));
    }
    assert("injected future bar fails assertNoFutureLeak", threw);

    const early = lookupHistoricalDecisionAtClock(clock("09:41"), {
      fixtureId: "synthetic-ny-am",
    });
    assert("early ok", early.ok);
    if (early.ok) {
      const truncated = {
        ...fixture,
        m1: fixture.m1.slice(0, 12),
        m5: fixture.m5.filter((b) => b.time.getTime() <= earlyAsOf.getTime()),
        m15: fixture.m15.filter((b) => b.time.getTime() <= earlyAsOf.getTime()),
      };
      const earlyTrunc = lookupHistoricalDecisionAtClock(
        clock("09:41"),
        { fixtureId: "synthetic-ny-am" },
        { record: false, fixtureData: truncated }
      );
      assert("truncated early ok", earlyTrunc.ok);
      if (earlyTrunc.ok) {
        assert(
          "earlier envelope independent of later bars (stance)",
          early.envelope.stance === earlyTrunc.envelope.stance
        );
        assert("earlier asOf unchanged", early.asOf === earlyTrunc.asOf);
      }
      const sliced = new ReplayDataCutoff(fixture, earlyAsOf).slicedM1();
      assert(
        "no later bar in earlier slice",
        sliced.every((b) => b.time.getTime() <= earlyAsOf.getTime()) &&
          !sliced.some((b) => b.time.getTime() === fixture.m1[50]!.time.getTime())
      );
    }
  }

  console.log("\n7. LIVE vs HISTORICAL isolation");
  if (!hasHistoricalUi) {
    console.log("  · skip §7 (historical-ui not in shipset)");
  } else {
    clearDecisionEnvelopeHistory();
    const liveCacheBefore = peekLiveDeskIntelligenceCache();
    const pipeBefore = getLastPipelineResult();

    buildHistoricalFixtureIntelligence({
      fixtureId: "synthetic-ny-am",
      barIndex: 50,
    });
    const hist = getDecisionEnvelopeHistory("HISTORICAL");
    const live = getDecisionEnvelopeHistory("LIVE");
    assert("historical ring has entries", hist.length >= 1);
    assert("live ring empty after historical build", live.length === 0);
    assert(
      "historical entries labeled HISTORICAL",
      hist.every((e) => e.lane === "HISTORICAL" || e.dataMode === "HISTORICAL")
    );
    assert("live cache still untouched", peekLiveDeskIntelligenceCache() === liveCacheBefore);
    assert("lastPipeline restored", getLastPipelineResult() === pipeBefore);

    const histEnv = hist[0]!;
    recordDecisionEnvelopeHistory({
      asOf: new Date("2099-01-01T00:00:00.000Z"),
      lane: "LIVE",
      envelope: histEnv.envelope,
      verdict: "LONG",
      stateHash: "LIVE_ONLY_HASH",
      marketState: { ...histEnv.marketState, verdict: "LONG" },
      force: true,
    });
    assert("live ring has entry", getDecisionEnvelopeHistory("LIVE").length === 1);
    assert(
      "historical still only HISTORICAL",
      getDecisionEnvelopeHistory("HISTORICAL").every(
        (e) => e.lane === "HISTORICAL" || e.dataMode === "HISTORICAL"
      )
    );
    const histAnswer = answerHistoricalDecisionTimeTravel(
      "What was your decision at 10:20?",
      { fixtureId: "synthetic-ny-am", barIndex: 50 }
    );
    assert(
      "historical answer never LIVE banner",
      !!histAnswer &&
        /HISTORICAL/i.test(histAnswer.reply) &&
        !/LIVE — CURRENT SESSION HISTORY/.test(histAnswer.reply)
    );
  }

  console.log("\n8. recorded-only vs PIT manufacture");
  {
    clearDecisionEnvelopeHistory();
    clearHistoricalFixtureSession();

    // Seed recorded 09:31 and 10:20 via PIT helper (research path); NL must use ring.
    const at931 = lookupHistoricalDecisionAtClock(clock("09:31"), {
      fixtureId: "synthetic-ny-am",
    });
    const at1020 = lookupHistoricalDecisionAtClock(clock("10:20"), {
      fixtureId: "synthetic-ny-am",
    });
    assert("seed 09:31 ok", at931.ok === true);
    assert("seed 10:20 ok", at1020.ok === true);
    assert(
      "ring has 09:31+10:20",
      getDecisionEnvelopeHistory("HISTORICAL").length >= 2
    );

    // 09:31 at 09:31 → recorded 09:31 decision
    const nl931 = answerHistoricalDecisionTimeTravel(
      "What was your decision at 09:31?",
      { fixtureId: "synthetic-ny-am", barIndex: 50 }
    );
    assert("nl 09:31 ok", !!nl931?.snapshot && nl931.snapshot.ok === true);
    if (nl931?.snapshot?.ok && at931.ok) {
      assert(
        "09:31 returns recorded asOf",
        nl931.snapshot.asOf === at931.asOf
      );
      assert(
        "09:31 returns recorded stance",
        nl931.snapshot.envelope.stance === at931.envelope.stance
      );
      assert(
        "09:31 returns recorded status",
        nl931.snapshot.status === at931.status
      );
      assert("09:31 fromStore", nl931.snapshot.fromStore === true);
      // Verdict + original why from recorded envelope (no LLM rewrite / PIT rebuild).
      const frozenWhat = String(at931.envelope.thesis?.what || "").trim();
      const frozenWhy = String(at931.envelope.thesis?.whyNow || "").trim();
      const reasonLine = `Reason/thesis: ${frozenWhat || "—"}`;
      assert(
        "09:31 reply Status from recorded",
        new RegExp(`Status:\\s*${nl931.snapshot.status}`, "i").test(nl931.reply)
      );
      assert(
        "09:31 reply Reason/thesis from recorded",
        nl931.reply.includes(reasonLine)
      );
      assert(
        "09:31 reply Why from recorded whyNow",
        frozenWhy.length > 0 && nl931.reply.includes(`Why: ${frozenWhy}`)
      );
      assert(
        "09:31 reply THESIS whyNow matches recorded",
        frozenWhy.length > 0 &&
          nl931.reply.includes(`whyNow=${frozenWhy}`)
      );
    }

    // 09:30 no record → no-recorded-decision (fixture HAS 09:30 bar; must not invent)
    const nl930 = answerHistoricalDecisionTimeTravel(
      "What was your decision at 09:30?",
      { fixtureId: "synthetic-ny-am", barIndex: 50 }
    );
    assert("nl 09:30 missing", nl930?.snapshot?.ok === false);
    assert(
      "nl 09:30 wording",
      /no decision was recorded at 09:30/i.test(nl930?.reply || "")
    );
    assert(
      "parse last recorded",
      parseDecisionHistoryQuery("What was your last recorded decision?")
        .kind === "last_recorded"
    );
    assert(
      "parse immediately before",
      parseDecisionHistoryQuery(
        "What was your decision immediately before 09:30?"
      ).kind === "immediately_before"
    );

    // later 09:41 does NOT manufacture 09:30
    lookupHistoricalDecisionAtClock(clock("09:41"), {
      fixtureId: "synthetic-ny-am",
    });
    const after941 = answerHistoricalDecisionTimeTravel(
      "What was your decision at 09:30?",
      { fixtureId: "synthetic-ny-am", barIndex: 50 }
    );
    assert(
      "09:41 seed does not manufacture 09:30",
      after941?.snapshot?.ok === false &&
        /no decision was recorded at 09:30/i.test(after941?.reply || "")
    );

    // immediately before 09:30 ≠ at 09:30
    const before930 = answerHistoricalDecisionTimeTravel(
      "What was your decision immediately before 09:30?",
      { fixtureId: "synthetic-ny-am", barIndex: 50 }
    );
    assert(
      "immediately before 09:30 misses (nothing earlier)",
      before930?.snapshot?.ok === false
    );
    const before941 = lookupRecordedHistoricalStrictlyBefore(clock("09:41"), {
      fixtureId: "synthetic-ny-am",
    });
    const at941ring = lookupRecordedHistoricalAtClock(clock("09:41"), {
      fixtureId: "synthetic-ny-am",
    });
    assert("at 09:41 recorded ok", at941ring.ok === true);
    assert("immediately before 09:41 ok", before941.ok === true);
    if (before941.ok && at941ring.ok && at931.ok) {
      assert(
        "immediately before 09:41 is 09:31 not 09:41",
        before941.asOf === at931.asOf && before941.asOf !== at941ring.asOf
      );
    }

    // last recorded → latest ring
    const last = answerHistoricalDecisionTimeTravel(
      "What was your last recorded decision?",
      { fixtureId: "synthetic-ny-am", barIndex: 50 }
    );
    const latest = latestDecisionEnvelope("HISTORICAL", {
      fixtureId: "synthetic-ny-am",
    });
    assert("last recorded ok", !!last?.snapshot && last.snapshot.ok === true);
    assert("latest exists", !!latest);
    if (last?.snapshot?.ok && latest) {
      assert("last = latest asOf", last.snapshot.asOf === latest.asOf);
      assert(
        "last = latest stance",
        last.snapshot.envelope.stance === latest.stance
      );
    }

    // what changed compares recorded 09:31→10:20
    const between = answerHistoricalDecisionTimeTravel(
      "What was different between 09:31 and 10:20?",
      { fixtureId: "synthetic-ny-am", barIndex: 50 }
    );
    assert("between recorded compare", !!between?.compare);
    if (between?.compare && at931.ok && at1020.ok) {
      assert(
        "between earlier from recorded 09:31",
        between.compare.earlier.asOf === at931.asOf &&
          between.compare.earlier.fromStore === true
      );
      assert(
        "between later from recorded 10:20",
        between.compare.later.asOf === at1020.asOf &&
          between.compare.later.fromStore === true
      );
    }

    // future data cannot alter earlier recorded status
    if (at931.ok) {
      const frozenStatus = at931.status;
      const frozenStance = at931.envelope.stance;
      recordDecisionEnvelopeHistory({
        asOf: new Date("2099-12-31T23:59:00.000Z"),
        lane: "HISTORICAL",
        envelope: {
          ...at931.envelope,
          stance: "long",
          thesis: { ...at931.envelope.thesis, what: "FUTURE_POISON" },
        },
        verdict: "LONG",
        stateHash: "FUTURE_POISON_HASH",
        marketState: { verdict: "LONG", price: 99999 },
        fixtureId: "synthetic-ny-am",
        barIndex: 999,
        force: true,
      });
      const reread = lookupRecordedHistoricalAtClock(clock("09:31"), {
        fixtureId: "synthetic-ny-am",
      });
      assert("future entry does not alter 09:31", reread.ok === true);
      if (reread.ok) {
        assert("09:31 status frozen", reread.status === frozenStatus);
        assert("09:31 stance frozen", reread.envelope.stance === frozenStance);
        assert(
          "09:31 thesis not poisoned",
          reread.envelope.thesis.what !== "FUTURE_POISON"
        );
      }
    }

    // LIVE / HISTORICAL isolation
    const liveLen = getDecisionEnvelopeHistory("LIVE").length;
    assert("LIVE empty during HISTORICAL recorded tests", liveLen === 0);
    assert(
      "HISTORICAL answers never LIVE banner",
      !!nl931 &&
        /HISTORICAL/i.test(nl931.reply) &&
        !/LIVE — CURRENT SESSION HISTORY/.test(nl931.reply)
    );
  }

  console.log("\n9. LIVE session-boundary clock lookup");
  {
    const baseEnv = {
      stance: "wait",
      confidence: "medium",
      thesis: {
        what: "t",
        whyNow: "n",
        timeframe: "m1",
        toward: null,
        fromWhere: null,
        invalidates: "x",
        complete: true,
      },
      conflictLog: {
        htfHorizon: "htf",
        htfLean: "neutral",
        tacticalHorizon: "m1",
        tacticalLean: "neutral",
        disagree: false,
        ltfAgainstHtfAllowed: false,
        why: "ok",
        target: null,
        invalidation: null,
      },
      invalidation: { price: "100", condition: "break 100" },
      layers: {
        facts: "fact",
        interpretation: "interp",
        decision: "wait",
        invalidation: "break 100",
      },
      primaryHorizon: {
        id: "primary",
        timeframe: "m1",
        lean: "neutral",
        role: "stance",
        summary: "s",
      },
      htfContext: {
        id: "htf",
        timeframe: "m15",
        lean: "neutral",
        role: "context",
        summary: "h",
      },
      conflictResolution: {
        conflict: false,
        between: "none",
        winner: "neither",
        stance: "wait",
        sentence: "s",
      },
      read: {
        htfContext: { horizon: "htf", lean: "neutral" },
        currentStructure: { horizon: "m1", lean: "neutral" },
        tradeableOpportunity: "none",
        tradeDirection: "NONE",
        target: "",
        invalidation: "",
        overallStance: "wait",
      },
      logicOrder: {
        strategicBias: "a",
        tacticalBias: "b",
        execution: "c",
        invalidation: "d",
      },
      reasoningChain: [],
      citedConcepts: [],
    } as unknown as DecisionEnvelope;

    function liveRec(
      asOf: Date,
      tag: string,
      stance: DecisionEnvelope["stance"] = "wait"
    ) {
      const env = {
        ...baseEnv,
        stance,
        thesis: { ...baseEnv.thesis, what: tag },
        layers: { ...baseEnv.layers, facts: `ev-${tag}` },
      } as DecisionEnvelope;
      return recordDecisionEnvelopeHistory({
        asOf,
        lane: "LIVE",
        envelope: env,
        verdict: String(stance).toUpperCase(),
        stateHash: `H-${tag}`,
        asOfEst: formatEst(asOf),
        marketState: {
          price: 100,
          stateHash: `H-${tag}`,
          snapshotId: `snap-${tag}`,
          verdict: String(stance).toUpperCase(),
        },
        decisionKey: `KEY-${tag}`,
        force: true,
      });
    }

    function ask(q: string) {
      return answerLiveDecisionHistoryQuery(q);
    }

    function isMiss(ans: ReturnType<typeof ask>): boolean {
      const reply = ans?.reply || "";
      return (
        ans?.responseSource === "live_decision_missing" ||
        /No decision was recorded|NO DECISION AVAILABLE|no_decision/i.test(reply)
      );
    }

    function replyHas(ans: ReturnType<typeof ask>, tag: string): boolean {
      return new RegExp(tag, "i").test(ans?.reply || "");
    }

    function assertSameSession(asOfIso: string, refAsOf: Date, label: string) {
      assert(
        label,
        cmeSessionDateKeyFromDate(new Date(asOfIso)) ===
          cmeSessionDateKeyFromDate(refAsOf)
      );
    }

    // 1. Same-day exact HH:MM
    clearDecisionEnvelopeHistory();
    liveRec(new Date("2026-08-15T13:30:00.000Z"), "same-day-0930", "long");
    liveRec(new Date("2026-08-15T14:15:00.000Z"), "same-day-1015", "short");
    {
      const ans = ask("What was your decision at 09:30?");
      assert("1 same-day exact hit", replyHas(ans, "same-day-0930"));
      assert("1 same-day not later row", !replyHas(ans, "same-day-1015"));
      assert("1 same-day source", ans?.responseSource === "live_decision_at_time");
    }

    // 2. Previous session → honest miss (no leak)
    clearDecisionEnvelopeHistory();
    liveRec(new Date("2026-08-14T13:31:00.000Z"), "prior-session-0931", "long");
    liveRec(new Date("2026-08-15T14:00:00.000Z"), "today-1000", "short");
    {
      const ans = ask("What was your decision at 09:31?");
      assert("2 previous-session no leak", !replyHas(ans, "prior-session-0931"));
      assert("2 previous-session honest miss", isMiss(ans));
    }

    // 3. Overnight → RTH: must not return prior RTH
    clearDecisionEnvelopeHistory();
    liveRec(new Date("2026-08-14T13:30:00.000Z"), "prior-rth-0930", "long");
    liveRec(new Date("2026-08-15T01:00:00.000Z"), "overnight-2100", "wait");
    liveRec(new Date("2026-08-15T14:00:00.000Z"), "rth-1000", "short");
    {
      const ans = ask("What was your decision at 09:30?");
      assert("3 overnight→RTH no prior RTH", !replyHas(ans, "prior-rth-0930"));
      assert(
        "3 overnight→RTH miss or same-session only",
        isMiss(ans) || replyHas(ans, "overnight-2100") || replyHas(ans, "rth-1000")
      );
    }

    // 4. RTH → overnight: must not cross to prior RTH
    clearDecisionEnvelopeHistory();
    liveRec(new Date("2026-08-14T13:30:00.000Z"), "rth-day-0930", "long");
    liveRec(new Date("2026-08-15T02:30:00.000Z"), "overnight-2230", "wait");
    {
      const ans = ask("What was your decision at 09:30?");
      assert("4 RTH→overnight no prior RTH", !replyHas(ans, "rth-day-0930"));
      assert("4 RTH→overnight honest miss", isMiss(ans));
    }

    // 5. Weekend
    clearDecisionEnvelopeHistory();
    liveRec(new Date("2026-08-14T13:30:00.000Z"), "friday-0930", "long");
    liveRec(new Date("2026-08-17T14:00:00.000Z"), "monday-1000", "short");
    {
      const ans = ask("What was your decision at 09:30?");
      assert("5 weekend no Friday leak", !replyHas(ans, "friday-0930"));
      assert("5 weekend honest miss", isMiss(ans));
    }

    // 6. Holiday gap
    clearDecisionEnvelopeHistory();
    liveRec(new Date("2026-08-12T13:30:00.000Z"), "pre-holiday-0930", "long");
    liveRec(new Date("2026-08-14T14:00:00.000Z"), "post-holiday-1000", "short");
    {
      const ans = ask("What was your decision at 09:30?");
      assert("6 holiday no pre-gap leak", !replyHas(ans, "pre-holiday-0930"));
      assert("6 holiday honest miss", isMiss(ans));
    }

    // 7. DST transition
    clearDecisionEnvelopeHistory();
    liveRec(new Date("2026-03-06T14:30:00.000Z"), "pre-dst-0930", "long");
    liveRec(new Date("2026-03-09T14:00:00.000Z"), "post-dst-1000", "short");
    {
      const ans = ask("What was your decision at 09:30?");
      assert("7 DST no pre-DST leak", !replyHas(ans, "pre-dst-0930"));
      assert("7 DST honest miss", isMiss(ans));
    }

    // 8. Duplicate HH:MM across days → current session only
    clearDecisionEnvelopeHistory();
    liveRec(new Date("2026-08-14T13:30:00.000Z"), "day1-0930", "long");
    liveRec(new Date("2026-08-15T13:30:00.000Z"), "day2-0930", "short");
    liveRec(new Date("2026-08-15T14:00:00.000Z"), "day2-1000", "wait");
    {
      const ans = ask("What was your decision at 09:30?");
      assert("8 duplicate HH:MM returns day2", replyHas(ans, "day2-0930"));
      assert("8 duplicate HH:MM never day1", !replyHas(ans, "day1-0930"));
      assertSameSession(
        "2026-08-15T13:30:00.000Z",
        new Date("2026-08-15T14:00:00.000Z"),
        "8 returned asOf same CME session as latest"
      );
    }

    // 9. Nearest-previous must not cross sessions
    clearDecisionEnvelopeHistory();
    liveRec(new Date("2026-08-14T13:31:00.000Z"), "nearest-prior-0931", "long");
    liveRec(new Date("2026-08-15T14:00:00.000Z"), "nearest-today-1000", "short");
    {
      const ans = ask("What was your decision at 09:45?");
      assert(
        "9 nearest-previous cross-session blocked",
        !replyHas(ans, "nearest-prior-0931")
      );
      assert("9 nearest-previous honest miss", isMiss(ans));
    }

    // 10. Exact current-session match when present
    clearDecisionEnvelopeHistory();
    liveRec(new Date("2026-08-14T13:30:00.000Z"), "old-session-0930", "long");
    liveRec(new Date("2026-08-15T13:30:00.000Z"), "current-session-0930", "short");
    liveRec(new Date("2026-08-15T14:00:00.000Z"), "current-session-1000", "wait");
    {
      const ans = ask("What was your decision at 09:30?");
      assert(
        "10 exact current-session 09:30",
        replyHas(ans, "current-session-0930")
      );
      assert("10 not old session", !replyHas(ans, "old-session-0930"));
    }

    // 11. LIVE/HISTORICAL isolation remains intact
    clearDecisionEnvelopeHistory();
    clearHistoricalFixtureSession();
    const histSeed = lookupHistoricalDecisionAtClock(clock("09:31"), {
      fixtureId: "synthetic-ny-am",
    });
    assert("11 hist seed ok", histSeed.ok === true);
    liveRec(new Date("2026-08-15T14:00:00.000Z"), "live-isolation-1000", "short");
    {
      const liveAns = ask("What was your decision at 10:00?");
      const histAns = answerHistoricalDecisionTimeTravel(
        "What was your decision at 09:31?",
        { fixtureId: "synthetic-ny-am", barIndex: 50 }
      );
      assert(
        "11 LIVE answer has LIVE banner",
        !!liveAns && /LIVE — CURRENT SESSION HISTORY/.test(liveAns.reply)
      );
      assert(
        "11 HISTORICAL answer never LIVE banner",
        !!histAns &&
          /HISTORICAL/i.test(histAns.reply) &&
          !/LIVE — CURRENT SESSION HISTORY/.test(histAns.reply)
      );
      assert(
        "11 LIVE ring not empty / HISTORICAL not empty",
        getDecisionEnvelopeHistory("LIVE").length >= 1 &&
          getDecisionEnvelopeHistory("HISTORICAL").length >= 1
      );
      assert(
        "11 LIVE ask does not return hist thesis",
        !replyHas(liveAns, histSeed.ok ? histSeed.envelope.thesis.what : "___")
      );
    }

    // 12. Existing historical recorded-only behaviour remains intact
    clearDecisionEnvelopeHistory();
    clearHistoricalFixtureSession();
    const at931 = lookupHistoricalDecisionAtClock(clock("09:31"), {
      fixtureId: "synthetic-ny-am",
    });
    assert("12 seed 09:31", at931.ok === true);
    {
      const nl931 = answerHistoricalDecisionTimeTravel(
        "What was your decision at 09:31?",
        { fixtureId: "synthetic-ny-am", barIndex: 50 }
      );
      const nl930 = answerHistoricalDecisionTimeTravel(
        "What was your decision at 09:30?",
        { fixtureId: "synthetic-ny-am", barIndex: 50 }
      );
      assert("12 recorded 09:31 hit", !!nl931?.snapshot && nl931.snapshot.ok);
      if (nl931?.snapshot?.ok && at931.ok) {
        assert("12 recorded asOf", nl931.snapshot.asOf === at931.asOf);
        assert("12 fromStore", nl931.snapshot.fromStore === true);
      }
      assert(
        "12 missing 09:30 honest miss (no PIT invent)",
        !!nl930 &&
          (!nl930.snapshot || !nl930.snapshot.ok) &&
          /No decision was recorded at 09:30/i.test(nl930.reply)
      );
      assert(
        "12 LIVE empty during historical recorded check",
        getDecisionEnvelopeHistory("LIVE").length === 0
      );
    }

    // Same-session nearest-previous still works (companion to #9)
    clearDecisionEnvelopeHistory();
    liveRec(new Date("2026-08-15T13:30:00.000Z"), "same-sess-0930", "long");
    liveRec(new Date("2026-08-15T14:15:00.000Z"), "same-sess-1015", "short");
    {
      const ans = ask("What was your decision at 09:45?");
      assert(
        "9b same-session nearest-previous keeps 09:30",
        replyHas(ans, "same-sess-0930")
      );
      assert(
        "9b same-session nearest not later 10:15",
        !replyHas(ans, "same-sess-1015")
      );
    }

    // 13. Ring pressure: many prior-session HH:MM rows must not leak into current session
    clearDecisionEnvelopeHistory();
    for (let d = 1; d <= 40; d++) {
      const day = String(d).padStart(2, "0");
      // Prior Globex sessions: Aug days 01–40 mapped via July/Aug synthetic ISO (UTC 13:30 ≈ 09:30 ET)
      const month = d <= 31 ? "07" : "08";
      const dom = d <= 31 ? day : String(d - 31).padStart(2, "0");
      liveRec(
        new Date(`2026-${month}-${dom}T13:30:00.000Z`),
        `prior-pressure-${month}${dom}-0930`,
        "long"
      );
    }
    liveRec(new Date("2026-08-15T14:00:00.000Z"), "pressure-current-1000", "wait");
    {
      const ans = ask("What was your decision at 09:30?");
      assert(
        "13 ring-pressure prior 09:30 not leaked",
        !!ans && !/prior-pressure-/.test(ans.reply)
      );
      assert(
        "13 ring-pressure honest miss (no current 09:30)",
        !!ans &&
          (ans.responseSource === "live_decision_missing" ||
            /No (recorded )?decision/i.test(ans.reply))
      );
      const at10 = ask("What was your decision at 10:00?");
      assert(
        "13 ring-pressure current 10:00 still hits",
        replyHas(at10, "pressure-current-1000")
      );
    }

    // 14. LIVE ring pressure must not contaminate HISTORICAL recorded answers
    clearDecisionEnvelopeHistory();
    clearHistoricalFixtureSession();
    for (let d = 1; d <= 40; d++) {
      const day = String(d).padStart(2, "0");
      const month = d <= 31 ? "07" : "08";
      const dom = d <= 31 ? day : String(d - 31).padStart(2, "0");
      liveRec(
        new Date(`2026-${month}-${dom}T13:31:00.000Z`),
        `live-poison-${month}${dom}-0931`,
        "short"
      );
    }
    const hist14 = lookupHistoricalDecisionAtClock(clock("09:31"), {
      fixtureId: "synthetic-ny-am",
    });
    assert("14 hist seed 09:31", hist14.ok === true);
    {
      const histAns = answerHistoricalDecisionTimeTravel(
        "What was your decision at 09:31?",
        { fixtureId: "synthetic-ny-am", barIndex: 50 }
      );
      assert(
        "14 HISTORICAL under LIVE pressure has HISTORICAL banner",
        !!histAns &&
          /HISTORICAL/i.test(histAns.reply) &&
          !/LIVE — CURRENT SESSION HISTORY/.test(histAns.reply)
      );
      assert(
        "14 HISTORICAL reply never cites LIVE poison tags",
        !!histAns && !/live-poison-/.test(histAns.reply)
      );
      if (hist14.ok) {
        const thesisBit = String(hist14.envelope.thesis?.whyNow || hist14.envelope.thesis?.what || "").trim();
        const statusBit = String(hist14.status || "").trim();
        assert(
          "14 HISTORICAL preserves recorded status/thesis under LIVE pressure",
          !!histAns &&
            ((statusBit.length > 0 && histAns.reply.includes(statusBit)) ||
              (thesisBit.length > 0 && histAns.reply.includes(thesisBit)) ||
              (hist14.decisionKey != null && histAns.reply.includes(String(hist14.decisionKey))))
        );
      }
      const liveMiss = ask("What was your decision at 09:31?");
      assert(
        "14 LIVE ask under pressure does not return HISTORICAL thesis",
        !replyHas(liveMiss, hist14.ok ? hist14.envelope.thesis.what : "___")
      );
    }
  }

  console.log("\n=== Summary ===");
  console.log(`passed=${passed} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main();
