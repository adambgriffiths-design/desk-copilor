# Product Acceptance Criteria

Controlled validation pass for Desk Copilot v1.4.60. Each criterion defines **what “good” looks like**, an **exact test procedure**, and a **PASS / FAIL / UNKNOWN** rubric.

**Scope:** MNQ on TradingView, Chrome extension + `https://desk-copilor.vercel.app` backend.

---

## Rubric

| Verdict | Meaning |
|---------|---------|
| **PASS** | Observed behavior matches expected behavior with evidence (automated or live). |
| **FAIL** | Observed behavior contradicts expected behavior, or a known regression/gap is documented. |
| **UNKNOWN** | Requires live TradingView + extension session; not determinable from offline probes alone. |

---

## Dependencies (all criteria)

| Dependency | When required |
|------------|---------------|
| **Extension reload** | After any `extension/` change — Chrome → Extensions → Reload “The Trading Desk”. |
| **TradingView chart open** | MNQ continuous or front-month contract visible; panel attached. |
| **Prod backend** | Default `https://desk-copilor.vercel.app` (see Options if overridden). |
| **Voice optional** | Text input in panel is sufficient unless testing voice latency/recovery. |
| **MARK LEVELS** | Criteria 3–7 assume levels drawn at least once this session. |

---

## Criterion 1 — Live price matches TradingView (authoritative)

**Must-have:** Spoken and written price reflects the TradingView last print, not a stale Yahoo 1m close or misread volume axis (~15k).

### Test procedure (manual)

1. Open MNQ chart on TradingView; note header last price (e.g. 21,450.25).
2. Reload extension v1.4.60.
3. Ask: **“What price are we at right now?”**
4. Compare answer to TV header within **±1 tick** (0.25 pts).

### Expected behavior

- Route: `snapshot · price` (not full chart read).
- Answer cites price within ±1 tick of TV header.
- Status bar shows LIVE (not STALE/DEGRADED) when connected.
- No ~15,000 or other non-MNQ values.

### Automated procedure

```bash
npm run test:system          # includes chart-snapshot
npx tsx scripts/test-chart-live-price.ts
```

### PASS / FAIL / UNKNOWN

- **PASS:** Live answer within ±1 tick of TV; `dataQuality` not STALE/UNAVAILABLE.
- **FAIL:** Answer differs by >1 tick from TV while LIVE; cites ~15k; uses Yahoo-only close when TV tick available.
- **UNKNOWN:** Offline only — unit tests pass but live TV sync not exercised.

---

## Criterion 2 — Knows symbol, contract, and timeframe

**Must-have:** Copilot answers in context of the chart the user is viewing (symbol, contract month, active timeframe).

### Test procedure (manual)

1. Set chart to **MNQ1!** (or current front month) on **5m**.
2. Ask: **“What symbol and timeframe are you looking at?”**
3. Switch chart to **15m**; ask again.
4. Optional: switch to **MES** — expect honest scope limit (MNQ-focused product).

### Expected behavior

- Names MNQ (or exact TV symbol string) and active timeframe (5m / 15m).
- After timeframe change, updated timeframe reflected without stale 5m reference.
- Does not invent a contract month not visible on chart.

### Automated procedure

```bash
npm run test:chart-snapshot
npm run test:analysis-contract
```

### PASS / FAIL / UNKNOWN

- **PASS:** Symbol + timeframe match TV legend/tab within one refresh cycle.
- **FAIL:** Wrong symbol, wrong timeframe, or silent assumption after user changed chart.
- **UNKNOWN:** Requires live TV DOM + extension panel (no headless chart in CI).

---

## Criterion 3 — Answers MSS correctly

**Must-have:** Market Structure Shift questions use observation-backed facts, not GPT invention.

### Test procedure (manual)

1. MARK LEVELS on a chart with a clear recent MSS (or use a known replay session).
2. Ask: **“Where’s the last MSS?”**
3. Ask: **“What is an MSS?”** (teaching — definition only, no live level guess).

### Expected behavior

- **“Where’s the last MSS?”** → `snapshot · structure` or market-intelligence fast fact; cites direction + level + time if present.
- **“What is an MSS?”** → teaching definition; no fabricated level.
- If no MSS in data: **WAIT / unknown**, not invented level.

### Automated procedure

```bash
npx tsx scripts/test-conversation-routing.ts   # MSS → snapshot FAST_FACT
npx tsx scripts/test-observation-proof.ts      # chart-proof-mss-bullish fixture
npm run test:market-intelligence
```

### PASS / FAIL / UNKNOWN

- **PASS:** Fact answer matches chart/engine; teaching stays definitional.
- **FAIL:** Casual/GPT stream; wrong direction/level; guesses when observation empty.
- **UNKNOWN:** Live chart MSS not verified in this pass.

---

## Criterion 4 — Answers REH / REL correctly

**Must-have:** Relative equal high/low queries route to fact lookup, not casual chat.

### Test procedure (manual)

1. MARK LEVELS on chart with visible equal highs/lows.
2. Ask: **“Where is the nearest REH?”**
3. Ask: **“Where is the nearest relative equal high?”**
4. Ask: **“Is there a relative equal high near current price?”**

### Expected behavior

- Route: `snapshot` + market intelligence (`liquidity.reh`), **not** `casual · stream`.
- Answer includes level price and above/below current price when data exists.
- If no pool: states none/nearest unknown — does not invent.

### Automated procedure

```bash
npx tsx scripts/test-conversation-routing.ts   # 4 REH golden phrases
npm run test:reh-rel
npx tsx scripts/test-observation-proof.ts      # chart-proof-reh-above
npm run test:routing                           # routing-golden.csv REH rows
```

### PASS / FAIL / UNKNOWN

- **PASS:** All three manual questions get fact-backed REH answers via snapshot path.
- **FAIL:** “Ha — say more”, casual stream, or missing level when chart-proof fixture expects one.
- **UNKNOWN:** Live REH level accuracy not verified offline.

**Known gap:** TS `lib/chart-read-intent.ts` wires `needsMarketIntelligenceAnswer`; `extension/chart-intent.js` does **not** mirror this — extension may route REH to `trading · DEEP_ANALYSIS` instead of snapshot fast fact.

---

## Criterion 5 — Answers FVG / NWOG / NDOG / etc. correctly

**Must-have:** Gap and session-level facts from observations, not narrative invention.

### Test procedure (manual)

1. Ask: **“Where’s the latest NWOG?”**
2. Ask: **“Is there an unfilled FVG below price?”**
3. Ask: **“Where’s the first presented FVG?”** (1m session FVG, not daily).

### Expected behavior

- NWOG/NDOG → snapshot market-intelligence fast fact when data available.
- FVG answers reference timeframe (1m vs daily) correctly.
- FPFVG question does not return daily FVG by mistake.

### Automated procedure

```bash
npx tsx scripts/test-conversation-routing.ts   # NWOG → snapshot FAST_FACT
npm run test:market-intelligence
npx tsx scripts/test-observation-proof.ts      # chart-proof-fvg-present
npm run test:scoped                            # FPFVG routing
```

### PASS / FAIL / UNKNOWN

- **PASS:** Facts match labeled fixtures / visible chart.
- **FAIL:** Wrong gap type, daily vs 1m confusion, casual fallback.
- **UNKNOWN:** Live gap levels not verified in this pass.

**Known gap:** Same extension `chart-intent.js` sync issue as REH for NWOG/NDOG fact routing.

---

## Criterion 6 — Market verdict only when evidence available

**Must-have:** LONG/SHORT/lean only when quality gate passes; otherwise conditional or WAIT.

### Test procedure (manual)

1. With good data: **“Give me the current market verdict.”**
2. Disconnect backend (offline) or use pre-market thin data: same question.
3. Ask: **“Would you take this setup?”** on a marginal chart.

### Expected behavior

- Good data: DEEP_ANALYSIS verdict with conditional language, invalidation, entry separation.
- Bad/missing data: **WAIT** or “not calling entry yet” — no “buy here”.
- No verdict when `data_quality: missing` or connection not LIVE.

### Automated procedure

```bash
npm run test:voice-quality
npm run test:decision
npm run test:contamination
npm run test:replay                    # decision agreement metric
```

### PASS / FAIL / UNKNOWN

- **PASS:** Verdict gated; evidence-based phrasing in live session.
- **FAIL:** Directional call without structure/FVG/liquidity evidence; GPT bypasses gate (P0-B class).
- **UNKNOWN:** Live verdict on current session not run.

**Baseline:** Replay decision agreement **66.7%** (2026-08-13); interpretation **54.3%**.

---

## Criterion 7 — Refuses safely when data unavailable (WAIT, not invent)

**Must-have:** Missing price, structure, or connection → WAIT, never fabricated levels.

### Test procedure (manual)

1. Open panel before MARK LEVELS / before backend warm: **“What’s the bias?”**
2. Simulate disconnect: toggle offline or stop backend; ask **“What price are we at?”**
3. Ask **“Where’s the last MSS?”** when observation engine returns `data_quality: missing`.

### Expected behavior

- Spoken/panel: **WAIT** or explicit “live data unavailable”.
- `LIVE_DATA_UNAVAILABLE_VERDICT` tone — no PDH/PDL/MSS numbers invented.
- UI status: DISCONNECTED / DEGRADED / not LIVE.

### Automated procedure

```bash
npm run test:connection
npm run test:decision                  # missing-quality fixture
npx tsx scripts/test-observation-proof.ts   # missing-quality case
```

### PASS / FAIL / UNKNOWN

- **PASS:** WAIT/refusal with no fabricated numbers in manual + automated missing-quality cases.
- **FAIL:** Invented levels, bullish/bearish call on `data_quality: missing`.
- **UNKNOWN:** Live disconnect recovery wording not verified.

---

## Criterion 8 — Normal conversation (no “Ha — say more” catch-all)

**Must-have:** General chat gets a real reply or explicit LLM-failure message — not generic clarification loop.

### Test procedure (manual)

1. **“Do you prefer chicken nuggets or burgers?”** — expect persona reply.
2. **“What’s the weather in London?”** — expect weather lookup or city clarification.
3. **“What is the time?”** — expect real answer or “trouble responding”, **not** “Ha — say more”.
4. After a trading answer, ask **“Tell me a joke.”** — must not inherit trading route.

### Expected behavior

- Persona/weather/joke → `casual` or `live_web`, with substantive reply.
- Never **`Ha — say more, I'm listening.`** for general questions.
- `CASUAL_LLM_FAILURE_REPLY` acceptable when stream fails.

### Automated procedure

```bash
npm run test:conversation-chains       # assertNotHaSayMore on 5 chains
npx tsx scripts/test-conversation-routing.ts
npx tsx tmp/probe-general-casual-failure.ts
```

### PASS / FAIL / UNKNOWN

- **PASS:** Zero Ha — say more on golden chains; manual general questions answered.
- **FAIL:** Ha — say more on general input; trading route blocks casual follow-up incorrectly.
- **UNKNOWN:** Voice-only casual paths not fully probed.

---

## Criterion 9 — Understands follow-up questions

**Must-have:** Multi-turn context preserved (weather city, MSS invalidation, NWOG→NDOG, verdict “Why?”).

### Test procedure (manual)

1. **“What’s the weather?”** → **“London”**
2. **“Where’s the NWOG?”** → **“What about NDOG?”**
3. After verdict: **“Why?”**
4. **“What is an MSS?”** → **“Show that on the chart”**

### Expected behavior

- Follow-ups route to `live_web`, `snapshot`, or `invalidation_followup` — not fresh casual.
- Resolved question merges prior context (Berlin + Germany, NWOG → NDOG).
- No persona/food reply mid trading chain.

### Automated procedure

```bash
npm run test:conversation-chains       # 42 assertions
npm run test:routing
```

### PASS / FAIL / UNKNOWN

- **PASS:** All four manual chains behave as expected.
- **FAIL:** Follow-up treated as unrelated casual; loses pending intent.
- **UNKNOWN:** Voice STT follow-ups not tested offline.

---

## Criterion 10 — Stay connected and recover when disconnected

**Must-have:** Connection state visible; RECONNECT works; no fake LIVE when backend down.

### Test procedure (manual)

1. Confirm status shows **LIVE** with age (ms) when healthy.
2. Block `desk-copilor.vercel.app` or use DevTools offline → ask any question.
3. Click **RECONNECT** → verify recovery and LIVE restored.
4. Leave idle 30s → verify pulse stays fresh or degrades honestly.

### Expected behavior

- DISCONNECTED → RECONNECTING → CONNECTED (or FAILED after max retries with clear message).
- No LIVE badge without fresh market pulse (<15s).
- Backend offline message mentions reconnect (not silent failure).

### Automated procedure

```bash
npm run test:connection
curl.exe -s https://desk-copilor.vercel.app/api/health
npm run test:system -- --prod          # prod probes (health + desk-tracker)
```

### PASS / FAIL / UNKNOWN

- **PASS:** State machine tests pass; live reconnect restores LIVE within 2 retries.
- **FAIL:** Stale LIVE badge; infinite spinner; no recovery path.
- **UNKNOWN:** Live reconnect UX not exercised in this pass.

**Note:** `npm run health` probes **localhost** only — prod health requires direct curl to Vercel.

---

## Automated probe (matrix only)

```bash
npx tsx scripts/product-acceptance-probe.ts
npx tsx scripts/product-acceptance-probe.ts --json > reports/product-acceptance-probe.json
```

Outputs JSON for criteria with offline coverage (1, 3–9 partial, 10 partial). Criteria 2 and live-only paths remain **UNKNOWN** until manual session.

---

## Manual live test session — recommended order

Run in this order to maximize signal per minute and surface root causes early:

1. **#10 Connection** — LIVE badge, RECONNECT (blocks everything else).
2. **#1 Live price** — validates TV tick path before structure questions.
3. **#2 Symbol/timeframe** — confirms chart context contract.
4. **#4 REH** — highest known extension routing gap.
5. **#5 NWOG / FVG** — same routing cluster as #4.
6. **#3 MSS** — structure fact path.
7. **#7 Refuse safely** — disconnect / pre-levels WAIT.
8. **#6 Verdict gating** — full verdict + setup question.
9. **#9 Follow-ups** — Why?, NDOG, weather city.
10. **#8 Casual** — persona + time/joke (regression guard).

Record PASS/FAIL/UNKNOWN in `reports/product-acceptance-YYYY-MM-DD.md` after the session.
