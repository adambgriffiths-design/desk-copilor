# Karen — Post-optimization LIVE latency measurement

**When:** 2026-08-15T00:16Z (local Saturday)  
**Mode:** MEASUREMENT ONLY — no code changes  
**LIVE sample:** **UNAVAILABLE — not fabricated**

---

## Gate check (required before live sample)

| Check | Result |
|-------|--------|
| Calendar | **Saturday** 2026-08-15 ~00:17 BST / Fri ~19:17 ET prior close |
| CME equity-index futures | **CLOSED** (weekend) |
| `http://127.0.0.1:3020/api/health` | **HTTP 500** |
| `http://127.0.0.1:3000/api/health` | down/fail |
| LIVE_LATENCY_TRACE live Give-me-the-read | **Not run** |

Per instructions: do **not** fabricate live data while the market is closed / backend unhealthy.

The pre-opt live MISS median **~28–40s** remains **stale** relative to HTF append-only + StructureFacts incremental + EQH force-off. A fresh live wall requires RTH (or Sunday open) + healthy `:3020`.

---

## CURRENT WARM (live)

**UNAVAILABLE**

| Stage | Live post-opt |
|-------|---------------|
| market data | UNAVAILABLE |
| market context | UNAVAILABLE |
| StructureFacts | UNAVAILABLE |
| HTF | UNAVAILABLE |
| DecisionEnvelope | UNAVAILABLE |
| LLM first token | UNAVAILABLE |
| SSE first visible | UNAVAILABLE |
| final response | UNAVAILABLE |
| TOTAL | UNAVAILABLE |
| HIT/MISS | — |
| fullRebuild count | — |
| waited for new bar | — |

*(Last known warm HIT was **pre/alongside reuse**, not a fresh post-all-three-opts live wire sample: TOTAL ~3.8–4.8s, context 1–16ms, LLM-bound — cite only as historical reference, not this measurement.)*

---

## CURRENT NEW-BAR (live)

**UNAVAILABLE**

| Stage | Live post-opt |
|-------|---------------|
| market data | UNAVAILABLE |
| market context | UNAVAILABLE |
| StructureFacts | UNAVAILABLE |
| HTF | UNAVAILABLE |
| DecisionEnvelope | UNAVAILABLE |
| LLM / SSE / final / TOTAL | UNAVAILABLE |
| HIT/MISS reason | — |
| fullRebuild count | — |
| waited for new bar | — |

---

## CURRENT M5 (live)

**UNAVAILABLE** — m5 append not naturally encounterable offline; no live sample.

---

## Fixture post-opt leaves (NOT live — reference only)

Do **not** substitute for the live columns above.

| Path | Approx | Source |
|------|--------|--------|
| Pure 1m applyClosedBar | ~579–759 ms | structure + EQH post-opt |
| StructureFacts | ~373–601 ms | structure incremental |
| EQH | ~175–334 ms (~200 typical) | force-off |
| m5 append | ~2685 ms | HTF append-only |
| m15 append | ~1069 ms | HTF append-only |
| Warm HIT context (reuse era) | 1–16 ms | live-context-reuse |

---

## Deliverable

```
CURRENT WARM: LIVE UNAVAILABLE (weekend + backend 500) — do not use fabricated numbers
CURRENT NEW-BAR: LIVE UNAVAILABLE
CURRENT M5: LIVE UNAVAILABLE
SINGLE LARGEST LIVE BOTTLENECK: UNKNOWN until open-session LIVE_LATENCY_TRACE sample (stale ~28s MISS must not be cited as current)
NEXT OPTIMIZATION TARGET: Re-run this exact protocol Sun/Mon when futures are open and /api/health on :3020 is 200 — then rank from measured stages; until then do not pick a new live optimization from stale 17:21Z audit
```

Stop.
