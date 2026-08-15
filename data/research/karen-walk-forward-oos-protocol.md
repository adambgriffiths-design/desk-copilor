# KAREN — Anchored Walk-Forward OOS Protocol

**PHASE:** historical-validation methodology  
**MODE:** research / pre-registration (scaffolding only — no heavy DV replay)  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED — `2026-01-01 → 2026-08-14` never used for selection, ranking, or retuning  
**TREE:** `.tmp/karen-final-integration/` (mirrored to repo `data/research/`)  
**CONFIG:** `data/karen-decision-validation/configs/walk-forward-anchored-v1.json`  
**LOADER:** `lib/decision-validation/walk-forward-anchored.ts`  
**CARVE:** `archive-carve-v1`  
**PRE-REGISTERED:** 2026-08-15

---

## 0. Adam’s ranking (source of truth)

| Rank | Method | Role for Karen |
|-----:|--------|----------------|
| **1 (PRIMARY)** | **Anchored walk-forward + purge/embargo + final untouched holdout** | Default temporal validation design |
| 2 (later) | Combinatorial / purged CV (many configs) | Robustness check only — **stub in v1** |
| 3 | Single train/test | Too fragile **alone** (carve DEV→VAL is confirmatory, not a substitute for WF) |
| **4 — DO NOT USE** | **Random k-fold** | Forbidden for Karen financial time series |

This document formalizes rank-1. Rank-2 is acknowledged as a future stub only.

---

## 1. Why anchored walk-forward ≫ random k-fold

Karen Decision Validation (DV) scores **asOf** decisions with a forward **outcome horizon** (30m MFE/MAE / target-before-inv). Observations are:

1. **Time-ordered** — regimes, sessions, and structure evolve; shuffling destroys causality.
2. **Serially dependent** — nearby asOfs share bars, HTF context, and episode state.
3. **Label-overlapping** — an asOf at `t` uses bars in `(t, t+30m]` for outcomes; random folds put correlated train/test labels on both sides of a “split.”
4. **Leakage-prone under shuffle** — random k-fold routinely trains on the future and tests on the past relative to market time.

**Anchored (expanding) walk-forward** keeps every training window as a single past prefix ending before each unseen OOS block, then rolls forward. That matches how a live system would have been fit/selected at each calendar point.

**Random k-fold is forbidden** for Karen financial time series (selection, reporting, or “just a quick check”).

---

## 2. Structure

```
anchor ──────────────────────────────────────────► time
   │ DEV expanding │ purge │ OOS block │
   │ DEV expanding ────────│ purge │ OOS block │
   │ DEV expanding ─────────────────│ purge │ OOS │
   … repeat …
   │████████ SEALED HOLDOUT 2026 ████████│
```

Pattern (nominal months):

| Step | Expanding DEV | OOS block |
|------|---------------|-----------|
| 1 | Oct 2023 → Jun 2024 | Jul → Sep 2024 |
| 2 | Oct 2023 → Sep 2024 | Oct → Dec 2024 |
| 3 | Oct 2023 → Dec 2024 | Jan → Mar 2025 |
| 4 | Oct 2023 → Mar 2025 | Apr → May 2025* |

\*Fold 4 OOS is **truncated** so it ends before carve-v1 **VALIDATION** (`2025-06-01`). Carve VAL stays a **one-shot confirmatory** gate after `PROMOTE_TO_VALIDATION`, not a WF retune fold.

---

## 3. Exact fold calendar (adapted to archive-carve-v1)

**Data geography**

| Span | YMD | Role |
|------|-----|------|
| Carve trading days (SoT) | ~2023-10-02 → 2026-08-14 | Wired archive used by carve-v1 |
| Broader raw note | ~2021-10 → 2026-08 | Not used until acquired/wired; protocol still anchors at carve start |
| Anchor | **2023-10-02** | Shared DEV start for all folds |
| Inner OOS region | through **2025-05-30** | Robustness only |
| Carve VALIDATION | **2025-06-01 → 2025-12-31** | One-shot after PROMOTE |
| UNTOUCHED_HOLDOUT | **2026-01-01 → 2026-08-14** | **SEALED** |

### Fold table (usable asOf windows)

| Fold ID | DEV asOf (inclusive) | Purge (excluded) | OOS asOf (inclusive) | Role |
|---------|----------------------|------------------|----------------------|------|
| `wf-anchored-01` | 2023-10-02 → 2024-06-27 | 2024-06-28 | 2024-07-01 → 2024-09-30 | inner_oos |
| `wf-anchored-02` | 2023-10-02 → 2024-09-27 | 2024-09-30 | 2024-10-01 → 2024-12-31 | inner_oos |
| `wf-anchored-03` | 2023-10-02 → 2024-12-30 | 2024-12-31 | 2025-01-01 → 2025-03-31 | inner_oos |
| `wf-anchored-04` | 2023-10-02 → 2025-03-28 | 2025-03-31 | 2025-04-01 → 2025-05-30 | inner_oos |

Machine-readable twin: `configs/walk-forward-anchored-v1.json`.

---

## 4. Purge / embargo rule (concrete)

Tied to DV outcome scoring (same as dual-audit / promotion protocol):

| Parameter | Value | Why |
|-----------|------:|-----|
| `outcomeHorizonMinutes` | **30** | proxyR / MFE / MAE / T-before horizon |
| `sessionBufferMinutes` | **390** | One full NY RTH session (09:30–16:00 ET) — reduces session-structure leakage across the boundary |
| `totalGapMinutes` | **420** | 30 + 390 |
| `calendarGapTradingDays` | **1** | Calendar implementation for day-indexed folds: ≥1 trading day excluded between last DEV asOf day and first OOS asOf day |

**Operational rule**

1. **Purge window:** calendar day(s) listed per fold — no DEV train asOfs and no OOS asOfs.
2. **Label overlap:** drop any DEV asOf whose `(asOf + 30m)` intersects the purge window (or OOS).
3. **Embargo intent:** the session buffer covers correlated same-session / overnight structure that a pure 30m gap would miss.
4. **Do not** “borrow” purge/OOS days back into DEV after seeing OOS metrics.

---

## 5. How this interacts with DEV → VAL promotion + experiment registry

| Layer | Carve-v1 today | With walk-forward-anchored-v1 |
|-------|----------------|-------------------------------|
| Candidate exploration | Full DEVELOPMENT `2023-10-02→2025-05-31` | Still allowed; prefer declaring which WF DEV prefix was used |
| Temporal robustness | Informal / none | **Inner OOS folds** `wf-anchored-01..04` — report stability; **no retune on OOS** |
| Promotion gates | `karen-dev-to-validation-protocol.md` on DEV | Unchanged — gates still DEV-first |
| Confirmatory VAL | One-shot `2025-06-01→2025-12-31` after PROMOTE | **Still one-shot** — not converted into extra WF folds for tuning |
| Holdout | Sealed 2026 | **Still sealed** |
| Registry | `split=DEV\|VALIDATION\|HOLDOUT` | Register WF runs with fold id in `timestamp_manifest` / notes; never HOLDOUT; VAL still requires prior `decision=promote` |

**How WF replaces / extends carve-v1 VAL usage**

- It does **not** replace carve VAL as the promotion confirmatory gate.
- It **extends** pre-promotion measurement: chronological OOS blocks inside the former DEV span (plus truncated Apr–May 2025) so “looks good on late DEV” is stress-tested without peeking 2026.
- Using carve VAL months as additional WF retune folds is **forbidden** (same spirit as `VALIDATION_TUNING_FORBIDDEN`).

Wire: [`karen-dev-to-validation-protocol.md`](./karen-dev-to-validation-protocol.md) · [`karen-dv-experiment-registry.md`](./karen-dv-experiment-registry.md)

---

## 6. Forbidden

- Random / shuffle k-fold CV  
- Peeking or scoring **UNTOUCHED_HOLDOUT** for selection  
- Retuning thresholds, knobs, or execution assumptions on OOS fold metrics  
- Treating OOS or VAL as a tuning loop  
- Unlocking holdout before architecture, thresholds, execution assumptions, and evaluation rules are frozen (Adam)  
- Implementing combinatorial purged CV as a silent primary selector (v1 stub only)

---

## 7. Future robustness (stub only)

**Combinatorial / purged CV** (many purge widths / block sizes / embargo lengths) may later stress-test a **frozen** candidate. It is:

- `implemented: false` in `walk-forward-anchored-v1.json`
- Never a substitute for anchored WF + sealed holdout
- Never run on holdout

---

## 8. Scaffolding (no heavy replay)

| Artifact | Path |
|----------|------|
| This note | `data/research/karen-walk-forward-oos-protocol.md` |
| Fold config | `data/karen-decision-validation/configs/walk-forward-anchored-v1.json` |
| Loader / invariants | `lib/decision-validation/walk-forward-anchored.ts` |
| Unit test | `scripts/test-karen-walk-forward-anchored.ts` |

```bash
# From .tmp/karen-final-integration (or mirrored repo root once synced)
npx tsx scripts/test-karen-walk-forward-anchored.ts
# or
npm run test:karen-walk-forward-anchored
```

---

## 9. Changelog

| Time | Change |
|------|--------|
| 2026-08-15 | Initial pre-registration — anchored WF calendar, purge=30m+390m, holdout sealed, combinatorial stub |

**EDGE_CLAIM:** NONE  
**HOLDOUT_STATUS:** SEALED  
**OOS_RETUNING:** FORBIDDEN  
**RANDOM_K_FOLD:** FORBIDDEN
