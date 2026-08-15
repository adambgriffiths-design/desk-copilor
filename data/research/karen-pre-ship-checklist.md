# KAREN — Pre-Ship Checklist (authoritative)

**Date:** 2026-08-15  
**Mode:** READ-ONLY consolidation — no product edits, no commit / push / deploy  
**Baseline HEAD:** `74183b24553757a22fd71d79d0f8954d7c72872f` (v1.4.73)  
**Primary:** dirty overlap exists (untracked decision-memory libs + modified observation/interpretation/casual/api-config) — **not** a verified clean carve apply  
**Deployed (last probe):** Vercel health reported `1.4.64` — **behind** HEAD; none of the isolated shipsets are deployed as verified carve  
**Missing reports:** `karen-cme-globex-closed-vs-broken-implementation.md`, `karen-globex-expectfresh-recovery-implementation.md` — **do not exist**; Globex `expectFresh` recovery is **in progress** in `.tmp/karen-market-closed-unify/` without a completion report  

**Worktrees under `.tmp/`:**
| Worktree | Role |
|----------|------|
| `.tmp/karen-six-feature-clean/` | Six-feature + red-team L1/last-decision + F6 surgical wire |
| `.tmp/karen-interp-decision-fixes/` | Three interp/decision fixes (dirty-primary-shaped WT — do not merge whole) |
| `.tmp/karen-general-chat-fix/` | GENERAL_CHAT / localhost fallthrough surgical fix |
| `.tmp/karen-market-closed-unify/` | Weekend≡closed unify (done: no product change) + **WIP** Globex `expectFresh` / closed-vs-broken implementation |

**Stale SoT warning:** `.tmp/karen-six-feature-clean/karen-six-feature.patch` lags current clean WT (missing red-team deep-clone / F6 wire; historically listed orphaned `conversational-intent`). **Source of truth = clean WT files, not the patch file.**

---

## 1. Six-feature clean patch

STATUS: CONDITIONAL  
SOURCE TREE: `C:\Users\adamg\Projects\desk-copilot\.tmp\karen-six-feature-clean`  
FILES CHANGED:
- Modified: `app/api/chat/stream/route.ts`, `extension/casual-chat.js`, `lib/analysis-contract.ts`, `lib/analysis-quality-gate.ts`, `lib/chat-engine.ts`, `lib/desk-pipeline.ts`, `lib/market-data.ts`, **`lib/observation-facts.ts` (dirty overlay — not official six-feature carve)**
- New: `lib/conversational-normalize.ts`, `lib/decision-contract-output.ts`, `lib/decision-envelope-history.ts`, `lib/decision-envelope.ts`, `lib/decision-history-query.ts`, `lib/decision-memory-backend.ts`, `lib/decision-time-travel.ts`, `lib/mentor-intent.ts`, `lib/mtf-horizons.ts`, `lib/session-liquidity.ts`, `lib/turn-category.ts`
- Verify-only scripts under `.tmp/karen-six-feature-clean/scripts/` (`verify-feature*`, `test-decision-*`, `red-team-*`, …)
- Absent (correct): `lib/conversational-intent.ts`
- F6 surgical wire **present** in WT: `tryStructuredWaitFollowUpFromLastPipeline` in `lib/chat-engine.ts` + stream short-circuit (`karen-f6-surgical-wire-report.md` body still incomplete / unfilled — code evidence supersedes empty report sections)

TESTS:
- Overnight focused+fuller checkpoint: **390 passed / 0 failed** (pre–F6-wire E2E expansion; F6 then **11/0** focused + **22/0** past-tense)
- Post red-team + F6 wire (bugfixes report): adapter **49/0**; time-travel **127/0**; F2 **24/0**; F3 **20/0**; F4 **13/0**; F5 **27/0**; F6 **25/0**; red-team E repro **PASS**; red-team B last-decision **PASS** — listed regression scripts **9 PASS / 0 FAIL**
- Forbidden-import product scan: **PASS** (recorder / decision-memory-material / withManualAnalysePriority / live-latency-profile / market-data-errors = zero)

TYPECHECK: FAIL — 5× TS2339 in dirty `lib/observation-facts.ts` (`side` / `status` / `id`); HEAD-shaped `observation-facts` alone typechecks green with the rest of the clean shipset  
PRODUCTION APPLIED: NO  
DEPLOYED: NO  
BLOCKER: Restore/revert `lib/observation-facts.ts` to HEAD (or HEAD-compat) before calling the clean carve typecheck-green; do not apply stale `.patch` file; human gate still required for primary apply

---

## 2. L1 immutability fix

STATUS: PASS  
SOURCE TREE: `C:\Users\adamg\Projects\desk-copilot\.tmp\karen-six-feature-clean`  
FILES CHANGED: `lib/decision-envelope-history.ts` (`structuredClone` / `cloneHistoryEntry` on record + public getters); repro `scripts/red-team-E-mutability-repro.ts`  
TESTS: red-team E **3/3 PASS** (caller mutate / retrieved mutate / Redis hydrate intact); included in post-fix regression green set above  
TYPECHECK: FAIL (ambient clean-tree `observation-facts` only — no diagnostics on history file)  
PRODUCTION APPLIED: NO  
DEPLOYED: NO  
BLOCKER: none for this fix itself; ship blocked by ambient clean-tree tsc + not yet carved into primary as verified apply

---

## 3. LIVE last-decision fix

STATUS: PASS  
SOURCE TREE: `C:\Users\adamg\Projects\desk-copilot\.tmp\karen-six-feature-clean`  
FILES CHANGED: `lib/decision-history-query.ts` (natural “last / last recorded decision” → `last_recorded`); `lib/decision-time-travel.ts` (LIVE `answerLiveDecisionHistoryQuery` branch); repro `scripts/red-team-B-last-decision-repro.ts`  
TESTS: red-team B last-decision repro **12/12 PASS**; time-travel fuller suite **127/0**  
TYPECHECK: FAIL (ambient `observation-facts` only)  
PRODUCTION APPLIED: NO  
DEPLOYED: NO  
BLOCKER: none for this fix itself; same ambient tsc + apply gate as #2

---

## 4. Liquidity_swept observation fix

STATUS: CONDITIONAL  
SOURCE TREE: `C:\Users\adamg\Projects\desk-copilot\.tmp\karen-interp-decision-fixes`  
FILES CHANGED (intentional): `lib/observation-engine.ts` (sweepHit → `taken=true` before provenance demotion)  
TESTS (interp WT): `liquidity_swept` fixtures restored; `npm run test:replay` observation **100%** (`liquidity_swept` **6/6**); `test:observation` PASS; chart-proof **3/3** PASS  
TYPECHECK: FAIL ambient (~18 error lines in dirty WT; **none** attributed to the three fix modules)  
PRODUCTION APPLIED: NO (primary has a **dirty** `lib/observation-engine.ts` modification — not the verified clean carve)  
DEPLOYED: NO  
BLOCKER: **Do not wholesale-merge** dirty interp `observation-engine.ts` into the six-feature carve — it pulls `level-interaction` / richer level provenance absent from HEAD/clean. Clean/HEAD already maps `taken: swept.has("pdh"|"pdl"|"pdc")` from `liquiditySweeps`. Fix1’s FN is a **dirty-WT provenance** bug; consolidation plan = keep HEAD observation for A+B shipset

---

## 5. similar-but-skip interpretation fix

STATUS: CONDITIONAL  
SOURCE TREE: `C:\Users\adamg\Projects\desk-copilot\.tmp\karen-interp-decision-fixes`  
FILES CHANGED (intentional): `lib/interpretation-engine.ts` (`reversalLookalikeWithoutSslSweep` / present_not_tradeable skip)  
TESTS: `similar-but-skip` → `long_supported=false`, verdict `NO_TRADE`; `test:session-liquidity` PASS; replay decision agreement includes similar-but-skip NO_TRADE; interpretation residual **64.5%** (non-blocking for decision 100%)  
TYPECHECK: FAIL ambient (dirty WT; fix file itself clean relative to ambient)  
PRODUCTION APPLIED: NO (primary has dirty `lib/interpretation-engine.ts` — not verified surgical port)  
DEPLOYED: NO  
BLOCKER: **Manual surgical port only** onto HEAD/`session-liquidity`-aware interpretation — do not copy whole dirty C file; do not import collateral `decision-layer.ts` dirty hunks

---

## 6. ny-open label / decision-contract reconciliation

STATUS: PASS  
SOURCE TREE: `C:\Users\adamg\Projects\desk-copilot\.tmp\karen-interp-decision-fixes`  
FILES CHANGED: `data/labeled-setups/examples/ny-open-long-a-plus.json` only (`adam_verdict: WAIT`; would-take notes; **no** `decision-layer.ts` edit)  
TESTS: ny-open WAIT matches label; replay decision agreement **100% (6/6)**; Fix1↛Fix3 counterfactual proven (sweep restore does not force LONG)  
TYPECHECK: N/A for JSON label (ambient WT tsc still FAIL)  
PRODUCTION APPLIED: NO  
DEPLOYED: NO  
BLOCKER: none for the label file itself — mechanical safe add when shipping labeled fixtures

---

## 7. GENERAL_CHAT slowness / dead-localhost diagnosis (+ fix WT)

STATUS: PASS  
SOURCE TREE: `C:\Users\adamg\Projects\desk-copilot\.tmp\karen-general-chat-fix`  
FILES CHANGED: `extension/api-config.js`, `extension/casual-chat.js`, `lib/casual-chat-intent.ts`, `app/api/chat/stream/route.ts`, `lib/chat-engine.ts`  
TESTS (WT probes, not npm suite counts):
- Gate: informal `whats the capital of Berlin` → **true** (was false)
- Joke instant: **~5ms**, OpenAI **0**
- Localhost DOWN → Vercel fallthrough **~367ms**; hung TCP confirm → Vercel **~944ms** (vs ~90s risk)
- Soft fallback + trading isolation: GENERAL_CHAT stays non-trading; no Redis/market on casual path
- Live capital OpenAI stream: **SKIPPED** (no `OPENAI_API_KEY` in verification shell)

TYPECHECK: NOT RUN (not claimed in verification report)  
PRODUCTION APPLIED: NO (primary has overlapping dirty `casual-chat-intent` / `api-config` — not this verified five-file apply)  
DEPLOYED: NO (prod probe still rejected informal `whats` on **1.4.64**)  
BLOCKER: apply deferred to Adam; smoke capital live LLM after apply; do not mix with six-feature/interp/recorder

---

## 8. CME closed-vs-broken market-state design (+ unify / Globex WIP)

STATUS: CONDITIONAL  
SOURCE TREE:
- Design: `data/research/karen-market-closed-vs-feed-broken-design.md` (primary research)
- Unify (complete): `C:\Users\adamg\Projects\desk-copilot\.tmp\karen-market-closed-unify` — product change **NONE** for weekend≡normal-closed
- Implementation WIP (incomplete): same WT now dirty with Globex `expectFresh` recovery — **no completion report**

FILES CHANGED:
- Unify phase: **none** (probe only `.tmp-market-closed-unify-probe.ts`)
- **WIP (incomplete / unverified as finished):** `lib/cme-globex-session-status.ts` (new), `app/api/quote/route.ts`, `extension/api-config.js`, `extension/content.js`

TESTS:
- Unify: `.tmp-market-closed-unify-probe.ts` **ok**; `scripts/test-connection-state.ts` **ok**; `scripts/test-chart-live-price.ts` **ok**; weekend/`getDay` forks **none**
- Globex `expectFresh` recovery implementation: **NOT RUN / no completion evidence** (reports named in brief do not exist)

TYPECHECK: NOT RUN for WIP Globex carve  
PRODUCTION APPLIED: NO  
DEPLOYED: NO  
BLOCKER: Design + weekend-unify are done; **Globex closed-vs-broken / expectFresh recovery is still running / incomplete** — do not treat WIP files as ship-ready; do not claim open-session verification on Saturday

---

## 9. Open-market fallback investigation

STATUS: NOT MERGED  
SOURCE TREE: investigation on primary + `.tmp/probe-open-market-live-data.ts` (prepared); overlapping WIP may exist under `.tmp/karen-market-closed-unify/` (`shouldRecoverLastFromBackendQuote` / `expectFresh`)  
FILES CHANGED (investigation): **none** as completed ship — design-only smallest fix described in `karen-open-market-live-data-investigation.md`  
TESTS: OPEN-SESSION VERIFIED: **NO** (CME closed Saturday); weekend Yahoo/prod quote samples only  
TYPECHECK: NOT RUN  
PRODUCTION APPLIED: NO  
DEPLOYED: NO  
BLOCKER: Cannot prove or ship “open-market live Last recovery” until Globex is open; run prepared probe + browser checklist next open; any WIP recovery must not paint Yahoo as LIVE or weaken freshness gates

---

## A. READY TO MERGE

*(Sufficient executable evidence — still require integration tree + human gate; none are production-applied.)*

1. **Clean six-feature carve from current WT** (not stale `.patch`), **after** `observation-facts` restore — includes F1–F5, F6 wire, red-team L1 clone, LIVE last-decision  
2. **L1 immutability** (`decision-envelope-history.ts`) — already inside clean WT  
3. **LIVE last-decision** (`decision-history-query.ts` + `decision-time-travel.ts`) — already inside clean WT  
4. **ny-open label JSON** (`adam_verdict: WAIT`) — mechanical, C-only  
5. **GENERAL_CHAT five-file surgical set** — isolated WT verified; merge separately from decision-memory carve (or after, with conflict check on `chat-engine` / stream route)

---

## B. NEEDS ONE MORE FIX

| Item | Exact issue | Smallest fix |
|------|-------------|--------------|
| Clean-tree tsc | Dirty `observation-facts.ts` uses `side`/`status`/`id` | Restore HEAD or HEAD-compat rewrite (label-only heuristics) — **pre-ship required** |
| C Fix2 similar-but-skip | Verified only in dirty interp WT | Surgical port of `reversalLookalikeWithoutSslSweep` onto HEAD interpretation — **not** whole-file copy |
| C Fix1 liquidity_swept | Verified on dirty provenance path; HEAD already sweep→taken | **Do not import** dirty observation wholesale; re-confirm observation/replay on HEAD carve instead |
| Globex expectFresh / closed-vs-broken | WIP in market-closed-unify; no completion report | Finish + focused tests **or** discard WIP until designed ship; do not mix half-wired extension/quote into six-feature PR |
| GENERAL_CHAT live capital | Gate/fallthrough verified; live OpenAI smoke skipped | Post-apply smoke with API key |
| Stale patch file | Behind WT | Ignore / regenerate after integration — never apply as SoT |

---

## C. ENVIRONMENTAL VERIFICATION

| Check | Requires |
|-------|----------|
| Live Tickstream Last advancing / TV tick cadence | **CME Globex open** |
| Open-market `/api/quote` → Last recovery | **CME open** + browser extension checklist |
| Closed vs broken UI copy correctness while ticks expected | **CME open** (stale-while-open) |
| Real Upstash cross-isolate decision memory | **Real Redis** credentials + multi-isolate runtime |
| Production GENERAL_CHAT informal `whats` + joke + localhost fallthrough | **Production deploy** + extension reload |
| Live Redis / CME A/B of decision-memory features | **Production runtime** + open market (where relevant) |
| Browser UI LIVE badge / hidden-panel behavior | **Browser UI** (automation often blocked) |

Do **not** claim these from Saturday closed-market probes.

---

## D. MUST STAY EXCLUDED

- `lib/continuous-decision-recorder.ts` and all continuous-recorder probes/tests  
- Recorder-modified `lib/verdict-engine.ts` / `withManualAnalysePriority`  
- `lib/decision-memory-material.ts`  
- `lib/live-latency-profile.ts`, `lib/live-latency-trace.ts`, `lib/market-data-errors.ts`  
- `lib/conversational-intent.ts` (absent from clean carve — do not re-add without call sites)  
- `lib/level-interaction.ts` + dirty observation provenance stack (required only by blocked wholesale Fix1)  
- Entire `.tmp/karen-interp-decision-fixes/` dirty tree as a unit (hundreds of unrelated modified/untracked libs)  
- Unrelated dirty primary APIs / voice / desk-tracker / research-architecture churn  
- Debug/probe files: `.tmp-*`, `.tmp/probe-*`, `.fix-*`, red-team-only unless promoted as harnesses  
- `.env` / secrets / credentials  
- Stale `karen-six-feature.patch` as apply source of truth  
- Incomplete Globex WIP unless finished and separately reviewed  

---

## E. ORDER OF OPERATIONS

1. **Freeze sources:** clean WT = A+B SoT; ignore stale patch; do not merge whole interp WT  
2. **Integration worktree from baseline `74183b2`**  
3. **Merge isolated fixes in order:**  
   a. A+B clean six-feature file inventory (incl. red-team + F6 wire)  
   b. Revert/fix `observation-facts.ts` → HEAD-compat  
   c. C Fix3 label JSON  
   d. Optional C Fix2 surgical interpretation port  
   e. Skip dirty C Fix1 wholesale  
   f. Separately: GENERAL_CHAT five files (resolve overlaps on `chat-engine` / stream)  
   g. Globex/open-market: **hold** until WIP complete **or** explicitly drop from this ship  
4. **Run regression matrix** (memory adapter, red-team E/B, time-travel, F2–F6 verifies, envelope transitive, observation/decision/replay if Fix2/3, session-liquidity, analysis-contract; GENERAL_CHAT probes if that carve included)  
5. **Typecheck** `npx tsc --noEmit` — must be green  
6. **Produce final clean patch / PR diff from integration tree only**  
7. **Human review diff** (forbidden imports, no recorder, no secrets, no unrelated dirty)  
8. **Commit** only after explicit Adam request  
9. **Deploy** only after commit accepted + local build green  
10. **Post-deploy verification:** health/version; GENERAL_CHAT smokes; decision-memory with real Redis if configured; **open-market** Last/TV only when Globex open  

---

## F. STOP CONDITIONS

Stop the process if:

- any new unrelated files appear in the ship diff  
- a recorder / `decision-memory-material` / `withManualAnalysePriority` / latency / market-data-errors dependency appears in product paths  
- typecheck introduces new errors (or `observation-facts` overlay is reintroduced)  
- a previously green feature (F1–F6, red-team E/B, replay decision 100% when in scope) regresses  
- live market verification is claimed while CME is closed  
- Redis production verification is claimed without real runtime contact  
- entire dirty interp WT or stale `.patch` is used as merge source  
- incomplete Globex `expectFresh` WIP is silently folded into the six-feature PR  

---

## Worktree inventory snapshot (2026-08-15)

| Path | HEAD | Product delta summary |
|------|------|------------------------|
| `.tmp/karen-six-feature-clean` | `74183b2` detached | Six-feature + red-team + F6 wire; **tsc blocked** by observation-facts overlay |
| `.tmp/karen-interp-decision-fixes` | `74183b2` detached | Intentional 3-file fixes **plus** large dirty-primary-shaped tree — carve only |
| `.tmp/karen-general-chat-fix` | `74183b2` detached | Five surgical files + local verify probes |
| `.tmp/karen-market-closed-unify` | `74183b2` detached | Unify complete (no product change); **WIP** Globex session status + quote/content/api-config recovery |

Primary also contains **unverified dirty overlaps** (untracked decision-memory libs; modified observation/interpretation/casual/api-config). Treat primary dirty state as **not** “PRODUCTION APPLIED = YES.”

---

## OVERALL SHIP STATUS: CONDITIONAL

## SINGLE NEXT ACTION: Restore HEAD-compatible `lib/observation-facts.ts` in an integration tree built from the current `.tmp/karen-six-feature-clean` working set (not the stale patch), then re-run `tsc --noEmit` and the F1–F6 + red-team E/B regression matrix before any primary apply.

---

## Confirmation

- No product code modified by this checklist task  
- No commit / push / deploy  
- Only artifact: `data/research/karen-pre-ship-checklist.md`  

**STOP.**
