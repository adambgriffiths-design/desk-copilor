/**
 * Desk tracker tests — npm run test:desk-tracker
 */
import { CONFIRMATION_POLICIES, requiresCandleClose, allowsIntrabarExecution } from "../lib/confirmation-policy";
import {
  nextPhase,
  statusColorForPhase,
  phaseLabel,
  inferCloseTrigger,
} from "../lib/desk-state-machine";
import { confirmEventsOnBarClose, detectPendingEvents, intrabarExecutionSignal } from "../lib/pending-events";
import { transitionBrief } from "../lib/decision-timeline";
import { resetDeskTracker, runDeskTracker } from "../lib/desk-tracker-engine";

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

console.log("=== confirmation policies ===");
assert(requiresCandleClose("mss"), "MSS requires close");
assert(allowsIntrabarExecution("fvg_entry"), "FVG entry allows intrabar");
assert(!CONFIRMATION_POLICIES.fvg_entry.affects_verdict, "FVG entry does not flip verdict");

console.log("\n=== state machine ===");
assert(nextPhase("waiting", "approaching_liquidity") === "watching_liquidity", "→ watching liquidity");
assert(statusColorForPhase("liquidity_swept_pending") === "amber", "pending = amber");
assert(statusColorForPhase("entry_active") === "red", "entry active = red");
assert(phaseLabel("waiting_for_retrace").includes("retrace"), "phase label");

console.log("\n=== pending / confirm ===");
const mockCtx = {
  daily: { lastClose: 21000 },
  structureFacts: {
    mss: { direction: "bullish" as const, level: 20990, at: "10:00", atTime: 0, description: "bullish MSS" },
    liquiditySweeps: [],
    m1UnfilledFvgs: [{ type: "bullish" as const, top: 21005, bottom: 20998, timeframe: "1m", inverted: false }],
    m1InvertedFvgs: [],
    firstPresentedFvg: { nyOpening: null, postFhdr: null, activeSession: null },
    relativeEqualPools: [],
    summary: "",
  },
  htfPdArrays: { previousDay: { high: 21100, low: 20800, close: 20950, open: 20940, equilibrium: 20975 }, ndog: null, levels: [] },
} as import("../lib/types").MarketContext;

const pending = detectPendingEvents(mockCtx, 21000);
assert(pending.some((p) => p.concept === "fvg_entry"), "detects FVG zone touch");

const exec = intrabarExecutionSignal(mockCtx, 21000);
assert(exec?.met === true, "intrabar execution signal");

const { confirmed } = confirmEventsOnBarClose(pending, mockCtx, {
  t: 1,
  o: 20995,
  h: 21002,
  l: 20990,
  c: 21001,
});
assert(Array.isArray(confirmed), "confirm on close returns array");

console.log("\n=== transition brief ===");
const brief = transitionBrief(null, {
  phase: "waiting_for_retrace",
  verdict: "WAIT",
  confirmed: [],
  pending: [{ id: "x", concept: "fvg_entry", label: "fvg", status: "pending", confirmation: "intrabar_wick", detected_at: "", detail: "watching" }],
});
assert(brief.includes("First tracker"), "first snapshot brief");

console.log("\n=== engine (live) ===");
resetDeskTracker();
async function runLive() {
  try {
    const state = await runDeskTracker({ chartLastPrice: 21000, candleClosed: false });
    assert(Boolean(state.phase), "engine returns phase");
    assert(["green", "amber", "red"].includes(state.status_color), "status color");
    const closed = await runDeskTracker({ chartLastPrice: 21000, candleClosed: true, lastBarTime: Math.floor(Date.now() / 1000) });
    assert(Boolean(closed.transition_brief), "close update brief");
  } catch (err) {
    console.warn("  (live engine skipped)", err instanceof Error ? err.message : err);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
runLive();
