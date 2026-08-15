# Karen — re-measure live latency after HTF + StructureFacts opts

**When:** 2026-08-14T22:46Z  
**Mode:** MEASUREMENT ONLY — no implementation  
**LIVE sample:** **UNAVAILABLE** (do not fabricate)

## Why live is unavailable

| Check | Result |
|---|---|
| Local clock | Fri 2026-08-14 ~23:46 BST / ~18:46 ET |
| CME equity-index futures | Closed after Friday ~17:00 ET — **off-hours** |
| `http://127.0.0.1:3000/api/health` | HTTP **500** |
| `http://127.0.0.1:3020/api/health` | **down** |
| LIVE_LATENCY_TRACE live `Give me the read` | **Not run** (would fabricate or hang) |

Below uses **existing measured** LIVE_LATENCY_TRACE / in-process benches + **post-opt fixture** leaf timings. Fixture CPU ≠ live Yahoo/Tickstream TTFT.

---

## BEFORE (prior known live + context profile)

### Live trading-path (pre-opt audit + reuse era)

Source: `karen-live-latency-audit.md` + `karen-live-context-reuse.md`

| Path | TOTAL | market-data | market-context | DecisionEnvelope | LLM | LLM TTFT | SSE first visible≈ | HIT/MISS |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Audit median (no reuse) | **39567** | ~425 | **27806** | ~57 | ~4918 | ~0.9–1.5s after ready | ≈TOTAL (buffered) | mostly MISS |
| Audit worst | **54880** | ~8.9s | **40651** | 397 | 6986 | — | ≈TOTAL | MISS |
| Warm HIT (reuse bench A r4–5) | **3816–4832** | (in context) | **1–16** | (in prompt) | **3712–4629** | 618–646 | ≈TOTAL if buffered | **HIT** |
| New-bar MISS (reuse bench / cold profile) | tens of s live; fixture pure1m sync **~2.7–3.1s** | Yahoo+tick | structure full **~1.0–2.3s** + EQH | ~3ms | ~4–7s live | — | — | MISS `bars` |
| HTF coincident MISS (pre append-only) | context **~8–11s** leaf | — | m5 **11315** / m15 **11075** fullRebuild | — | — | — | — | MISS HTF |

### Structure / HTF leaf BEFORE (user-cited)

| Leaf | BEFORE |
|---|---:|
| StructureFacts new-1m | **989.4 ms** |
| HTF m5 append | **11315 ms** |
| HTF m15 append | **11075 ms** |

---

## CURRENT (post HTF append-only + StructureFacts incremental)

**Live A/B/C sample:** UNAVAILABLE — see above.

### Fixture / engine post-opt (authoritative for those leaves)

Sources: `karen-structure-facts-incremental.md`, `karen-htf-append-only.md`

#### A. Warm HIT (context reuse — unchanged by these two opts)

From reuse bench (still the best HIT measurement):

| Stage | ms |
|---|---:|
| market-data acquisition | ≈0 (reuse; no Yahoo/Tick on follow-up HIT) |
| market-context construction | **1–16** |
| StructureFacts | **0** (skipped) |
| HTF | **0** (skipped) |
| DecisionEnvelope | reused / &lt;10 typical assemble |
| LLM | **~3700–4600** |
| LLM first token | **~620–650** |
| SSE first visible token | **≈ final** if still buffered; flush code exists but not re-proven on wire tonight |
| final response | **~3800–4800 TOTAL** |
| HIT/MISS | **HIT** |
| MISS REASON | — |
| fullRebuild count | **0** |
| CPU | n/a |

#### B. Genuine new-1m-bar MISS (pure 1m; HTF lengths unchanged)

| Stage | CURRENT (ms) | Notes |
|---|---:|---|
| market-data | live UNAVAILABLE; prior Yahoo usually &lt;600, Tickstream live spike ~8s | |
| market-context / applyClosedBar | **~579–759** (re-verify) | was ~1312–3140 full-depth pre-structure-inc |
| StructureFacts (`lastStructureMs` / update) | **373–601** | was **989.4** baseline / ~1076–2332 full |
| HTF | **0** append (lengths unchanged) | |
| DecisionEnvelope | **~3** | negligible |
| LLM / TTFT / SSE / final | live UNAVAILABLE; prior LLM **~4–7s** still applies when speaking a new read | |
| HIT/MISS | **MISS** | |
| MISS REASON | `bars` (new 1m identity) | |
| fullRebuild count | **0** (pure 1m) | |
| EQH force residual | **~200** (`lastEqhMs`) | |

#### C. m5/m15 append (available on fixture; live UNAVAILABLE)

| Stage | CURRENT (ms) |
|---|---:|
| HTF m5 append | **2685** (was 11315) — **0** fullRebuild |
| HTF m15 append | **1069** (was 11075) — **0** fullRebuild |
| StructureFacts | included in apply path when 1m also advances |
| DecisionEnvelope | parity-covered; ms-class |
| LLM / SSE | live UNAVAILABLE |

---

## IMPROVEMENT

| Path | BEFORE → CURRENT | Improvement |
|---|---|---|
| StructureFacts new-1m | 989.4 → 601.4 ms | **1.64×** (3.36× vs same-run full) |
| HTF m5 append | 11.3s → 2.7s | **~4.2×**, fullRebuild 1→0 |
| HTF m15 append | 11.1s → 1.1s | **~10.4×**, fullRebuild 1→0 |
| Warm HIT TOTAL | already LLM-bound ~4s after reuse | **no change** from these two opts |
| Live end-to-end tonight | — | **not re-measured** |

---

## REMAINING BOTTLENECK (single largest — from measurements, not guess)

**Path-split (must not collapse incorrectly):**

1. **Warm HIT (user-perceived, after reuse):** largest measured stage is **LLM full generation (~3.8–5.5s)**. Context is 1–16ms. These StructureFacts/HTF opts do not touch that path.
2. **New-1m MISS (engine, post-opts):** largest remaining **engine** contributors measured are **EQH force (~200ms)** + residual StructureFacts leaves inside **~373–601ms** update — not HTF.
3. **m5 append MISS:** largest remaining **engine** leaf is still **HTF m5 append ~2.7s** (better than 11s, still &gt; StructureFacts).

For **overall user-perceived trading latency** on the common post-reuse path (HIT), the single largest remaining contributor is:

### **LLM generation (~4s), with SSE first-visible still historically tied to final if buffering holds**

On **MISS / new bar**, the single largest remaining **pre-LLM** contributor after these opts is:

### **HTF m5 append (~2.7s) when m5 grows; else EQH-force + residual structure (~0.4–0.6s class) on pure 1m**

---

## SAFE NEXT TARGET

1. **If optimizing what traders feel on warm HIT / spoken read:** prove SSE first-visible flush on the wire, then LLM TTFT/path — **do not** re-touch StructureFacts/HTF append.
2. **If optimizing new-bar MISS engine wall:** **EQH force-off / reuse** (already identified; StructureFacts report) — next leaf after HTF append-only.
3. **Do not** start another live 5-read marathon until RTH / healthy `:3020` + LIVE_LATENCY_TRACE.

---

## PASS criteria for this task

- [x] No implementation  
- [x] No fabricated live numbers  
- [x] Compared BEFORE vs CURRENT from existing measurements + completed opt reports  
- [x] Named single remaining bottleneck with path caveat  
- [x] Stopped after measurement  
