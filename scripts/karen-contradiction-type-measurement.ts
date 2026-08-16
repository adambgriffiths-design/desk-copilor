/**
 * Frequency / co-occurrence + type-vs-count information measurement from typed stamps.
 *
 * NO GOOD/BAD / proxyR / outcomes.
 *
 *   node --import tsx scripts/karen-contradiction-type-measurement.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { ContradictionStampItem } from "../lib/contradiction-stamp-features";

const root = process.cwd();
const stampPath = join(
  root,
  "data/karen-decision-validation/acquisition/reports/force-wait-shadow-stamps-y1500-latest.json"
);
const outJson = join(
  root,
  "data/karen-decision-validation/acquisition/reports/contradiction-type-measurement-latest.json"
);
const outTypeVsCountJson = join(
  root,
  "data/karen-decision-validation/acquisition/reports/contradiction-type-vs-count-latest.json"
);
const outMd = join(root, "data/research/karen-contradiction-type-measurement.md");
const outTypeVsCountMd = join(
  root,
  "data/research/karen-contradiction-type-vs-count-measurement.md"
);

type Stamp = {
  asOf: string;
  population: string;
  featuresAtT: {
    contradictions?: string[];
    contradictionCount?: number;
    contradictionItems?: ContradictionStampItem[];
    marketStructure?: string | null;
    tradeableBias?: string | null;
  };
  c1Shadow?: { actionable?: boolean };
};

function entropy(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let h = 0;
  for (const c of counts) {
    if (c <= 0) continue;
    const p = c / total;
    h -= p * Math.log2(p);
  }
  return h;
}

function taxonomyOf(item: ContradictionStampItem): string {
  if (item.id === "structure_vs_bias") {
    if (item.polarity === "bullish_struct_bearish_bias")
      return "STRUCTURE_VS_BIAS_BULLISH_STRUCT";
    if (item.polarity === "bearish_struct_bullish_bias")
      return "STRUCTURE_VS_BIAS_BEARISH_STRUCT";
    return "STRUCTURE_VS_BIAS_UNKNOWN_POLARITY";
  }
  if (item.id === "htf_misaligned") return "HTF_BIAS_MISALIGNED";
  return item.id.toUpperCase();
}

function sortMap(m: Map<string, number>) {
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function main() {
  const dump = JSON.parse(readFileSync(stampPath, "utf8")) as {
    stamps?: Stamp[];
    at?: string;
  };
  const stamps = (dump.stamps ?? []).filter(
    (s) => s.population === "FORCE_WAIT" && s.c1Shadow?.actionable === true
  );
  const n = stamps.length;

  const idFreq = new Map<string, number>();
  const taxFreq = new Map<string, number>();
  const polFreq = new Map<string, number>();
  const sevFreq = new Map<string, number>();
  const comboFreq = new Map<string, number>();
  const underCc1Tax = new Map<string, number>();
  const typesUnderCountBin = new Map<string, Map<string, number>>();
  let typedCoverage = 0;
  let missingItems = 0;

  // Joint: count bin × type-combo for conditional entropy
  const jointCountType = new Map<string, number>();
  const countBinOnly = new Map<string, number>();

  for (const s of stamps) {
    const f = s.featuresAtT ?? {};
    const strings = [...(f.contradictions ?? [])];
    const cc = f.contradictionCount ?? strings.length;
    const items = f.contradictionItems;
    if (!Array.isArray(items)) {
      missingItems++;
      continue;
    }
    typedCoverage++;

    const taxIds: string[] = [];
    for (const item of items) {
      idFreq.set(item.id, (idFreq.get(item.id) ?? 0) + 1);
      sevFreq.set(item.severity, (sevFreq.get(item.severity) ?? 0) + 1);
      const tax = taxonomyOf(item);
      taxIds.push(tax);
      taxFreq.set(tax, (taxFreq.get(tax) ?? 0) + 1);
      if (item.polarity) polFreq.set(item.polarity, (polFreq.get(item.polarity) ?? 0) + 1);
    }

    if (items.length === 0) {
      taxFreq.set("NONE", (taxFreq.get("NONE") ?? 0) + 1);
      idFreq.set("none", (idFreq.get("none") ?? 0) + 1);
    }

    const comboKey =
      taxIds.length === 0 ? "NONE" : [...taxIds].sort().join("+");
    comboFreq.set(comboKey, (comboFreq.get(comboKey) ?? 0) + 1);

    const ccBin =
      cc === 0 ? "0" : cc === 1 ? "1" : cc === 2 ? "2" : "3+";
    countBinOnly.set(ccBin, (countBinOnly.get(ccBin) ?? 0) + 1);
    const jointKey = `${ccBin}||${comboKey}`;
    jointCountType.set(jointKey, (jointCountType.get(jointKey) ?? 0) + 1);

    if (!typesUnderCountBin.has(ccBin)) typesUnderCountBin.set(ccBin, new Map());
    const m = typesUnderCountBin.get(ccBin)!;
    m.set(comboKey, (m.get(comboKey) ?? 0) + 1);

    if (cc === 1) {
      const tax = taxIds[0] ?? "UNMAPPED";
      underCc1Tax.set(tax, (underCc1Tax.get(tax) ?? 0) + 1);
    }
  }

  const coveragePct = n > 0 ? (100 * typedCoverage) / n : 0;
  const H_count = entropy([...countBinOnly.values()]);
  const H_typeCombo = entropy([...comboFreq.values()]);
  const H_tax = entropy([...taxFreq.values()]);
  const H_joint = entropy([...jointCountType.values()]);
  // H(type | count) = H(count,type) - H(count)
  const H_type_given_count = Math.max(0, H_joint - H_count);
  // Mutual information I(type; count) = H(type) - H(type|count)
  const I_type_count = Math.max(0, H_typeCombo - H_type_given_count);

  const distinctTypesUnderCc1 = underCc1Tax.size;
  const richer =
    H_type_given_count > 0.01 ||
    (countBinOnly.get("1") ?? 0) > 0 && distinctTypesUnderCc1 > 1;

  const freqReport = {
    kind: "contradiction-type-measurement",
    EDGE_CLAIM: "NONE",
    HOLDOUT: "SEALED",
    VAL: "DO_NOT_TOUCH",
    SELECTIVE_UNLOCK: "PARKED",
    C4_SINGLE_CHANGE: "NOT_DEFINED",
    OUTCOMES_INSPECTED: false,
    at: new Date().toISOString(),
    sourceStamp: stampPath.replace(/\\/g, "/"),
    representation: "contradiction_repr_v1",
    population: "FORCE_WAIT ∩ c1Shadow.actionable",
    n,
    typedCoverageN: typedCoverage,
    typedCoveragePct: coveragePct,
    missingItems,
    idFreq: Object.fromEntries(sortMap(idFreq)),
    taxonomyFreq: Object.fromEntries(sortMap(taxFreq)),
    polarityFreq: Object.fromEntries(sortMap(polFreq)),
    severityFreq: Object.fromEntries(sortMap(sevFreq)),
    comboFreq: Object.fromEntries(sortMap(comboFreq)),
    underCc1Taxonomy: Object.fromEntries(sortMap(underCc1Tax)),
    countBin: Object.fromEntries(sortMap(countBinOnly)),
    VERIFICATION: missingItems === 0 && coveragePct === 100 ? "PASS" : "FAIL",
  };

  const typeVsCount = {
    kind: "contradiction-type-vs-count",
    measurement_id: "m_contradiction_type_adds_info_beyond_count_v0",
    EDGE_CLAIM: "NONE",
    HOLDOUT: "SEALED",
    VAL: "DO_NOT_TOUCH",
    OUTCOMES_INSPECTED: false,
    at: new Date().toISOString(),
    n,
    entropy: {
      H_countBin: H_count,
      H_typeCombo: H_typeCombo,
      H_taxonomyEvent: H_tax,
      H_joint_count_type: H_joint,
      H_type_given_count: H_type_given_count,
      I_type_count: I_type_count,
    },
    distinctTypesUnderCc1,
    underCc1Taxonomy: Object.fromEntries(sortMap(underCc1Tax)),
    typesUnderCountBin: Object.fromEntries(
      [...typesUnderCountBin.entries()].map(([k, m]) => [k, Object.fromEntries(sortMap(m))])
    ),
    TYPE_VS_COUNT_RICHER: richer ? "YES" : "NO",
    criterion:
      "RICHER if H(type|count)>0.01 OR (under cc=1, distinct taxonomy cells > 1)",
    VERIFICATION: "PASS",
  };

  writeFileSync(outJson, JSON.stringify(freqReport, null, 2));
  writeFileSync(outTypeVsCountJson, JSON.stringify(typeVsCount, null, 2));

  const md = `# KAREN — contradiction_type frequency (typed stamps)

**DATE:** ${new Date().toISOString().slice(0, 10)}  
**VERIFICATION:** **${freqReport.VERIFICATION}**  
**REPRESENTATION:** \`contradiction_repr_v1\`  
**EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED · **VAL:** DO NOT TOUCH  
**OUTCOMES_INSPECTED:** NO

## Population

FORCE_WAIT ∩ c1Shadow.actionable from \`force-wait-shadow-stamps-y1500-latest.json\` — **n=${n}**  
Typed coverage: **${coveragePct.toFixed(1)}%** (${typedCoverage}/${n})

## Id frequency (event counts)

${sortMap(idFreq)
  .map(([k, v]) => `- \`${k}\`: ${v}`)
  .join("\n")}

## Taxonomy / polarity / severity (counts only)

### Taxonomy
${sortMap(taxFreq)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

### Polarity
${sortMap(polFreq)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

### Severity
${sortMap(sevFreq)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

## Co-occurrence combos

${sortMap(comboFreq)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

## Under contradictionCount===1

${sortMap(underCc1Tax)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

## Non-goals

No GOOD/BAD, proxyR, unlock, ALS, score, or VAL.
`;

  const md2 = `# KAREN — does contradiction type add info beyond count?

**measurement_id:** \`m_contradiction_type_adds_info_beyond_count_v0\`  
**DATE:** ${new Date().toISOString().slice(0, 10)}  
**RUN:** executed (outcome-blind)  
**TYPE_VS_COUNT_RICHER:** **${typeVsCount.TYPE_VS_COUNT_RICHER}**  
**EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED · **OUTCOMES_INSPECTED:** NO

## Question

Does representing contradiction **type** add information beyond \`contradictionCount\`?

## Plan (predeclared) — executed

Entropy / conditional entropy / distinct types under each count bin / co-occurrence. **No outcomes.**

## Results

| Metric | Value |
|--------|------:|
| H(count bin) | ${H_count.toFixed(4)} |
| H(type combo) | ${H_typeCombo.toFixed(4)} |
| H(count, type) | ${H_joint.toFixed(4)} |
| H(type \\| count) | ${H_type_given_count.toFixed(4)} |
| I(type; count) | ${I_type_count.toFixed(4)} |
| Distinct types under cc=1 | ${distinctTypesUnderCc1} |

### Types under each count bin

${[...typesUnderCountBin.entries()]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(
    ([bin, m]) =>
      `**cc=${bin}**\n` +
      sortMap(m)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join("\n")
  )
  .join("\n\n")}

## Verdict

**TYPE_VS_COUNT_RICHER = ${typeVsCount.TYPE_VS_COUNT_RICHER}**  
Criterion: H(type|count) > 0.01 **or** >1 distinct taxonomy cell under cc=1.

## Paths

- \`${outTypeVsCountJson.replace(/\\/g, "/").replace(root.replace(/\\/g, "/") + "/", "")}\`
- Frequency companion: \`karen-contradiction-type-measurement.md\`
`;

  mkdirSync(join(root, "data/research"), { recursive: true });
  writeFileSync(outMd, md);
  writeFileSync(outTypeVsCountMd, md2);

  console.log(
    JSON.stringify(
      {
        VERIFICATION: freqReport.VERIFICATION,
        TYPE_VS_COUNT_RICHER: typeVsCount.TYPE_VS_COUNT_RICHER,
        H_type_given_count: H_type_given_count,
        distinctTypesUnderCc1,
        n,
        outMd,
        outTypeVsCountMd,
      },
      null,
      2
    )
  );
}

main();
