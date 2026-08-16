/**
 * Outcome-blind smoke for evidence_dependency_repr_v0 (synthetic obs only — cheap).
 *
 * Shows:
 *  1) several reasons sharing one evidence source / dependency group
 *  2) genuinely separate evidence sources
 *  3) provenance determined vs unresolved rates
 *  4) whether stable source/dependency IDs are technically justified
 *
 * Does NOT: change trading behaviour, inspect outcomes, touch VAL/HOLDOUT, run Y=1500.
 *
 *   npx tsx scripts/karen-evidence-dependency-smoke.ts
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { MarketObservation } from "../lib/desk-schema";
import { freezeObservation } from "../lib/desk-schema";
import { buildMarketInterpretation } from "../lib/interpretation-engine";
import {
  annotateInterpretationEvidenceDependencies,
  groupedReasonLabels,
  isStructureAliasedFromBias,
  EVIDENCE_DEPENDENCY_REPRESENTATION_VERSION,
  type EvidenceDependencyAnnotation,
} from "../lib/evidence-dependency-repr-v0";

const root = process.cwd();
const outDir = join(root, "data/research");
const outJson = join(outDir, "karen-evidence-dependency-smoke-v0.json");

function baseObs(over: Partial<MarketObservation> & { evidence?: Record<string, string> }): MarketObservation {
  const evidence = {
    "market_state.last_price": "20000.00",
    "market_state.quality.flag": "ok",
    "bias_stack.daily": "bullish",
    "bias_stack.m15": "bullish",
    "bias_stack.m5": "bullish",
    "bias_stack.tradeable_bias": "bullish",
    "premium_discount.vs_current_day_range": "discount",
    "premium_discount.vs_previous_day_range": "discount",
    "structure.displacement": "absent",
    "structure.fvg.status": "absent",
    "active_session.id": "ny",
    "active_session.kill_zone": "true",
    "market_state.snapshot_id": "smoke-synth",
    "market_state.updated_at": "2026-08-16T00:00:00.000Z",
    ...(over.evidence ?? {}),
  };
  return {
    market_structure: "unclear",
    liquidity: { levels: [] },
    displacement: "absent",
    displacement_points: null,
    fvg: { status: "absent" },
    order_block: "unclear",
    premium_discount: { zone: "discount", price_location: "discount of current day" },
    htf_bias: {
      daily: "bullish",
      m15: "bullish",
      m5: "bullish",
      aligned: true,
      tradeable_bias: "bullish",
    },
    session: "ny",
    time_context: "smoke",
    data_quality: "good",
    reh_rel: {
      status: "known",
      nearest_reh_above: null,
      nearest_rel_below: null,
      all_levels: [],
      reh_levels: [],
      rel_levels: [],
    },
    evidence,
    state_hash: "smoke-synth",
    ...over,
    evidence,
  };
}

type CaseResult = {
  id: string;
  intent: "shared_source" | "separate_sources" | "mixed";
  description: string;
  longReasons: string[];
  shortReasons: string[];
  longReasonCount: number;
  shortReasonCount: number;
  structureAliasedFromBias: boolean;
  annotation: EvidenceDependencyAnnotation;
  groupedReasons: string[][];
};

function runCase(
  id: string,
  intent: CaseResult["intent"],
  description: string,
  obsRaw: MarketObservation
): CaseResult {
  const obs = freezeObservation(obsRaw);
  const interp = buildMarketInterpretation(obs);
  const annotation = annotateInterpretationEvidenceDependencies(obs, interp);
  return {
    id,
    intent,
    description,
    longReasons: [...interp.long_case.reasons],
    shortReasons: [...interp.short_case.reasons],
    longReasonCount: interp.long_case.reasons.length,
    shortReasonCount: interp.short_case.reasons.length,
    structureAliasedFromBias: isStructureAliasedFromBias(obs),
    annotation,
    groupedReasons: groupedReasonLabels(annotation),
  };
}

const cases: CaseResult[] = [];

// 1) Shared source: HTF bias aliased into market_structure → two long reasons, one bias source
cases.push(
  runCase(
    "bias_alias_double_count",
    "shared_source",
    "No MSS evidence; market_structure copied from tradeable bias → HTF bias + structure reasons share bias source",
    baseObs({
      market_structure: "bullish",
      // deliberately omit structure.mss_direction
      evidence: {
        "bias_stack.tradeable_bias": "bullish",
        "structure.displacement": "absent",
        "structure.fvg.status": "absent",
      },
    })
  )
);

// 2) Shared source: SSL raid + displacement-after confirmation (code-path dependency)
cases.push(
  runCase(
    "ssl_raid_plus_displacement_confirm",
    "shared_source",
    "PDL taken + displacement present → sweep reason + 'Displacement present after sell-side sweep' share dep:ssl_disp_confirm",
    baseObs({
      market_structure: "unclear",
      displacement: "present",
      displacement_points: 12.5,
      htf_bias: {
        daily: "neutral",
        m15: "neutral",
        m5: "neutral",
        aligned: true,
        tradeable_bias: "neutral",
      },
      liquidity: {
        levels: [
          {
            id: "pdl",
            label: "PDL",
            price: 19950,
            taken: true,
            side: "sell_side",
            status: "CLOSED_BEYOND",
            candleId: "1m:2026-08-15T14:32:00Z",
            qualifyingTickAt: 1723732320,
            qualifyingTickPrice: 19949,
          },
        ],
      },
      evidence: {
        "bias_stack.tradeable_bias": "neutral",
        "structure.displacement": "present",
        "structure.displacement_points": "12.50",
        "structure.fvg.status": "absent",
        "liquidity.pdl":
          "19950.00 status=CLOSED_BEYOND taken=true candle=1m:2026-08-15T14:32:00Z",
      },
    })
  )
);

// 3) Separate sources: real MSS + HTF bias (different PIT keys) — no alias group
cases.push(
  runCase(
    "mss_and_bias_independent",
    "separate_sources",
    "MSS evidence present + HTF bias → structure reason uses mss source; bias reason uses bias source (no shared group)",
    baseObs({
      market_structure: "bullish",
      evidence: {
        "bias_stack.tradeable_bias": "bullish",
        "structure.mss_direction": "bullish",
        "structure.mss_level": "20010.00",
        "structure.displacement": "absent",
        "structure.fvg.status": "absent",
      },
    })
  )
);

// 4) Separate sources: SSL sweep + bullish FVG (no proven cross-link; FVG ungrouped from sweep)
cases.push(
  runCase(
    "ssl_and_fvg_separate_families",
    "separate_sources",
    "Sell-side sweep + bullish FVG — different families; no auto-group without shared candle proof",
    baseObs({
      market_structure: "unclear",
      displacement: "absent",
      fvg: { status: "present", direction: "bullish", top: 20020, bottom: 20005 },
      htf_bias: {
        daily: "neutral",
        m15: "neutral",
        m5: "neutral",
        aligned: true,
        tradeable_bias: "neutral",
      },
      liquidity: {
        levels: [
          {
            id: "pdl",
            label: "PDL",
            price: 19950,
            taken: true,
            side: "sell_side",
            status: "CLOSED_BEYOND",
            candleId: "1m:2026-08-15T13:00:00Z",
            qualifyingTickAt: 1723726800,
          },
        ],
      },
      evidence: {
        "bias_stack.tradeable_bias": "neutral",
        "structure.displacement": "absent",
        "structure.fvg.status": "present",
        "structure.fvg.top": "20020.00",
        "structure.fvg.bottom": "20005.00",
        "liquidity.pdl":
          "19950.00 status=CLOSED_BEYOND taken=true candle=1m:2026-08-15T13:00:00Z",
      },
    })
  )
);

// 5) Mixed: MSS + displacement + FVG — families co-present; displacement/FVG NOT grouped (unproven)
cases.push(
  runCase(
    "mss_disp_fvg_co_present_ungrouped",
    "mixed",
    "MSS + displacement + FVG co-present (classic impulse bundle). MSS grouped with structure; disp/FVG stay separate — no shared candle on reason path",
    baseObs({
      market_structure: "bullish",
      displacement: "present",
      displacement_points: 18,
      fvg: { status: "present", direction: "bullish", top: 20040, bottom: 20022 },
      evidence: {
        "bias_stack.tradeable_bias": "bullish",
        "structure.mss_direction": "bullish",
        "structure.mss_level": "20015.00",
        "structure.displacement": "present",
        "structure.displacement_points": "18.00",
        "structure.fvg.status": "present",
        "structure.fvg.top": "20040.00",
        "structure.fvg.bottom": "20022.00",
      },
    })
  )
);

const sharedExamples = cases.filter((c) => c.groupedReasons.length > 0);
const separateExamples = cases.filter(
  (c) => c.intent === "separate_sources" && c.groupedReasons.length === 0
);

let det = 0;
let code = 0;
let unr = 0;
let reasonRows = 0;
for (const c of cases) {
  const ps = c.annotation.provenanceStats;
  det += ps.deterministic;
  code += ps.code_path;
  unr += ps.unresolved;
  reasonRows += c.annotation.longReasonCount + c.annotation.shortReasonCount;
}

const reasonCountsPreserved = cases.every((c) => {
  const n = c.annotation.nodes.filter((x) => x.surface === "interpretation_reason").length;
  return n === c.longReasonCount + c.shortReasonCount;
});

const stableIdsJustified =
  sharedExamples.length >= 1 &&
  separateExamples.length >= 1 &&
  det + code > 0 &&
  reasonCountsPreserved;

const report = {
  representationVersion: EVIDENCE_DEPENDENCY_REPRESENTATION_VERSION,
  generatedAt: new Date().toISOString(),
  outcomesInspected: false,
  tradingBehaviourChanged: false,
  reasonCountsPreserved,
  summary: {
    cases: cases.length,
    sharedSourceCases: sharedExamples.map((c) => c.id),
    separateSourceCases: separateExamples.map((c) => c.id),
    provenance: {
      reasonRows,
      deterministic: det,
      code_path: code,
      unresolved: unr,
      determinedRate: reasonRows ? (det + code) / reasonRows : 0,
      unresolvedRate: reasonRows ? unr / reasonRows : 0,
    },
    stableSourceIdsJustified: stableIdsJustified,
    duplicateEvidenceConfirmed: sharedExamples.length > 0,
  },
  cases,
};

mkdirSync(outDir, { recursive: true });
writeFileSync(outJson, JSON.stringify(report, null, 2), "utf8");

console.log("=== evidence_dependency_repr_v0 smoke (synthetic, outcome-blind) ===");
console.log(`wrote ${outJson}`);
console.log(`cases=${cases.length} reasonRows=${reasonRows}`);
console.log(
  `provenance: deterministic=${det} code_path=${code} unresolved=${unr} determinedRate=${(
    (det + code) /
    Math.max(1, reasonRows)
  ).toFixed(2)}`
);
console.log(`shared_source examples: ${sharedExamples.map((c) => c.id).join(", ") || "(none)"}`);
for (const c of sharedExamples) {
  console.log(`  ${c.id}: groups=${JSON.stringify(c.groupedReasons)}`);
  console.log(`    reasons long=${c.longReasonCount} short=${c.shortReasonCount}`);
}
console.log(`separate_source examples: ${separateExamples.map((c) => c.id).join(", ") || "(none)"}`);
for (const c of separateExamples) {
  const sources = [
    ...new Set(
      c.annotation.nodes
        .filter((n) => n.surface === "interpretation_reason" && n.evidenceSourceId)
        .map((n) => n.evidenceSourceId)
    ),
  ];
  console.log(`  ${c.id}: distinctSources=${sources.length} → ${sources.join(" | ")}`);
}
console.log(`reasonCountsPreserved=${reasonCountsPreserved}`);
console.log(`DUPLICATE_EVIDENCE_CONFIRMED=${sharedExamples.length > 0}`);
console.log(`STABLE_SOURCE_IDS_JUSTIFIED=${stableIdsJustified}`);
console.log("OUTCOMES_INSPECTED=NO TRADING_BEHAVIOUR_CHANGED=NO");
