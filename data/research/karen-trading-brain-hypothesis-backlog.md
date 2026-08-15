# KAREN — Trading-Brain Hypothesis Backlog

**PHASE:** trading-brain research  
**MODE:** hypothesis generation only  
**DATE:** 2026-08-15  
**TREE:** `.tmp/karen-final-integration/` (+ synced repo copy)  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED (do not open)  
**LOGIC:** no replay · no implementation · no weight/threshold changes in this document  

**Sources (read, not invented):**
- `karen-trading-logic-correctness-audit.md`
- `karen-trading-brain-baseline-v1.md` / `v2.md` / `v3.md` / `v4.md`
- `karen-semantic-baseline-freeze.md` (experiment lock = **baseline-v2**)
- `karen-dev-wait-overcaution-audit.md`
- `karen-dev-actionable-performance-audit.md`
- `karen-opportunity-frequency-reconciliation.md`
- `karen-decision-validation-expansion.md` (integration tree)
- `day-karen-edge-validation-final.md` (supervisor)
- `lib/decision-validation/confounders.ts` registry
- `karen-decision-architecture.md` / roadmap (HTF stay-flat as exposed hypothesis)
- `karen-dev-to-validation-protocol.md` — **not present yet** (noted)

**ICT concepts = hypotheses, not assumed truths.**  
**All unproven time hypotheses = EXPERIMENTAL_OFF (never production weights until pre-registered promotion).**

---

## Top 10 experiments (recommended order)

Ranking: (1) correctness → (2) explanatory value → (3) expected edge relevance → (4) cheap to test.

| # | ID | Experiment (single change) | Why first | Prod weights |
|--:|----|----------------------------|-----------|--------------|
| 1 | **A1** | Tag + measure `pd_level_fallback_last_price` invent vs **v3 refuse** on micro + rare natural missing-prior days | Correctness invent path; FIX_PROVEN_ON_MICRO; natural 214 Δ0 | stay on **v2**; v3 remains CANDIDATE |
| 2 | **A2** | Add session-HL **provenance flags**; measure empty-window invent vs **v4 refuse** | Correctness invent path; auto-tag currently blind | stay on **v2**; v4 CANDIDATE |
| 3 | **A3** | Dual-label PD day boundary: EST Yahoo daily vs CME Globex session keys on same asOfs | Labeling confounder always-on (214/214); blocks faithful ICT PD scoring | observation/label only |
| 4 | **A4** | Measure disagreement rate: observation REH/REL clustering vs structure equal-pools | Always-on dual-path confounder; cheap measure | no weigher change yet |
| 5 | **B1** | Decompose WAIT drivers: `entryStatus` WAIT/EXTENDED vs `both_sides` vs `<2 reasons` vs HTF stay-flat | Explains 79% WAIT / structurally_overcautious without tuning | measure-only |
| 6 | **C1** | Under `decision-process-experiment` + frozen v2: **one** confirmation-count change (≥2 → ≥1 reasons) | Highest-impact overcaution lever with attribution | EXPERIMENT profile only |
| 7 | **D1** | Require STRICT episode persistence ≥2 evals before “actionable opportunity” product language | 76–81% episodes are 1-eval flickers | scoring/product definition |
| 8 | **F1** | Ablate invalidation offset (±5) / target geometry; re-score T-before-inv (baseline ~19.5%) | Actionables often invalidate first (80.5%) | experiment profile |
| 9 | **G1** | Quiet/active day regime classifier (dense-panel bimodality) before opportunity-rate claims | Quiet rate 50–62.5%; early archive chunks Z≈0 | measure / gate language |
| 10 | **E1** | Time module **EXPERIMENTAL_OFF**: score “11:30 tends to take 10:00 H/L” as observation-only DV claim | Explicit TOD hook design; must not enter production weights | **EXPERIMENTAL_OFF** |

Holdout remains sealed. Any DEV winner → at most one VAL peek per protocol (when protocol lands). No holdout unlock from this backlog.

---

## Status snapshot (from discoveries)

| Item | Status |
|------|--------|
| Semantic invent-path baseline | **FROZEN `baseline-v2`** |
| v1 (directed displacement + MSS≠bias) | FROZEN |
| v2 (sweep one-sided weigher credit) | FROZEN / HEAD |
| v3 PD refuse lastPrice | CANDIDATE (micro FIX_PROVEN; natural Δ0) |
| v4 empty-session HL refuse | CANDIDATE (path triggered; DV Δ0; tag blind) |
| DEV WAIT share (even@1500) | **79.2%** engine-restraint; QG-blocked 0 |
| MISSED_OPPORTUNITY heuristic | **75.7%** of WAITs (not = missed TRADE_OPPORTUNITY) |
| Actionable T-before-inv | **~19.5%** (scored subset) |
| STRICT opportunities/day (8-day SoT) | median **10.5**; quiet/active **bimodal** |
| Time / kill-zone / 11:30→10:00 modules | **not implemented** · **EXPERIMENTAL_OFF** |
| EDGE_CLAIM | **NONE** |

---

# A. OBSERVATION CORRECTNESS

---

### A1 — PD lastPrice invent (`prev ?? lastPrice`)

**HYPOTHESIS**  
When prior daily is missing, inventing PDH/PDL/PDC at `lastPrice` poisons premium/discount, sweep pools, and confluence; refusing invent (unknown PD) is more correct for DV.

**WHY_IT_MIGHT_MATTER**  
Correctness audit severity medium; micro-fixtures show invent vs refuse verdict Δ2/3; silent invent can credit “PD” confluence that never existed.

**CURRENT_IMPLEMENTATION**  
Frozen **v2** still invents via lastPrice. Candidate **v3** refuses → PD unknown. Confounder id `pd_level_fallback_last_price` (proxy: PD ≈ lastPrice).

**KNOWN_CONFOUNDER**  
`pd_level_fallback_last_price`; natural Yahoo-week 214 rate **0%** (path rare when priors populated); micro rate high when forced.

**SINGLE_CHANGE_TEST**  
Replay identical asOfs under `withTradingBrainBaseline("v2"|"v3")` on micro-PD-missing + archive days with true missing prior; no other knobs.

**METRIC_EXPECTED_TO_MOVE**  
Confounder active rate → 0 under v3 on micro; verdict/structure Δ on invent asOfs only; NO_TRADE / unknown PD share up when prior missing.

**FAILURE_CONDITION**  
Natural corpus still Δ0 **and** no invent provenance ever fires on archive → deprioritize promotion; keep as defensive candidate only.

**DEV_TEST**  
`karen-trading-brain-micro-fixtures-v3-v4` + targeted missing-prior day slice on DEVELOPMENT carve.

**VALIDATION_REQUIREMENT**  
If promoted later: identical-asOf integrity vs frozen v2; confounder rate; no expectancy ranking on holdout.

**LOOKAHEAD_RISK**  
Low if bars ≤ asOf and prior day selected by EST key &lt; asOfKey (already probed).

---

### A2 — Empty session → today HL fallback

**HYPOTHESIS**  
Empty Asia/London (etc.) windows falling back to today’s m1 HL invent fake session levels early/thin, corrupting session liquidity reads.

**WHY_IT_MIGHT_MATTER**  
Correctness audit medium; Asia calendar-yesterday + empty fallback called out; early Globex / holidays at risk.

**CURRENT_IMPLEMENTATION**  
`levels.ts` `recentSessionBars` fallback to today HL under v2. Candidate **v4** refuses → unknown. Confounder `empty_session_hl_fallback` **auto-tag inactive** without provenance.

**KNOWN_CONFOUNDER**  
`empty_session_hl_fallback` (undetectable from envelope alone today).

**SINGLE_CHANGE_TEST**  
Add provenance flags on session HL source (window_bars vs fallback_today_hl); compare v2 invent vs v4 refuse on micro-empty-session + thin Asia opens.

**METRIC_EXPECTED_TO_MOVE**  
Provenance invent rate; session-HL unknown rate; (maybe) WAIT/NO_TRADE when session liquidity required — natural 214 may stay Δ0.

**FAILURE_CONDITION**  
Provenance never active on DEV archive → treat as defensive only; do not stack into overcaution experiments.

**DEV_TEST**  
Micro empty-session fixture + flag instrumentation; measure-only on DEV carve.

**VALIDATION_REQUIREMENT**  
Promotion only with Adam; identical-asOf vs v2; no holdout selection.

**LOOKAHEAD_RISK**  
Low if window uses bars ≤ asOf; high if “today HL” includes post-asOf minutes (must keep slice discipline).

---

### A3 — EST Yahoo daily vs CME Globex session day for PD

**HYPOTHESIS**  
Karen PD arrays keyed by EST calendar daily diverge from CME session day (18:00 ET roll); ICT “previous day” for futures may need Globex session keys — current labeling confounds DV “PD hit” scores.

**WHY_IT_MIGHT_MATTER**  
Confounder `est_yahoo_daily_ne_cme_session` active **100%** on TickStream fixtures; after 18:00 ET PD still = previous EST calendar bar.

**CURRENT_IMPLEMENTATION**  
`getEstDateKey` + Yahoo completed daily; `cmeSessionDateKey` exists but not used for PD arrays.

**KNOWN_CONFOUNDER**  
`est_yahoo_daily_ne_cme_session` (always-on for CME bar datasets).

**SINGLE_CHANGE_TEST**  
Observation-only dual compute: emit both EST-PD and CME-session-PD at same asOf; score agreement; **do not** swap production PD yet.

**METRIC_EXPECTED_TO_MOVE**  
Disagreement rate by clock hour (esp. 18:00–00:00 ET); sweep/PD touch label mismatch rate.

**FAILURE_CONDITION**  
Disagreement ≈0 on RTH-only evals → boundary issue is Globex-specific; scope module to overnight only.

**DEV_TEST**  
Label integrity script on DEVELOPMENT asOfs stratified by ET hour.

**VALIDATION_REQUIREMENT**  
Fixtures must declare convention before any “PD accuracy” claim; holdout sealed.

**LOOKAHEAD_RISK**  
Medium if CME session “prior day” incorrectly includes incomplete session — define completed Globex day strictly.

---

### A4 — Dual REH / REL algorithms

**HYPOTHESIS**  
Observation clustering REH/REL and structure `detectRelativeEqualPools` can disagree; envelope EQH vs observation REH confuses liquidity evidence.

**WHY_IT_MIGHT_MATTER**  
Always-on confounder `dual_reh_algorithms` (214/214); low–med severity but permanent noise in explainability.

**CURRENT_IMPLEMENTATION**  
Two paths; observation `reh_rel` uses clustering only; structure pools not wired into `reh_rel`.

**KNOWN_CONFOUNDER**  
`dual_reh_algorithms`.

**SINGLE_CHANGE_TEST**  
Log both outputs at t; compute agree/disagree; no weigher change.

**METRIC_EXPECTED_TO_MOVE**  
Disagreement rate; fraction of WAIT/actionable with REH conflict.

**FAILURE_CONDITION**  
Disagree rate &lt;5% on DEV → deprioritize unify work.

**DEV_TEST**  
Confounder enrichment pass on dense DEV panel days.

**VALIDATION_REQUIREMENT**  
Unify only after measure; single source of truth declared in fixtures.

**LOOKAHEAD_RISK**  
Low (both from bars ≤ asOf) if lookbacks identical; medium if one path uses different lookback secretly.

---

### A5 — LIVE quote vs closed-bar price path

**HYPOTHESIS**  
`resolveLiveLastPrice` preferring chart LIVE over bar close makes LIVE desk ≠ closed-bar DV path, so production “correctness” ≠ historical scores.

**WHY_IT_MIGHT_MATTER**  
Correctness audit documents LIVE vs close risk; DV injects `yahoo_bar_close` for PIT.

**CURRENT_IMPLEMENTATION**  
DV harness forces bar close; live desk can prefer TV LIVE.

**KNOWN_CONFOUNDER**  
Path mismatch (not yet a formal confounder id).

**SINGLE_CHANGE_TEST**  
On overlapping LIVE+historical stamps, compare observation fields under LIVE vs forced close (measure only).

**METRIC_EXPECTED_TO_MOVE**  
Verdict disagreement rate LIVE vs close; structure field delta rate.

**FAILURE_CONDITION**  
Disagreement ≈0 when last closed bar == LIVE → issue is rare; document only.

**DEV_TEST**  
Paired probe on recent LIVE sessions (not holdout carve).

**VALIDATION_REQUIREMENT**  
DV remains closed-bar; product docs state LIVE≠DV.

**LOOKAHEAD_RISK**  
High if LIVE print is from forming bar beyond asOf semantics — keep asOf = bar time explicit.

---

# B. INTERPRETATION

---

### B1 — WAIT driver decomposition (entryStatus vs evidence vs conflict)

**HYPOTHESIS**  
“Structurally overcautious” is a mixture of distinct mechanisms (`entryStatus` WAIT/EXTENDED, both sides supported, &lt;2 reasons, HTF stay-flat, reversalLookalikeWithoutSslSweep); lumping them hides which single change would matter.

**WHY_IT_MIGHT_MATTER**  
DEV: 1188/1188 WAITs are `canDeliver=true` engine restraint; top co-occurring evidence FVG/displacement; both_sides 9.5% of WAITs. Opportunity reconciliation warns MISSED_OPPORTUNITY ≠ missed TRADE_OPPORTUNITY.

**CURRENT_IMPLEMENTATION**  
WAIT when one side supported but entry WAIT/EXTENDED, or both sides supported; interpretation needs ≥2 reasons; NY bullish without SSL sweep skipped.

**KNOWN_CONFOUNDER**  
Heuristic miss-label; sampling density; idle WAIT↔NO_TRADE flips dominate dense days.

**SINGLE_CHANGE_TEST**  
Taxonomy pass only: tag each WAIT with primary driver enum; no threshold change.

**METRIC_EXPECTED_TO_MOVE**  
Driver share distribution; miss-heuristic rate **conditional on driver**.

**FAILURE_CONDITION**  
&gt;80% WAITs still “opaque other” after taxonomy → instrumentation incomplete.

**DEV_TEST**  
Re-annotate dual-audit JSON with driver tags on DEVELOPMENT even@1500.

**VALIDATION_REQUIREMENT**  
Driver taxonomy frozen before any threshold experiment; VAL only after DEV winner.

**LOOKAHEAD_RISK**  
None for tagging; miss heuristic uses future bars (already outcome layer — keep separate from driver attribution).

---

### B2 — HTF stay-flat on bias vs structure conflict

**HYPOTHESIS**  
Default `ltfAgainstHtfAllowed=false` (stay flat when HTF bias opposes LTF structure) is an unvalidated architecture choice that suppresses otherwise supported LTF trades.

**WHY_IT_MIGHT_MATTER**  
Decision architecture explicitly marks this as hypothesis, not proven; conflicts feed WAIT/flat stance.

**CURRENT_IMPLEMENTATION**  
`buildTradingDecision` stay-flats on bias-vs-structure; envelope logs conflict.

**KNOWN_CONFOUNDER**  
Bias quality itself; MSS≠bias already fixed in v1 — residual true conflicts may be real or HTF lag.

**SINGLE_CHANGE_TEST**  
Experiment profile: allow LTF-against-HTF when ≥2 LTF reasons and SSL/BSL aligned (one flag); freeze v2 brain.

**METRIC_EXPECTED_TO_MOVE**  
Actionable rate; WAIT share; proxyR on newly allowed set (DEV diagnostic only).

**FAILURE_CONDITION**  
New actionables show worse inv-before rate than baseline actionables → reject profile.

**DEV_TEST**  
`decision-process-experiment` single knob on DEV dense panel.

**VALIDATION_REQUIREMENT**  
Pre-register; one VAL confirmation; holdout sealed.

**LOOKAHEAD_RISK**  
Low for decision at t; outcome scoring must not leak.

---

### B3 — `reversalLookalikeWithoutSslSweep` long skip

**HYPOTHESIS**  
Blocking NY bullish MSS/FVG/displacement without sell-side sweep removes false reversal longs — or over-blocks valid continuations/reversals.

**WHY_IT_MIGHT_MATTER**  
Hard-coded interpretation special case; interacts with overcaution and NY_AM poor actionable proxyR in dual-audit (n small).

**CURRENT_IMPLEMENTATION**  
Interpretation skips supported long under that pattern.

**KNOWN_CONFOUNDER**  
Session clock vs true NY open microstructure; sweep detector post-fix may change rate.

**SINGLE_CHANGE_TEST**  
Toggle skip off in experiment profile only; compare long rate and inv-before on NY_AM.

**METRIC_EXPECTED_TO_MOVE**  
NY_AM LONG count; T-before-inv; miss-heuristic among prior WAITs in 09:30–11:30.

**FAILURE_CONDITION**  
Extra longs predominantly inv-before → keep skip.

**DEV_TEST**  
DEV session-stratified dual-audit with toggle.

**VALIDATION_REQUIREMENT**  
n≥ pre-registered minimum in VAL before any promotion talk.

**LOOKAHEAD_RISK**  
Low.

---

### B4 — Structure/FVG `unknown` hard gate

**HYPOTHESIS**  
Requiring structure/FVG not `unknown` before support blocks many otherwise directional reads that outcome heuristics call “missed.”

**WHY_IT_MIGHT_MATTER**  
Interpretation support rules; WAIT overcaution co-occurs with FVG present **and** absent slices differently (miss rate 79% vs 55% in audit).

**CURRENT_IMPLEMENTATION**  
Support needs structure/FVG not unknown + ≥2 reasons + no contradiction.

**KNOWN_CONFOUNDER**  
Observation unknown from thin lookback vs true absence.

**SINGLE_CHANGE_TEST**  
Allow support with structure unclear **only if** directional FVG + matching sweep (one rule).

**METRIC_EXPECTED_TO_MOVE**  
WAIT→actionable conversion; contradiction rate.

**FAILURE_CONDITION**  
Rise in both_sides / conflict WAIT without quality gain.

**DEV_TEST**  
Process experiment on DEV.

**VALIDATION_REQUIREMENT**  
As B2.

**LOOKAHEAD_RISK**  
Low.

---

# C. EVIDENCE WEIGHTING

---

### C1 — Confirmation count threshold (≥2 reasons)

**HYPOTHESIS**  
Requiring ≥2 reasons is a major structural cause of WAIT despite present FVG/displacement; lowering to ≥1 (with side-aligned sweep) increases actionables without inventing concepts.

**WHY_IT_MIGHT_MATTER**  
Overcaution audit: FVG present on 85.9% of WAITs; displacement 73.3%; engine restraint 100% of WAITs.

**CURRENT_IMPLEMENTATION**  
`interpretation-engine`: ≥2 reasons per side.

**KNOWN_CONFOUNDER**  
Dual-credit already fixed in v2; remaining overcaution may be threshold, not dual-credit.

**SINGLE_CHANGE_TEST**  
One knob: `minReasons: 2 → 1` under `withDecisionProcessExperiment` + `baseline-v2`.

**METRIC_EXPECTED_TO_MOVE**  
WAIT↓, ACTIONABLE↑, episode rate; proxyR on **new** actionables only (gated reporting).

**FAILURE_CONDITION**  
New actionables’ mean proxyR worse than held-out DEV slice of old actionables by pre-registered margin → reject.

**DEV_TEST**  
DEV even@1500 + dense panel days; semantic hash / PIT checks.

**VALIDATION_REQUIREMENT**  
Single VAL run if DEV wins; **never** unlock holdout for selection.

**LOOKAHEAD_RISK**  
None for threshold; outcome horizon fixed a priori (30m).

---

### C2 — Conflict WAIT when both sides supported

**HYPOTHESIS**  
Both-sides → WAIT is correct conflict handling **or** over-triggers when one side is weak noise; netting to the stronger side could reduce false WAIT.

**WHY_IT_MIGHT_MATTER**  
both_sides_supported on 9.5% of WAITs; miss rate still ~74%.

**CURRENT_IMPLEMENTATION**  
Both long & short supported → WAIT.

**KNOWN_CONFOUNDER**  
Reason-string quality; residual dual semantics elsewhere (OB stub, REH dual).

**SINGLE_CHANGE_TEST**  
If reasonCount(long) ≥ reasonCount(short)+2, take long (mirror short); else WAIT.

**METRIC_EXPECTED_TO_MOVE**  
Conflict-WAIT share; actionable from former both_sides.

**FAILURE_CONDITION**  
Hard L/S flips rise; inv-before worsens.

**DEV_TEST**  
Process experiment; flip matrix watch.

**VALIDATION_REQUIREMENT**  
As C1.

**LOOKAHEAD_RISK**  
Low.

---

### C3 — Quality of reasons vs count (HTF bias as weak reason)

**HYPOTHESIS**  
Counting HTF tradeable bias as a full reason inflates confluence or, conversely, blocking on HTF creates false conflict; HTF should be context-weighted not parity-weighted.

**WHY_IT_MIGHT_MATTER**  
Architecture: HTF is context, not trade; weigher still lists HTF bias among reasons.

**CURRENT_IMPLEMENTATION**  
Reasons include HTF bias, structure, sweeps (one-sided post-v2), displacement, FVG.

**KNOWN_CONFOUNDER**  
HTF lag vs LTF; stay-flat interactions (B2).

**SINGLE_CHANGE_TEST**  
Mark HTF bias as context-only (does not increment reasonCount); keep in envelope narrative.

**METRIC_EXPECTED_TO_MOVE**  
Support rates; conflict rates; actionable composition.

**FAILURE_CONDITION**  
Loss of all HTF-aligned actionables without replacement LTF confluence → too aggressive.

**DEV_TEST**  
Process experiment.

**VALIDATION_REQUIREMENT**  
Pre-register; DEV then optional VAL.

**LOOKAHEAD_RISK**  
Low.

---

# D. ACTIONABILITY / WAIT

---

### D1 — 1-eval episode flicker vs persistent opportunity

**HYPOTHESIS**  
Most STRICT “opportunities” are 1-eval flickers (76–81%); persistent ≥2-eval episodes are the meaningful actionable set for product and for threshold experiments.

**WHY_IT_MIGHT_MATTER**  
Frequency SoT ~10.5/day can be noisy; persistent subset had worse mean proxyR descriptively (−0.765 vs −0.306) — need careful gates, not naive “more persistence = better.”

**CURRENT_IMPLEMENTATION**  
STRICT episode = maximal same-side actionable run; no flicker filter in product language.

**KNOWN_CONFOUNDER**  
Cadence 5m; sparse sampling miss; thesis re-key inflation under THESIS_AWARE.

**SINGLE_CHANGE_TEST**  
Report metrics twice: all STRICT vs persistence≥2 only; no engine change.

**METRIC_EXPECTED_TO_MOVE**  
Opportunities/day; quiet-day rate; quality tables by persistence.

**FAILURE_CONDITION**  
Persistence filter leaves n too small for DEV decisions (&lt; pre-registered n).

**DEV_TEST**  
Reuse opportunity-frequency panel scripts (measure-only).

**VALIDATION_REQUIREMENT**  
Freeze definition before tuning thresholds.

**LOOKAHEAD_RISK**  
Medium if persistence uses future stamps to decide “was flicker” for **entry** — for research, classify episode only after end; for live, use elapsed time ≥ N minutes instead of future knowledge.

---

### D2 — entryStatus WAIT/EXTENDED scaffold dominates restraint

**HYPOTHESIS**  
Many `canDeliver=true` WAITs are execution-scaffold WAIT/EXTENDED rather than missing evidence; fixing entry model timing matters more than adding reasons.

**WHY_IT_MIGHT_MATTER**  
Correctness audit: WAIT when entryStatus WAIT/EXTENDED; entryStatus not always on envelope history.

**CURRENT_IMPLEMENTATION**  
Execution scaffold drives WAIT despite supported side.

**KNOWN_CONFOUNDER**  
B1 mixture; need driver taxonomy first.

**SINGLE_CHANGE_TEST**  
After B1: if driver=entryStatus share ≥ X%, experiment only entry-model readiness rule (e.g. allow ACTIVE when zone numeric + side supported).

**METRIC_EXPECTED_TO_MOVE**  
WAIT↓ among entryStatus-driven; actionable↑; stance wait vs flat mix.

**FAILURE_CONDITION**  
Driver share low → do not touch entry model yet.

**DEV_TEST**  
Depends on B1 taxonomy.

**VALIDATION_REQUIREMENT**  
Sequence after B1; single knob.

**LOOKAHEAD_RISK**  
Low.

---

### D3 — WAIT→action latency vs overcaution narrative

**HYPOTHESIS**  
Median WAIT→action latency ~5m with 87% ≤15m means Karen is often “late by one cadence,” not permanently flat — overcaution may be **timing**, not absence of ideas.

**WHY_IT_MIGHT_MATTER**  
Opportunity reconciliation §9; 57.9% of WAIT evals never see same-day actionable.

**CURRENT_IMPLEMENTATION**  
No anticipatory entry; verdicts are point-in-time.

**KNOWN_CONFOUNDER**  
Cadence; episode flicker.

**SINGLE_CHANGE_TEST**  
Measure-only: compare MFE/MAE if entry shifted −5m/−1 bar on eventual actionable days (counterfactual research, not live).

**METRIC_EXPECTED_TO_MOVE**  
Counterfactual proxyR; fraction of miss-heuristic WAITs that convert same day.

**FAILURE_CONDITION**  
Counterfactual does not improve → timing hypothesis weak.

**DEV_TEST**  
Offline counterfactual on DEV dense days (**research only**; do not wire into production).

**VALIDATION_REQUIREMENT**  
Must not use holdout; label as counterfactual lookahead-safe only if shift uses information available at t−5m.

**LOOKAHEAD_RISK**  
**High** if you pick shifts using knowledge that an actionable appears later — restrict to policies decidable at t.

---

# E. SESSION / TIME

**Policy:** all items in this section are **EXPERIMENTAL_OFF** for production weights. Clock session/kill-zone labels may exist; they must not alter verdict math until promoted via DV profile.

---

### E1 — 11:30 tends to take 10:00 high/low  【EXPERIMENTAL_OFF】

**HYPOTHESIS**  
By ~11:30 ET, price tends to have taken the 10:00 ET high or low (ICT-style TOD claim) — useful as confirmation/invalidation context, not as automatic trade.

**WHY_IT_MIGHT_MATTER**  
Explicitly named in correctness audit as not implemented; TOD hook design specified.

**CURRENT_IMPLEMENTATION**  
Not implemented. Kill zone / AMD are clock-only in `sessions.ts`.

**KNOWN_CONFOUNDER**  
Regime bimodality; holiday hours; using future 11:30 at 10:05 is illegal.

**SINGLE_CHANGE_TEST**  
Pure module: at asOf≥11:30, observe whether 10:00 HL taken using bars ≤ asOf; emit `HypothesisObservation`; **weigher untouched**.

**METRIC_EXPECTED_TO_MOVE**  
Claim true/false/unknown rates; agreement with same-day directional outcomes (score hooks only).

**FAILURE_CONDITION**  
True-rate ≈ coin-flip on DEV → keep OFF forever or revise anchors.

**DEV_TEST**  
DV profile `ny_1130_vs_1000_hl@v1` on DEVELOPMENT only.

**VALIDATION_REQUIREMENT**  
Pre-registered; VAL once; holdout sealed; **never** auto-add to production weights.

**LOOKAHEAD_RISK**  
**High** if evaluated before anchors form; module must return `unknown` when 10:00 HL not yet formed / asOf&lt;11:30 for “taken by 11:30” claims.

---

### E2 — Kill-zone windows alter opportunity quality  【EXPERIMENTAL_OFF】

**HYPOTHESIS**  
Clock kill-zone bool correlates with higher-quality actionables than non-KZ; gating or boosting inside KZ could matter — unproven.

**WHY_IT_MIGHT_MATTER**  
Kill zone already computed; dual-audit session slices show heterogeneous proxyR (OTHER n=53 mild; NY_PM n=5 very negative — tiny n).

**CURRENT_IMPLEMENTATION**  
`resolveSessionContext` killZone bool; not a weigher input.

**KNOWN_CONFOUNDER**  
Tiny session n in sparse actionable audit; quiet/active days.

**SINGLE_CHANGE_TEST**  
Stratify existing DEV actionables by killZone; no weight change.

**METRIC_EXPECTED_TO_MOVE**  
proxyR / T-before-inv by KZ vs not.

**FAILURE_CONDITION**  
No material separation after n-guard → remain OFF.

**DEV_TEST**  
Re-slice dual-audit JSON.

**VALIDATION_REQUIREMENT**  
Measure-only until n and separation clear.

**LOOKAHEAD_RISK**  
Low (clock function of asOf).

---

### E3 — Post-10:00 ET continuation / purge regime  【EXPERIMENTAL_OFF】

**HYPOTHESIS**  
Behavior 10:00–11:30 differs from 09:30–10:00 (open drive vs mid-morning); pooling them confounds NY_AM metrics.

**WHY_IT_MIGHT_MATTER**  
WAIT buckets split 0930–1000 vs 1000–1130; actionable dual-audit pools NY_AM (n=5) with poor proxyR.

**CURRENT_IMPLEMENTATION**  
Session labels coarser than these sub-windows for weigher.

**KNOWN_CONFOUNDER**  
Small n; bimodality.

**SINGLE_CHANGE_TEST**  
Stratified scorecard only (0930–1000 vs 1000–1130 vs lunch vs PM).

**METRIC_EXPECTED_TO_MOVE**  
Per-bucket actionable rate, proxyR, miss-heuristic.

**FAILURE_CONDITION**  
Buckets indistinguishable → no TOD gate.

**DEV_TEST**  
DEV dual-audit re-bucket.

**VALIDATION_REQUIREMENT**  
EXPERIMENTAL_OFF for weights.

**LOOKAHEAD_RISK**  
Low.

---

### E4 — Lunch 11:30–13:30 mean-revert / low-quality  【EXPERIMENTAL_OFF】

**HYPOTHESIS**  
NY lunch actionables are systematically different (dual-audit lunch mean proxyR +0.454 on n=8 — unstable) and may deserve stay-out or separate model.

**WHY_IT_MIGHT_MATTER**  
Session tables in both WAIT and actionable audits.

**CURRENT_IMPLEMENTATION**  
No lunch stay-out in weigher (session stay-out exists for other liquidity patterns).

**KNOWN_CONFOUNDER**  
n=8; do not promote from tiny n.

**SINGLE_CHANGE_TEST**  
Measure-only lunch vs non-lunch; pre-register minimum n before any stay-out experiment.

**METRIC_EXPECTED_TO_MOVE**  
proxyR, inv-before, episode duration.

**FAILURE_CONDITION**  
n insufficient or unstable sign across DEV years → OFF.

**DEV_TEST**  
Dense panel lunch slice.

**VALIDATION_REQUIREMENT**  
EXPERIMENTAL_OFF; Adam gate for any stay-out flag.

**LOOKAHEAD_RISK**  
Low for clock gate; high if conditioned on future lunch range.

---

### E5 — Session transition (Asia→London→NY) liquidity handoff  【EXPERIMENTAL_OFF】

**HYPOTHESIS**  
Raids of prior-session H/L at transitions are higher-value sweep evidence than mid-session pool taps.

**WHY_IT_MIGHT_MATTER**  
Architecture mentions session stay-out (e.g. London Asia-high raid); session HL accuracy depends on A2.

**CURRENT_IMPLEMENTATION**  
Partial session-liquidity stay-out rules; not a full transition module.

**KNOWN_CONFOUNDER**  
Empty-session invent (A2); EST vs session day (A3).

**SINGLE_CHANGE_TEST**  
Tag sweeps within ±N minutes of session open; compare outcome quality vs other sweeps (measure).

**METRIC_EXPECTED_TO_MOVE**  
Sweep-tagged actionable proxyR; stay-out hit rate.

**FAILURE_CONDITION**  
No separation → keep OFF.

**DEV_TEST**  
After A2 provenance; else contaminated.

**VALIDATION_REQUIREMENT**  
Depends on A2; EXPERIMENTAL_OFF weights.

**LOOKAHEAD_RISK**  
Medium near boundaries if session HL uses incomplete windows incorrectly labeled as final.

---

### E6 — H/L formation timing (when is “10:00 high” fixed?)  【EXPERIMENTAL_OFF】

**HYPOTHESIS**  
Anchors like “10:00 high” must be defined as HL of a completed window ending 10:00, not running extreme of an open interval — ambiguous formation timing creates false “taken” claims.

**WHY_IT_MIGHT_MATTER**  
Required for E1 integrity; correctness audit unknown-when-anchors-missing rule.

**CURRENT_IMPLEMENTATION**  
No TOD anchor module.

**KNOWN_CONFOUNDER**  
Forming bar inclusion; LIVE vs close.

**SINGLE_CHANGE_TEST**  
Define anchor recipe v1; unit probes for asOf 09:59 / 10:00 / 10:01; no weigher.

**METRIC_EXPECTED_TO_MOVE**  
Anchor stability; unknown rate.

**FAILURE_CONDITION**  
Unstable under bar-open vs bar-close asOf convention → freeze convention first (A5).

**DEV_TEST**  
Focused probes alongside trading-logic correctness style tests (design only here).

**VALIDATION_REQUIREMENT**  
Anchor spec locked before E1 scoring.

**LOOKAHEAD_RISK**  
**High** if “10:00 high” uses minutes after 10:00 while claiming 10:00 print.

---

# F. ENTRY / INVALIDATION

---

### F1 — Invalidation offset (±5) too tight / wrong side

**HYPOTHESIS**  
Invalidations from swept levels ±5 or MSS ±5 are too tight (or mis-sided), causing inv-before-target dominance (~80.5% scored).

**WHY_IT_MIGHT_MATTER**  
Actionable performance audit: T-before 19.5% / inv-before 80.5%; mean proxyR −0.330.

**CURRENT_IMPLEMENTATION**  
Invalidation from swept levels ±5 or MSS ±5; execution scaffold target.

**KNOWN_CONFOUNDER**  
Horizon 30m; target geometry; flicker entries.

**SINGLE_CHANGE_TEST**  
One change: ±5 → ±10 (or ATR-scaled once); freeze entry and target rules.

**METRIC_EXPECTED_TO_MOVE**  
T-before-inv rate; MAE_R; proxyR (DEV diagnostic).

**FAILURE_CONDITION**  
T-before rises only because invalidation rarely hit (vacuous) — require MAE still informative.

**DEV_TEST**  
Process/invalidation experiment on DEV actionables.

**VALIDATION_REQUIREMENT**  
Pre-register; no holdout tuning.

**LOOKAHEAD_RISK**  
Low for rule at t; do not fit ± from future MAE.

---

### F2 — Wick entry does not affect verdict

**HYPOTHESIS**  
Confirmation policy (candle_close for MSS/sweep/disp/FVG; wick entry ignored) causes late or missed entries relative to ICT wick-entry practice.

**WHY_IT_MIGHT_MATTER**  
SPEC_NOT_BUILT wick entry / pending; correctness audit: wick does not affect verdict.

**CURRENT_IMPLEMENTATION**  
`confirmation-policy.ts` candle_close; wick labeled in fixtures only.

**KNOWN_CONFOUNDER**  
Pending state machine absent; D3 timing.

**SINGLE_CHANGE_TEST**  
Observation+policy experiment: allow entryStatus ACTIVE on wick into FVG when close confirmation pending — verdict experiment profile only.

**METRIC_EXPECTED_TO_MOVE**  
WAIT→action latency; actionable count; inv-before on wick-ACTIVE set.

**FAILURE_CONDITION**  
Large inv-before spike on wick set.

**DEV_TEST**  
After pending-state sketch; else mark blocked on H3.

**VALIDATION_REQUIREMENT**  
EXPERIMENT only; ICT claim not assumed true.

**LOOKAHEAD_RISK**  
Medium (wick vs close race on forming bar) — use closed prior bar only in v1 policy.

---

### F3 — Target-before-invalidation definition vs proxyR

**HYPOTHESIS**  
Scoring target-before-inv on sparse numeric targets mis-ranks decisions; many “best MFE” rows still fail T-before (null/false) — metric mismatch.

**WHY_IT_MIGHT_MATTER**  
Dual-audit best-by-MFE list shows T-before null/false on several high-MFE rows.

**CURRENT_IMPLEMENTATION**  
Outcome harness target/inv parse; proxyR hybrid.

**KNOWN_CONFOUNDER**  
Missing target parse; horizon cap.

**SINGLE_CHANGE_TEST**  
Publish parallel scorecards: T-before, MFE/MAE, proxyR — no logic change.

**METRIC_EXPECTED_TO_MOVE**  
Agreement rate among metrics; fraction unscored.

**FAILURE_CONDITION**  
Metrics diverge wildly → pick primary metric before threshold work.

**DEV_TEST**  
Recompute dual-audit tables.

**VALIDATION_REQUIREMENT**  
Freeze primary metric in protocol (when written).

**LOOKAHEAD_RISK**  
Outcome layer always uses future bars — keep sealed from selection on holdout.

---

# G. MARKET REGIME

---

### G1 — Quiet / active day bimodality

**HYPOTHESIS**  
Opportunity frequency is bimodal (quiet days ~0 episodes vs active ~20–28); pooling hides that “~10.5 opportunities/day” is not typical every day.

**WHY_IT_MIGHT_MATTER**  
8-day SoT median 10.5 quiet 50%; 40-day panel median **0.0** quiet **62.5%**; BIMODALITY_HOLDS YES.

**CURRENT_IMPLEMENTATION**  
No regime gate in engine; product language risk.

**KNOWN_CONFOUNDER**  
Sample day selection; cadence.

**SINGLE_CHANGE_TEST**  
Fit simple quiet classifier from **prior** day features only (e.g. prior day range / overnight range); predict quiet vs active; measure-only.

**METRIC_EXPECTED_TO_MOVE**  
Classifier precision/recall for quiet days; conditional opportunity rates.

**FAILURE_CONDITION**  
Not predictable from past info → keep descriptive split only.

**DEV_TEST**  
Dense panel + chronological DEV days.

**VALIDATION_REQUIREMENT**  
No threshold tuning from panel alone (already recommended).

**LOOKAHEAD_RISK**  
**High** if classifier uses same-day future range; must be causal (≤ prior close / overnight ≤ asOf).

---

### G2 — Early-archive low-actionable regime (2023–early 2024)

**HYPOTHESIS**  
Chunked fullspan Z≈0 in early windows reflects a distinct regime (data quality or market behavior), so pooling fullspan expectancy is misleading.

**WHY_IT_MIGHT_MATTER**  
Day-karen final: chunk1 Z=0; actionable density regime-dependent; primary 12mo denser.

**CURRENT_IMPLEMENTATION**  
Same baseline-v2 across archive.

**KNOWN_CONFOUNDER**  
Sampling; data gaps; symbol calendar.

**SINGLE_CHANGE_TEST**  
Split DEV metrics pre/post regime break date (pre-registered from carve chunks).

**METRIC_EXPECTED_TO_MOVE**  
Actionable rate by era; WAIT drivers by era.

**FAILURE_CONDITION**  
Smooth continuum → no hard regime split.

**DEV_TEST**  
Re-slice carve even-span reports.

**VALIDATION_REQUIREMENT**  
Declare evaluation window before comparing brains.

**LOOKAHEAD_RISK**  
Low for stratification.

---

### G3 — NY_PM / afternoon actionable toxicity

**HYPOTHESIS**  
NY_PM actionables are lower quality (dual-audit mean proxyR −4.274, n=5) and may warrant session stay-out — **unproven, tiny n**.

**WHY_IT_MIGHT_MATTER**  
Session heterogeneity; WAIT miss rate also high in NY_PM (88.1%).

**CURRENT_IMPLEMENTATION**  
No PM-specific weigher gate.

**KNOWN_CONFOUNDER**  
**n=5** — extreme small-sample risk.

**SINGLE_CHANGE_TEST**  
Accumulate denser PM-only DEV sample before any gate; measure first.

**METRIC_EXPECTED_TO_MOVE**  
PM actionable n, proxyR CI.

**FAILURE_CONDITION**  
CI includes baseline → no gate.

**DEV_TEST**  
Dense afternoon evals on active days only.

**VALIDATION_REQUIREMENT**  
Minimum n pre-registered; EXPERIMENTAL_OFF until then.

**LOOKAHEAD_RISK**  
Low for clock stay-out; do not fit from holdout.

---

# H. ICT CONCEPTS NOT YET PROPERLY IMPLEMENTED

---

### H1 — Order block geometry (stub)

**HYPOTHESIS**  
Real OB geometry (impulse origin candle / range) would improve entry zones vs current MSS→relevant / FVG→unclear heuristic.

**WHY_IT_MIGHT_MATTER**  
SPEC_NOT_BUILT; always-on confounder `order_block_stub`.

**CURRENT_IMPLEMENTATION**  
`inferOrderBlock` heuristic stub.

**KNOWN_CONFOUNDER**  
`order_block_stub` always active.

**SINGLE_CHANGE_TEST**  
Implement geometry behind feature flag OFF; compare zone hit rates offline — **not** in production weights.

**METRIC_EXPECTED_TO_MOVE**  
Entry-zone touch→go rate; inv-before on OB-tagged entries.

**FAILURE_CONDITION**  
No lift vs FVG-only zones on DEV.

**DEV_TEST**  
Offline OB detector vs labeled fixtures (when labels exist).

**VALIDATION_REQUIREMENT**  
SPEC + fixtures first; ICT not assumed true.

**LOOKAHEAD_RISK**  
Medium if OB uses future impulse confirmation beyond asOf.

---

### H2 — FVG validity / fill state machine

**HYPOTHESIS**  
Tracking FVG validity (invalidated / partially filled / still valid) would stop counting dead FVGs as confluence.

**WHY_IT_MIGHT_MATTER**  
SPEC_NOT_BUILT; FVG present on most WAITs — may be stale gaps.

**CURRENT_IMPLEMENTATION**  
Gap zones with 50% fill rule / latest unfilled map; no full pending/validity machine in observation.

**KNOWN_CONFOUNDER**  
Fill rule vs Adam definition; multi-TF FVG conflict.

**SINGLE_CHANGE_TEST**  
Add validity enum on observation; strip invalid FVGs from reason eligibility (experiment profile).

**METRIC_EXPECTED_TO_MOVE**  
FVG-present WAIT share; actionable precision.

**FAILURE_CONDITION**  
Negligible change in reasons → FVG already effectively filtered.

**DEV_TEST**  
Observation experiment + dual-audit.

**VALIDATION_REQUIREMENT**  
Fixtures declare fill rule; holdout sealed.

**LOOKAHEAD_RISK**  
Low if fill uses bars ≤ asOf only.

---

### H3 — Pending states / desk phase machine in Layer 1

**HYPOTHESIS**  
Without pending lifecycle in observation JSON, WAIT/ACTIVE/EXTENDED cannot be audited as ICT state progression.

**WHY_IT_MIGHT_MATTER**  
Correctness audit: pending not in observation; desk-state-machine phases exist elsewhere; blocks F2.

**CURRENT_IMPLEMENTATION**  
Desk-state-machine phases; Layer 1 observation lacks pending.

**KNOWN_CONFOUNDER**  
Envelope history missing entryStatus (timeline audit).

**SINGLE_CHANGE_TEST**  
Record pending enum on observation at t (measure/log); no weigher change first.

**METRIC_EXPECTED_TO_MOVE**  
Pending distribution; alignment with entryStatus.

**FAILURE_CONDITION**  
Pending always unknown → machine not wired to facts.

**DEV_TEST**  
Logging pass on DEV.

**VALIDATION_REQUIREMENT**  
Schema version bump; identical-asOf integrity.

**LOOKAHEAD_RISK**  
Low for logging; high if pending “resolves” using future bars in the same record.

---

### H4 — First-presented FVG as privileged entry (vs any FVG)

**HYPOTHESIS**  
NY/session first-presented FVG is higher quality than generic latest unfilled FVG for entries.

**WHY_IT_MIGHT_MATTER**  
First-presented FVG computed (`gap-zones.ts`) but may not be privileged in weigher vs any FVG.

**CURRENT_IMPLEMENTATION**  
Detector exists; interpretation uses directional FVG generally.

**KNOWN_CONFOUNDER**  
Session window definitions; 9:30 middle-bar rule.

**SINGLE_CHANGE_TEST**  
Reasons only from first-presented FVG when present; else fallback (experiment).

**METRIC_EXPECTED_TO_MOVE**  
Actionable rate; proxyR on FVG-reasoned set.

**FAILURE_CONDITION**  
n collapse / no lift.

**DEV_TEST**  
Process experiment NY windows.

**VALIDATION_REQUIREMENT**  
ICT hypothesis OFF until lift shown on DEV+VAL.

**LOOKAHEAD_RISK**  
Low if first-presented uses ≤ asOf.

---

### H5 — Displacement completeness beyond direction

**HYPOTHESIS**  
Even with direction (v1), displacement definition (body &gt; 1.5× avg in last 5 of 12) may be weak/noisy vs true ICT displacement (range + consecutive closes).

**WHY_IT_MIGHT_MATTER**  
Was high-severity undirected; fixed direction but definition may still overfire (present on 73% of WAITs).

**CURRENT_IMPLEMENTATION**  
Directed displacement in observation; one-sided weigher credit.

**KNOWN_CONFOUNDER**  
Historical undirected confounder cleared under v1+; definition quality open.

**SINGLE_CHANGE_TEST**  
Tighten displacement rule behind experiment flag; measure reason frequency and actionable quality.

**METRIC_EXPECTED_TO_MOVE**  
displacement-present rate; WAIT drivers; proxyR.

**FAILURE_CONDITION**  
Tighter rule removes actionables without improving inv-before.

**DEV_TEST**  
Observation experiment under baseline-v2 freeze for other knobs.

**VALIDATION_REQUIREMENT**  
Do not conflate with invent-path baselines.

**LOOKAHEAD_RISK**  
Low.

---

## Confounder registry (quick map)

| Id | Severity | Baseline note |
|----|----------|---------------|
| `bias_as_structure_fallback` | high | Cleared under v1+ |
| `undirected_displacement` | high | Cleared under v1+ |
| `sweeps_dual_credit` | medium | Cleared under v2 |
| `est_yahoo_daily_ne_cme_session` | medium | Always-on labeling |
| `pd_level_fallback_last_price` | medium | Rare natural; v3 candidate |
| `empty_session_hl_fallback` | medium | Tag blind; v4 candidate |
| `order_block_stub` | low | Always-on |
| `dual_reh_algorithms` | low | Always-on |

---

## Protocol gap

`karen-dev-to-validation-protocol.md` was **not found** at generation time. Until it exists, treat promotion rules as:

1. Freeze semantic brain (**baseline-v2**).  
2. One experiment knob at a time (`decision-process-experiment` or observation flag).  
3. DEV only for selection.  
4. At most one VAL confirmation.  
5. **Holdout sealed** — no unlock from this backlog.  
6. Time modules remain **EXPERIMENTAL_OFF**.

---

## Explicit non-goals (this document)

- No replay runs, no logic changes, no commits/push/deploy  
- No EDGE_CLAIM  
- No holdout expectancy  
- No genetic / auto weight learning  
- No treating ICT lore as true  

---

## See also

**Queue SoT (Adam):** [`karen-research-queue-one-bottleneck.md`](./karen-research-queue-one-bottleneck.md) — **ONE** current bottleneck = WAIT quality (`c4_shadow_quality_gated_wait`); five suspects queued behind it (not parallel bottlenecks). Active candidate pointer: [`karen-next-single-change-dev-candidate.md`](./karen-next-single-change-dev-candidate.md).

**Diagnostic hops:** [`karen-first-broken-hop-diagnostic-pipeline.md`](./karen-first-broken-hop-diagnostic-pipeline.md) — CURRENT = WAIT quality only; rest = QUEUED_SUSPECTS. Map backlog IDs onto that queue; do not launch weighting / entry-timing / target-inv / regime experiments while c4 is in flight.

Also: [`karen-dev-to-validation-protocol.md`](./karen-dev-to-validation-protocol.md) · [`karen-dv-experiment-registry.md`](./karen-dv-experiment-registry.md)

---

## Sync

Canonical copies:

- `data/research/karen-trading-brain-hypothesis-backlog.md` (repo)
- `.tmp/karen-final-integration/data/research/karen-trading-brain-hypothesis-backlog.md` (integration tree)
