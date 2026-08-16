/**
 * Enrich existing FORCE_WAIT Y=1500 shadow stamp dump with typed contradictionItems.
 *
 * Same reconstruction as featuresAtT in karen-dv-force-wait-shadow-stamps-y1500.ts —
 * additive only; legacy contradictions / contradictionCount / c1Shadow / verdicts untouched.
 *
 * Prefer this when a full DV re-stamp is too heavy; semantically equivalent for typed fields
 * because DV records never carried full obs+interp beyond these evidence fields.
 *
 *   npx tsx scripts/karen-dv-enrich-contradiction-items-stamps.ts
 */
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from "fs";
import { join } from "path";
import {
  CONTRADICTION_REPRESENTATION_VERSION,
  stampContradictionItemsFromDvEvidence,
} from "../lib/contradiction-stamp-features";

const root = process.cwd();
const reportsDir = join(root, "data/karen-decision-validation/acquisition/reports");
const latestPath = join(reportsDir, "force-wait-shadow-stamps-y1500-latest.json");
const jsonlPath = join(reportsDir, "force-wait-shadow-stamps-y1500-latest.jsonl");
const schemaPath = join(reportsDir, "force-wait-shadow-stamps-y1500.schema.md");

type Feat = {
  marketStructure?: string | null;
  tradeableBias?: string | null;
  displacement?: string | null;
  fvgStatus?: string | null;
  longSupported?: boolean;
  shortSupported?: boolean;
  contradictions?: string[];
  contradictionCount?: number;
  contradictionItems?: unknown;
  contradictionRepresentationVersion?: string;
  [k: string]: unknown;
};

type Stamp = {
  asOf: string;
  population: string;
  baselineVerdict?: string;
  featuresAtT: Feat;
  c1Shadow?: unknown;
  [k: string]: unknown;
};

function enrichFeatures(f: Feat): Feat {
  const contradictions = [...(f.contradictions ?? [])];
  const contradictionCount = f.contradictionCount ?? contradictions.length;
  const contradictionItems = stampContradictionItemsFromDvEvidence({
    marketStructure: f.marketStructure,
    tradeableBias: f.tradeableBias,
    displacement: f.displacement,
    fvgStatus: f.fvgStatus,
    longSupported: f.longSupported,
    shortSupported: f.shortSupported,
    contradictions,
  });
  // Rebuild object with legacy fields first (same values), then typed add-ons.
  const {
    contradictionItems: _dropItems,
    contradictionRepresentationVersion: _dropVer,
    ...rest
  } = f;
  return {
    ...rest,
    contradictions,
    contradictionCount,
    contradictionItems,
    contradictionRepresentationVersion: CONTRADICTION_REPRESENTATION_VERSION,
  };
}

function main() {
  const raw = readFileSync(latestPath, "utf8");
  const dump = JSON.parse(raw) as {
    stamps?: Stamp[];
    schemaNote?: Record<string, unknown>;
    at?: string;
    [k: string]: unknown;
  };
  const stamps = dump.stamps ?? [];
  if (stamps.length === 0) {
    console.error(JSON.stringify({ ok: false, error: "no stamps" }));
    process.exit(1);
  }

  const at = new Date().toISOString();
  const stampTag = at.replace(/[:.]/g, "-");
  const backupPath = join(
    reportsDir,
    `force-wait-shadow-stamps-y1500-pre-enrich-${stampTag}.json`
  );
  copyFileSync(latestPath, backupPath);

  const enriched = stamps.map((s) => ({
    ...s,
    featuresAtT: enrichFeatures(s.featuresAtT ?? {}),
  }));

  const withItems = enriched.filter(
    (s) => (s.featuresAtT.contradictionItems as unknown[] | undefined)?.length
  ).length;

  dump.stamps = enriched;
  dump.at = at;
  dump.enrichment = {
    kind: "contradiction_items_v1",
    method: "stampContradictionItemsFromDvEvidence on existing dump featuresAtT",
    note: "Additive typed fields; full DV re-stamp not required for typed reconstruction parity",
    representationVersion: CONTRADICTION_REPRESENTATION_VERSION,
    stampsEnriched: enriched.length,
    stampsWithTypedItems: withItems,
  };
  dump.schemaNote = {
    ...(dump.schemaNote ?? {}),
    featuresAtT:
      "PIT-safe fields frozen at asOf (evidence + reasoningStructure + derived PD geometry). Outcomes excluded. Includes contradictionItems (typed) + legacy contradictions[]/contradictionCount.",
    contradictionItems:
      "Typed items {id,severity,affects,polarity,evidence_paths,description} via stampContradictionItemsFromDvEvidence — mirrors buildContradictionReport predicates from DV evidence fields; polarity for structure_vs_bias from marketStructure×tradeableBias. Version: contradiction_repr_v1.",
  };

  writeFileSync(latestPath, JSON.stringify(dump, null, 2));
  writeFileSync(jsonlPath, enriched.map((s) => JSON.stringify(s)).join("\n") + "\n");

  const stampedPath = join(reportsDir, `force-wait-shadow-stamps-y1500-${stampTag}.json`);
  writeFileSync(stampedPath, JSON.stringify(dump, null, 2));

  const schemaMd = `# FORCE_WAIT shadow stamp dump — schema (DEV Y=1500)

**KIND:** \`force_wait_shadow_stamps_y1500\`  
**BASELINE:** baseline-v2  
**EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED · **VAL:** not touched  
**C4_DEFINED:** NO · **C4_SINGLE_CHANGE:** NOT_DEFINED  
**REPRESENTATION:** \`contradiction_repr_v1\` (typed contradictionItems)

## Purpose

PIT-safe stamp table for discriminator search: baseline FORCE_WAIT / WAIT→ACT-under-c1 states with features at *t* and c1 shadow side/outcomes scored **after** freeze.

## Files

| File | Content |
|------|---------|
| \`force-wait-shadow-stamps-y1500-latest.json\` | Full report + stamps[] |
| \`force-wait-shadow-stamps-y1500-latest.jsonl\` | One stamp JSON per line |
| \`force-wait-shadow-stamps-y1500-*.json\` | Timestamped snapshot |

## Stamp fields

- \`asOf\` — evaluation timestamp
- \`population\` — \`FORCE_WAIT\` | \`WAIT_TO_ACT_NON_FORCE\` | \`FORCE_WAIT_STAY_WAIT\`
- \`baselineForceWaitPrimary\` — taxonomy primary (one-sided support + WAIT)
- \`featuresAtT\` — evidence + reasoningStructure + PD geometry; **no** post-t labels
- \`featuresAtT.contradictions\` / \`contradictionCount\` — legacy free-text (unchanged meaning)
- \`featuresAtT.contradictionItems\` — typed \`{id, severity, affects, polarity, evidence_paths, description}\` (\`contradiction_repr_v1\`)
- \`c1Shadow.side\` / \`outcomeLabel\` — shadow under \`c1_wait_entry_actionable\` after freeze

### Typed contradiction reconstruction (DV)

DV records lack full obs+interp. Typed items are reconstructed at stamp time from asOf evidence + reasoningStructure via \`stampContradictionItemsFromDvEvidence\` (same predicates as \`buildContradictionReport\`). \`htfAligned\` / \`dataQuality\` are not on EvidenceAtT — HTF misalignment inferred from contradiction string when needed.

### Outcome label rule (analysis only)

1. GOOD if \`targetBeforeInvalidation\`
2. BAD if \`invalidationBeforeTarget\`
3. else GOOD if \`proxyR >= 0.25\`; BAD if \`proxyR <= -0.25\`
4. else NEUTRAL

**Forbidden:** using outcomeLabel / proxyR / MFE/MAE as live gate features.

## Non-goals

- Not a scored experiment registry row
- Not a c4 predicate
- Does not resurrect/promote c1
`;
  writeFileSync(schemaPath, schemaMd);

  console.log(
    JSON.stringify(
      {
        ok: true,
        stamps: enriched.length,
        stampsWithTypedItems: withItems,
        representationVersion: CONTRADICTION_REPRESENTATION_VERSION,
        paths: { latestPath, jsonlPath, schemaPath, stampedPath, backupPath },
      },
      null,
      2
    )
  );
}

main();
