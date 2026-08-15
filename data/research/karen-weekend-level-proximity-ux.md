# KAREN — Weekend level proximity UX

**Date:** 2026-08-15  
**Tree:** `.tmp/karen-final-integration/`  
**Mode:** diagnose → smallest fix → verify — no prod / commit / push  

---

## ROOT_CAUSE

**Not a freshness/QG bug.** Comparative arithmetic + Friday-close labeling already worked for matched phrases.

**First broken hop: phrase → comparative route.**

| Hop | Before | After |
|-----|--------|-------|
| Phrase `where is current price closest to` | `isComparativeDistancePhrase` → **false** | **true** |
| Intent | `classifyChartQuestion` → **price** | **level** |
| Prior levels | PDL 30025 extracted OK | unchanged |
| Session (weekend) | `expectFresh=false` | unchanged |
| Reference price | never reached (wrong path) | Friday/last close via `resolvePriceForLevelCompare` |
| Proximity | skipped | absolute pts, nearest among candidates |
| Renderer | market-snapshot DQ gate → **"Live market data is unavailable — I can't quote that yet."** | comparative reply with Friday's close label |

Weekend closed + no LIVE tick is correct safety for **OPEN-session live quotes**. The failure was mis-routing a **level-distance** follow-up into the **price snapshot** path, which then treated weekend as unavailable LIVE.

---

## WEEKEND_BEHAVIOUR

- With trustworthy last/close: `Using Friday's close, PDL is …` (never LIVE / never “live unavailable”).
- With no close: `Market's closed for the weekend — I don't have a trustworthy Friday close…` (market closed ≠ feed broken).
- Repro after fix (PDL 30025, close 30040): `Using Friday's close, PDL is 15 pts from current.`

---

## OPEN_MARKET_BEHAVIOUR

- Fresh TV/tickstream → live basis, no Friday preface: `PDL is closer — 18 pts vs 47 to PDH.`
- Missing/stale when `expectFresh` → honest: `I don't have a trustworthy current price…` (do not invent; do not use aged Yahoo as LIVE).

---

## REFERENCE_PRICE_SOURCE

| Session | Source | Label |
|---------|--------|-------|
| OPEN + fresh auth live | chart tick | live (plain English; no LIVE badge required) |
| CLOSED / weekend | chart last or desk/Yahoo close | **Friday's close** / last/close |
| OPEN + no trustworthy live | — | unavailable (null) |
| CLOSED + no close | — | closed unavailable wording |

No MarketState / full intel rebuild for distance math (`trySnapshotChatReply` comparative branch unchanged).

---

## LIVE_LABEL_INTEGRITY

- CLOSED answers never contain `\bLIVE\b`.
- CLOSED never emit snapshot string `Live market data is unavailable — I can't quote that yet.` on this route.
- last close ≠ live; no live expected ≠ offline.

---

## PRIOR_LEVEL_CONTEXT

- Extracts PDH/PDL/PDC/session H/L from prior assistant prose (incl. `Previous day low: 30025.00 — swept`).
- Anaphora follow-ups: which is closer / what's closest / where is current price closest to / sitting relative / how far from PDL / and PDH?
- Named `and PDH?` without PDH in prior → honest miss (no invent from PDL).

---

## PROXIMITY_ARITHMETIC

- Absolute point distance; nearest among candidates; equidistant called out.
- `which would price hit first?` → same nearer-by-distance reply (not a path prediction).

---

## OPENAI_CALLS

**0** — pure `answerComparativeLevelFollowUp` arithmetic.

---

## LATENCY

Warm comparative answer avg **~0.23 ms** / call (200 iters, local). Target &lt;500 ms: **PASS**.

---

## TYPECHECK

`npx tsc --noEmit -p tsconfig.json` → **exit 0**.

---

## FOCUSED_TESTS

`npx tsx scripts/test-karen-comparative-level-followups.ts` → **ALL PASS**

Coverage: OPEN+fresh, OPEN unavailable, WEEKEND+Friday close labelled, CLOSED+no close wording, prior anaphora, multi-level absolute order, swept PDL repro, and-PDH miss, hit-first ≠ prediction, new phrase matrix.

---

## FILES

| File | Change |
|------|--------|
| `lib/level-comparative-followup.ts` | Phrase/slot coverage; closed unavailable wording; named PDH/PDL slot honesty |
| `extension/casual-chat.js` | Mirror phrase/slot detection (incl. `closest`) |
| `scripts/test-karen-comparative-level-followups.ts` | Repro + weekend UX cases |

**Not touched:** freshness/QG, decision-history, market-intel EST memoize / T1 light PD path.
