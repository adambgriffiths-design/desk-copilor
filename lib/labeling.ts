import fs from "fs";
import path from "path";

export type AdamVerdict = "LONG" | "SHORT" | "WAIT" | "NO_TRADE";
export type SetupGrade = "A+" | "A" | "B" | "C" | "pass" | "no_trade";
export type FvgValidityLabel = "valid" | "present_not_tradeable" | "invalid" | "absent";

/** Expected observation fields — what actually happened on chart. Adam to refine scoring in Phase 2. */
export type ExpectedObservation = {
  liquidity_swept?: boolean;
  fvg_status?: string;
  fvg_direction?: string;
  displacement?: string;
  market_structure?: string;
  mss_direction?: string;
  reh_above?: boolean;
  reh_level?: number | null;
  rel_below?: boolean;
  htf_bias_aligned?: boolean;
  tradeable_bias?: string;
  data_quality?: string;
  session?: string;
  order_block?: string;
};

export type LabeledSetup = {
  id: string;
  timestamp: string;
  market_state_snapshot: string;
  /** What the observation engine should detect — required for replay Report 1. */
  expected_observation: ExpectedObservation;
  adam_verdict: AdamVerdict;
  would_take: boolean;
  grade: SetupGrade;
  why_taken: string;
  why_rejected_alternatives: string;
  fvg_validity: FvgValidityLabel;
  /** Optional — for Report 2 entry_model check. Adam to refine. */
  expected_entry_model?: string;
  /** Optional — for Report 3 price tolerance. Adam to refine. */
  expected_invalidation?: number;
  expected_target?: number;
  similar_but_skip?: boolean;
  notes: string;
  /** @deprecated use expected_observation */
  observation?: ExpectedObservation;
};

export type SetupFixture = {
  id: string;
  ctx: Record<string, unknown>;
  state: Record<string, unknown>;
  label: LabeledSetup;
};

const EXAMPLES_DIR = path.join(process.cwd(), "data", "labeled-setups", "examples");
const CHART_PROOF_DIR = path.join(process.cwd(), "data", "labeled-setups", "chart-proof");

export function getExpectedObservation(label: LabeledSetup): ExpectedObservation {
  return label.expected_observation ?? label.observation ?? {};
}

export function validateLabeledSetup(label: unknown): string[] {
  const errors: string[] = [];
  if (!label || typeof label !== "object") return ["label must be an object"];
  const l = label as Record<string, unknown>;
  const required = [
    "id",
    "timestamp",
    "market_state_snapshot",
    "adam_verdict",
    "would_take",
    "grade",
    "why_taken",
    "why_rejected_alternatives",
    "fvg_validity",
    "notes",
  ];
  for (const key of required) {
    if (l[key] === undefined || l[key] === "") errors.push(`missing required field: ${key}`);
  }
  if (!l.expected_observation && !l.observation) {
    errors.push("missing required field: expected_observation");
  }
  if (typeof l.why_taken === "string" && l.why_taken.length < 10) {
    errors.push("why_taken must be at least 10 characters");
  }
  if (typeof l.why_rejected_alternatives === "string" && l.why_rejected_alternatives.length < 10) {
    errors.push("why_rejected_alternatives must be at least 10 characters");
  }
  return errors;
}

export function loadSetupFixture(filename: string): SetupFixture {
  const candidates = [
    path.join(EXAMPLES_DIR, filename),
    path.join(CHART_PROOF_DIR, filename),
  ];
  const filePath = candidates.find((p) => fs.existsSync(p));
  if (!filePath) {
    throw new Error(`labeled fixture not found: ${filename}`);
  }
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as SetupFixture;
  const labelErrors = validateLabeledSetup(raw.label);
  if (labelErrors.length) {
    throw new Error(`${filename}: ${labelErrors.join("; ")}`);
  }
  return raw;
}

export function listSetupFixtures(): string[] {
  if (!fs.existsSync(EXAMPLES_DIR)) return [];
  return fs.readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith(".json"));
}

/** Observation chart-proof labels (separate from decision-replay examples). */
export function listChartProofFixtures(): string[] {
  if (!fs.existsSync(CHART_PROOF_DIR)) return [];
  return fs.readdirSync(CHART_PROOF_DIR).filter((f) => f.endsWith(".json"));
}

export function saveLabeledSetup(label: LabeledSetup): string {
  const errors = validateLabeledSetup(label);
  if (errors.length) throw new Error(errors.join("; "));
  if (!fs.existsSync(EXAMPLES_DIR)) fs.mkdirSync(EXAMPLES_DIR, { recursive: true });
  const filePath = path.join(EXAMPLES_DIR, `${label.id}.json`);
  const fixture: SetupFixture = {
    id: label.id,
    ctx: {},
    state: {},
    label,
  };
  fs.writeFileSync(filePath, JSON.stringify(fixture, null, 2));
  return filePath;
}
