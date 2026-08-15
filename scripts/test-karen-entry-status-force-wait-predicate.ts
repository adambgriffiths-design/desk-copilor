/**
 * Tiny offline unit checks for ENTRY_STATUS_FORCE_WAIT predicate.
 * No DV replay, no day-cache locks, no archive I/O.
 *
 * Run: npx tsx scripts/test-karen-entry-status-force-wait-predicate.ts
 */
import {
  shouldForceEntryWait,
  withDecisionProcessExperiment,
} from "../lib/decision-process-experiment";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function classifyShadow(args: {
  longSupported: boolean;
  shortSupported: boolean;
  entryStatus: string | null;
  experiment?: "none" | "c1_wait_entry_actionable";
}):
  | "NO_DIRECTION_ANYWAY"
  | "LONG_WOULD_HAVE_OCCURRED"
  | "SHORT_WOULD_HAVE_OCCURRED"
  | "OTHER_GATE_STILL_BLOCKS"
  | "CURRENT_WOULD_BE_ACTIONABLE" {
  const { longSupported, shortSupported, entryStatus } = args;
  const exp = args.experiment ?? "none";
  return withDecisionProcessExperiment(exp, () => {
    const force = shouldForceEntryWait(entryStatus);
    if (longSupported && shortSupported) return "OTHER_GATE_STILL_BLOCKS";
    if (!longSupported && !shortSupported) return "NO_DIRECTION_ANYWAY";
    if (!force) return "CURRENT_WOULD_BE_ACTIONABLE";
    // Under frozen: WAIT|EXTENDED force wait. Shadow without force → directional.
    // Under c1: only EXTENDED still forces; WAIT becomes actionable.
    if (entryStatus === "EXTENDED") return "OTHER_GATE_STILL_BLOCKS";
    if (longSupported) return "LONG_WOULD_HAVE_OCCURRED";
    return "SHORT_WOULD_HAVE_OCCURRED";
  });
}

function main(): void {
  // Frozen predicate
  assert(shouldForceEntryWait(null) === false, "null → false");
  assert(shouldForceEntryWait("ACTIVE") === false, "ACTIVE → false");
  assert(shouldForceEntryWait("WAIT") === true, "WAIT → true (frozen)");
  assert(shouldForceEntryWait("EXTENDED") === true, "EXTENDED → true (frozen)");

  withDecisionProcessExperiment("c1_wait_entry_actionable", () => {
    assert(shouldForceEntryWait("WAIT") === false, "c1: WAIT → false");
    assert(shouldForceEntryWait("EXTENDED") === true, "c1: EXTENDED → true");
    assert(shouldForceEntryWait("ACTIVE") === false, "c1: ACTIVE → false");
  });

  // Shadow classes (analysis-only; never a DecisionEnvelope)
  assert(
    classifyShadow({
      longSupported: true,
      shortSupported: false,
      entryStatus: "WAIT",
    }) === "LONG_WOULD_HAVE_OCCURRED",
    "shadow long"
  );
  assert(
    classifyShadow({
      longSupported: false,
      shortSupported: true,
      entryStatus: "WAIT",
    }) === "SHORT_WOULD_HAVE_OCCURRED",
    "shadow short"
  );
  assert(
    classifyShadow({
      longSupported: true,
      shortSupported: true,
      entryStatus: "WAIT",
    }) === "OTHER_GATE_STILL_BLOCKS",
    "both sides"
  );
  assert(
    classifyShadow({
      longSupported: true,
      shortSupported: false,
      entryStatus: "EXTENDED",
    }) === "OTHER_GATE_STILL_BLOCKS",
    "extended still blocks"
  );
  assert(
    classifyShadow({
      longSupported: false,
      shortSupported: false,
      entryStatus: "WAIT",
    }) === "NO_DIRECTION_ANYWAY",
    "no direction"
  );
  assert(
    classifyShadow({
      longSupported: true,
      shortSupported: false,
      entryStatus: "WAIT",
      experiment: "c1_wait_entry_actionable",
    }) === "CURRENT_WOULD_BE_ACTIONABLE",
    "c1 makes WAIT actionable"
  );

  console.log(
    JSON.stringify({
      ok: true,
      EXACT_GATE_PREDICATE:
        'shouldForceEntryWait(entryStatus)===(WAIT||EXTENDED) && one-sided support → WAIT',
      EDGE_CLAIM: "NONE",
    })
  );
}

main();
