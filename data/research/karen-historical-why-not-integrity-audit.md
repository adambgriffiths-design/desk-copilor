# KAREN — Historical Why-Not Integrity Audit

**Date:** 2026-08-15  
**Mode:** AUDIT ONLY — no code changes, no commit/push/deploy  
**Scope:** Follow-ups on **recorded** LONG / SHORT / WAIT / NO_TRADE DecisionEnvelopes  
**Questions:** `Why?` · `Why not long?` · `Why not short?` · `What were you waiting for?`  
**Lanes:** LIVE-history + HISTORICAL-fixture  
**Probe:** `.tmp-why-not-integrity-probe.ts` + `.tmp-waiting-routing-check.ts` (audit-only)  
**Helpers reused:** `recordDecisionEnvelopeHistory`, `findDecisionAtOrBefore`, `answerHistoricalDecisionTimeTravel`, `answerHistoricalFixtureTurn`, `tryDeterministicMentorFollowUp`, `formatWhyNotDirectionFollowUp` / `formatStructuredWaitFollowUp` / `formatMentorTradeSpoken`, `REPLAY_FIXTURES`, `synthetic-ny-am`  
**Related priors:** `karen-weekend-analysis-quality-pass.md`, `karen-live-decision-history-integrity-audit.md`, `karen-historical-verdict-plus-why.md`, `karen-recorded-vs-pit-fix.md`, `test:karen-wait-followup`

---

## Method

1. LIVE ring was empty → seeded **synthetic** DecisionEnvelopes via `recordDecisionEnvelopeHistory({ force: true })` (probe-only; not product persistence / not fake live Yahoo).
2. Bound LIVE product follow-ups with `replaceLastPipelineResult` + intel cache to the **original** recorded envelope; injected a **later** opposite stance/price and verified answers did not cite later thesis/price.
3. HISTORICAL: same four statuses recorded into HISTORICAL ring (`synthetic-ny-am` markers) + NL `at 09:31` recorded-only check; fixture-UI path at bar **50** (natural WAIT/FLAT).
4. Integrity checks per cell: original stance/thesis preserved · no later-market leak · no invented execution · no LLM path · structured WHY NOT / WAITING labels when routed · HISTORICAL banner / PREVIOUS DECISION where product path applies.

**Control (not scored in matrix):** `What are you waiting for?` routes correctly on both lanes; past-tense `were` does not.

---

## Matrix

| Status | Question | LIVE | HISTORICAL | Evidence (short) |
|--------|----------|------|------------|------------------|
| LONG | Why? | **PASS** | **PASS** | LIVE: product + ring cite `LIVE-LONG-THESIS-LONG`; later SHORT@99999 not used. HIST: recorded ring + `at_time` fromStore. |
| LONG | Why not long? | **PASS** | **PASS** | `WHY NOT LONG:` from original envelope/ctx; stance stays long; no execution invent. |
| LONG | Why not short? | **PASS** | **PASS** | `WHY NOT SHORT:` from original; no PIT/LLM. |
| LONG | What were you waiting for? | **FAIL** | **FAIL** | Intent=`GENERAL_CHAT`; LIVE `tryDeterministicMentorFollowUp` → **null**; does not bind recorded WAITING FOR path. |
| SHORT | Why? | **PASS** | **PASS** | Original `…-SHORT-THESIS-SHORT` preserved; later poison unused. |
| SHORT | Why not long? | **PASS** | **PASS** | Structured why-not from original envelope. |
| SHORT | Why not short? | **PASS** | **PASS** | Structured why-not from original envelope. |
| SHORT | What were you waiting for? | **FAIL** | **FAIL** | Same past-tense routing miss (not envelope-bound). |
| WAIT | Why? | **PASS** | **PASS** | LIVE product structured explain; HIST ring + fixture-UI `historical_fixture_wait` / same decisionKey. |
| WAIT | Why not long? | **PASS** | **PASS** | LIVE+HIST `WHY NOT LONG:`; fixture-UI PREVIOUS DECISION + same key. |
| WAIT | Why not short? | **PASS** | **PASS** | Same as above for short side. |
| WAIT | What were you waiting for? | **FAIL** | **FAIL** | Fixture-UI `responseSource=historical_fixture_read` (fresh read, **no** PREVIOUS DECISION / WAITING FOR). Control `are` → PASS. |
| NO_TRADE | Why? | **PASS** | **PASS** | Synthetic monitor/NO_TRADE + replay `missing-quality`; no fill/execution claims. |
| NO_TRADE | Why not long? | **PASS** | **PASS** | Why-not from original monitor envelope. |
| NO_TRADE | Why not short? | **PASS** | **PASS** | Why-not from original monitor envelope. |
| NO_TRADE | What were you waiting for? | **FAIL** | **FAIL** | Same `were` routing gap. |

**Score (core 32 cells):** LIVE 12 PASS / 4 FAIL · HISTORICAL 12 PASS / 4 FAIL · All 8 FAIL cells are the WAITING-FOR (`were`) question.

---

## WHY:

**PASS** on LIVE and HISTORICAL for LONG / SHORT / WAIT / NO_TRADE when the prior read is bound.

- Answers come from `formatMentorTradeSpoken` / wait explain on the **original** DecisionEnvelope (LIVE: last pipeline / cache; HISTORICAL recorded-ring or fixture session envelope).
- Original thesis tokens preserved; later opposite ring entries (price 99999 / poison) did not appear.
- No LLM reinterpretation on the deterministic mentor path; no invented fill/execution language observed.
- HISTORICAL fixture-UI (`synthetic-ny-am@50`): same `decisionKey`, `PREVIOUS DECISION` banner, `responseSource=historical_fixture_wait`.

---

## WHY NOT LONG:

**PASS** on both lanes for all four recorded statuses.

- Product path: `parseWhyNotDirection` → `formatWhyNotDirectionFollowUp(originalEnv, "long", …)`.
- Labels `WHY NOT LONG:`; cites structured long-side rejection / evidence from the frozen interpretation attached to that decision.
- Status/stance of the recorded envelope not flipped to a new market re-decide; no Yahoo refresh when prior read present (`test:karen-wait-followup` / weekend quality pass agree).

---

## WHY NOT SHORT:

**PASS** on both lanes for all four recorded statuses.

- Same formatter path with direction `"short"`.
- Fixture-UI bar50: `historical_fixture_why_not`, same decisionKey, HISTORICAL + PREVIOUS DECISION banners, no fabricated trade language (matches `karen-weekend-analysis-quality-pass.md`).

---

## WAITING FOR:

**FAIL** for the exact audit phrase `What were you waiting for?` on **both** LIVE and HISTORICAL, for **all** four statuses.

| Phrase | Intent | LIVE product | HISTORICAL fixture-UI |
|--------|--------|--------------|------------------------|
| `What are you waiting for?` (control) | `WAIT_EXPLANATION` | hit; `WAITING FOR:` from envelope | `historical_fixture_wait`; PREVIOUS DECISION |
| `What were you waiting for?` (audit) | `GENERAL_CHAT` | **null** (no envelope bind) | `historical_fixture_read` — re-speaks current read, **no** PREVIOUS DECISION / WAITING FOR |

Root cause: `lib/mentor-intent.ts` wait detectors only match `what (is|are|'s) you/we waiting for` — **not** past-tense `were`. So the question never enters the recorded-envelope follow-up path.

When the wait formatter **is** invoked on the original envelope (`formatStructuredWaitFollowUp`), content integrity would PASS (envelope-only, no LLM). Product routing never gets there for `were`.

---

## LIVE PATH:

| Item | Result |
|------|--------|
| Ring empty initially | Yes → seeded via `recordDecisionEnvelopeHistory` in probe |
| Why? / Why not long/short | **PASS** — `tryDeterministicMentorFollowUp` + last pipeline = original envelope |
| What were you waiting for? | **FAIL** — not classified as wait follow-up; no recorded bind |
| Later market contamination | **PASS** (for Why / why-not) — later opposite stance/price not cited |
| PIT rebuild | N/A (LIVE ring / last pipeline; no fixture PIT) |
| Fresh LLM | Not used on deterministic hit path |
| Invented execution | Not observed |
| Continuous live Yahoo | Not used (synthetic / replay fixtures only) |

**Note:** LIVE why-not follow-ups bind **last pipeline / intel cache**, not a time-travel lookup into the LIVE history ring. Integrity holds when that last envelope **is** the recorded decision; ring seeding alone does not answer why-not without binding last pipeline.

---

## HISTORICAL PATH:

| Item | Result |
|------|--------|
| Recorded-ring LONG/SHORT/WAIT/NO_TRADE | Why / why-not **PASS** (formatter on `findDecisionAtOrBefore` entry); `at_time` keeps original thesis (`fromStore`) |
| Fixture-UI `synthetic-ny-am` bar50 (WAIT/FLAT) | Why / why-not **PASS** (same decisionKey + PREVIOUS DECISION) |
| What were you waiting for? | **FAIL** (treated as new read) |
| Natural fixture LONG/SHORT bars | Not required — LONG/SHORT covered by synthetic HISTORICAL ring records |
| PIT rebuild residual | Fixture-UI **rebuilds** session each turn via `buildHistoricalFixtureIntelligence` then formats; fixed `barIndex` → deterministic same envelope/key. Stricter “no PIT rebuild / ring-only” is satisfied for **clock at_time** (recorded-vs-PIT fix), not for conversational why-not on fixture-UI. |
| Later HISTORICAL poison | Does not alter earlier recorded 09:31 thesis/status on at_time / ring retrieve |

---

## PASS/FAIL SUMMARY:

| Area | Verdict |
|------|---------|
| Why? × 4 statuses × 2 lanes | **PASS** (8/8) |
| Why not long? × 4 × 2 | **PASS** (8/8) |
| Why not short? × 4 × 2 | **PASS** (8/8) |
| What were you waiting for? × 4 × 2 | **FAIL** (0/8) |
| No later-market / no LLM / no invented execution (on routed paths) | **PASS** |
| Same status + original thesis when envelope-bound | **PASS** |
| LIVE path available | **YES** (seeded; was empty) |
| HISTORICAL path available | **YES** (ring + fixture-UI) |

### Overall: **FAIL** (conditional)

Why / why-not integrity against the **original recorded DecisionEnvelope** holds on LIVE and HISTORICAL for LONG, SHORT, WAIT, and NO_TRADE.  
The audit **fails overall** because `What were you waiting for?` does **not** use the original recorded envelope on either lane (past-tense intent miss → general/new-read path).

**Smallest fix target (out of scope here):** extend wait-follow-up intent / `isMentorFollowUpOnPriorRead` to accept `what were you waiting for` (and route like `are`).

---

## Stop (original audit)

Audit complete. No remediation code, commit, push, or deploy performed at audit time.

---

## Overnight re-verify (2026-08-15)

Past-tense wait routing was fixed in dirty WT (`mentor-intent` / casual `were` anaphora; suite `test:karen-past-tense-wait-routing` 22/22). Re-ran `.tmp-why-not-integrity-probe.ts`:

| Metric | Result |
|--------|--------|
| livePass / liveFail | **16 / 0** |
| histPass / histFail | **16 / 0** |
| extraPass / extraFail | **8 / 0** |
| cells | 40 |

**Overall (re-verify): PASS** — prior WAITING-FOR (`were`) FAIL cells closed. Evidence JSON: `.tmp-why-not-integrity-probe.json`. Companion: `data/supervisor/results/overnight-why-not-integrity-reverify.md`.
