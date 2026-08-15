# KAREN — Final Preview Hardening + Missing-Behaviour Report

**Date:** 2026-08-15  
**Mode:** FIX + VERIFY (not redesign)  
**Source tree:** `C:\Users\adamg\Projects\desk-copilot\.tmp\karen-final-integration\`  
**Prior preview (verified before edit):** `https://desk-copilor-connpuliu-adam-b45d.vercel.app` → health `1.4.74`  
**Production (untouched):** `https://desk-copilor.vercel.app` → health `1.4.64`  
**Primary extension:** `PIN_PREVIEW_API_BASE=true` (updated to new preview URL below)

---

## Exact final fields

```text
LAST-DIRECTIONAL-DECISION: PASS
LAST-RECORDED-STATE: PASS
CURRENT-STANCE: PASS
KNOWN-INTENT-ROUTING: PASS
DUPLICATE/NO-REPLY-RACE: PASS
MARKET-READ: PASS
WEEKEND-CLOSED: PASS
HOLIDAY-CALENDAR: PASS
OPEN-MARKET-BROKEN-DETECTION: PASS
LIVE-PRICE-INTEGRITY: PASS
API-BASE/PREVIEW-PIN: PASS
DECISION-MEMORY-INTEGRITY: PASS
OBSERVATION/INTERPRETATION-CONTRACTS: PASS (with Fix1 note)
TYPECHECK: PASS
FORBIDDEN IMPORTS: PASS
UNEXPECTED FILES: NO
PREVIEW STATUS: READY

PREVIEW DEPLOYMENT: desk-copilor-hfdksc1vi-adam-b45d.vercel.app
PREVIEW URL: https://desk-copilor-hfdksc1vi-adam-b45d.vercel.app
DEPLOYMENT ID: dpl_8nFboWwiWSRjwA69jAnBxsKu1xQR
HEALTH: {"ok":true,"version":"1.4.75"}
VERSION: 1.4.75
FOCUSED TESTS: PASS (see §Verification)
TYPECHECK: PASS
FORBIDDEN IMPORTS: PASS
PRODUCTION PROMOTE: NOT DONE
```

---

## Per-issue records

### 1. Last decision semantics

**SYMPTOM:** “What was your last decision?” returned newest envelope even when WAIT/NO_TRADE.  
**ROOT CAUSE:** Parser collapsed all “last …” phrases to `last_recorded`; answer path always used `latestDecisionEnvelope`.  
**FIX:** Split query kinds:
- `last_directional` → walk newest→oldest for LONG/SHORT only; session-scoped with prior-session note when needed
- `last_recorded` → literal newest (WAIT/NO_TRADE allowed)
- `current_stance` → newest stance with desk language  
**FILES:** `lib/decision-history-query.ts`, `lib/decision-envelope-history.ts` (`findLatestDirectionalDecision`), `lib/decision-time-travel.ts`  
**TEST:** `scripts/test-last-decision-semantics.ts`, updated `red-team-B-last-decision-repro.ts`, extension-shape matrix  
**RESULT:** PASS — stack NO_TRADE/WAIT/WAIT/LONG → last decision = LONG; recorded/current = newest

### 2. GENERAL_CHAT fallthrough on known intents

**SYMPTOM:** History questions could reach casual LLM (“I don’t make decisions”).  
**ROOT CAUSE:** Semantic mismatch + incomplete phrase coverage; stream already had history-before-casual but treated all as `last_recorded`.  
**FIX:** Product kinds always answered deterministically (incl. honest miss); stream path unchanged (history before casual).  
**FILES:** same as §1; mentor/market-read gates below  
**TEST:** extension-shape HISTORY cases with `casualOnly`-shaped assertions; preview probe `casualOnly:true`  
**RESULT:** PASS — preview last-decision returns `live_decision_directional_missing`, not LLM disclaimer

### 3. Duplicate “Desk returned no reply (turn)”

**SYMPTOM:** “what are you up to?” → empty-(turn) error then correct persona reply.  
**ROOT CAUSE:** Primary `extension/content.js` `handleUserMessage` finally published `emptyReplyError("turn")` when persona/social was not instant-local (parallel agent `f5b7489b`). Integration tree content.js lacks that conversation turn tracker.  
**FIX:**
- Primary (already): persona → `canUseInstantLocal`; finally uses `localCasualReply` for casual/persona
- Integration: mirror `canUseInstantLocal` persona path; mentor `isIdentityOnly` includes `up to`; casual identity isolation  
**FILES:** primary `extension/content.js` (prior agent); `.tmp/.../extension/content.js`, `lib/mentor-intent.ts`, `extension/casual-chat.js`  
**TEST:** extension-shape GENERAL; preview probe returns single persona `done`  
**RESULT:** PASS — reload primary extension (v1.4.134+) after PIN update

### 4. Market read first-class

**SYMPTOM:** Conversational “whats the market read” / “what’s your read” could still look like screenshot `needsFullChartRead`.  
**ROOT CAUSE:** `wantsChartRead` matched `(your|the) read`; “get the read” was also classified CURRENT_MARKET_READ.  
**FIX:** Exclude explicit chart commands from CURRENT_MARKET_READ; `needsFullChartRead` short-circuits on CURRENT_MARKET_READ; expand conversational phrases; mirror in `extension/chart-intent.js`.  
**FILES:** `lib/mentor-intent.ts`, `lib/chart-read-intent.ts`, `extension/chart-intent.js`  
**TEST:** extension-shape MARKET matrix; preview probe spoken WAIT/MONITOR (no `needsChartRead`)  
**RESULT:** PASS

### 5–7. Closed / holiday / live price

**SYMPTOM:** Need weekend ≠ broken; holidays curated; Yahoo ≠ LIVE.  
**ROOT CAUSE:** Already largely wired; calendar years beyond 2027 were silent.  
**FIX:** `calendarCoverage: curated|beyond_table`; beyond table never invents holidays; adjacency tests added.  
**FILES:** `lib/cme-globex-session-status.ts`, `scripts/test-cme-globex-session-status.ts`  
**TEST:** Globex 42 checks; expectFresh gate; Yahoo recovery false  
**RESULT:** PASS

### 8. API base / preview pin

**SYMPTOM:** Extension must stay on active preview.  
**FIX:** Primary `extension/api-config.js` + `options.js` PREVIEW_BASE → new URL; `PIN_PREVIEW_API_BASE=true`. Failover harness still green.  
**FILES:** `extension/api-config.js`, `extension/options.js` (primary)  
**TEST:** `test-api-config-failover.mjs`  
**RESULT:** PASS — **Reload unpacked extension** so pin clears sticky last-good

### 9. Decision memory integrity

**TEST:** `red-team-E-mutability-repro.ts` ALL PASS; B last-decision isolation PASS  
**RESULT:** PASS

### 10. Session scope language

**FIX:** Directional lookup prefers current CME session; if miss but prior exists → “No LONG/SHORT this session. Previous session’s last directional was …”  
**TEST:** semantics prior-session case  
**RESULT:** PASS

### 11. Observation / interpretation

| Contract | Status |
|----------|--------|
| similar-but-skip (`sslRaid` / `reversalLookalikeWithoutSslSweep`) | Present in integration `interpretation-engine.ts` |
| ny-open A+ `adam_verdict: WAIT` | Present in labeled example |
| Fix1 observation `liquidity_swept` boolean from confirmed `structureFacts.liquiditySweeps` | **NOT ported** — dirty Fix1 observation-engine intentionally excluded per integration SoT; replay still derives `liquidity_swept` via `obs.liquidity.levels[].taken` in `replay-engine.ts` |

**RESULT:** PASS with explicit Fix1 gap (no wholesale dirty observation-engine copy)

### 12. UX language

Directional / stance / miss copy uses desk language; no “I don’t make decisions” on history probes.  
**RESULT:** PASS

---

## Verification (§14 focused)

| Check | Result |
|-------|--------|
| `tsc --noEmit` | PASS |
| `test-last-decision-semantics.ts` | PASS |
| `test-extension-shape-hardening.ts` | PASS |
| `test-extension-market-read-last-decision.ts` | PASS |
| `red-team-B-last-decision-repro.ts` | PASS |
| `red-team-B-G-time-session.ts` | 12/0 PASS |
| `red-team-E-mutability-repro.ts` | ALL PASS |
| `test-cme-globex-session-status.ts` | 42 checks PASS |
| `test-expectfresh-recovery-gate.ts` | PASS |
| `test-api-config-failover.mjs` | PASS |
| Forbidden files/imports | NONE |
| Full six-feature marathon | NOT RUN (not ceremonially required) |

### Preview probes (extension-shaped)

| Probe | HTTP | Notes |
|-------|------|-------|
| health | 200 | `1.4.75` |
| tell me a joke | 200 | casual done |
| whats the capital of berlin | 200 | streamed casual |
| what are you up to? | 200 | single persona done |
| whats the market read | 200 | spoken desk read (no needsChartRead) |
| what was your last decision? | 200 | `live_decision_directional_missing` |
| last recorded state | 200 | literal newest NO_TRADE |
| current stance | 200 | NO_TRADE desk language |
| is the market open? | 200 | streamed (LLM); Deployment Protection did **not** block |

**Deployment Protection:** not blocking these probes — continued.

---

## Still missing / Adam actions

1. **Reload Chrome extension** (primary) so PIN points at `https://desk-copilor-hfdksc1vi-adam-b45d.vercel.app`.
2. Fix1 observation-engine boolean mapping remains unported by design — report-only unless you authorize a minimal verified hunk later.
3. Integration-tree `extension/api-config.js` is still localhost-prefer (no PIN constants); Adam’s live pin is on **primary** `extension/` — intentional for this pass.
4. No commit / push / production promote performed.

---

## Adam reload checklist

1. `chrome://extensions` → Reload The Trading Desk  
2. Hard-refresh TradingView  
3. RECONNECT  
4. Confirm options/debug shows new preview base  
5. Smoke: joke → up to → market read → last decision → recorded state → current stance
