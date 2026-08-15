/**
 * WEEKEND ANALYSIS PERFORMANCE + QUALITY PASS
 * HISTORICAL / FIXTURE only — synthetic-ny-am, in-process, no next-dev, no live market.
 * Label timings as HISTORICAL_FIXTURE (LIVE_LATENCY_TRACE env ≠ live market).
 */
import fs from "fs";
import path from "path";
import { isGeneralConversation, isNonTradingConversation } from "../lib/casual-chat-intent";
import { isStandaloneGeneralTurn } from "../lib/conversational-intent";
import { validateDecisionEnvelope } from "../lib/decision-envelope";
import {
  clearDecisionEnvelopeHistory,
  getDecisionEnvelopeHistory,
} from "../lib/decision-envelope-history";
import {
  beginLiveLatencyTrace,
  emitLiveLatencyTraceIfEnabled,
  liveLatencyTimingsPayload,
  markLiveLatencyStage,
  snapshotLiveLatencyTrace,
} from "../lib/live-latency-trace";
import { peekLiveDeskIntelligenceCache } from "../lib/market-intelligence";
import { getLastPipelineResult, replaceLastPipelineResult } from "../lib/desk-pipeline";
import { ReplayDataCutoff } from "../lib/research/replay/cutoff";
import { loadReplayFixture } from "../lib/research/replay/fixtures";
import {
  answerHistoricalDecisionTimeTravel,
  compareDecisionSnapshots,
  lookupHistoricalDecisionAtClock,
} from "../lib/decision-time-travel";
import {
  answerHistoricalFixtureTurn,
  clearHistoricalFixtureSession,
  HISTORICAL_FIXTURE_BANNER,
} from "../lib/research/replay/historical-ui";

process.env.LIVE_LATENCY_TRACE = "1";

type Msg = { role: "user" | "assistant"; content: string };

const FIXTURE = { fixtureId: "synthetic-ny-am", barIndex: 50 };
const REPORT = path.join(
  process.cwd(),
  "data",
  "research",
  "karen-weekend-analysis-quality-pass.md"
);

const FABRICATED_TRADE_RE =
  /\b(I took|we took|I entered|I filled|my fill|wins?\/losses?|P&?L|profit(ed)?|loss(es)? taken)\b/i;

function clock(raw: string) {
  const [h, m] = raw.split(":").map(Number);
  return { hour: h!, minute: m!, raw };
}

async function main() {
  const issues: string[] = [];
  const startedAt = new Date().toISOString();

  clearHistoricalFixtureSession();
  clearDecisionEnvelopeHistory();
  replaceLastPipelineResult(null);

  const liveCacheBefore = peekLiveDeskIntelligenceCache();
  const livePipeBefore = getLastPipelineResult();
  const fixture = loadReplayFixture(FIXTURE.fixtureId);
  const asOfBar = fixture.m1[FIXTURE.barIndex]!;
  const asOfIso = asOfBar.time.toISOString();

  // --- 1. Give me the read ---
  const messages: Msg[] = [];
  const t0 = Date.now();
  beginLiveLatencyTrace(`quality-pass-read-${t0}`, {
    requestType: "trading:CURRENT_MARKET_READ",
    dataMode: "HISTORICAL_FIXTURE",
    fixtureId: FIXTURE.fixtureId,
    yahooFetched: false,
    tickstreamUsed: false,
  });
  markLiveLatencyStage("intent_classified");
  messages.push({ role: "user", content: "Give me the read" });
  const read = answerHistoricalFixtureTurn("Give me the read", messages, FIXTURE);
  markLiveLatencyStage("sse_first_visible_token");
  const firstVisibleMs = Date.now() - t0;
  markLiveLatencyStage("final_response");
  const finalMs = Date.now() - t0;
  emitLiveLatencyTraceIfEnabled();
  const latencyPayload = liveLatencyTimingsPayload();
  const latencyTrace = snapshotLiveLatencyTrace();
  messages.push({ role: "assistant", content: read.reply });

  const env = read.envelope;
  const verdict = read.session.pipeline.decision.verdict;
  const decisionKey = read.decisionKey;
  const validationErrors = validateDecisionEnvelope(env);

  if (!/HISTORICAL\s*\/\s*FIXTURE/i.test(read.reply)) {
    issues.push("Primary reply missing HISTORICAL / FIXTURE banner");
  }
  if (read.session.label !== HISTORICAL_FIXTURE_BANNER) {
    issues.push("Session label mismatch");
  }
  if (validationErrors.length) {
    issues.push(`validateDecisionEnvelope: ${validationErrors.join("; ")}`);
  }
  if (env.stance !== "flat" && env.stance !== "wait") {
    // WAIT/FLAT expected at index 50 from prior smoke — flag if unexpected trade stance
    issues.push(`Unexpected stance at index 50: ${env.stance} (expected flat/wait)`);
  }
  if (verdict !== "WAIT" && verdict !== "FLAT") {
    issues.push(`Unexpected verdict at index 50: ${verdict} (expected WAIT/FLAT)`);
  }
  if (FABRICATED_TRADE_RE.test(read.reply)) {
    issues.push("Primary reply appears to fabricate trade execution language");
  }
  if (!String(env.layers.facts || "").trim() || !String(env.layers.interpretation || "").trim()) {
    issues.push("Envelope missing facts or interpretation layer");
  }
  if (String(env.layers.facts) === String(env.layers.interpretation)) {
    issues.push("facts layer identical to interpretation (authority/evidence split broken)");
  }
  if (!env.thesis?.complete) {
    issues.push("thesis.complete is false");
  }

  // --- 2–5 follow-ups ---
  const followUps = [
    "Why?",
    "Why not long?",
    "Why not short?",
    "What are you waiting for?",
  ];
  const followResults = followUps.map((q) => {
    messages.push({ role: "user", content: q });
    const answered = answerHistoricalFixtureTurn(q, messages, FIXTURE, {
      lastVerdict: messages.find((m) => m.role === "assistant")?.content,
    });
    messages.push({ role: "assistant", content: answered.reply });
    const same = answered.decisionKey === decisionKey;
    const hasLabel = /HISTORICAL\s*\/\s*FIXTURE/i.test(answered.reply);
    const hasPrevious = /PREVIOUS DECISION/i.test(answered.reply);
    const fabricated = FABRICATED_TRADE_RE.test(answered.reply);
    if (!same) issues.push(`Follow-up "${q}" changed decisionKey`);
    if (!hasLabel) issues.push(`Follow-up "${q}" missing HISTORICAL label`);
    if (!hasPrevious) issues.push(`Follow-up "${q}" missing PREVIOUS DECISION banner`);
    if (fabricated) issues.push(`Follow-up "${q}" fabricated trade language`);
    return {
      q,
      decisionKey: answered.decisionKey,
      sameDecision: same,
      hasLabel,
      hasPrevious,
      fabricated,
      preview: answered.reply.slice(0, 320),
      responseSource: answered.responseSource,
    };
  });

  // --- 6. decision at earlier timestamp ---
  const earlyClock = "09:41";
  const earlyLookup = lookupHistoricalDecisionAtClock(clock(earlyClock), {
    fixtureId: FIXTURE.fixtureId,
  });
  const earlyAnswer = answerHistoricalDecisionTimeTravel(
    `What was your decision at ${earlyClock}?`,
    FIXTURE
  );
  if (!earlyLookup.ok) {
    issues.push(`Earlier timestamp lookup failed at ${earlyClock}`);
  } else {
    if (new Date(earlyLookup.asOf).getTime() > asOfBar.time.getTime()) {
      issues.push("Earlier lookup asOf is after current fixture bar — future leak");
    }
    if (!/HISTORICAL/i.test(earlyAnswer?.reply || "")) {
      issues.push("Earlier decision reply missing HISTORICAL label");
    }
    if (/LIVE — CURRENT SESSION HISTORY/.test(earlyAnswer?.reply || "")) {
      issues.push("Earlier decision reply used LIVE banner");
    }
  }

  // --- 7. what changed between timestamps ---
  const betweenQ = "What was different between 09:31 and 10:20?";
  const betweenAnswer = answerHistoricalDecisionTimeTravel(betweenQ, FIXTURE);
  const a = lookupHistoricalDecisionAtClock(clock("09:31"), {
    fixtureId: FIXTURE.fixtureId,
  });
  const b = lookupHistoricalDecisionAtClock(clock("10:20"), {
    fixtureId: FIXTURE.fixtureId,
  });
  let whatChanged: {
    ok: boolean;
    decisionChanged?: boolean;
    earlierAsOf?: string;
    laterAsOf?: string;
    preview?: string;
    sections?: { market: boolean; interpretation: boolean; decision: boolean };
  } = { ok: false };
  if (a.ok && b.ok) {
    const cmp = compareDecisionSnapshots(a, b, "HISTORICAL");
    whatChanged = {
      ok: true,
      decisionChanged: cmp.decisionChanged,
      earlierAsOf: a.asOf,
      laterAsOf: b.asOf,
      preview: (betweenAnswer?.reply || cmp.formatted).slice(0, 500),
      sections: {
        market: cmp.formatted.includes("1. WHAT CHANGED IN MARKET STATE"),
        interpretation: cmp.formatted.includes("2. WHAT CHANGED IN INTERPRETATION"),
        decision: cmp.formatted.includes("3. WHAT CHANGED IN DECISION"),
      },
    };
    if (new Date(a.asOf).getTime() >= new Date(b.asOf).getTime()) {
      issues.push("what-changed: earlier asOf not before later");
    }
    if (!whatChanged.sections.market || !whatChanged.sections.decision) {
      issues.push("what-changed missing expected sections");
    }
  } else {
    issues.push("what-changed pair lookup failed (09:31 / 10:20)");
  }
  if (betweenAnswer && FABRICATED_TRADE_RE.test(betweenAnswer.reply)) {
    issues.push("what-changed reply fabricated trade language");
  }

  // --- Future-data leakage ---
  const earlyAsOf = fixture.m1[11]!.time; // 09:41
  const cutoff = new ReplayDataCutoff(fixture, earlyAsOf);
  let futureLeakOk = true;
  try {
    cutoff.assertNoFutureLeak();
  } catch {
    futureLeakOk = false;
    issues.push("ReplayDataCutoff.assertNoFutureLeak failed on clean fixture");
  }
  const sliced = cutoff.slicedM1();
  const laterBarTime = fixture.m1[50]!.time.getTime();
  if (sliced.some((bar) => bar.time.getTime() > earlyAsOf.getTime())) {
    futureLeakOk = false;
    issues.push("Cutoff slice contains bars after asOf");
  }
  if (sliced.some((bar) => bar.time.getTime() === laterBarTime)) {
    futureLeakOk = false;
    issues.push("Early cutoff incorrectly includes index-50 bar");
  }
  // Truncation independence
  let frozenHistoryOk = false;
  if (earlyLookup.ok) {
    const truncated = {
      ...fixture,
      m1: fixture.m1.slice(0, 12),
      m5: fixture.m5.filter((b) => b.time.getTime() <= earlyAsOf.getTime()),
      m15: fixture.m15.filter((b) => b.time.getTime() <= earlyAsOf.getTime()),
    };
    const earlyTrunc = lookupHistoricalDecisionAtClock(
      clock(earlyClock),
      { fixtureId: FIXTURE.fixtureId },
      { record: false, fixtureData: truncated }
    );
    frozenHistoryOk =
      earlyTrunc.ok &&
      earlyTrunc.envelope.stance === earlyLookup.envelope.stance &&
      earlyTrunc.asOf === earlyLookup.asOf;
    if (!frozenHistoryOk) {
      issues.push("Truncated fixture changed earlier decision (frozen history broken)");
    }
  }

  // --- Live isolation ---
  const liveCacheAfter = peekLiveDeskIntelligenceCache();
  const livePipeAfter = getLastPipelineResult();
  const liveIsolation =
    liveCacheAfter === liveCacheBefore && livePipeAfter === livePipeBefore;
  if (!liveIsolation) {
    issues.push("Fixture path mutated live intel cache or lastPipeline");
  }
  const histRing = getDecisionEnvelopeHistory("HISTORICAL");
  const liveRing = getDecisionEnvelopeHistory("LIVE");
  if (liveRing.length > 0) {
    issues.push("LIVE DecisionEnvelope history non-empty after fixture-only run");
  }
  if (
    histRing.length > 0 &&
    !histRing.every((e) => e.lane === "HISTORICAL" || e.dataMode === "HISTORICAL")
  ) {
    issues.push("HISTORICAL ring contains non-HISTORICAL entries");
  }

  // Trace must not claim live feeds
  const yahooOrTick =
    (latencyTrace as { yahooFetched?: boolean } | null)?.yahooFetched === true ||
    (latencyTrace as { tickstreamUsed?: boolean } | null)?.tickstreamUsed === true;
  if (yahooOrTick) issues.push("LIVE_LATENCY_TRACE marked yahoo/tickstream used");
  const dataMode = (latencyTrace as { dataMode?: string } | null)?.dataMode;
  if (dataMode && dataMode !== "HISTORICAL_FIXTURE") {
    issues.push(`Latency trace dataMode=${dataMode} (expected HISTORICAL_FIXTURE)`);
  }

  // --- General routing (outside market pipeline) ---
  const generals = [
    "what's the capital of Germany?",
    "tell me a joke",
  ];
  const generalChecks = generals.map((q) => {
    const bypass =
      isGeneralConversation(q) ||
      isStandaloneGeneralTurn(q) ||
      isNonTradingConversation(q);
    if (!bypass) issues.push(`General question not off-market: ${q}`);
    return { q, bypass };
  });

  const pass = issues.length === 0;
  const stance = env.stance;
  const thesisWhat = env.thesis?.what ?? "";
  const factsLen = String(env.layers.facts || "").length;
  const interpLen = String(env.layers.interpretation || "").length;
  const primaryHasBanner = /HISTORICAL\s*\/\s*FIXTURE/i.test(read.reply);
  const mentorMatchesStance = /FLAT|WAIT|flat|wait/i.test(read.reply);
  const earlyHasHistorical = !!(earlyAnswer && /HISTORICAL/i.test(earlyAnswer.reply));
  const earlyNoLiveBanner = !!(
    earlyAnswer && !/LIVE — CURRENT SESSION HISTORY/.test(earlyAnswer.reply)
  );
  const earlyAsOfOk =
    earlyLookup.ok && new Date(earlyLookup.asOf).getTime() <= asOfBar.time.getTime();
  const whatChangedOrderOk = !!(
    whatChanged.ok &&
    whatChanged.earlierAsOf &&
    whatChanged.laterAsOf &&
    new Date(whatChanged.earlierAsOf) < new Date(whatChanged.laterAsOf)
  );
  const whatChangedSectionsOk = !!(
    whatChanged.sections?.market &&
    whatChanged.sections?.interpretation &&
    whatChanged.sections?.decision
  );
  const histLaneOk = histRing.every(
    (e) => e.lane === "HISTORICAL" || e.dataMode === "HISTORICAL"
  );

  const md = `# KAREN — Weekend analysis quality pass

**Date:** ${startedAt}
**Mode:** HISTORICAL / FIXTURE — NOT LIVE MARKET DATA
**Path:** in-process \`answerHistoricalFixtureTurn\` / \`buildKarenReplayResponse\` / DecisionEnvelope (no next-dev)
**Fixture:** \`${FIXTURE.fixtureId}\` @ barIndex **${FIXTURE.barIndex}** (\`asOf\` ${asOfIso})
**LIVE_LATENCY_TRACE label:** dataMode=\`HISTORICAL_FIXTURE\` (env flag only — **not** live market)
**Verdict:** **${pass ? "PASS" : "FAIL"}**

---

## ANALYSIS QUALITY

| Check | Result | Detail |
|-------|--------|--------|
| Envelope authority | ${validationErrors.length ? "FAIL" : "PASS"} | \`validateDecisionEnvelope\` errors=${validationErrors.length}; source=pipeline DecisionEnvelope |
| Stance | ${stance === "flat" || stance === "wait" ? "PASS" : "WARN"} | stance=\`${stance}\` verdict=\`${verdict}\` |
| Thesis | ${env.thesis?.complete ? "PASS" : "FAIL"} | what=\`${thesisWhat}\`; complete=${env.thesis?.complete} |
| Evidence vs interpretation | ${factsLen && interpLen && factsLen !== interpLen ? "PASS" : "FAIL"} | facts=${factsLen} chars; interpretation=${interpLen} chars |
| WAIT/FLAT | ${verdict === "WAIT" || verdict === "FLAT" || stance === "flat" || stance === "wait" ? "PASS" : "FAIL"} | No forced long/short at index 50 |
| Mentor matches envelope | ${mentorMatchesStance ? "PASS" : "WARN"} | reply cites flat/wait stance |
| HISTORICAL banner | ${primaryHasBanner ? "PASS" : "FAIL"} | \`${HISTORICAL_FIXTURE_BANNER}\` |

Primary reply preview:
\`\`\`
${read.reply.slice(0, 450)}
\`\`\`

Envelope snapshot:
\`\`\`json
${JSON.stringify(
  {
    stance: env.stance,
    confidence: env.confidence,
    verdict,
    thesis: env.thesis,
    conflictLog: env.conflictLog,
    invalidation: env.invalidation,
    decisionKey,
    asOf: asOfIso,
  },
  null,
  2
)}
\`\`\`

---

## HISTORICAL DECISION RETRIEVAL

| Query | Result | Detail |
|-------|--------|--------|
| Decision at ${earlyClock} | ${earlyLookup.ok ? "PASS" : "FAIL"} | ${
    earlyLookup.ok
      ? `match=${earlyLookup.match}; asOf=${earlyLookup.asOf}; stance=${earlyLookup.envelope.stance}; key=${earlyLookup.decisionKey}`
      : "lookup failed"
  } |
| Reply labeled HISTORICAL | ${earlyHasHistorical ? "PASS" : "FAIL"} | LIVE banner absent: ${earlyNoLiveBanner ? "yes" : "NO"} |
| Earlier asOf ≤ current | ${earlyAsOfOk ? "PASS" : "FAIL"} | current asOf=${asOfIso} |

Earlier reply preview:
\`\`\`
${(earlyAnswer?.reply || "").slice(0, 400)}
\`\`\`

---

## WHAT-CHANGED

| Check | Result | Detail |
|-------|--------|--------|
| Between 09:31 and 10:20 | ${whatChanged.ok ? "PASS" : "FAIL"} | decisionChanged=${whatChanged.decisionChanged} |
| Temporal order | ${whatChangedOrderOk ? "PASS" : "FAIL"} | ${whatChanged.earlierAsOf} → ${whatChanged.laterAsOf} |
| Sections (state / interpretation / decision) | ${whatChangedSectionsOk ? "PASS" : "FAIL"} | market=${whatChanged.sections?.market}; interp=${whatChanged.sections?.interpretation}; decision=${whatChanged.sections?.decision} |

Preview:
\`\`\`
${whatChanged.preview || "(none)"}
\`\`\`

---

## FOLLOW-UP CONSISTENCY

| Question | Same decisionKey | HISTORICAL | PREVIOUS DECISION | Fabricated trade |
|----------|------------------|------------|-------------------|------------------|
${followResults
  .map(
    (r) =>
      `| ${r.q} | ${r.sameDecision ? "yes" : "NO"} | ${r.hasLabel ? "yes" : "NO"} | ${
        r.hasPrevious ? "yes" : "NO"
      } | ${r.fabricated ? "YES (bad)" : "no"} |`
  )
  .join("\n")}

Primary decisionKey: \`${decisionKey}\`

### Follow-up previews
${followResults.map((r) => `#### ${r.q}\n\`\`\`\n${r.preview}\n\`\`\``).join("\n\n")}

---

## FUTURE-DATA LEAKAGE

| Check | Result |
|-------|--------|
| \`assertNoFutureLeak\` on early cutoff | ${futureLeakOk ? "PASS" : "FAIL"} |
| Early slice excludes later bars (incl. index 50) | ${futureLeakOk ? "PASS" : "FAIL"} |
| Truncated fixture → same early stance/asOf | ${frozenHistoryOk ? "PASS" : "FAIL"} |

---

## TRADE-HISTORY INTEGRITY

| Check | Result | Detail |
|-------|--------|--------|
| No fabricated fills/P&L in read | ${FABRICATED_TRADE_RE.test(read.reply) ? "FAIL" : "PASS"} | Pattern scan on primary reply |
| No fabricated fills in follow-ups | ${followResults.some((r) => r.fabricated) ? "FAIL" : "PASS"} | Pattern scan |
| WAIT/FLAT (no invented trade) | ${verdict === "WAIT" || verdict === "FLAT" || stance === "flat" ? "PASS" : "WARN"} | stance=${stance} verdict=${verdict} |
| Fixture never enters live state | ${liveIsolation && liveRing.length === 0 ? "PASS" : "FAIL"} | live cache unchanged; LIVE history ring empty |
| HISTORICAL history lane only | ${histLaneOk ? "PASS" : "FAIL"} | hist entries=${histRing.length}; live entries=${liveRing.length} |

---

## GENERAL ROUTING

| Question | Off market pipeline | Result |
|----------|---------------------|--------|
${generalChecks
  .map((g) => `| ${g.q} | ${g.bypass ? "yes" : "NO"} | ${g.bypass ? "PASS" : "FAIL"} |`)
  .join("\n")}

Intent-level bypass only (no LLM call in this pass). Capital of Germany / joke must not hit DecisionEnvelope / fixture build.

---

## FIXTURE LATENCY

Timings are **CPU / in-process fixture path**, labeled \`HISTORICAL_FIXTURE\` via LIVE_LATENCY_TRACE. **Not live-market TTFT.**

| Stage | ms |
|-------|-----|
| First visible (read) | **${firstVisibleMs}** |
| Final response (read) | **${finalMs}** |
| Yahoo fetched | **false** |
| Tickstream used | **false** |
| dataMode | \`${dataMode ?? "HISTORICAL_FIXTURE"}\` |

\`liveLatencyTimingsPayload\` (sanitized):
\`\`\`json
${JSON.stringify(latencyPayload, null, 2)}
\`\`\`

---

## ISSUES

${issues.length ? issues.map((e) => `- ${e}`).join("\n") : "- none"}

---

## SINGLE NEXT ACTION

${
  pass
    ? "No code change required from this pass — keep weekend work on HISTORICAL/FIXTURE DecisionEnvelope paths; defer any live latency work until markets reopen."
    : "Fix the first FAIL in ISSUES above on the historical fixture path only (do not touch live/ICT/envelope core unless the fail proves a fixture-adapter bug)."
}

---

## Final

**${pass ? "PASS" : "FAIL"}** — WEEKEND ANALYSIS PERFORMANCE + QUALITY PASS complete. STOP.
`;

  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, md, "utf8");
  console.log(md);
  console.log(`\nWrote ${REPORT}`);
  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
