# KAREN — Continuous state as SPEED opportunity (AUDIT ONLY)

**Date:** 2026-08-15  
**Mode:** AUDIT ONLY — no implementation, no live testing (market closed), no benchmark marathon, no commit/push/deploy  
**Question:** Can continuous background market state make **manual Analyse / “Give me the read” faster** without creating more expensive work?  
**Continuous recorder:** **NOT BUILT**  
**History retrieval:** recorded-only + verdict+why — `test:decision-history-time-travel` **92/92** (separate concern)  
**Sources:** `karen-live-context-reuse.md`, `karen-llm-payload-size-audit.md`, `karen-speed-connection-priority-audit.md`, `karen-weekend-analysis-quality-pass.md`, `karen-latency-by-request-type.md`, `lib/chat-engine.ts`, `lib/verdict-engine.ts`, `lib/market-data.ts`, `lib/decision-envelope-history.ts`, prior continuous drafts  

**Latency citation rules:** Old live MISS medians **~28–40s are STALE** (pre-reuse / pre-HTF-append / pre-structureFacts). **Post-optimization live wall-clock UNAVAILABLE** (CME closed / `:3020` unhealthy). Do not treat stale MISS as current.

---

## CURRENT MANUAL PATH:

| Surface | Path | Pays for |
|---------|------|----------|
| **Analyse Market** | extension → `POST /api/live-verdict` → `generateChartAnswer` → **`generatePipelineVerdict`** → `runDecisionPipeline` → **`runDeskPipeline`** | Yahoo/bars (or TV snapshot) + market state + **deterministic** envelope. **No LLM** on structured path. |
| **“Give me the read”** (chat) | `/api/chat/stream` → `buildDeskMarketIntelligence` (+ reuse) → quality gate / envelope → **LLM rewrite** of gated read | Context (HIT **1–16 ms** when warm) + **LLM ~3.7–4.8 s** (warm HIT, Bench A) |
| **Why? / Why not long?** follow-up | Prefer `tryReuseLiveDeskIntelligence` / cached intel → deterministic mentor | HIT follow-up **~6–153 ms** live; unit **0.8–1.5 ms** — **no LLM** when structured path hits |

**Authoritative envelope:** always `runDeskPipeline` → `analysis_contract.decision`. Statuses remain `LONG | SHORT | WAIT | NO_TRADE` only.

**Already reusable today (no continuous background):** live context reuse fingerprint (bars / price≥0.25 / session), Yahoo `fetchAllTimeframesCached` (45s TTL + in-flight coalesce), `/api/warm`, `getLastPipelineResult`, LIVE ring only if something already recorded this process.

---

## REUSABLE CURRENT STATE:

| Asset | Exists? | What it is | Manual benefit if warm |
|-------|---------|------------|------------------------|
| Yahoo multi-TF pin/cache | **Yes** | 45s cross-request + coalesce | Avoids duplicate Yahoo fetch within TTL |
| Live desk intelligence cache | **Yes** | `tryReuseLiveDeskIntelligence` / peek | Chat follow-ups & same-fingerprint reads skip engine rebuild |
| Incremental engine + HTF append-only + structureFacts | **Yes** | Cheap closed-bar path vs fullRebuild | New-bar cost lower than obsolete full rebuilds (fixture-proven; **live post-opt UNAVAILABLE**) |
| TV `chartSnapshot` in extension | **Yes** | Structured candles for Analyse | Analyse can be snapshot-led; not the same object as server intel cache |

Background continuous work can **keep these warm** so manual hits HIT more often — but only if background and manual share the **same Node isolate** (serverless multi-isolate gap remains).

---

## REUSABLE DECISION STATE:

| Asset | Exists? | Notes |
|-------|---------|--------|
| `getLastPipelineResult()` | **Yes** | Last in-process `DeskPipelineResult` (panel/spoken briefs) |
| LIVE `DecisionEnvelopeHistoryEntry` | **Yes** (ring max 80) | Only if something recorded this process; empty after restart |
| Quality-gate envelope text | **Yes** | Chat path; not automatically shared to `live-verdict` |
| Mentor LLM output | **Not a decision store** | Must not be treated as authoritative history |

**Gap:** Analyse Market does **not** today short-circuit to “latest LIVE envelope if fingerprint HIT.” Continuous recorder alone does not add that — a **reuse gate on the manual path** would.

**Fixture envelope JSON size (bullish-wait probe):** full history entry ~**8.3 KB**; envelope alone ~**6.8 KB**; compact projection ~**0.9 KB**. Not a speed bottleneck vs LLM.

---

## MINIMUM FRESHNESS:

Reuse market context / decision only when **existing** live reuse key would HIT:

- same 1m/5m/15m/daily **bar identity** (count|first|lastTime)
- last print within **&lt; 0.25 MNQ** of cached overlay (`LIVE_CONTEXT_PRICE_EPS`; ≥0.25 = MISS)
- same session / AMD / macro fingerprint
- same wall-clock **minute** rule already used for follow-up fast path (`tryReuseLiveDeskIntelligence` + session unchanged)

**UNKNOWN (unmeasured):** whether an extra wall-clock “envelope younger than N seconds” threshold beyond fingerprint is needed for UX; fingerprint is the coded truth today.

If fingerprint would **MISS**, serving a background envelope as “current” is **unsafe**.

---

## BACKGROUND WORK REQUIRED:

For a **speed** design (not “memory spam”):

| Work | Cadence | Cost class |
|------|---------|------------|
| Cheap freshness poll / fingerprint check | tens of seconds | Negligible if local |
| Yahoo warm (`/api/warm` or cached fetch) | ≤ about once / 45s when open | Network; coalesced |
| Incremental engine sync on new closed 1m / price≥0.25 / session | On miss only | CPU; prefer append-only / structureFacts — **not** fullRebuild every minute |
| `generatePipelineVerdict` / `runDeskPipeline` | Only on meaningful decision trigger | CPU; **$0 LLM** |
| Mentor LLM | **Never** on background timer | Avoid |

**Do not:** LLM every minute · fullRebuild every minute · tick engine · second decision engine · new DB/cache architecture.

---

## MANUAL WORK REMAINING:

Even with perfect background warm:

| Manual action | Still must pay (if fingerprint HIT) | Still must pay (if MISS) |
|---------------|-------------------------------------|---------------------------|
| Analyse (structured) | Optionally **near-zero** if short-circuit to last pipeline/envelope (NOT wired today) — else re-run deterministic pipeline (CPU, usually ≪ LLM) | Context rebuild + pipeline; live cost **UNAVAILABLE** post-opt |
| “Give me the read” | Context **1–16 ms** already; **LLM ~3.7–4.8 s** still dominates unless product skips LLM | Context miss + LLM |
| Historical “decision at HH:MM?” | Ring lookup only (92/92) — not a speed issue | Honest miss string |

**Critical:** On warm HIT chat reads, continuous background **cannot** remove the ~3.7–4.8s LLM wall unless manual path **skips LLM** and returns envelope/`spokenBrief` (product change). Context reuse is already solved for that case.

---

## EXPECTED SPEED BENEFIT:

| Scenario | Benefit | Evidence |
|----------|---------|----------|
| Background keeps Yahoo+intel warm → manual would have been **cold** | Avoid cold context path | Cold/intel-only burst historically paid tens of seconds (STALE as absolute live number; directionally “cold ≫ HIT”) |
| Background keeps fingerprint HIT → chat follow-up | Already **6–153 ms** | Measured; background optional |
| Background + **new** Analyse short-circuit on HIT | Could skip deterministic pipeline CPU | **Speculative** — not built; win size **UNKNOWN** live (pipeline ≪ LLM historically on warm chat) |
| Background + skip LLM on “Give me the read” when HIT | Could drop **~3.7–4.8 s** → leave context+envelope assembly (~ms–tens ms) + UI | Only if product accepts non-LLM narration; **not** current behaviour |
| Background while already warm HIT | **Little or no** speed win for chat | Warm HIT already LLM-bound |
| Historical fixture first-visible ~**793 ms** | Offline reference only | `karen-weekend-analysis-quality-pass.md` — not live |
| General knowledge ~**895 ms** | Unrelated to continuous state | Must stay off market pipeline |

**Verdict:** Continuous background is a **conditional** speed optimization (warm / avoid cold / optional envelope short-circuit). It does **not** by itself solve warm “Give me the read” latency. **Do not claim it solves the speed problem.**

---

## RISK OF MAKING SPEED WORSE:

| Risk | Mechanism | Severity |
|------|-----------|----------|
| CPU contention | Background new-bar / pipeline overlaps manual Analyse | **High** on 8GB / single Node if both rebuild |
| Yahoo/Tickstream contention | Extra fetches; coalesce helps but cold miss still expensive | Medium (coalesce mitigates duplicates) |
| LLM contention | Background must **not** call mentor LLM; if it did, fights chat | Avoid by policy |
| Queueing / `verdictBusy` | Background holds busy → manual waits or cancels | High if single-flight poorly designed |
| Isolate mismatch | Warm on isolate A, Analyse on B → **no reuse**, wasted background CPU | High on serverless |
| Duplicate builds | Background + manual both MISS same bar | Medium — need single-flight + coalesce |
| Memory | LIVE ring 80 × ~8 KB ≈ **~0.6 MB** envelope history — negligible vs engine RSS | Low for ring; engine RSS **UNKNOWN** live |

**If evidence doesn’t support a win:** when the user already has warm HIT (context 1–16 ms), adding background work **cannot** improve chat speed and **can** only add contention risk. Net: **neutral to negative** unless LLM skip or cold-avoidance applies.

---

## LLM CALL IMPACT:

| Policy | Impact |
|--------|--------|
| Background structured pipeline only | **0** background LLM calls / hour |
| Background mentor “read” every minute | Would add up to ~60 LLM calls/hour — **rejected** |
| Manual “Give me the read” after background | Still **1 LLM** today on deliverable envelope path (~3.7–4.8 s) |
| Payload ~6.6k tokens; ~640 tok duplicate envelope cut | Estimated **~50–150 ms** TTFT if implemented — **not necessarily shipped**; ≪ decode wall |

Continuous decision memory must stay **LLM-free** on the timer path.

---

## CPU/MEMORY IMPACT:

| Item | Known | Unknown |
|------|-------|---------|
| Warm HIT context | **1–16 ms** | — |
| Fixture HTF m5 append-only | ~2.7 s class (vs ~11 s full) | Live post-opt |
| StructureFacts incremental | ~3× class vs full on fixture | Live post-opt |
| Envelope ring 80 | ~**0.6 MB** JSON-class | — |
| Background every 1m full rebuild | **Rejected** | Would dominate CPU |
| Process RSS with engine warm | — | **UNKNOWN** — need open-market sample |

---

## SAFE REUSE CONDITIONS:

- Same process / isolate as the manual request  
- Live reuse fingerprint **HIT** (bars + price&lt;0.25 + session)  
- Last pipeline / LIVE envelope produced under that fingerprint (or same `stateHash` + stance with unchanged thesis/invalidation)  
- Data quality still deliverable (not stale/missing/timeout)  
- Manual Analyse or chat explicitly allowed to short-circuit (product rule)  
- Background did **not** use vision/LLM alternate path  

Follow-ups (`Why?`, `Why not short?`) already safely reuse cached intel when `shouldRefreshMarketState` is false.

---

## UNSAFE REUSE CONDITIONS:

- New closed 1m / HTF identity change (bars MISS)  
- Print move ≥ **0.25 MNQ**  
- Session / AMD / macro change  
- Yahoo/Tickstream unavailable, timeout, or degraded quality  
- Serving envelope from another isolate / after restart (empty ring)  
- Treating “last recorded WAIT” as current after a gap minute with no record  
- Skipping LLM while presenting a **new** mentor narrative as if freshly reasoned (honesty / product)  
- Mixing HISTORICAL fixture envelopes into LIVE current read  

---

## SINGLE BEST DESIGN:

**Speed-first continuous awareness (not continuous expensive rebuild):**

1. **Cheap keep-warm only while market open:** fingerprint poll + Yahoo warm/coalesce + incremental engine sync on real MISS events — **no** mentor LLM, **no** fullRebuild-every-minute, **no** tick engine.  
2. **Decision eval rare:** on meaningful change (new 1m / session / structural decision trigger), run **same** `generatePipelineVerdict` → `runDeskPipeline` as Analyse; append LIVE ring only on material decision/why change.  
3. **Manual speed hook (the actual win):** if fingerprint HIT and last pipeline/envelope matches → Analyse / optional chat panel path **returns that result** (skip rebuild; chat still may LLM unless product opts into `spokenBrief`-only).  
4. **Hard yield:** `verdictBusy` / single-flight — manual always wins; overlapping background discarded.  
5. **Honesty:** miss minutes stay unrecorded; restart clears RAM history; never invent speed wins from STALE 28–40s figures.

**Does this solve speed?** **No guarantee.** Proven warm-HIT bottleneck is **LLM (~3.7–4.8 s)**. Background helps **cold → warm** and **optional pipeline skip**; open-market measurement still required for post-opt context cost and contention.

---

## Answers to the 12 numbered design questions (compact)

1. **Current vs possible:** Today reuse is request-driven HIT; continuous recorder absent. Possible = keep-warm + rare pipeline + manual short-circuit.  
2. **Reuse latest background market context?** Yes **if** fingerprint HIT and same isolate — same mechanism as `tryReuseLiveDeskIntelligence`.  
3. **Reuse latest background DecisionEnvelope?** Possible for Analyse/panel; **not wired**; unsafe on MISS.  
4. **Freshness threshold?** Existing reuse key (+ follow-up same-minute rule); extra N-second threshold **UNKNOWN**.  
5. **Background work?** Warm + incremental on miss + rare deterministic pipeline — never LLM/minute.  
6. **Manual remaining?** Warm chat still LLM-bound unless skip-LLM policy; Analyse CPU unless short-circuit.  
7. **Speed benefit?** Conditional cold-avoid / short-circuit; **not** a fix for warm LLM.  
8. **Risk slower?** Yes — CPU/Yahoo/`verdictBusy` contention; serverless isolate waste.  
9. **LLM impact?** Background must be **0** LLM; manual unchanged unless optional skip.  
10. **CPU/memory?** Ring tiny; engine cost UNKNOWN live; avoid 1m full rebuild.  
11. **Safe reuse?** Fingerprint HIT + quality OK + same isolate.  
12. **Unsafe?** Any reuse-key MISS, stale feeds, restart gaps, fixture bleed.

---

## What still needs open-market measurement

- Post-opt live MARKET CONTEXT on new 1m MISS (replace STALE 28–40s)  
- Contention: background+manual overlap wall times  
- Whether Analyse short-circuit wins meaningful ms vs full `generatePipelineVerdict`  
- Whether users accept LLM-skip “read” from `spokenBrief`  
- Cross-isolate warm failure rate on prod  

---

## Stop

Speed audit complete. Continuous recorder not implemented. No code changes, live tests, commit, push, or deploy.

*(Full architecture file: `karen-continuous-decision-memory-audit.md` — completed after this speed deliverable.)*
