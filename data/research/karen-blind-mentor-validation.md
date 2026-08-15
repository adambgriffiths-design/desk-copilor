# Karen Blind Mentor Validation

**Generated:** 2026-08-14T10:07:41.577Z
**Path:** Phase 1 pipeline via `buildKarenReplayResponse` (not deterministic).
**Production:** unchanged (`lib/reh-rel.ts`, `lib/structure.ts` trading, live LONG/SHORT).
**Future data:** evaluator-only (post-hoc 30m net, invalidation audit). Not used in rubric scores.
**Duplicate baselines:** not re-run. Aug 12 1m replay reused from `research-mentor-minute-replay-nq-week.json` (1,321 evals, 2026-08-14). Week Mode B reused, not re-executed.

---

## PHASE 11 — HEADLINE RESULTS

DATASET: `nq-aug12-2026-cme` (methodology) + reused `nq-week-aug05-aug12-2026-cme` Mode B / 1m day replay
DATE RANGE: 2026-08-11T22:00:00.000Z → 2026-08-12T22:00:00.000Z (Aug 12 CME session). Week checkpoints Aug 5–12 already collected.
NUMBER OF EVALUATIONS: **1321** native 1m (reused) + **12** framework cutoffs with full input-state capture this run
NUMBER OF STATE TRANSITIONS: **94** verdict + **63** structure + **115** bias + **481** entryStatus (Aug 12 1m)

MENTOR SCORE: **98.3%** mean 10-criterion rubric on 12 Aug 12 cutoffs (12/12 mentorEvalReady). **This number is not evidence of mentor quality** — see baseline comparison.
RESPONSIVENESS: **YES at 1m clock** — 94 verdict transitions; 43/47 directional episodes last ≤5 minutes (flicker). High WAIT is not scored as auto-good or auto-bad.
LIQUIDITY ACCURACY: **MIXED / UNEVALUATED IN KAREN TEXT.** Research `detectEqhEqlLiquidity` distinguishes accepted vs rejected pools at sampled T. Karen's mentor string still leans on PDH/PDL/PDC sweep boilerplate; 2 cutoff(s) had collapsed PD prices (same print for multiple labels). Production REH/REL is a separate detector (not modified).
STRUCTURE ACCURACY: rubric structure_accuracy avg **2/2** (self-consistency with observation, not independent chart audit). 1m recorded **63** structure flips.
UNCERTAINTY CALIBRATION: rubric uncertainty avg **2/2**. Formatter hard-codes confidence 45 on WAIT and 65 on LONG/SHORT — calibration is largely mechanical, not judged.
HINDSIGHT VIOLATIONS: rubric flag **0/12** on cutoffs; extra language scan **0**; 1m poison test **PASS** — point-in-time preserved — 14 snapshots unchanged before poison at 2026-08-11T23:14:00.000Z
FORCED-SIGNAL RATE: **0/12** cutoffs (forced_signal flag). Deterministic path was not used.
WAIT RATE: checkpoints **5/12 (41.7%)**; 1m **1201/1321 (90.9%)**
DIRECTIONAL RATE: checkpoints **4/12 (33.3%)**; 1m LONG 49 + SHORT 71 = **9.1%**. NO_TRADE checkpoints 3, 1m 0.

REGIME COVERAGE:
- Present in available data: overnight quiet, globex, London/NY session transitions, some RTH trend vs range (week Mode B proxies: range, quiet, volatile, trend_up, trend_down n=1; conflicting_setup n=7). This 12-cutoff run had 0 mixed both-cases timestamps.
- Missing / too thin: news-driven expansion, multi-week trend, crash/gap, FOMC, multi-product (ES/YM), month+ sample, live vs replay parity of mentor text.
- Not cherry-picked: Mode A session anchors + reused full 1m day + existing week Mode B (no new week/month run).

BASELINE COMPARISON (same Aug 12 cutoffs, same rubric):

| System | Mean rubric | vs Karen | Agreement with Karen verdict |
|--------|-------------|----------|------------------------------|
| Karen (pipeline) | 98.3% | — | — |
| always WAIT + copied Karen evidence | 95.0% | +3.3 | 5/12 |
| always WAIT naive (empty evidence) | 66.7% | +31.7 | 8/12 |
| follow last-5m direction | 85.8% | 12.5 | 2/12 |
| structure-only (bull→LONG / bear→SHORT) | 94.2% | 4.2 | 4/12 |
| liquidity-only (one-sided raid) | 95.0% | 3.3 | 5/12 |

1m reconstructed agreement (n=1321): always-WAIT **90.9%**, structure-only **9.9%**, last-5m direction **4.8%**.

**A 99% vs 98% finding:** Karen's official rubric is 98% vs 95% for always-WAIT that keeps Karen's evidence fields. Lift = **3.3 points.** That is not a mentor-quality result. Naive empty WAIT scores 67% because the rubric rewards populated formatter fields (candles, levels, FVG/PD/structure strings) more than decision policy.

STRONGEST BEHAVIOURS:
- Point-in-time cutoff is real: `ReplayDataCutoff.assertNoFutureLeak` + poison test passed on the reused 1m run.
- Missing/stale chart → NO_TRADE (Globex 1-bar `missing`; Late globex `stale`). That is honest gating.
- Early-morning Asia-high-in-London raid → stay flat rather than chasing bullish MSS. That is actual mentor caution, not empty WAIT.
- When entry is ACTIVE and only one case is supported, framework cutoffs did go LONG/SHORT with a numeric invalidation.

WEAKEST BEHAVIOURS:
- **Zero durable 1m theses** (≥15 min). 43/47 directional episodes lasted ≤5 minutes (median 2 min). Flicker is not mentoring.
- Official 10-criterion rubric lift vs copied always-WAIT is **3.3 points**. Week Mode B was 100% on 185 checkpoints. Naive empty WAIT scores 67% because the rubric rewards filled formatter fields.
- Production `reh_rel` was **unknown at 12/12 cutoffs** — Karen is not using the research EQH/EQL area model in the mentor observation.
- PDH=PDL collapse in pdEvidence at: Globex open, Overnight mid.
- Confidence is hardcoded (45 WAIT / 65 directional / 30 NO_TRADE) in `formatKarenFromPipeline`.
- Formatter still emits FVG/MSS/PD strings on stale/missing cutoffs even while the verdict correctly says NO_TRADE.
- NY open: LONG-bias retrace into a **bearish** FVG (bullish thesis, opposite-gap entry).

REPRESENTATIVE SUCCESS CASES:
- **Early morning** WAIT: Asia high taken in London treated as buy-side raid, not a long. (Stay flat — Asia high taken in London is a buy-side liquidity raid, not a reason to flip bullish. Look for displacement or continuation lower, or wait until one-minute structure confirms. A high being)
- **Globex open** 1 bar, data_quality=missing → NO_TRADE. Honest insufficient-info, not a fake structure call.
- **Pre-NY open** one-sided + non-WAIT entry → LONG, invalidation 29619.5.

REPRESENTATIVE FAILURE CASES:
- **NY open** LONG-bias retrace into a bearish FVG (bearish FVG 29927.5–29931.3 (formed 10:29)). Thesis and gap disagree.
- **1m flicker** LONG for 4 min (2026-08-11T23:21:00.000Z → 2026-08-11T23:25:00.000Z). Full day: 0 episodes ≥15 min.
- **PDH=PDL in pdEvidence** at Globex open, Overnight mid.
- **Late globex stale**: verdict NO_TRADE (good) but formatter still cites `Bearish MSS — body close below swing low 29812.75 at 16:59`.
- **Rubric ceiling / self-grade:** 98% vs 95% copied always-WAIT. Phase-4 12/12 is the decision layer matching itself.

IMPORTANT LIMITATIONS:
- One instrument (NQ), one primary day at full 1m resolution, plus already-collected week checkpoints. Not months.
- Minute replay stores transitions, not full Karen prose per minute. Layer-2 rubric on all 272 episodes was not re-run (would duplicate ~hours of pipeline). Framework cutoffs carry full input state this run.
- Rubric scores Karen against her own observation (self-consistency), not against an independent human mentor or chart.
- Post-hoc 30m price change is diagnostic only and was **not** used to pick a flattering verdict.
- Another agent owns live incremental market-state and EQH-area rework; this experiment evaluated **current** research `eqhEqlLiquidity` + current pipeline text.
- `buildPointInTimeRecord` still stamps deterministic Karen — not used as mentor evidence here.

OVERALL VERDICT: **WEAK**
CONFIDENCE: **MODERATE in the measurement, LOW in any claim that Karen “works” as a mentor**

On the only full-resolution day, Karen produced **zero** directional episodes lasting ≥15 minutes (43/47 lasted ≤5m; median 2 min). 1m agreement with always-WAIT is 90.9%. Official rubric lift vs copied always-WAIT is 3.3 points (98% vs 95%). Production reh_rel was unknown at 12/12 cutoffs while research detectEqhEqlLiquidity still ranked pools. PIT/poison and NO_TRADE-on-missing-data work — that is evaluation plumbing, not mentor skill. Prior week Mode B sat at a 100% rubric ceiling (185 checkpoints). Do not read 12/12 Phase-4 “match” as independent mentor grading: it mostly checks that buildTradingDecision followed its own entry-WAIT rule.

### WHAT WOULD HAVE TO BE TRUE FOR US TO CONCLUDE THAT KAREN ACTUALLY WORKS?

All of the following, not a high rubric percentage:

1. **Discriminating instrument.** A rubric (or human rater) that can score below ~80% on always-WAIT-with-copied-evidence, and that **penalizes WAIT when evidence is one-sided and entry is ACTIVE** (Phase 4 strong→opinion). Today's 10-criterion score does not do this.
2. **Lift over trivial policies.** On that instrument, Karen beats always-WAIT, last-5m direction, and structure-only by a margin that is not a rounding error — including on structure-change and conflicting-setup strata, with confidence intervals that do not swallow the lift.
3. **Cautious and responsive.** Mixed/weak → WAIT/NO_TRADE (already mostly true) **and** strong one-sided evidence → a clear, revisable opinion that does not flicker 1–4 minutes later unless structure/liquidity actually invalidated.
4. **Liquidity explanation.** At T, Karen can say why *this* EQH/EQL area matters and why a nearby equal is rejected (visual class, confirmation, sweep status) — matching research `detectEqhEqlLiquidity` rejected-candidate lists — without PDH=PDL=PDC collapse boilerplate.
5. **Point-in-time.** Zero hindsight flags on a larger sample; poison tests remain green; stored input states reproduce the same verdict.
6. **Regimes.** Same pattern on quiet, trend, volatile, reversal, and session-transition days across **several weeks**, not one Thursday and a 100%-ceiling week checkpoint file.
7. **Usefulness.** A trader/learner can act on invalidation + levels when Karen is directional, and can tell the difference between “conflicting cases” vs “bias but wait for retrace” vs “no trade.”

Until (1)–(2) are true, **do not treat 100% mentorEvalReady as success.** It is a ceiling artifact.

---

## PHASE 1 — Blind experiment definition (executed)

At each cutoff T, Karen received only:
- 1m/5m/15m/daily bars with `time <= T` via `ReplayDataCutoff`
- chart snapshot scored at `asOf`, not `Date.now()`
- observation / interpretation / decision built from that cutoff

Karen did not receive future candles, future MSS confirmation, future sweeps, or outcome labels.

Exact input states for 12 cutoffs: `data/research/karen-blind-mentor-validation/aug12-input-states.json` (observation subset, interpretation cases, decision, last 5 bars, REH/REL nearest, evidence keys, formatted Karen).

| Cutoff | Bars at T | data_quality | future FVG leak count |
|--------|-----------|--------------|------------------------|
| Globex open 2026-08-11T22:00:00.000Z | 1 | missing | 0 |
| Overnight mid 2026-08-12T02:00:00.000Z | 241 | good | 0 |
| Early morning 2026-08-12T06:00:00.000Z | 481 | good | 0 |
| Pre-market 2026-08-12T11:00:00.000Z | 781 | good | 0 |
| Pre-NY open 2026-08-12T13:00:00.000Z | 901 | good | 0 |
| NY open 2026-08-12T14:30:00.000Z | 991 | good | 0 |
| Post-open hour 2026-08-12T15:30:00.000Z | 1051 | good | 0 |
| Mid-morning RTH 2026-08-12T16:30:00.000Z | 1111 | good | 0 |
| Lunch 2026-08-12T17:30:00.000Z | 1171 | good | 0 |
| PM session 2026-08-12T19:00:00.000Z | 1261 | good | 0 |
| Session end 2026-08-12T20:59:00.000Z | 1380 | good | 0 |
| Late globex 2026-08-12T21:45:00.000Z | 1380 | stale | 0 |

---

## PHASE 2 — Full-resolution 1m replay (reused, not 12 checkpoints)

Source: existing `research-mentor-minute-replay-nq-week.json` dayReport. **Not re-run** (~93 min historically). Warmup 60 bars. Poison test recorded in that artifact.

| Metric | Aug 12 1m |
|--------|-----------|
| Evaluations | 1321 |
| WAIT / LONG / SHORT / NO_TRADE | 1201 / 49 / 71 / 0 |
| Verdict transitions | 94 |
| Structure / bias / session changes | 63 / 115 / 7 |
| Entry ACTIVE windows | 100 |
| Setup-eligible windows | 37 |
| Directional episodes | 47 (median 2 min) |
| Flicker (≤5 min directional) | 43 |
| Durable (≥15 min directional) | 0 |
| Verdict transitions within 5m of a structure change | 46.8% |

High WAIT frequency is **not** interpreted as good or bad. It is a fact: 90.9% of minutes were WAIT. Responsiveness is evidenced by transitions, not by WAIT rate.

Flicker examples (≤5 min directional):

- LONG 23:21–23:25 UTC (4 min)
- LONG 00:19–00:23 UTC (4 min)
- LONG 00:25–00:26 UTC (1 min)
- SHORT 01:17–01:18 UTC (1 min)
- SHORT 01:20–01:21 UTC (1 min)
- SHORT 01:29–01:30 UTC (1 min)
- SHORT 01:34–01:39 UTC (5 min)
- LONG 02:16–02:17 UTC (1 min)

Durable examples (≥15 min):

_None._

---

## PHASE 3 — 10-criterion rubric vs market outcome

REASONING QUALITY (scored). MARKET OUTCOME (not scored).

| Criterion | Avg 0–2 |
|-----------|---------|
| sufficient_info | 2 |
| structure_accuracy | 2 |
| dominant_conflicting_evidence | 1.67 |
| uncertainty | 2 |
| invalidation | 2 |
| no_hindsight | 2 |
| no_forced_direction | 2 |
| consistency | 2 |
| trader_usefulness | 2 |
| data_quality_honesty | 2 |

Post-hoc 30-minute net (evaluator only, **not scored**):

- Pre-NY open: LONG — DIAGNOSTIC ONLY — next-30m net 55.5 (not scored)
- Post-open hour: SHORT — DIAGNOSTIC ONLY — next-30m net -16.3 (not scored)
- PM session: SHORT — DIAGNOSTIC ONLY — next-30m net -44.0 (not scored)
- Session end: SHORT — DIAGNOSTIC ONLY — next-30m net 23.5 (not scored)


A correct WAIT can precede a large move. A SHORT can be followed by a bounce. Neither changes the rubric. Lucky direction was not rewarded.

---

## PHASE 4 — Strong / mixed / weak → opinion (independent of rubric)

This mapping is **not** implemented by the official rubric (the rubric gives WAIT a 2 on invalidation, no_forced_direction, and often uncertainty). Measured here separately.

| Class | n | Expected | Match |
|-------|---|---------|-------|
| strong (one-sided + entry not WAIT/EXTENDED) | 4 | LONG or SHORT | 4/4 |
| mixed (both cases) | 0 | WAIT | 0/0 |
| weak (neither case) | 4 | WAIT/NO_TRADE | 4/4 |
| one-sided retrace wait (entry WAIT/EXTENDED) | 4 | WAIT | 4/4 |

Phase 4 **spec-consistency** match (decision layer vs its own entry-WAIT rule): **12/12 (100.0%)**.

Phase 4 **program standard** (one-sided support → clear LONG/SHORT opinion, not retrace-WAIT): **4/8** one-sided cutoffs were directional. 4 stayed WAIT because execution entryStatus was WAIT/EXTENDED. Mixed-evidence cutoffs in this 12-set: **0** (cannot claim conflicting-evidence skill from this sample; week Mode B conflicting_setup n=7 is the only extra).

| Cutoff | Class | Expected (scaffold) | Actual | Scaffold match |
|--------|-------|---------------------|--------|----------------|
| Globex open | weak | WAIT|NO_TRADE | NO_TRADE | yes |
| Overnight mid | weak | WAIT|NO_TRADE | NO_TRADE | yes |
| Early morning | weak | WAIT|NO_TRADE | WAIT | yes |
| Pre-market | one_sided_retrace_wait | WAIT | WAIT | yes |
| Pre-NY open | strong | LONG | LONG | yes |
| NY open | one_sided_retrace_wait | WAIT | WAIT | yes |
| Post-open hour | strong | SHORT | SHORT | yes |
| Mid-morning RTH | one_sided_retrace_wait | WAIT | WAIT | yes |
| Lunch | one_sided_retrace_wait | WAIT | WAIT | yes |
| PM session | strong | SHORT | SHORT | yes |
| Session end | strong | SHORT | SHORT | yes |
| Late globex | weak | WAIT|NO_TRADE | NO_TRADE | yes |

Do not read 12/12 scaffold match as “Karen follows Phase 4 of the validation program.” The program wants strong evidence → opinion. The pipeline often converts one-sided evidence into WAIT-for-retrace. That is internally consistent and still **not** a durable mentor thesis (see 0 × ≥15m directional episodes on the 1m tape).

---

## PHASE 5 — Liquidity / REH / EQL (current research detector, not waiting on other agent)

Production `lib/reh-rel.ts` was not modified. Evaluation uses research `detectEqhEqlLiquidity` on bars ≤ T, plus what Karen actually said (`pdEvidence`, liquidity levels in observation).

### 2026-08-12T02:00:00.000Z (price 29663.75, 241 bars)

Accepted pools: **2**. Rejected candidates recorded: **12**. Pending unconfirmed swings: 1.

| Type | Area | Level | Status | Importance | Why this, not a nearby equal |
|------|------|-------|--------|------------|------------------------------|
| EQH | BUY_SIDE | 29681.00 | closed_through | MEDIUM | This area is meaningful because it is a class-A shelf. Nearby 29681.00/29683.50 is not: Rejected as EQH: relativeEquality, clearPoolVsNoise. Prices are similar  |
| EQL | SELL_SIDE | 29646.75 | active | HIGH | This area is meaningful because it is a class-A shelf. Nearby 29639.50/29640.75 is not: Rejected as EQL: relativeEquality, clearPoolVsNoise. Prices are similar  |

Rejected (why not):
- EQH 29667.25/29666.50 class D: Rejected as EQH: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool. (failed: clearPoolVsNoise)
- EQL 29639.50/29639.50 class D: Rejected as EQL: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool. (failed: clearPoolVsNoise)
- EQH 29669.75/29670.75 class D: Rejected as EQH: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool. (failed: clearPoolVsNoise)
- EQL 29657.00/29657.00 class D: Rejected as EQL: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool. (failed: clearPoolVsNoise)
- EQH 29672.00/29670.75 class D: Rejected as EQH: relativeEquality, clearPoolVsNoise. Prices are similar but not one recognizable horizontal area. (failed: relativeEquality, clearPoolVsNoise)
- EQL 29639.50/29640.75 class D: Rejected as EQL: relativeEquality, clearPoolVsNoise. Prices are similar but not one recognizable horizontal area. (failed: relativeEquality, clearPoolVsNoise)

### 2026-08-12T14:30:00.000Z (price 29907.50, 991 bars)

Accepted pools: **0**. Rejected candidates recorded: **8**. Pending unconfirmed swings: 1.

_No accepted class-A pools at this cutoff._

Rejected (why not):
- EQH 29935.00/29936.00 class D: Rejected as EQH: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool. (failed: clearPoolVsNoise)
- EQL 29860.75/29864.00 class D: Rejected as EQL: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool. (failed: clearPoolVsNoise)
- EQH 29922.50/29921.50 class D: Rejected as EQH: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool. (failed: clearPoolVsNoise)
- EQL 29853.25/29847.75 class D: Rejected as EQL: relativeEquality, clearPoolVsNoise. Prices are similar but not one recognizable horizontal area. (failed: relativeEquality, clearPoolVsNoise)
- EQH 29941.50/29945.75 class D: Rejected as EQH: relativeEquality, clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool. (failed: relativeEquality, clearPoolVsNoise)
- EQL 29853.25/29860.75 class D: Rejected as EQL: relativeEquality, clearPoolVsNoise. Prices are similar but not one recognizable horizontal area. (failed: relativeEquality, clearPoolVsNoise)

### 2026-08-12T19:00:00.000Z (price 29901.00, 1261 bars)

Accepted pools: **3**. Rejected candidates recorded: **12**. Pending unconfirmed swings: 1.

| Type | Area | Level | Status | Importance | Why this, not a nearby equal |
|------|------|-------|--------|------------|------------------------------|
| EQH | BUY_SIDE | 29924.50 | closed_through | MEDIUM | This area is meaningful because it is a class-A shelf. Nearby 29924.50/29923.25 is not: Rejected as EQH: relativeEquality, clearPoolVsNoise. Overlapping structu |
| EQL | SELL_SIDE | 29889.25 | closed_through | MEDIUM | This area is meaningful because it is a class-A shelf. Nearby 29889.25/29890.50 is not: Rejected as EQL: relativeEquality, clearPoolVsNoise. Prices are similar  |
| EQL | SELL_SIDE | 29901.25 | closed_through | MEDIUM | This area is meaningful because it is a class-A shelf. Nearby 29902.50/29901.25 is not: Rejected as EQL: relativeEquality, clearPoolVsNoise. Overlapping structu |

Rejected (why not):
- EQH 29924.00/29923.25 class D: Rejected as EQH: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool. (failed: clearPoolVsNoise)
- EQL 29902.50/29901.50 class D: Rejected as EQL: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool. (failed: clearPoolVsNoise)
- EQH 29922.25/29923.25 class D: Rejected as EQH: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool. (failed: clearPoolVsNoise)
- EQL 29908.00/29909.00 class D: Rejected as EQL: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool. (failed: clearPoolVsNoise)
- EQH 29924.50/29923.25 class D: Rejected as EQH: relativeEquality, clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool. (failed: relativeEquality, clearPoolVsNoise)
- EQL 29902.50/29901.25 class D: Rejected as EQL: relativeEquality, clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool. (failed: relativeEquality, clearPoolVsNoise)

Karen pipeline liquidity text at the same timestamps is in the input-state JSON. Overnight `pdEvidence` can print PDH=PDL (session-boundary collapse). Observation `reh_rel.status` was unknown on most cutoffs — **the mentor is not explaining research EQH/EQL areas**. Research `detectEqhEqlLiquidity` can list rejected class-D noise; Karen's prose does not.

---

## PHASE 6 — Hindsight falsification

| Check | Result |
|-------|--------|
| Rubric hindsight_leakage | 0/12 |
| Language scan (after/later/will/ended up) | 0 |
| Future FVGs in cutoff context | 0 total |
| 1m poison (mutate a future bar, past snapshots unchanged) | PASS — point-in-time preserved — 14 snapshots unchanged before poison at 2026-08-11T23:14:00.000Z |

No extra language-scan violations on framework cutoffs.

Failures are not hidden: flicker, rubric ceiling, PD collapse, and missing regimes are reported as failures/limits, not as “needs more data” euphemisms for success.

---

## PHASE 7 — Regime coverage

From this run + existing week Mode B (not cherry-picked):

- **Covered enough to talk about:** RTH vs globex, lunch, overnight, some structure flips, range-dominated week proxy. This 12-cutoff set had **zero mixed (both-cases) timestamps**.
- **Too thin:** trend_down (n=1 in week Mode B), “strong expansion” as its own class, reversals after news.
- **Absent:** multi-month, other products, holiday/early-close, true crash.

Do not generalize “Karen works” beyond NQ first half of August 2026 TickStream.

---

## PHASE 8 — Scale decision

Methodology check on Aug 12: the **official rubric is not a valid success meter** (ceiling vs copied always-WAIT). Per program rules, expanding to multi-week/month **full baselines** is not justified.

Already-collected week Mode B (185 checkpoints, 100% rubric, 4.9% directional) is used as **coverage**, not as a second victory lap. Full week 1m was previously estimated ~483 minutes and was not launched. No duplicate NQ baseline.

Prior `research-mentor-quality-nq-aug12.md` (adaptive 13 cutoffs, all WAIT-heavy, 100% rubric) does **not** match this run’s 12 session anchors (4 directional, 3 NO_TRADE). Possible causes: different cutoff set, later pipeline/formatter changes from other agents. This report uses **this run’s stored input states**, not the older markdown.

Existing week Mode B excerpt lives at `data/supervisor/results/research-mentor-responsiveness-nq-week.md` (WAIT 176/185, SHORT 6, LONG 3).

---

## PHASE 9 — Success criteria A–H (not P&L, not signal count)

| ID | Criterion | Finding |
|----|-----------|---------|
| A | Reasoning quality | Self-consistent formatter output; not independently judged. Rubric maxed out. |
| B | Responsiveness | Yes at 1m (transitions exist) but flicker-heavy; checkpoint sampling hid most directional minutes. |
| C | Point-in-time integrity | Supported on this sample (poison PASS, 0 rubric hindsight flags). |
| D | Liquidity/structure accuracy | Structure strings follow observation. Production reh_rel unknown on most cutoffs. Research detector ranks/rejects pools; Karen prose does not. PDH=PDL collapses. |
| E | Uncertainty calibration | Mechanical 45/65 confidence. |
| F | Hindsight rate | 0/12 on cutoffs; poison PASS. |
| G | Consistency | Pipeline verdict matches formatted Karen. WAIT with one-sided support is consistent with entry WAIT, not with Phase 4 “strong→opinion.” |
| H | Trader usefulness | Entry zone + levels usually present; usefulness of perpetual retrace-WAIT is limited. |

**Conclusion (required enum): WEAK**

---

## PHASE 10 — Independent baselines (the load-bearing section)

If this section is ignored, the 100% mentor score will be misread as success.

- Copied always-WAIT mean rubric **95.0%** vs Karen **98.3%**.
- Naive empty WAIT **66.7%** — the rubric is mostly scoring “did the formatter fill fields?”
- 1m Karen agrees with always-WAIT **90.9%** of minutes.
- Follow-short-term-direction and structure-only **disagree** with Karen often because they are always directional; that disagreement is not automatically Karen being wiser — it is Karen being quieter.

Value, if any, lives in the **~9% of minutes** that are LONG/SHORT and in the **WAIT-for-retrace vs conflicting WAIT** distinction — not in the 20/20 rubric.

---

## Per-cutoff snapshot (this run)

| Label | Verdict | Conf | long/short | entry | Rubric | Phase4 |
|-------|---------|------|------------|-------|--------|--------|
| Globex open | NO_TRADE | 30 | false/false | ACTIVE | 95% | weak ok |
| Overnight mid | NO_TRADE | 30 | false/false | WAIT | 95% | weak ok |
| Early morning | WAIT | 45 | false/false | WAIT | 95% | weak ok |
| Pre-market | WAIT | 45 | true/false | WAIT | 100% | one_sided_retrace_wait ok |
| Pre-NY open | LONG | 65 | true/false | ACTIVE | 100% | strong ok |
| NY open | WAIT | 45 | true/false | WAIT | 100% | one_sided_retrace_wait ok |
| Post-open hour | SHORT | 65 | false/true | null | 100% | strong ok |
| Mid-morning RTH | WAIT | 45 | true/false | WAIT | 100% | one_sided_retrace_wait ok |
| Lunch | WAIT | 45 | true/false | WAIT | 100% | one_sided_retrace_wait ok |
| PM session | SHORT | 65 | false/true | ACTIVE | 100% | strong ok |
| Session end | SHORT | 65 | false/true | ACTIVE | 100% | strong ok |
| Late globex | NO_TRADE | 30 | false/false | ACTIVE | 95% | weak ok |

---

*Research only. No trades, no deploy, no commit. Generated by scripts/research-karen-blind-mentor-validation.ts.*