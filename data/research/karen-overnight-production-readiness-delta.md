# Overnight — Production-readiness delta (updated)

**Date:** 2026-08-15 (continuous)  
**Mode:** AUDIT / NOTE ONLY — no deploy  
**CME:** closed — no live verification claims

## What improved overnight (dirty WT)

| Area | Change | Production impact |
|------|--------|-------------------|
| Latency measurability | `completion_tokens` / `prompt_tokens` / `total_tokens` on stream + format line | Warm HIT measurable at CME open; default behavior unchanged |
| Mode/intent | Structure/level location expand through **wave 5**; golden **108**; conversation-routing **57**; structure-snapshot **112** | Far fewer casual/live_web misroutes on ICT fact asks |
| Critical routing fix | `current day high/low` was **live_web** (weather-like) → snapshot level | Stops false weather path on desk level asks |
| Observation chart-proof | OHLC fixtures + `rebuildCtxFromCandles`; desk **11/11** | Lasting Layer-1 proof gate |
| `structureFacts.fhdr` | Computed 9:30–10:30 ET | Snapshot can answer FHDR with real prices |
| Historical why-not | **40/40**; time-travel **135/135**; live-replay **72/72** | Integrity green |
| Clean six-feature prep | F2–F6 verdable in `.tmp`; orphan dropped; patches regenerated | Ready for human apply review — **not applied** |

## Still not production-ready from prior audits

- Clean six-feature **patch apply** — HUMAN APPROVAL REQUIRED
- Continuous recorder — **do not ship**
- Real Redis local secrets — mock-only overnight
- Instant-read flag default OFF — intentional
- Live `completion_tokens` magnitudes — **UNKNOWN until CME open**
- Scoped chart-doing vs market-doing — product decision pending
- Interpretation agreement **61.1%** — morning design work (not overnight prompt guess)

## Recommendation

Ship **Candidate A** (routing) then **B** (chart-proof/FHDR) as separate PRs when Adam wants — **separate** from six-feature clean patch apply. Do not combine with recorder.
