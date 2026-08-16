/**
 * Karen research status dashboard — reads SoT markdown only.
 * No secrets. EDGE_CLAIM: NONE · HOLDOUT sealed · no VAL/ALS.
 *
 * Usage: npx tsx scripts/karen-research-status.ts
 *        npm run karen:research:status
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const RESEARCH = join(ROOT, "data", "research");

const DOCS = {
  handoff: "KAREN-HANDOFF.md",
  featureGap: "karen-wait-quality-feature-gap-lock.md",
  nextChange: "karen-next-single-change-dev-candidate.md",
  queue: "karen-research-queue-one-bottleneck.md",
  debt: "karen-research-debt-inventory.md",
} as const;

function readDoc(name: string): string | null {
  const p = join(RESEARCH, name);
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8");
}

/** Table cell or bold field: | **KEY** | value |  or  **KEY:** value */
function field(md: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`\\|\\s*\\*\\*${escaped}\\*\\*\\s*\\|\\s*([^|\\n]+)\\|`, "i"),
    new RegExp(`\\*\\*${escaped}\\*\\*\\s*\\|\\s*\\*\\*([^*]+)\\*\\*`, "i"),
    new RegExp(`\\*\\*${escaped}\\*\\*:?\\s*\\*\\*([^*]+)\\*\\*`, "i"),
    new RegExp(`\\*\\*${escaped}\\*\\*:?\\s*([^\\n|*]+)`, "i"),
  ];
  for (const re of patterns) {
    const m = md.match(re);
    if (m?.[1]) {
      const v = m[1].replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
      if (v) return v;
    }
  }
  return null;
}

function firstLineMatch(md: string, re: RegExp): string | null {
  const m = md.match(re);
  return m?.[1]?.replace(/\s+/g, " ").trim() ?? null;
}

function excerptNextAction(md: string): string {
  const idx = md.search(/##\s+NEXT_SINGLE_ACTION/i);
  if (idx < 0) return "(no NEXT_SINGLE_ACTION section)";
  const body = md.slice(idx).split(/\n##\s+/)[0] ?? "";
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("|") && !l.startsWith("---"));
  const prose = lines.find((l) => !l.startsWith("*") || l.length > 40);
  return (prose ?? lines[0] ?? "(empty)").slice(0, 280);
}

function main(): void {
  const featureGap = readDoc(DOCS.featureGap);
  const nextChange = readDoc(DOCS.nextChange);
  const queue = readDoc(DOCS.queue);
  const handoff = readDoc(DOCS.handoff);

  if (!featureGap || !nextChange || !queue) {
    console.error("FAIL: missing SoT docs under data/research/");
    for (const [k, v] of Object.entries(DOCS)) {
      if (!readDoc(v) && k !== "debt" && k !== "handoff") {
        console.error(`  missing: ${v}`);
      }
    }
    process.exit(1);
  }

  const bottleneck =
    field(featureGap, "CURRENT bottleneck") ??
    field(queue, "CURRENT") ??
    "Evidence-representation richness before WAIT";

  const stop = field(featureGap, "STOP_CONDITION") ?? field(nextChange, "STOP_CONDITION") ?? "?";
  const audit = field(featureGap, "AUDIT_STATUS") ?? field(nextChange, "AUDIT_STATUS") ?? "?";
  const oneFeature = field(featureGap, "ONE_FEATURE") ?? field(nextChange, "ONE_FEATURE") ?? "?";
  const selective = field(featureGap, "SELECTIVE_UNLOCK") ?? field(nextChange, "SELECTIVE_UNLOCK") ?? "?";
  const c4 = field(featureGap, "C4_SINGLE_CHANGE") ?? field(nextChange, "C4_SINGLE_CHANGE") ?? "?";
  const holdout =
    field(featureGap, "HOLDOUT") ??
    firstLineMatch(featureGap, /\*\*HOLDOUT:\*\*\s*([^\n·]+)/i) ??
    "SEALED";
  const edge =
    field(featureGap, "EDGE_CLAIM") ??
    firstLineMatch(featureGap, /\*\*EDGE_CLAIM:\*\*\s*([^\n·]+)/i) ??
    "NONE";

  const nextAction = excerptNextAction(nextChange);
  const lastResultHints = [
    "c1 REJECT (Gate10 + VAL proxyR)",
    "stamp dump done; CLEAR_PIT_SAFE=NO",
    "BEST_ALT=NONE_JUSTIFIED",
    "contradiction_type measurement PASS; feature-story YES",
  ];
  const parked = [
    "SELECTIVE_UNLOCK (current features)",
    "c4 score/implement (NOT_DEFINED)",
    "audit areas 2–4",
    "QUEUED_SUSPECTS 1–5",
    "binary c1 / cited_mss DEFINE_BLOCK",
  ];

  console.log("=== KAREN research status ===");
  console.log(`DATE_HINT: 2026-08-16 (SoT docs)`);
  console.log(`HANDOFF: ${handoff ? DOCS.handoff : "(missing — create data/research/KAREN-HANDOFF.md)"}`);
  console.log("");
  console.log(`BOTTLENECK: ${bottleneck}`);
  console.log(`ACTIVE_MEASUREMENT: contradiction_type (ONE_FEATURE=${oneFeature})`);
  console.log(`  AUDIT_STATUS: ${audit}`);
  console.log(`  STOP_CONDITION: ${stop}`);
  console.log(`  SELECTIVE_UNLOCK: ${selective}`);
  console.log(`  C4_SINGLE_CHANGE: ${c4}`);
  console.log("");
  console.log("PARKED:");
  for (const p of parked) console.log(`  - ${p}`);
  console.log("");
  console.log("LAST_RESULTS:");
  for (const r of lastResultHints) console.log(`  - ${r}`);
  console.log("");
  console.log(`NEXT_ACTION: ${nextAction}`);
  console.log("");
  console.log(`EDGE_CLAIM: ${edge}`);
  console.log(`HOLDOUT: ${holdout}`);
  console.log(`VAL: DO NOT TOUCH`);
  console.log(`DEBT: ${DOCS.debt}`);
  console.log("");
  console.log("SoT sources:");
  for (const f of [DOCS.featureGap, DOCS.nextChange, DOCS.queue, DOCS.handoff]) {
    console.log(`  ${existsSync(join(RESEARCH, f)) ? "ok" : "MISSING"}  ${f}`);
  }
}

main();