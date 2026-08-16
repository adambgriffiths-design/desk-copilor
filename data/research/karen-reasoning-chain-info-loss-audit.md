# KAREN — Reasoning-chain information-loss audit

**DATE:** 2026-08-16  
**MODE:** representation audit only  
**EDGE_CLAIM:** NONE  
**OUTCOMES:** NO  
**OUTCOMES_INSPECTED:** NO  
**UNLOCK / ALS / VAL / HOLDOUT:** not touched  

**Authorization:** Adam — reasoning-chain vs `citedConcepts` / `featuresAtT` info-loss (Lane 2 follow-on).

---

## METHOD

Compare what `buildDecisionEnvelope` already computes on `DecisionEnvelope.reasoningChain[]` vs what research stamps into `featuresAtT` (and DV `EvidenceAtT`).

No trading outcomes, proxyR, GOOD/BAD, clearance, MFE/MAE, or holdout/VAL inspection.

### Sources

| Source | Role |
|--------|------|
| `lib/decision-envelope.ts` | `ReasoningChainItem`, `buildReasoningChain`, `citeConcepts`, `applyConceptRoles` |
| `data/research/karen-decision-architecture.md` | Detected vs used / playbook checklist SoT |
| `lib/research/architecture/trace.ts` | Research-facing concept status derived from full chain |
| DV `EvidenceAtT` (replay stamp) | Persists `citedConcepts: string[]` only from envelope |
| `scripts/karen-dv-force-wait-shadow-stamps-y1500.ts` | `featuresAtT.citedConcepts` pass-through |
| Parent: [`karen-decision-pipeline-info-loss-audit.md`](./karen-decision-pipeline-info-loss-audit.md) Rank-2 |

### Pipeline collapse

```
buildReasoningChain → ReasoningChainItem[] (full playbook rows)
  → citeConcepts → citedConcepts: string[]  (PRIMARY drivers only)
  → applyConceptRoles → role / usedInDecision / detected on each row
  → DV EvidenceAtT.citedConcepts = env.citedConcepts
  → featuresAtT.citedConcepts = e.citedConcepts
  ✗ reasoningChain[] never copied into EvidenceAtT / featuresAtT
```

Live decision memory / analysis contract can still hold the full envelope; **research stamps do not**.

---

## INTERNAL (what Karen knows)

### Fixed playbook (`PLAYBOOK_CHAIN_CONCEPTS`)

Always 10 rows (omit = bug). Order:

`htf_bias` · `premium_discount` · `liquidity_sweep_pdh` · `liquidity_sweep_pdl` · `session_liquidity` · `eqh` · `eql` · `mss` · `displacement` · `fvg`

### Per-row schema (`ReasoningChainItem`)

| Field | Type | Meaning |
|-------|------|---------|
| `concept` | playbook id | Checklist slot |
| `checked` | boolean | Evaluated (`true`) vs not enough data (`false`) |
| `outcome` | `true` \| `false` \| `uncertain` | Proven / absent / UNPROVEN-or-unknown |
| `detected` | boolean | **Derived:** `outcome === "true"` |
| `role` | `PRIMARY` \| `SUPPORTING` \| `NONE` | After cite pass |
| `usedInDecision` | boolean | **Derived:** `role === PRIMARY \| SUPPORTING` |
| `evidence` | `ReasoningEvidence` | `source`, optional `prices`, `swing`, `candleTime`, `close`, `tolerance`, `snapshotId`, `candleId`, `status` |
| `impact` | string | How the row moved (or did not move) stance |

### How cite / role are assigned

1. **`citeConcepts`** builds `citedConcepts` from conflict + stance + impact regex (subset of playbook ids).
2. **`applyConceptRoles`**:
   - id ∈ `citedConcepts` → `role = PRIMARY`, `usedInDecision = true`
   - else if `detected` and impact matches `/support|confirmation|agrees with/i` → `SUPPORTING`, `usedInDecision = true`
   - else → `NONE`, `usedInDecision = false`

**Implication:** `citedConcepts` ≈ PRIMARY ids only. **SUPPORTING rows are used in the decision but absent from the research string list.**

### Relationships (not a separate edge list)

There is no explicit concept-graph type. Relationships live in:

| Carrier | What it encodes |
|---------|-----------------|
| `conflictResolution.between` | `primary_vs_htf` → co-cites `mss`+`htf_bias`; `session_stay_out` → `session_liquidity`; `both_sides` → both PDH/PDL sweeps |
| Co-PRIMARY set | Which concepts jointly drove stance |
| SUPPORTING vs PRIMARY | Confirmation vs driver |
| `impact` prose | Causal “why flat/wait/disagree/UNPROVEN” text |
| Fixed playbook order | Checklist completeness (checked-false still present) |

---

## RESEARCH SURFACE (what survives)

| Surface | Reasoning content |
|---------|-------------------|
| `EvidenceAtT.citedConcepts` | `string[]` — PRIMARY ids only |
| `featuresAtT.citedConcepts` | Same pass-through |
| Univariate screens | Membership flags e.g. `citedConcepts∋mss` |

**Not stamped:** `reasoningChain[]`, `checked`, `detected`, `usedInDecision`, `role`, `evidence`, `outcome`, `impact`, `conflictResolution.between` / `conflictLog`.

Adjacent market fields (`tradeableBias`, `marketStructure`, `fvgStatus`, `liquidityLevels`, HTF stack, …) are **not** substitutes for chain state: they describe observation, not “checked / proven / used / role for this stance.”

---

## FIELD-LEVEL LOSS (`reasoningChain` → `citedConcepts` only)

| Field | Lost? | Reconstructible from `citedConcepts` alone? | Notes |
|-------|-------|-----------------------------------------------|-------|
| `concept` (full checklist) | **Partial** | **NO** | Only PRIMARY ids appear; unchecked / false / uncertain / SUPPORTING / NONE rows vanish |
| `checked` | **YES** | **NO** | Cannot tell “skipped for lack of data” vs “evaluated absent” vs “never listed” |
| `detected` | **YES** | **NO** | Detected+NONE (e.g. EQH present, unused) invisible; cite ≠ detection |
| `usedInDecision` | **YES** | **Partial** | PRIMARY ⊆ used; **SUPPORTING used-but-not-cited** invisible |
| `role` | **YES** | **NO** | PRIMARY vs SUPPORTING vs NONE collapsed; membership only implies PRIMARY |
| `evidence` | **YES** | **NO** | Provenance (candleId/time/prices/tolerance/status) dropped; some overlaps other stamps but not concept-bound |
| `outcome` | **YES** | **NO** | `true` / `false` / `uncertain` (UNPROVEN sweeps) invisible; cite can fire on impact language without `outcome===true` |
| `impact` | **YES** | **NO** | Stance-explanation prose discarded |
| Relationships | **YES** | **Partial** | Co-citation of PRIMARY ids only; conflict `between`, SUPPORTING links, impact causality gone |

### Concrete failure modes (representation only)

1. **Detected ≠ used** — architecture SoT (`EQH detected YES, role NONE`) cannot be asked from stamps.
2. **UNPROVEN ≠ taken** — sweep `outcome: uncertain` (taken flag without candle/time) vs `false` vs `true` collapsed; research “cite token” mixes stay-out / wait / conflict prose with proven sweeps.
3. **PDH vs PDL asymmetry** — both may be checked with different outcomes; only cited side(s) survive; non-cited side’s outcome lost.
4. **SUPPORTING confirmation** — e.g. displacement/FVG supporting a long without being PRIMARY — invisible to `citedConcepts∋…` screens.
5. **Checklist completeness** — `checked: false` rows prove the playbook ran; omission from the string list looks identical to “not on playbook.”
6. **Conflict coupling** — `primary_vs_htf` relationship is co-cite of `mss`+`htf_bias` without `between` enum; cannot distinguish intentional conflict cite from coincidental dual PRIMARY.

---

## WHAT IS *NOT* LOST (scope boundaries)

- Full chain still exists on live `DecisionEnvelope` when memory / contract / UI attach the envelope.
- Architecture trace helpers (`conceptStatusesFromEnvelope`) recover usage when the envelope is present — **not** on DV stamp path.
- Observation-level liquidity / HTF / FVG stamps (separate audits) reduce *market* blindness; they do **not** restore chain role/outcome/checked.

---

## SMALLEST_REPR (worth preserving in `featuresAtT`)

**Goal:** restore detected≠used, UNPROVEN≠taken, and checklist completeness without shipping full evidence blobs or impact essays.

### Recommended: `reasoning_repr_v0`

```ts
// featuresAtT / EvidenceAtT additive fields
reasoningRepresentationVersion: "reasoning_repr_v0"
reasoningChainCompact: Array<{
  concept: string;   // playbook id
  checked: boolean;
  outcome: "true" | "false" | "uncertain";
  role: "PRIMARY" | "SUPPORTING" | "NONE";
}>
/** Optional 1-enum relationship restore — tiny, high leverage */
conflictBetween?: "primary_vs_htf" | "session_stay_out" | "both_sides" | "none"
```

**Always emit all 10 playbook rows** (same rule as envelope). Keep existing `citedConcepts` as a derived back-compat view:

`citedConcepts ≡ reasoningChainCompact.filter(r => r.role === "PRIMARY").map(r => r.concept)`

### Why this is minimal (and sufficient)

| Need | Covered by |
|------|------------|
| Detected | `outcome === "true"` (same derivation as envelope `detected`) |
| Used in decision | `role ∈ {PRIMARY, SUPPORTING}` |
| PRIMARY vs SUPPORTING vs unused | `role` |
| Checked vs skipped | `checked` |
| Proven vs absent vs UNPROVEN | `outcome` |
| Conflict co-drive relationship | `conflictBetween` (+ PRIMARY set) |
| Concept identity | `concept` |

### Explicitly **out** of v0 (defer)

| Dropped | Why safe to defer |
|---------|-------------------|
| `evidence.*` | Level timing / prices / FVG / structure increasingly on other stamps (`liquidity_repr_v*`, HTF stack, etc.); provenance audits stay there |
| `impact` string | Large; mostly regenerable for research from `{concept, outcome, role}` + stance; keep on full envelope for UI/voice |
| Full `conflictLog` | `conflictBetween` is the relationship bit research needs first |
| Duplicate `detected` / `usedInDecision` columns | Pure functions of `outcome` / `role` |

### Size

≤ 10 compact rows × 4 fields + 1 enum ≈ small vs full chain JSON (~3k chars with evidence+impact).

### HTF-lesson analog

`citedConcepts` membership **does not invert** chain state — same class as collapsing `htf_bias` stack to `tradeableBias`. Compact rows restore invertibility for checked/outcome/role without replaying the envelope.

---

## GOVERNANCE

- EDGE_CLAIM **NONE**
- OUTCOMES **NO** · no unlock / ALS / VAL / HOLDOUT
- Representation-only recommendation — no stamp implementation required by this audit
- Parent Rank-2 loss remains open until `reasoning_repr_v0` (or equivalent) is instrumented

Related: [`karen-decision-pipeline-info-loss-audit.md`](./karen-decision-pipeline-info-loss-audit.md) · [`karen-decision-architecture.md`](./karen-decision-architecture.md) · [`karen-liquidity-internal-vs-featuresAtT.md`](./karen-liquidity-internal-vs-featuresAtT.md)

---

## Exact return block

```
REASONING_CHAIN_INFO_LOSS_AUDIT: PASS
OUTCOMES: NO
LOSS: reasoningChain[] → citedConcepts[] only
  - checked / detected / usedInDecision / role / evidence / outcome / impact: LOST
  - relationships: LOST except accidental PRIMARY co-membership
  - SUPPORTING used-but-not-cited: invisible
SMALLEST_REPR: reasoning_repr_v0 =
  reasoningChainCompact[{concept, checked, outcome, role}] × full playbook
  + optional conflictBetween
  (citedConcepts retained as PRIMARY-derived back-compat)
REPORT_PATH: data/research/karen-reasoning-chain-info-loss-audit.md
```
