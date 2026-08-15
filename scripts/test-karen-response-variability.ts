/**
 * Response variability + repetition memory — sequence tests.
 * Run: npx tsx scripts/test-karen-response-variability.ts
 */
import { casualChatFallback } from "../lib/casual-chat-intent";
import {
  JOKE_POOL,
  pickAskMeReply,
  pickJokeReply,
  resolveCasualDiversityFollowUp,
} from "../lib/casual-diversity";
import {
  formatMentorTradeSpoken,
  formatStructuredWaitFollowUp,
  resolveUserPresentationMode,
} from "../lib/decision-contract-output";
import type { DecisionEnvelope } from "../lib/decision-envelope";
import { runDeskPipeline } from "../lib/desk-pipeline";
import { REPLAY_FIXTURES } from "../lib/replay-fixtures";
import {
  assertFactsPreserved,
  extractFactTokens,
  openingFingerprint,
  resetConversationalRendererState,
} from "../lib/conversational-renderer";
import {
  normalizeReplyFingerprint,
  resetResponseRepetitionMemory,
  isRephraseFollowUp,
} from "../lib/response-repetition-memory";
import { classifyMentorIntent } from "../lib/mentor-intent";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

/** Match renderer spokenSafe digit stripping for semantic lock checks. */
function spokenDigits(text: string): string {
  return String(text || "").replace(/(\d+)\.(\d+)\b/g, "$1");
}

function factsPresent(locked: string[], rendered: string): string[] {
  const body = spokenDigits(rendered).toLowerCase();
  return locked.filter((f) => {
    const norm = spokenDigits(f).toLowerCase();
    return Boolean(norm) && !body.includes(norm);
  });
}

function cloneEnv(env: DecisionEnvelope, patch: Partial<DecisionEnvelope>): DecisionEnvelope {
  return {
    ...env,
    ...patch,
    thesis: { ...env.thesis, ...(patch.thesis || {}) },
    read: { ...env.read, ...(patch.read || {}) },
    invalidation: { ...env.invalidation, ...(patch.invalidation || {}) },
    conflictLog: { ...env.conflictLog, ...(patch.conflictLog || {}) },
  };
}

resetResponseRepetitionMemory();
resetConversationalRendererState();

const waitPipe = runDeskPipeline(
  REPLAY_FIXTURES["bullish-wait"].ctx,
  REPLAY_FIXTURES["bullish-wait"].state
);
const waitEnv = waitPipe.analysis_contract!.decision!;

console.log("=== joke ×10 — no immediate duplicates ===");
{
  resetResponseRepetitionMemory();
  const replies: string[] = [];
  const messages: Array<{ role: string; content: string }> = [];
  for (let i = 0; i < 10; i++) {
    const r = casualChatFallback("tell me a joke", messages.map((m) => m.content).join(" "), [
      ...messages,
      { role: "user", content: "tell me a joke" },
    ]);
    replies.push(r);
    messages.push({ role: "user", content: "tell me a joke" }, { role: "assistant", content: r });
  }
  const unique = new Set(replies.map(normalizeReplyFingerprint));
  let adjacentDup = 0;
  for (let i = 1; i < replies.length; i++) {
    if (normalizeReplyFingerprint(replies[i]!) === normalizeReplyFingerprint(replies[i - 1]!)) {
      adjacentDup++;
    }
  }
  assert(adjacentDup === 0, `no adjacent joke duplicates (got ${adjacentDup})`);
  assert(unique.size >= 8, `joke unique ≥8/10 (got ${unique.size})`);
  assert(
    !replies.every((r) => /scarecrow|outstanding in his field/i.test(r)),
    "not stuck on scarecrow joke"
  );
  assert(JOKE_POOL.length >= 12, `joke pool large enough (${JOKE_POOL.length})`);
}

console.log("\n=== joke → another → another → different one ===");
{
  resetResponseRepetitionMemory();
  const messages: Array<{ role: string; content: string }> = [];
  const a = casualChatFallback("tell me a joke", "", [{ role: "user", content: "tell me a joke" }]);
  messages.push({ role: "user", content: "tell me a joke" }, { role: "assistant", content: a });
  const b = resolveCasualDiversityFollowUp("another", messages)!;
  messages.push({ role: "user", content: "another" }, { role: "assistant", content: b });
  const c = resolveCasualDiversityFollowUp("another one", messages)!;
  messages.push({ role: "user", content: "another one" }, { role: "assistant", content: c });
  const d = resolveCasualDiversityFollowUp("different one", messages)!;
  const fps = [a, b, c, d].map(normalizeReplyFingerprint);
  assert(new Set(fps).size === 4, `four distinct jokes in chain (got ${new Set(fps).size})`);
}

console.log("\n=== ask me something ×10 ===");
{
  resetResponseRepetitionMemory();
  const replies: string[] = [];
  const messages: Array<{ role: string; content: string }> = [];
  for (let i = 0; i < 10; i++) {
    const r = pickAskMeReply({ messages });
    replies.push(r);
    messages.push(
      { role: "user", content: "ask me something" },
      { role: "assistant", content: r }
    );
  }
  const unique = new Set(replies.map(normalizeReplyFingerprint));
  assert(unique.size >= 8, `ask-me unique ≥8/10 (got ${unique.size})`);
  assert(
    replies.every((r) => /\?/.test(r) && r.length > 20),
    "ask-me replies are substantive questions"
  );
}

console.log("\n=== WAIT payload ×10 — same facts, varied wording ===");
{
  resetResponseRepetitionMemory();
  resetConversationalRendererState();
  const baseline = formatMentorTradeSpoken(waitEnv, {
    mode: "plain",
    render: { variant: 0, silent: true },
  });
  const lockedPrices = extractFactTokens(spokenDigits(baseline));
  const replies: string[] = [];
  for (let i = 0; i < 10; i++) {
    replies.push(
      formatMentorTradeSpoken(waitEnv, {
        mode: "plain",
        render: { variant: i },
      })
    );
  }
  const unique = new Set(replies.map(normalizeReplyFingerprint));
  assert(unique.size >= 3, `WAIT wording variants ≥3 (got ${unique.size})`);
  for (const r of replies) {
    assert(/\bWAITING\b/i.test(r) || /\bNO_TRADE\b/i.test(r), "WAIT/NO_TRADE stance preserved");
    assert(!/\bI(?:'m| am)\s+LONG\b/i.test(r), "no invented LONG");
    assert(!/\bI(?:'m| am)\s+SHORT\b/i.test(r), "no invented SHORT");
    const bodyPrices = new Set(extractFactTokens(spokenDigits(r)));
    const missingPrices = lockedPrices.filter((p) => !bodyPrices.has(p));
    assert(
      missingPrices.length === 0,
      `WAIT price facts preserved (${missingPrices.join(",") || "ok"})`
    );
  }
}

console.log("\n=== LONG payload ×10 — direction/prices/invalidation locked ===");
{
  resetResponseRepetitionMemory();
  const longEnv = cloneEnv(waitEnv, {
    stance: "long",
    thesis: {
      ...waitEnv.thesis,
      whyNow: "buy-side liquidity taken at 25100.25 with displacement",
      what: "long continuation",
    },
    invalidation: {
      ...waitEnv.invalidation,
      condition: "loss of 25050.00 structure",
    },
    read: {
      ...waitEnv.read,
      tradeDirection: "LONG",
      overallStance: "long",
    },
  });
  const baseline = formatMentorTradeSpoken(longEnv, {
    mode: "plain",
    render: { variant: 0, silent: true },
  });
  const lockedPrices = extractFactTokens(spokenDigits(baseline)).filter((p) =>
    ["25100", "25050"].includes(p)
  );
  const replies: string[] = [];
  for (let i = 0; i < 10; i++) {
    replies.push(
      formatMentorTradeSpoken(longEnv, {
        mode: "plain",
        render: { variant: i },
      })
    );
  }
  const unique = new Set(replies.map(normalizeReplyFingerprint));
  assert(unique.size >= 3, `LONG wording variants ≥3 (got ${unique.size})`);
  for (const r of replies) {
    assert(/\bLONG\b/.test(r), "LONG preserved");
    assert(!/\bI(?:'m| am)\s+SHORT\b/i.test(r), "no SHORT flip");
    assert(!/\bI(?:'m| am)\s+WAITING\b/i.test(r), "no WAIT flip");
    assert(/buy-side liquidity taken/i.test(r), "LONG why phrase preserved");
    assert(/loss of 25050/i.test(spokenDigits(r)), "LONG invalidation preserved");
    const bodyPrices = new Set(extractFactTokens(spokenDigits(r)));
    const missingPrices = lockedPrices.filter((p) => !bodyPrices.has(p));
    assert(
      missingPrices.length === 0,
      `LONG price facts preserved (${missingPrices.join(",") || "ok"})`
    );
  }
}

console.log("\n=== explain why waiting → say that differently ===");
{
  resetResponseRepetitionMemory();
  const ctx = {
    long_case: waitPipe.interpretation.long_case,
    short_case: waitPipe.interpretation.short_case,
    entry_model: waitPipe.interpretation.entry_model,
    rejected_alternative: waitPipe.analysis_contract?.rejected_alternative,
  };
  const a = formatStructuredWaitFollowUp(waitEnv, ctx, {
    mode: "plain",
    render: { variant: 0 },
  });
  const b = formatStructuredWaitFollowUp(waitEnv, ctx, {
    mode: "plain",
    render: { variant: 1 },
  });
  assert(isRephraseFollowUp("say that differently"), "rephrase detector");
  const intent = classifyMentorIntent("say that differently", {
    lastAssistant: a,
    lastMentorIntent: "WAIT_EXPLANATION",
  });
  assert(intent === "WAIT_EXPLANATION", `rephrase keeps WAIT_EXPLANATION (got ${intent})`);
  assert(
    normalizeReplyFingerprint(a) !== normalizeReplyFingerprint(b),
    "rephrase yields different wording"
  );
  assert(/\bWAITING\b|\bNO_TRADE\b/i.test(a) && /\bWAITING\b|\bNO_TRADE\b/i.test(b), "stance stable");
}

console.log("\n=== 10 consecutive openings — flag stock repeats ===");
{
  resetResponseRepetitionMemory();
  resetConversationalRendererState();
  const families = [
    () => formatMentorTradeSpoken(waitEnv, { mode: "plain" }),
    () => pickJokeReply({}),
    () => pickAskMeReply({}),
    () =>
      formatMentorTradeSpoken(cloneEnv(waitEnv, { stance: "long" }), {
        mode: "plain",
      }),
    () => casualChatFallback("hey", ""),
    () => formatStructuredWaitFollowUp(waitEnv, undefined, { mode: "plain" }),
    () => pickJokeReply({}),
    () => formatMentorTradeSpoken(waitEnv, { mode: "plain" }),
    () => pickAskMeReply({}),
    () => casualChatFallback("how's it going", ""),
  ];
  const openings = families.map((fn) => openingFingerprint(fn()));
  const flagged = openings.filter((o) =>
    ["im_waiting", "right_now", "at_the_moment", "looks_like"].includes(o)
  );
  // Allow at most 3 flagged openings across 10 different interactions.
  assert(flagged.length <= 3, `flagged openings ≤3/10 (got ${flagged.length}: ${flagged.join(",")})`);
  assert(new Set(openings).size >= 5, `opening diversity ≥5 unique (got ${new Set(openings).size})`);
}

console.log("\n=== latency — deterministic path stays local ===");
{
  const t0 = Date.now();
  for (let i = 0; i < 50; i++) {
    formatMentorTradeSpoken(waitEnv, { mode: "plain" });
  }
  const ms = Date.now() - t0;
  assert(ms < 200, `50 plain renders <200ms (got ${ms}ms)`);
  assert(resolveUserPresentationMode() === "plain" || process.env.KAREN_DECISION_DEBUG === "1", "mode ok");
  console.log(`  · 50 renders in ${ms}ms (0 OpenAI calls)`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
