# KAREN — Market Intelligence Latency P1

**Date:** 2026-08-15 (Saturday — CME equity-index **MARKET_CLOSED**, `expectFresh=false`)  
**Tree:** `.tmp/karen-final-integration/`  
**Mode:** INVESTIGATE → SURGICAL FIX → VERIFY  
**Supersedes residual from:** `karen-response-latency-fix.md` / agent 09e0c93d  
**Coordinate:** continuity agent 528efca5 — no conversational UX clobber  

```text
ROOT_BOTTLENECK: per-bar Intl EST timezone conversion in hot loops (getEstDateKey / getEstMinutes / barsInEstWindow)
SECONDARY: no DeskMarketIntelligence result reuse / no in-flight dedupe (concurrent 2× full rebuild)
DUPLICATE_BUILDS: concurrent market-reads rebuilt full context twice (109s measured BEFORE)
CACHE_ISSUES: Yahoo 45s cache HIT (~0ms) but intel rebuilt every call; no stateHash reuse
NETWORK_WAITS: Yahoo cold ~450–620ms; tickstream correctly skipped without chart snap; closed now hard-skips tickstream wait
QUERY_OVERWORK: T1 PDL was paying full CMR build (structure+obs+interp) — light daily path already present; keep it
OPENAI_CALLS: 0 on PDL / comparative / warm intel reuse paths measured here
TYPECHECK: PASS (tsc --noEmit)
NO_PROD_DEPLOY / NO_COMMIT / NO_PUSH
```

---

## 1. Stage table (BEFORE — instrumented)

Host profile `scripts/_profile-intel-stages.ts` · weekend · m1=**7860** bars.

| STAGE | CALL | COLD MS | WARM MS | CACHE HIT? | NETWORK? | REQUIRED FOR PDL? | BLOCKING? |
|-------|-----:|--------:|--------:|:----------:|:--------:|:-----------------:|:---------:|
| fetchAllTimeframesCached | 1–3 | 450 | 0–925* | yes (45s) | yes | daily only | yes |
| maybeResolveTickstreamFallback | 1–3 | 0–1 | 0–1 | n/a | no (skipped) | no | no |
| deskM1ChartSnapshot | 1–3 | 0–1 | 0 | n/a | no | no | no |
| **buildMarketContext** | 1–3 | **19718–26845** | **15667–26845** | **no** | **no** | **no (T1)** | **yes** |
| buildStructureFacts (alone, full m1) | 1–3 | 7583–10034 | 3396–10034 | no | no | no | part of context |
| structure last 24h only (691 bars) | — | 339–1204 | — | — | no | no | — |
| buildMarketState | 1–3 | 3–18 | 3–18 | no | no | no | yes if CMR |
| buildMarketObservation | 1–3 | 3–27 | 1–17 | no | no | no | yes if CMR |
| buildMarketInterpretation | 1–3 | 1–11 | 1–4 | no | no | no | yes if CMR |
| buildObservationFacts | 1–3 | 1–3 | 1–2 | no | no | no | yes if CMR |
| buildDeskMarketIntelligence e2e | 1–3 | **20093** | **25293–42374** | Yahoo only | mixed | no for T1 | yes |
| concurrent two builds | — | — | **109251** | no | no | — | yes |

\*Warm Yahoo sometimes refetch when 45s TTL expired during long profile.

### Isolated EST cost (`_profile-est-datekey.ts`)

| STAGE | MS | NOTE |
|-------|---:|------|
| getEstDateKey × 7860 | 1242 | `toLocaleDateString` per bar |
| barsInEstWindow × 16 | **35269** | each scan = dateKey + getEstMinutes (new `Intl.DateTimeFormat` each call) |
| buildMarketContext | 27072 | dominated by EST + structure session windows |
| buildStructureFacts | 18544 | sessionScope / barsInEstWindow over full series |

**ROOT CAUSE (proven):** not Yahoo, not OpenAI, not QG — **CPU bound on repeated EST timezone Intl conversions** inside `buildMarketContext` / `barsInEstWindow` / structure session scoping. Yahoo warm **0ms** while intel still **15–42s**.

---

## 2. Hidden serial waits / false leads

| Suspect | Finding |
|---------|---------|
| Tickstream 8s stream wait | Not on PDL path (no chart snap → `needsTickstreamFallback=false`). Still gated off when `expectFresh=false` after fix. |
| forceFresh bypass | Not the warm-path killer; rebuild happened with `forceFresh=false`. |
| News / research / OpenAI | Not in `buildDeskMarketIntelligence`. |
| Localhost probes | Extension-side; not in this build. |
| Historical replay | Not invoked. |
| QG + formatter double rebuild | Downstream of intel; not the 50–80s itself. |
| Weekend polling for LIVE | Tickstream could wait when chart export missing on open session; closed now returns null immediately. |
| Huge bar loops | 7860 m1 bars × many `getEstDateKey`/`getEstMinutes` = multi-10s. |

---

## 3. Query tiers (same truth source)

| Tier | Example | Path | Must build full intel? |
|------|---------|------|------------------------|
| T0 | joke / persona | local canned / instant casual | **no** |
| T1 | what is PDL / comparative with prior | `tryLightPdLevelReply` / level arithmetic | **no** |
| T2 | snapshot structure / FPFVG | snapshot + intel facts | yes (scoped) |
| T3 | CMR | full intel + QG + optional LLM skip | yes |

PDL uses **same** previous-day high/low from completed daily bars (Yahoo) — not a divergent invent source.

---

## 4. Market closed (Saturday)

- Session: `MARKET_CLOSED` / `expectFresh=false` / reason weekend.  
- Fix: `maybeResolveTickstreamFallback` returns **null** when `!expectFresh` — no stream wait for impossible LIVE.  
- Last-known Yahoo/bar close remains usable; must **not** be labeled LIVE (unchanged contract in comparative/price helpers).

---

## 5–6. Cache audit + dedupe

| Cache | Scope | TTL | Status |
|-------|-------|-----|--------|
| `marketCache` (Yahoo TFs) | `fetchAllTimeframesCached` | 45s | existed; HIT while intel still rebuilt |
| EST date/minutes memo | `getEstDateKey` / `getEstMinutes` | process life | **added** (truth-preserving) |
| Reused `Intl.DateTimeFormat` | EST helpers | process life | **added** |
| `intelCache` by Yahoo identity + price overlay | `buildDeskMarketIntelligence` | 45s | **added** — same object, not second SoT |
| `intelInFlight` | concurrent same key | until settle | **added** |

Fingerprint: `m1.length + last m1 time/close + daily last + chartLastPrice + snap candle count + forceFresh`.  
`forceFresh=true` skips hit (still shares in-flight). Never serves stale as fresh across bar identity change.

---

## 7. UX first ack for expensive CMR

Not implemented this pass (intel warm now sub-second when cached). Remaining optional: SSE `ack` before cold T3 context when cache miss — do not fabricate verdict.

---

## 8. Surgical fixes (files)

1. **`lib/market-data.ts`** — memoize `getEstDateKey` / `getEstMinutes`; reuse Intl formatters; `clearEstTimezoneCaches()` for tests.  
2. **`lib/market-intelligence.ts`** — stage marks; `intelCache` + `intelInFlight`; `clearDeskMarketIntelligenceCache()`.  
3. **`lib/tickstream/stream-snapshot.ts`** — skip tickstream when `!expectFresh`.  
4. **Keep** `lib/light-pd-level.ts` + chat-engine light PDL (T1) from prior triage — not clobbered.

---

## 9. BEFORE / AFTER

| Metric | BEFORE | AFTER |
|--------|-------:|------:|
| Yahoo warm | ~0 ms | ~0 ms |
| `buildMarketContext` (warm EST) | **15–27 s** | **60–244 ms** |
| `buildDeskMarketIntelligence` cold (yahoo warm) | **20–42 s** | **~209–226 ms** |
| intel warm (same state) | **15–42 s** (full rebuild) | **0 ms** (cache hit) |
| concurrent 2× same-state | **109 s** | **~7–126 ms** (deduped) |
| PDL light path | — / or full intel | **68–90 ms** |
| OpenAI on PDL | 0 (after prior routing fix) | **0** |

Targets:

| Target | Result |
|--------|--------|
| PDL / comparative &lt;500ms with snapshot | **PASS** (PDL ~68–90ms; comparative arithmetic unchanged) |
| history &lt;300ms | unchanged PASS (prior) |
| warm CMR det ideally &lt;2s | **PASS** (~0–226ms when yahoo warm / intel cached) |
| cold report external | Yahoo cold **~450–620ms** (network) |

---

## 10. Verify

| Check | Result |
|-------|--------|
| `scripts/test-karen-market-intelligence-latency-p1.ts` | **PASS** |
| `scripts/test-karen-latency-triage.ts` | **PASS** |
| `scripts/test-karen-instant-read-llm-skip.ts` | **PASS** (50) |
| `scripts/test-karen-comparative-level-followups.ts` | **PASS** |
| `scripts/test-market-intelligence.ts` | **PASS** (26) |
| `tsc --noEmit` | **PASS** |
| `test-scoped-chart-qa.ts` | FAIL pre-existing REH drawing assert (fixture `reh_0`) — date-key parity checked equal to prior `toLocaleDateString`; **not** attributed to EST memo |

---

## Remaining P1 / P2

1. **Cold T3 after process start** still pays Yahoo network + one context build (~0.2–1s typical here; can be higher on slow hosts / miss:bars).  
2. Optional **SSE early ack** for cold CMR without inventing a verdict.  
3. Structure algorithms still O(lookback) on purpose — further incremental StructureFacts is separate from this Intl tax.  
4. Preview deploy still on older binary until shipped — local shipset holds the fix.

---

## Bottom line

The 50–80s “MarketState” wall with warm Yahoo was **not** freshness, QG, or OpenAI — it was **per-bar EST `Intl` conversion** inside context/session/structure loops, plus **no intel reuse** so every turn and every concurrent reader paid it again. Memoized EST helpers + same-key intel cache/in-flight cut warm builds from tens of seconds to **milliseconds**, while PDL stays on the light daily path and weekend closed skips impossible LIVE waits.
