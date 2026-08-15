# KAREN — ENTRY_STATUS_FORCE_WAIT Bottleneck Attack

> **SUPERSEDED (NEXT only):** FINAL REPORT metrics / `GATE_CONCLUSION: KEEP_GATE` stand. The listed `NEXT_SINGLE_ACTION` (Protocol-score c1 Y=1500) is **done and superseded**: binary c1 = **REJECT** promote (Gate 10 + VAL proxyR). **ONE_NEXT** = `c4_shadow_quality_gated_wait` (`READY_TO_IMPLEMENT: N`). See `karen-next-single-change-dev-candidate.md`, c1 protocol decision, registry reject entry. **Do not** re-run c1 protocol/VAL.

**DATE:** 2026-08-15  
**TREE:** `.tmp/karen-final-integration/` (mirrored to repo `data/research/`)  
**PHASE:** trading-brain research / performance  
**MODE:** MEASURE FIRST  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED  
**VAL:** Peer auto-VAL observed (ingest only; **not** used for promotion / not retuned)

**REPORT_STATUS:** **COMPLETE for gate predicate + Y=1500 CF ingest** · WAIT→ACTION latency histograms still **TOO_EARLY** (no stamp timeline pass this wave) · heavy perf re-bench **SKIPPED** (peer occupied CPU; prior gates reused)

**Offline predicate test:** `scripts/test-karen-entry-status-force-wait-predicate.ts` → `ok:true`

---

## Constraint observance

- Semantic **v1–v4** integrity jobs were already finished earlier (not restarted).
- Peer `karen-dv-dev-overcaution-candidates.ts --limit=1500` allowed to finish; **not** duplicated. Results ingested from published `smoke:false` JSON @ `2026-08-15T20:40:12.230Z`.
- No gate removal, no threshold lowering, no VAL tuning, no HOLDOUT unlock.

---

## PART A — Clean baseline status

| Version | Status | Notes |
|---------|--------|-------|
| **v1** | **FROZEN** | Superseded for experiments |
| **v2** | **FROZEN** | **CURRENT_CLEAN_BASELINE** / experiment HEAD |
| **v3** | **CANDIDATE** | PD refuse; natural 214 Δ0 — not promoted |
| **v4** | **CANDIDATE** | Empty-session HL refuse; DV Δ0 — not promoted |

**CURRENT_CLEAN_BASELINE:** `baseline-v2`

---

## PART B — Exact gate predicate

### EXACT_GATE_PREDICATE

Frozen (`experiment=none`):

1. `getExecutionScaffold` → `buildWaitFor`:
   - `inZone` → `entryStatus=ACTIVE`
   - `extended` → `EXTENDED`
   - else → `WAIT` (“not at entry yet”)
2. `shouldForceEntryWait(entryStatus)` ≡ `entryStatus === "WAIT" || entryStatus === "EXTENDED"`
3. In `buildTradingDecision`, when **exactly one** of `long_case.supported` / `short_case.supported`:
   - if `shouldForceEntryWait` → verdict **WAIT** (bias text retained)
   - else → **LONG** or **SHORT**
4. Both sides supported → WAIT via conflict branch (not this gate).
5. QG `canDeliver=false` is orthogonal — measured **0** on taxonomy / dual-audit restraint waits.

**c1 (DEV overlay only):** `shouldForceEntryWait` true **only** for `EXTENDED`.

### Path

`observation → interpretation → execution scaffold (entryStatus) → shouldForceEntryWait → DecisionEnvelope`

### FIRST_BROKEN_HOP

No crashed hop. **Delivery bottleneck hop** = step 3 above after one-sided support while `entryStatus∈{WAIT,EXTENDED}`. QG not implicated. Upstream ACTIVE scarcity remains an open measure (esp. PRE era).

### Shares

| Source | WAIT_SHARE | ENTRY_STATUS_FORCE_WAIT_SHARE |
|--------|------------|-------------------------------|
| 8d taxonomy @15m | 77.2% (550/712) | **89.6%** of WAIT |
| Dual-audit / overcaution base Y=1500 | **79.2%** (1188/1500) | **≈90.4%** (1074/1188 WAIT→ACT under c1) |
| Era PRE / POST | — | 90.9% / 89.1% of WAIT |

---

## PART C — Counterfactual (Y=1500 paired; analysis only)

Shadow ≡ c1 semantics on identical asOfs (`entryStatus=WAIT` no longer forces; EXTENDED still does). **Not** a production DecisionEnvelope change.

| Class (code-faithful) | Approx count |
|----------------------|-------------:|
| LONG_WOULD_HAVE_OCCURRED | **519** (=560−41) |
| SHORT_WOULD_HAVE_OCCURRED | **555** (=587−32) |
| OTHER_GATE_STILL_BLOCKS | **≈113–114** residual WAIT under c1 ≈ both_sides (113) |
| NO_DIRECTION_ANYWAY | in NO_TRADE pool (239 unchanged) |

| | N | LONG | SHORT | T-before | med MFE | med MAE | mean proxyR |
|--|--:|-----:|------:|---------:|--------:|--------:|------------:|
| **COUNTERFACTUAL shadow ACT** (c1 all ACT) | **1147** | **560** | **587** | **0.581** | **11.75** | **10.75** | **+0.314** |
| of which WAIT→ACT flips | **1074** | 519 | 555 | (included in c1 ACT metrics) | | | |
| **CURRENT_ACTIONABLE** (baseline none) | **73** | **41** | **32** | **0.214** | **12** | **9.75** | **−0.330** |

**Gate-removal class (DEV quality):** **MIXED** — large T-before / proxyR lift on DEV, but ACT rate **1147/1500 = 76.5%** (frequency / spam risk). Informal peer VAL: T-before↑ but proxyR **worsens** (−0.561 → −1.053) → expectancy not confirmed.

---

## PART D — Delay vs permanent suppression

**WAIT_TO_ACTION latency bins:** still **TOO_EARLY** (no per-asOf same-direction clearance histogram this wave).

**Proxy evidence:** c1 converts **1074** waits to actionable on the **same asOf** with **0** ACT→WAIT — the gate is mostly **same-stamp suppression**, not a measured multi-minute delay curve. Quiet/PRE days with actionableRate=0 further suggest day-scale **PERMANENTLY_SUPPRESSED** under frozen gate for many states.

---

## PART E — PRE / POST 2024-06-24

| | PRE | POST |
|--|----:|-----:|
| ENTRY_FORCE / WAIT | **90.9%** | **89.1%** |
| Opp/day | **0.00** | **17.83** |
| Shadow actionable (era×c1) | **TOO_EARLY** (no era slice of Y=1500 c1) | TOO_EARLY |
| Quality | n/a | T-before 0.318 / proxyR −1.860 (dense STRICT) |

**Label:** **GATE_SEMANTICS + DATA_DIFFERENCE / FEATURE_AVAILABILITY** interaction — force-wait **rate** does not explain PRE≈0 vs POST≈18. Do **not** call pure MARKET_REGIME yet. Global c1 unlock implies PRE quiet mass is largely **gate-deliverable** once WAIT entryStatus stops blocking — strengthens gate role without proving regime.

---

## PART F — Quiet vs active / bimodality

| | CURRENT | SHADOW (implied by c1 Y=1500) |
|--|--------:|-------------------------------:|
| Quiet-day rate (40d panel) | **62.5%** | **TOO_EARLY** exact panel recompute |
| ACT rate @10m Y=1500 | 4.9% (73/1500) | **76.5%** (1147/1500) |

**BIMODALITY:** **ENTRY_GATE_EXPLAINS_BIMODALITY** (primary) with residual **OTHER_CAUSES** (era scaffold/ACTIVE-clearance). Formal quiet-rate under shadow panel = TOO_EARLY; directional evidence strong → not INCONCLUSIVE.

---

## PART G — Should this become a DEV candidate?

| Stance | Decision |
|--------|----------|
| Production gate | **KEEP_GATE** |
| Research / protocol | **RESEARCH_MORE** |
| Registry | c1 already the single-change DEV candidate — **do not remove gate**; do not treat peer auto-VAL as PROMOTE |

**Why not PROMOTE:** Gate 10 frequency collapse (76.5% ACT); VAL proxyR degradation; no STRICT episode panel / thirds package in this pass.

**GATE_CONCLUSION:** ENTRY_STATUS_FORCE_WAIT is the dominant WAIT primary (~90%). It **delays/suppresses** one-sided directional interpretation until scaffold ACTIVE (or c1 bypass). It is **not** compensating for QG failure. Removing WAIT-force (keep EXTENDED) **improves DEV T-before/proxyR** but **over-delivers** frequency and **fails VAL proxyR** — keep researching single-change c1 under protocol; **do not ship**.

---

## PARTS H–J — Performance (prior gates; no competing re-bench)

| Item | Value |
|------|-------|
| Bottleneck | **QG/envelope ~53%** · feature ~37% · `qg_dominant` stop |
| DAY_MS | ~**1.6s** warm struct+ctx @5m (2024-09-13) |
| Workers 1/2/4 | ~1.0× / 2.1× / **2.6×** · evals/sec ~24 / 51 / **64** |
| 429 DEV est @4w | ~**30 min** |
| 739 full est @4w | ~**52 min** |
| Peer wall (4×1500 sequential) | **~8335s (~139 min)** elapsedMs in report footer |
| SEMANTIC_HASH | **PASS** `a3c57a2992af5e72` |
| New QG-reuse opts | **NOT_RUN** this pass |

**PERFORMANCE:** Correctness > speed; next opt target = QG reuse with hash-match after idle CPU.

---

## PART K — Registry

- Infra + HOLDOUT guards: **PASS**
- New bottleneck experiment row: **not duplicated** (c1 already ledgered); protocol re-gate remains RESEARCH_MORE
- VAL peer peek recorded as **non-authoritative**

**EXPERIMENT_REGISTRY:** PASS  
**HOLDOUT:** SEALED  
**EDGE_CLAIM:** NONE  

---

## FINAL REPORT

```
CURRENT_CLEAN_BASELINE: baseline-v2
V1_STATUS: FROZEN
V2_STATUS: FROZEN
V3_STATUS: CANDIDATE
V4_STATUS: CANDIDATE
WAIT_SHARE: 79.2% (1188/1500)
ENTRY_STATUS_FORCE_WAIT_SHARE: 89.6% of WAIT (8d taxonomy); ≈90.4% (1074/1188 Y=1500 WAIT→ACT under c1)
EXACT_GATE_PREDICATE: shouldForceEntryWait(entryStatus)===(WAIT||EXTENDED) AND exactly-one-side-supported → WAIT instead of LONG/SHORT; entryStatus from buildWaitFor(inZone→ACTIVE, extended→EXTENDED, else→WAIT)
COUNTERFACTUAL: N=1147 LONG=560 SHORT=587 TARGET_BEFORE_INVALIDATION=0.581 MFE=11.75 MAE=10.75 PROXY_R=0.314
CURRENT_ACTIONABLE: N=73 TARGET_BEFORE_INVALIDATION=0.214 MFE=12 MAE=9.75 PROXY_R=-0.330
WAIT_TO_ACTION: 5M=TOO_EARLY 15M=TOO_EARLY 30M=TOO_EARLY 60M=TOO_EARLY NEVER=TOO_EARLY (same-stamp suppression dominant: 1074 WAIT→ACT @identical asOf)
PRE_2024_06_24: gate_rate=90.9% shadow_actionable=TOO_EARLY quality=n/a
POST_2024_06_24: gate_rate=89.1% shadow_actionable=TOO_EARLY quality=T-before=0.318 proxyR=-1.860
BIMODALITY: ENTRY_GATE_EXPLAINS_BIMODALITY (primary) + residual OTHER_CAUSES; current quiet=62.5%; shadow quiet panel=TOO_EARLY; ACT rate 4.9%→76.5% under c1
GATE_CONCLUSION: KEEP_GATE (prod) + RESEARCH_MORE (c1); MIXED removal class — DEV quality↑ but frequency spam + VAL proxyR↓; not QG compensation
PERFORMANCE: QG~53% dominant; DAY_MS~1.6s; workers 1/2/4 ~1.0/2.1/2.6×; 429d@4w~30m; 739d@4w~52m; heavy re-bench SKIPPED
SEMANTIC_HASH: PASS
PIT_VIOLATIONS: 0
EXPERIMENT_REGISTRY: PASS
HOLDOUT: SEALED
EDGE_CLAIM: NONE
NEXT_SINGLE_ACTION: SUPERSEDED — binary c1 REJECT promote (Gate 10 + VAL proxyR); ONE_NEXT = c4_shadow_quality_gated_wait (READY_TO_IMPLEMENT: N); do not re-run c1 protocol/VAL — see karen-next-single-change-dev-candidate.md
```

