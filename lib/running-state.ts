import type {
  VerdictJSON,
  RunningState,
  RunningStateEntry,
  VerdictDelta,
  ConceptKey,
} from "./decision-schema";
import type { MarketState } from "./market-state";

const MAX_HISTORY = 20;
let memory: RunningState = {
  last_verdict: null,
  last_market_state_hash: null,
  last_updated: new Date(0).toISOString(),
  history: [],
};

const CONCEPT_LABELS: Record<ConceptKey, string> = {
  htf_bias: "bias",
  liquidity: "liquidity",
  premium_discount: "premium/discount",
  mss: "MSS",
  displacement: "displacement",
  fvg: "FVG",
  entry_zone: "entry zone",
  session: "session",
  data_quality: "data quality",
};

export function getRunningState(): RunningState {
  return { ...memory, history: [...memory.history] };
}

function detectFieldChanges(
  prev: VerdictJSON | null,
  current: VerdictJSON,
  prevState?: MarketState | null,
  currentState?: MarketState | null
): string[] {
  const changes: string[] = [];
  if (prevState && currentState) {
    if (prevState.lastPrice !== currentState.lastPrice) {
      changes.push(
        `price ${prevState.lastPrice.toFixed(2)} → ${currentState.lastPrice.toFixed(2)}`
      );
    }
    if (prevState.structure.mss !== currentState.structure.mss) {
      changes.push(
        `MSS ${prevState.structure.mss || "none"} → ${currentState.structure.mss || "none"}`
      );
    }
    if (prevState.fvg.length !== currentState.fvg.length) {
      if (currentState.fvg.length < prevState.fvg.length) {
        changes.push("FVG filled");
      } else {
        changes.push("new FVG formed");
      }
    }
    if (prevState.structure.tradeableBias !== currentState.structure.tradeableBias) {
      changes.push(
        `bias ${prevState.structure.tradeableBias} → ${currentState.structure.tradeableBias}`
      );
    }
  }
  if (prev && prev.execution?.entry_status !== current.execution?.entry_status) {
    changes.push(
      `entry ${prev.execution?.entry_status || "none"} → ${current.execution?.entry_status || "none"}`
    );
  }
  return changes;
}

/** Compute delta between last and current verdict — senior mentor brief. */
export function computeVerdictDelta(
  prev: VerdictJSON | null,
  current: VerdictJSON,
  prevState?: MarketState | null,
  currentState?: MarketState | null
): VerdictDelta {
  if (!prev) {
    return {
      verdict_changed: false,
      concept_deltas: [],
      field_changes: detectFieldChanges(null, current, prevState, currentState),
      mentor_brief: "First read this session — no prior verdict to compare.",
    };
  }

  const concept_deltas = current.concepts.map((c) => {
    const prevConcept = prev.concepts.find((p) => p.concept === c.concept);
    const prev_score = prevConcept?.score ?? c.score;
    const delta = c.score - prev_score;
    return {
      concept: c.concept,
      prev_score,
      score: c.score,
      delta,
      direction: delta > 0 ? ("up" as const) : delta < 0 ? ("down" as const) : ("unchanged" as const),
    };
  });

  const field_changes = detectFieldChanges(prev, current, prevState, currentState);
  const verdict_changed = prev.verdict !== current.verdict;

  const changedConcepts = concept_deltas.filter((d) => d.direction !== "unchanged");
  const parts: string[] = ["Since last check:"];

  if (changedConcepts.length === 0 && field_changes.length === 0 && !verdict_changed) {
    parts.push("nothing material changed — verdict unchanged.");
  } else {
    const unchanged = concept_deltas
      .filter((d) => d.direction === "unchanged" && ["htf_bias", "mss", "fvg"].includes(d.concept))
      .map((d) => CONCEPT_LABELS[d.concept]);
    if (unchanged.length) parts.push(`${unchanged.join(", ")} unchanged`);

    for (const d of changedConcepts.slice(0, 3)) {
      const label = CONCEPT_LABELS[d.concept];
      parts.push(`${label} ${d.direction} (${d.prev_score}→${d.score})`);
    }
    for (const fc of field_changes.slice(0, 2)) {
      parts.push(fc);
    }
    if (verdict_changed) {
      parts.push(`verdict moved ${prev.verdict.replace("_", " ")} → ${current.verdict.replace("_", " ")}`);
    } else {
      parts.push("verdict unchanged");
    }
  }

  return {
    verdict_changed,
    prev_verdict: prev.verdict,
    concept_deltas,
    field_changes,
    mentor_brief: parts.join(", ") + ".",
  };
}

export function recordVerdict(
  verdict: VerdictJSON,
  state?: MarketState
): RunningState {
  const entry: RunningStateEntry = {
    ts: new Date().toISOString(),
    verdict: verdict.verdict,
    reason: verdict.reason,
    state_hash: verdict.state_hash,
    confidence: verdict.confidence,
  };
  memory = {
    last_verdict: verdict,
    last_market_state_hash: state?.stateHash ?? verdict.state_hash,
    last_updated: entry.ts,
    history: [...memory.history, entry].slice(-MAX_HISTORY),
  };
  return getRunningState();
}

export function clearRunningState(): void {
  memory = {
    last_verdict: null,
    last_market_state_hash: null,
    last_updated: new Date(0).toISOString(),
    history: [],
  };
}

export function formatRunningStateForPrompt(state: RunningState): string {
  if (!state.last_verdict) return "";
  const last = state.last_verdict;
  return [
    "=== RUNNING STATE (last desk verdict — context only, do not override current rules) ===",
    `Last verdict: ${last.verdict} (${last.confidence}% confidence)`,
    `Last reason: ${last.reason}`,
    `State hash: ${last.state_hash}`,
    `Updated: ${state.last_updated}`,
  ].join("\n");
}
