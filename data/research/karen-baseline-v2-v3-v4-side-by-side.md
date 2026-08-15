# Trading-brain baselines v2 / v3 / v4 — side-by-side

**Read-only collation** from completed TREE artifacts (2026-08-15).  
**EDGE_CLAIM:** NONE (all packages). **HOLDOUT / VAL:** not touched.  
**No metrics invented** — cells marked **NOT MEASURED** when absent from reports.

**Sources (TREE `.tmp/karen-final-integration/`):**

| Version | Latest report | Research note | Freeze lock |
|---------|---------------|---------------|-------------|
| v2 | `data/karen-decision-validation/v2/reports/trading-brain-baseline-v2-latest.{json,md}` | `data/research/karen-trading-brain-baseline-v2.md` | `karen-semantic-baseline-freeze.md` → **baseline-v2 FROZEN** |
| v3 | `…/v3/reports/trading-brain-baseline-v3-latest.{json,md}` | `karen-trading-brain-baseline-v3.md` (+ micro: `karen-micro-fixtures-v3-v4.md`) | CANDIDATE — **NOT promoted** |
| v4 | `…/v4/reports/trading-brain-baseline-v4-latest.{json,md}` | `karen-trading-brain-baseline-v4.md` (+ micro) | CANDIDATE — **NOT promoted** |

Repo mirrors of the research notes exist under `data/research/`.

**Shared eval contract (all three):** fixture `mnq-week-chronological-dev-v0`; manifest `evaluation-timestamps-v0:development`; **214/214** paired asOfs; FULL_REPLAY **PASS**.

**v1 context (previous baseline of v2):** FROZEN — directed displacement + MSS≠bias; sweeps still dual-credited. Integrity package `v1 vs v2` generatedAt `2026-08-15T11:41:20.029Z`.

---

## Side-by-side table

| Field | **v2** | **v3** | **v4** |
|-------|--------|--------|--------|
| **Status** | **FROZEN** (experiment + production HEAD) | **CANDIDATE** — NOT promoted / NOT frozen | **CANDIDATE** — NOT promoted / NOT frozen |
| **Exact change vs previous baseline** | **vs v1:** sweep dual-credit only — SSL→long only; BSL→short only; unknown→neither (+ preserve detector `side` on levels) | **vs v2:** PD refuse lastPrice invent — missing prior day → PD unknown (no `prev ?? lastPrice`) | **vs frozen v2 (integrity package is v2↔v4, not stacked on v3):** empty-session HL refuse — empty session window → unknown (no today-HL / lastPrice invent). **vs v3:** different invent-path (session HL vs PD); **no stacked v3→v4 full-214 package** |
| **Integrity compare kind** | `trading_brain_baseline_integrity_v1_vs_v2` | `…_v2_vs_v3` | `…_v2_vs_v4` (isolated; note: “not stacked with v3”) |
| **Run / generatedAt** | `2026-08-15T11:41:20.029Z` (runId `…11-41-12-764Z`) | `2026-08-15T12:03:58.367Z` (runId `…12-03-54-087Z`) | `2026-08-15T12:35:31.756Z` (runId `…12-35-24-236Z`) |
| **N evals (paired asOfs)** | 214 / 214 | 214 / 214 | 214 / 214 |
| **asOf range (manifest)** | `2026-08-06T07:00:00.000Z` → `2026-08-10T19:25:00.000Z` | same | same |
| **Number of days (explicit)** | **NOT MEASURED** (range spans calendar Aug 6–10; no `number_of_days` field in package) | **NOT MEASURED** | **NOT MEASURED** |
| **LONG / SHORT / WAIT / NO_TRADE** | 16 / 12 / 155 / 31 | 16 / 12 / 155 / 31 | 16 / 12 / 155 / 31 |
| **Actionable (paired counts)** | 26 / 214 (~12.1% density) | 26 / 214 (same) | 26 / 214 (same) |
| **Directional L+S** | 28 | 28 | 28 |
| **STRICT actionable episodes** | **NOT MEASURED** (reports use actionable decision counts, not STRICT episode ledger) | **NOT MEASURED** | **NOT MEASURED** |
| **Verdict deltas vs prior** | **vs v1:** LONG +3, SHORT +1, WAIT −1, NO_TRADE −3, ACTIONABLE +4; `verdictChanged` **15** | **vs v2:** all Δ **0**; `verdictChanged` **0** | **vs v2:** all Δ **0**; `verdictChanged` **0**. **vs v3 natural 214:** **NOT MEASURED** (no v3↔v4 paired package) |
| **Structural deltas vs prior** | **vs v1:** `structureChanged` **109**; structureΔ & verdict same **94**; same-WAIT reasoningΔ **82** | **vs v2:** structureChanged **0**; buckets `SAME_VERDICT_SAME_REASONING` **214** | **vs v2:** structureChanged **0**; `SAME_VERDICT_SAME_REASONING` **214** |
| **Target confounder rate** | `sweeps_dual_credit`: v1 109/214 (50.9%) → v2 **0** | `pd_level_fallback_last_price`: v2 & v3 both **0** active on natural 214 | `empty_session_hl_fallback`: v2 & v4 both **0** active (auto-detect may lack provenance flags) |
| **MEDIAN_MFE** | 18 | 18 | 18 |
| **MEDIAN_MAE** | 41.5 | 41.5 | 41.5 |
| **TARGET_BEFORE_INVALIDATION_RATE** | 0.1875 | 0.1875 | 0.1875 |
| **proxy-R / expectancy** | **NOT MEASURED** | **NOT MEASURED** | **NOT MEASURED** |
| **PIT / lookahead** | `LOOKAHEAD_VIOLATIONS` **0**; `lookAheadPass` true | **0**; true | **0**; true |
| **DQ exclusions** | `DATA_QUALITY_EXCLUSIONS` **2** | **2** | **2** |
| **Frozen / promoted / rejected** | **FROZEN** + promoted to experiment HEAD | **CANDIDATE**; invent-path **FIX_PROVEN_ON_MICROFIXTURE**; natural Δ0 → **NOT promoted** | **CANDIDATE**; **PATH_TRIGGERED_DELTA0** on micro; natural Δ0 → **NOT promoted** |
| **EDGE_CLAIM** | NONE | NONE | NONE |

### Micro-fixture proof (not the natural 214) — from `karen-micro-fixtures-v3-v4.md`

| Compare | Paired | Verdict Δ | Structure Δ | Actionable Δ | Status label |
|---------|-------:|----------:|------------:|-------------:|--------------|
| v2→v3 (PD invent fixture) | 3 | 2 | 2 | −2 | FIX_PROVEN_ON_MICROFIXTURE |
| v2→v4 (empty-session fixture) | 3 | 0 | 0 | 0 | PATH_TRIGGERED_DELTA0 |

---

## Plain English

### v1 → v2 (context)

v1 froze directed displacement and MSS≠bias but still dual-credited the same liquidity sweep to both long and short. v2 is the freeze that stops that: sell-side sweeps credit long only, buy-side short only. On the natural 214 that cleaned a lot of reasoning (`structureChanged` 109) and moved 15 verdicts / +4 actionable — correctness of credit, not an edge claim. **v2 is the frozen semantic baseline for experiments.**

### v2 → v3

Intent: stop inventing prior-day levels via `lastPrice` when the prior day is missing — mark PD unknown instead. On the natural DEV 214, that path never fired (`pd_level_fallback_last_price` 0; every verdict/structure identical to v2). Micro-fixtures prove the refuse path changes levels and some verdicts when invent is forced. Programme kept v3 as **candidate only** — do not change production default without Adam.

### v3 → v4 (and v2 → v4)

v4 is a **sibling** invent-path candidate, not a stacked promotion of v3: refuse fake Asia/London/etc. highs/lows when the session window is empty (no today-HL invent). Integrity reports compare **v4 vs frozen v2** (same 214, Δ0 everywhere). Micro shows context invent vs refuse differs, but DV verdicts still Δ0. Freeze lock: leave as candidate; prefer clean frozen v2 over unclear invent-path promotions.

---

## Artifact pointers

```
.tmp/karen-final-integration/data/karen-decision-validation/v2/reports/trading-brain-baseline-v2-latest.md
.tmp/karen-final-integration/data/karen-decision-validation/v3/reports/trading-brain-baseline-v3-latest.md
.tmp/karen-final-integration/data/karen-decision-validation/v4/reports/trading-brain-baseline-v4-latest.md
data/research/karen-semantic-baseline-freeze.md
data/research/karen-micro-fixtures-v3-v4.md
```

**Repo mirror of this doc:** `data/research/karen-baseline-v2-v3-v4-side-by-side.md`  
**TREE mirror:** write/copy beside other research under `.tmp/karen-final-integration/data/research/` when syncing.
