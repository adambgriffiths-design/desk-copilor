# KAREN Nightly Red-Team Progress

Started: 2026-08-15 (nightly QA supervisor)

Scope: clean six-feature tree `.tmp/karen-six-feature-clean/`
Baseline: `74183b24553757a22fd71d79d0f8954d7c72872f`
Primary WT: read-only except this report path.

---

RED-TEAM UPDATE
Area: BOOT
Attack: Environment + inventory
Result: Clean tree present; six-feature verify/test scripts found; no prior red-team-* probes
Evidence: Listed scripts verify-feature2..6, test-karen-*, test-decision-history-time-travel, test-decision-memory-adapter; libs decision-envelope-history, decision-memory-backend, decision-time-travel
Severity: INFO
Next attack: H PATCH PURITY scan + A MEMORY CORRUPTION probes

---

RED-TEAM UPDATE
Area: H PATCH PURITY
Attack: Forbidden module/filename + content scan (continuous-decision-recorder, decision-memory-material, withManualAnalysePriority, live-latency-profile, market-data-errors)
Result: PASS (checkpoint) — forbidden product modules absent; only test/comment references
Evidence: `Test-Path` False for lib/{live-latency-profile,continuous-decision-recorder,decision-memory-material,market-data-errors}.ts; rg hits only verify-feature3 comment + optional require stub in test-karen-instant-read-llm-skip.ts; zero withManualAnalysePriority
Severity: LOW (harness mention only)
Next attack: STOPPED per operator

---

## STOPPED

Operator STOP (Adam) received mid-audit. Finished only Area H to clean checkpoint. Areas A–G left UNVERIFIED. Final report written: `data/research/karen-nightly-red-team-final.md`. No commit / push / deploy. No further attacks.

---

## RESUMED (A–G)

RED-TEAM UPDATE
Area: A MEMORY CORRUPTION
Attack: LIVE↔HISTORICAL leak; fixture A-in-B; stale L1 after Redis fail; malformed/empty Redis; duplicate decisionKey
Result: PASS 6/6
Evidence: `npx tsx scripts/red-team-A-E-F-memory.ts` — all A asserts ✓
Severity: INFO
Next attack: E + F in same suite; then B/G

---

RED-TEAM UPDATE
Area: E DECISION INTEGRITY
Attack: mutate stance/thesis/whyNow after record; mutate via getter; Redis hydrate freeze
Result: FAIL — shared object reference corrupts L1; Redis SoT intact
Evidence: `red-team-E-mutability-repro.ts` → MUTATED_WHY/long after caller mutate; MUTATED_VIA_HIT/short via getter; hydrate restores FROZEN_WHY_NOW_TOKEN
Severity: HIGH (REAL BUG — not fixed)
Next attack: F REDIS FAILURE

---

RED-TEAM UPDATE
Area: F REDIS FAILURE
Attack: missing backend; HTTP fail; timeout; partial persist; cold isolate miss
Result: PASS 6/6
Evidence: red-team-A-E-F-memory.ts F section
Severity: INFO
Next attack: B TIME TRAVEL + G SESSION BOUNDARY

---

RED-TEAM UPDATE
Area: B TIME TRAVEL
Attack: 9:30 exact; wait-at-time; between; past immutability; weekend; last decision
Result: CONDITIONAL — 6 PASS; last decision FAIL
Evidence: at_time/between/weekend PASS; `red-team-B-last-decision-repro.ts` shows kind=none for “last decision” and last_recorded→LIVE ans=null
Severity: MED (REAL BUG — LIVE last_recorded unimplemented)
Next attack: G

---

RED-TEAM UPDATE
Area: G SESSION BOUNDARY
Attack: prior HH:MM; nearest previous; holiday gap; session transition; CME key
Result: PASS 5/5
Evidence: red-team-B-G-time-session.ts G section
Severity: INFO
Next attack: C + D

---

RED-TEAM UPDATE
Area: C MODE SWITCHING
Attack: GENERAL_CHAT / CURRENT_MARKET_READ / CHANGE_ANALYSIS / WAIT / DECISION_HISTORY; trading↔casual
Result: PASS 11/11
Evidence: red-team-C-D-mode-instant.ts
Severity: INFO
Next attack: D

---

RED-TEAM UPDATE
Area: D INSTANT READ
Attack: flag; deterministic hit; historical block; stream false; WAIT/history skip; malformed; verdict false; cross-request scope
Result: PASS 12/12
Evidence: red-team-C-D-mode-instant.ts D section (zero OpenAI on pure skip path)
Severity: INFO
Next attack: final report

---

RED-TEAM UPDATE
Area: FINAL
Attack: A–G exhausted; H carried PASS
Result: OVERALL CONDITIONAL — REAL BUGS: E L1 mutability (HIGH), B LIVE last_recorded/last decision (MED)
Evidence: data/research/karen-nightly-red-team-final.md overwritten
Severity: CONDITIONAL
Next attack: STOP (areas exhausted)

Primary WT changed: NO; Patch applied: NO; Commit: NO; Push: NO; Deploy: NO; Recorder shipped: NO
