# KAREN — PRE-MERGE REVIEW: GLOBEX CLOSED-vs-BROKEN

**Date:** 2026-08-15 (Saturday)  
**Mode:** AUDIT / VERIFY ONLY — no product code changes, no apply to primary, no commit / push / deploy  
**Review tree:** `C:\Users\adamg\Projects\desk-copilot\.tmp\karen-market-closed-unify\` (detached `74183b2` / v1.4.73)  
**Evidence:** `data/research/karen-globex-expectfresh-recovery-implementation.md`  
**Design:** `data/research/karen-market-closed-vs-feed-broken-design.md`  

**Re-verified this pass:** calendar unit **39/39 ok**; recovery gate **ok**; api-config failover **ok** (refuse→Vercel ~556ms; hung→Vercel ~968ms); `npx tsc --noEmit` **exit 0**.

---

## 1. HOLIDAY TABLE EXPIRY

### CALENDAR RANGE:

| Bound | Value |
|-------|--------|
| First curated entry | `2025-01-01` (New Year's Day holiday) |
| Last curated entry | `2027-01-01` (New Year's Day holiday) |
| 2027 coverage after NYD | **None** (no MLK / Presidents / Good Friday / … for remainder of 2027) |
| Coverage metadata / version stamp | **None** — table is a bare const array |

### OUT-OF-RANGE BEHAVIOR:

There is **no** coverage check. Unknown `estDateKey` → `regularGlobexStatus()` only (weekend / Fri≥17:00 / Sun&lt;18:00 / Mon–Thu 17:00–18:00 maintenance → CLOSED; else **MARKET_OPEN + expectFresh=true**).

Executable probes (`getCmeGlobexSessionStatus` with fixed ET clocks):

| asOf (ET) | Result | Notes |
|-----------|--------|-------|
| 2024-07-04 10:00 (Thu, historical Independence Day) | `MARKET_OPEN` / `expectFresh=true` | Before table — **silently authoritative open** |
| 2025-01-01 10:00 | `MARKET_HOLIDAY` / `false` | In range |
| 2027-01-01 10:00 | `MARKET_HOLIDAY` / `false` | Last entry |
| 2027-01-02 10:00 | `MARKET_CLOSED` / `false` | Weekend via regular rules (not holiday table) |
| 2028-01-17 10:00 (Mon MLK) | `MARKET_OPEN` / `true` | After table — unknown holiday treated as open |
| 2028-01-17 14:00 (after typical noon-CT early halt) | `MARKET_OPEN` / `true` | Would be `MARKET_EARLY_CLOSE` if curated |

### RISK:

**High for any date outside curated coverage.** The system **does** silently claim authoritative `MARKET_OPEN` / `expectFresh=true` when holiday coverage is unknown. That wrongly enables open-market Last recovery and “Market open · feed problem” UX on a real CME equity-index holiday/early-close day after `2027-01-01` (or any missing 2027 holiday), and historically before `2025-01-01`.

### RECOMMENDATION:

Do **not** expand the calendar in this audit. Safest pre-merge behavior: treat dates **outside** an explicit coverage window (recommend: first entry date → last full-year curated date, or a declared `calendarValidThrough`) as **non-authoritative** — e.g. `marketState` remains schedule-based only with a distinct reason / `coverage: "unknown"` flag, and **`expectFresh` must not be true solely from regular hours when holiday coverage is unknown** (prefer closed-or-unknown UX / disable open-market recovery until the table is extended). Ship with a hard expiry note: refresh before first 2027 post-NYD holiday (MLK 2027-01-18).

---

## 2. HOLIDAY DATA PROVENANCE

**Module comment:** “Source pattern: CME Globex equity-index holiday hours (CT+1 → ET).”  
**No pinned CME bulletin URL, PDF hash, or fetch date in code.** Secondary check this audit: NinjaTrader “2026 Holiday Trading Hours” (equity-index instruments, times in **CT**) + CME Group holiday landing page. **Not** NYSE RTH / US federal auto-equivalent (UK bank holiday 2026-08-31 correctly stays OPEN in tests).

ET handling: `haltEtMinutes` / `untilEtMinutes` / `afterEtMinutes` / `resumeEtMinutes` are America/New_York wall minutes via `getEstMinutes` / `getEstDateKey`. CT→ET conversion used in table is **+1 hour** (standard for these CME equity holiday templates: noon CT → 13:00 ET; 12:15 CT → 13:15 ET; 8:15 CT → 9:15 ET; 5:00 CT reopen → 18:00 ET).

### Full holidays (`type: "holiday"`)

| Date | Name | Encoding | CME equity-index relevance | Authority |
|------|------|----------|----------------------------|-----------|
| 2025-01-01 | New Year's Day | Full holiday until 18:00 ET (`untilEtMinutes`), then regular | Yes — Globex holiday day; evening reopen pattern | **REVIEW** — pattern matches equity Globex; 2025 not re-checked against CME primary bulletin in this pass |
| 2025-04-18 | Good Friday | Holiday after 09:15 ET (`afterEtMinutes`); overnight before may OPEN | Yes — equity early morning halt then closed; not overnight crypto/FX schedule | **REVIEW** — 09:15 ET ≡ 08:15 CT equity close pattern; confirm 2025 date vs CME |
| 2025-12-25 | Christmas Day | Full-day holiday | Yes | **REVIEW** (2025 secondary) |
| 2026-01-01 | New Year's Day | Holiday until 18:00 ET | Yes — NT: resumes 5:00 pm CT Jan 1 | **PASS-leaning** vs NT equity 2026 |
| 2026-04-03 | Good Friday | Holiday after 09:15 ET | Yes — NT: equity close 8:15 AM CT | **PASS-leaning** vs NT equity 2026 |
| 2026-12-25 | Christmas Day | Full-day holiday | Yes — NT: all markets closed | **PASS-leaning** |
| 2027-01-01 | New Year's Day | Full-day holiday (no `until`) | Yes — NT: Fri Jan 1 2027 all closed | **PASS-leaning**; note no evening reopen same calendar day (Friday full close → weekend) |

### Early closes (`type: "early_close"`)

| Date | Name | Halt ET | Resume | Notes / authority |
|------|------|---------|--------|-------------------|
| 2025-01-20 | MLK Day | 13:00 | 18:00 same day | Typical Mon holiday: noon CT halt / 5pm CT reopen — **REVIEW** (2025) |
| 2025-02-17 | Presidents Day | 13:00 | 18:00 | Same pattern — **REVIEW** |
| 2025-05-26 | Memorial Day | 13:00 | 18:00 | **REVIEW** |
| 2025-06-19 | Juneteenth | 13:00 | next Sun 18:00 (no `resumeEtMinutes`) | Fri early close → weekend — **REVIEW** |
| 2025-07-04 | Independence Day | 13:00 | next Sun | Fri Jul 4 2025 — **REVIEW** |
| 2025-09-01 | Labor Day | 13:00 | 18:00 | **REVIEW** |
| 2025-11-27 | Thanksgiving | 13:00 | 18:00 | Globex **early halt + evening reopen**, not NYSE full cash close — **correct class**; **REVIEW** vs CME PDF |
| 2025-11-28 | Day after Thanksgiving | 13:15 | next Sun | 12:15 CT → 13:15 ET — **REVIEW** |
| 2025-12-24 | Christmas Eve | 13:15 | next Sun | **REVIEW** |
| 2026-01-19 | MLK Day | 13:00 | 18:00 | NT: halt 12pm CT, resume 5pm CT — **PASS-leaning** |
| 2026-02-16 | Presidents Day | 13:00 | 18:00 | NT match — **PASS-leaning** |
| 2026-05-25 | Memorial Day | 13:00 | 18:00 | NT match — **PASS-leaning** |
| 2026-06-19 | Juneteenth | 13:00 | next Sun | NT: close 12pm CT, reopen Sun 5pm CT — **PASS-leaning** |
| 2026-07-03 | Independence Day (observed) | 13:00 | next Sun | NT: Fri Jul 3 close 12pm CT — **PASS-leaning** (Jul 4 Sat = weekend regular) |
| 2026-09-07 | Labor Day | 13:00 | 18:00 | NT match — **PASS-leaning** |
| 2026-11-26 | Thanksgiving | 13:00 | 18:00 | NT: halt 12pm / resume 5pm CT — **PASS-leaning**; **not** federal “market closed all day” |
| 2026-11-27 | Day after Thanksgiving | 13:15 | next Sun | NT: close 12:15 pm CT — **PASS-leaning** |
| 2026-12-24 | Christmas Eve | 13:15 | next Sun | NT: close 12:15 pm CT — **PASS-leaning** |

### Uncertain authority (flag)

1. **No primary CME citation in tree** — authority is curated/secondary, not machine-verified from CME Group holiday calendar artifacts.  
2. **All 2025 rows** — not cross-checked against a 2025 CME equity-index bulletin in this audit.  
3. **Thanksgiving labeled early_close** — correct for MNQ/NQ Globex vs NYSE full close; some tertiary “CME closed” pages oversimplify — do not “fix” to full holiday without CME equity PDF.  
4. **Good Friday as `holiday` + 09:15 ET gate** — equity-specific; other CME product classes differ (explicitly out of scope, but easy to misuse).  
5. **2027 after 2027-01-01** — no entries; see §1.

**Not auto-imported:** NYSE cash holidays, US federal calendar alone, UK bank holidays (test B12), ICT session labels.

---

## 3. REAL OPEN-MARKET PROOF PLAN

**Status:** procedure only. **Do not claim passed** (today is Saturday; Globex closed).

**When:** next CME Globex equity-index open window (e.g. Sun ≥18:00 ET through Fri &lt;17:00 ET, outside Mon–Thu 17:00–18:00 maintenance).  
**Where:** Chrome + TradingView MNQ chart + extension build from this worktree (or post-apply primary) + `npm run dev:karen` optional for localhost path.  
**Tools:** DevTools Network (`/api/quote`), extension market bar / header, optional Tickstream health.

### A. DC_PRICE_TICK continues ≥30s

| | |
|--|--|
| **Procedure** | With TV live on MNQ, watch bridge/`DC_PRICE_TICK` (or content dbg) for ≥30 continuous seconds. |
| **PASS** | ≥1 tick event roughly every few seconds for ≥30s; no sustained silence while session open. |
| **FAIL** | No ticks for ≥30s while calendar open and TV chart visibly moving. |

### B. Displayed MNQ timestamps advance

| | |
|--|--|
| **Procedure** | Note market-bar / Last timestamp or age label over 30–60s. |
| **PASS** | Age resets / print time advances with TV (or recovered Tickstream) while open. |
| **FAIL** | Frozen Friday/weekend stamp while `expectFresh=true` and TV is live. |

### C. expectFresh=true

| | |
|--|--|
| **Procedure** | `GET /api/quote?symbol=MNQ` (local or prod used by extension); inspect JSON. |
| **PASS** | `expectFresh === true`, `marketState === "MARKET_OPEN"` during open window. |
| **FAIL** | `expectFresh === false` or CLOSED/HOLIDAY/EARLY_CLOSE during known open hours. |

### D. Normal TV-owned Last stays live

| | |
|--|--|
| **Procedure** | Tick mode; healthy TV Last; do not kill bridge. |
| **PASS** | Badge/path shows LIVE (≤2s policy) from `tradingview_live` / TV Last; no backend paint fighting. |
| **FAIL** | LIVE from Yahoo; or Tickstream overwrites healthy TV Last. |

### E. TV stale/missing → fresh Tickstream ≤60s recovers Last

| | |
|--|--|
| **Procedure** | With `expectFresh=true`, interrupt TV ticks (hide Last / pause bridge) while Tickstream quote age ≤60s; wait for backend fallback path. |
| **PASS** | Last recovers from `tickstream_live`/`tickstream_quote` with honest age; badge STALE or LIVE only if age ≤2s — **not** invented ticks. |
| **FAIL** | No recovery despite Tickstream ≤60s; or recovery with age &gt;60s; or closed messaging. |

### F. Yahoo last-close cannot recover LIVE

| | |
|--|--|
| **Procedure** | Force Tickstream reject/unavailable so `/api/quote` returns Yahoo; TV dead; open session. |
| **PASS** | Yahoo print may appear under open+broken/stale UX **or** not painted as recovery; **never** LIVE from Yahoo-as-recovery. |
| **FAIL** | Yahoo old close painted LIVE or accepted by recovery gate. |

### G. Restored TV ticks retake ownership cleanly

| | |
|--|--|
| **Procedure** | After E, restore TV ticks. |
| **PASS** | TV Last resumes ownership within a few ticks; source returns to tradingview_*; no stuck Tickstream-only mode. |
| **FAIL** | Backend quote keeps overriding fresh TV Last. |

### H. No duplicate/fighting prices

| | |
|--|--|
| **Procedure** | During D→E→G, watch Last value + source label for 1–2 minutes. |
| **PASS** | Single displayed Last; source switches cleanly; no flicker between materially different prints at &gt;1pt without source change. |
| **FAIL** | Alternating TV vs Tickstream prices fighting each refresh. |

**Record:** timestamp ET, `marketState`/`expectFresh`, quote `source`/`lastPrintAgeMs`, screenshots of bar before/after TV kill. Mark each A–H PASS/FAIL; overall open-market proof stays **UNVERIFIED** until that session.

---

## 4. DECISION-PATH CONSISTENCY

Inspected (worktree; **not** modified): `lib/data-quality-check.ts`, observation quality mapping, `lib/analysis-quality-gate.ts`, `lib/desk-pipeline.ts` decide/uncertainty path.  
`getCmeGlobexSessionStatus` / `expectFresh` appear **only** in `lib/cme-globex-session-status.ts`, `app/api/quote/route.ts`, and extension UI/recovery — **not** in observation/decision quality.

### UI SESSION STATE:

When `expectFresh=false` (weekend / maintenance / holiday / early close):

- Shared **closed UX**: badge `STALE` or `UNAVAILABLE`; **never LIVE**.
- Copy from `marketReason` (closed / holiday / early close); open+broken strings suppressed.
- Last print may show with **real age**.
- Recovery gate **refuses** Tickstream LIVE recovery when `expectFresh !== true`.

### OBSERVATION DATA STATE:

- `auditDataQuality` still applies `STALE_BAR_SEC = 120` with **no** `expectFresh` input.
- Last bar age &gt;120s → critical `stale_bar` → report flag effectively **stale** → `can_observe` / `can_decide` **false** (only `good`/`degraded` allowed).
- Observation `data_quality` continues to reflect state/feature quality; weekend old bars still read as **stale / insufficient**, not “normal closed.”

### DECISION STATE:

- `evaluateAnalysisQualityGate`: `stale` → `INSUFFICIENT`; `canDeliverVerdict` blocked when `!audit.can_decide` or stale missing reasons.
- Pipeline uncertainty / spoken NO_TRADE paths still treat bad `data_quality` as **cannot lean / data too low** — i.e. **broken/insufficient live data**, not calendar-closed normal.

### Contradiction:

**Yes — known deferred gap (design §8.5 / impl “later”).**  
UI correctly says closed+old = normal; **deeper decide path still treats old bars as feed/data failure** when `expectFresh=false`. Do **not** fix in this audit; do **not** pretend UI and decide-path are unified.

---

## 5. LOCALHOST FAILOVER RED TEAM

**Code:** `extension/api-config.js` (ported general-chat-fix pattern) + `extension/background.js` `cachedBase || resolveApiBase()`.  
**Executable evidence:** `node scripts/test-api-config-failover.mjs` (**ok** this pass).

| Case | Verdict | Evidence |
|------|---------|----------|
| localhost healthy → localhost wins | **PASS (code)** | `pingHealth` probes local first via `resolveLocalProbe`; `rememberBase(local)`. Not exercised live here if :3020 down. |
| localhost connection refused → Vercel | **PASS** | Probe: local fail 15ms → Vercel ok 541ms; `fellThrough=true`; total ~556ms |
| localhost hangs → Vercel | **PASS** | Hung TCP + 800ms abort → Vercel; total ~968ms |
| slow after cached success → Vercel within bound | **PASS (code)** | `trustCachedLocal` / stored last-good require **`probeBase(..., 800)`** before trust; on fail clears `lastHealthOkAt` + local `cachedBase`, then `pingHealth` → Vercel. Bound ≈ **800ms confirm**, not 120s blind trust. |
| Vercel down, localhost healthy → localhost | **PASS (code)** | Local success returns before Vercel candidates. |
| both unavailable → honest unavailable | **PASS (code)** | `pingHealth` returns `{ ok:false, error: "Backend offline…" }`; `resolveApiBase` throws; **no** degraded cached localhost return (guard + comment enforced in test). |

### 120s sticky trust trap:

`HEALTH_TTL_MS = 120_000` still exists as a **cache eligibility window**, but cached local is **not** used without a live **800ms** confirm; failure clears trust. Sticky “health probe failed — using cached localhost” path **absent** (test asserts). **No 120s blind sticky trap remains** in this carve.

---

## 6. PATCH PURITY

### Exact production files (this implementation)

| Path | Role |
|------|------|
| **New** `lib/cme-globex-session-status.ts` | Classifier + recovery/UI helpers + holiday table |
| `app/api/quote/route.ts` | Additive `marketState` / `expectFresh` / age / reason / nextOpen |
| `extension/api-config.js` | Localhost prefer + Vercel failover |
| `extension/background.js` | Allow local `cachedBase` in resolve path |
| `extension/content.js` | expectFresh recovery + closed-vs-broken UI |

### Test / harness (ok to keep with carve; not runtime product)

- `scripts/test-cme-globex-session-status.ts`
- `scripts/test-expectfresh-recovery-gate.ts`
- `scripts/test-api-config-failover.mjs`

### Must **not** ship

| Path | Why |
|------|-----|
| `tsconfig.tsbuildinfo` | Incidental tsc cache (modified in WT) |
| `.tmp-market-closed-unify-probe.ts` | Prior temp probe |

### Forbidden overlap (scan)

| Concern | Result |
|---------|--------|
| decision memory / six-feature clean | **ZERO** — separate WT; no shared new decision-memory libs in this diff |
| `continuous-decision-recorder` | **ZERO** imports/edits |
| `decision-memory-material` | **ZERO** |
| recorder-modified `verdict-engine` | **ZERO** |
| `interpretation-engine` | **ZERO** |
| `decision-layer` | **ZERO** |

`git diff --name-only` product set matches the five files above (+ tsbuildinfo). Untracked: classifier + three tests + probe.

---

## 7. FINAL VERDICT

| Gate | Result |
|------|--------|
| CALENDAR LOGIC | **PASS** |
| HOLIDAY AUTHORITY | **REVIEW** |
| OUT-OF-RANGE SAFETY | **FAIL** |
| LOCALHOST FAILOVER | **PASS** |
| OPEN-MARKET RECOVERY CODE | **PASS** |
| OPEN-MARKET LIVE PROOF | **UNVERIFIED** |
| DECISION-PATH CONSISTENCY | **REVIEW** |
| TYPECHECK | **PASS** |
| PATCH PURITY | **PASS** |

### FINAL STATUS:

**CONDITIONAL HOLD**

### SINGLE NEXT ACTION:

Add an explicit holiday-calendar coverage/expiry gate so out-of-range dates cannot silently set `expectFresh=true` / authoritative `MARKET_OPEN`, then re-run calendar + recovery tests before any primary apply review.

---

## Confirmation

- Reviewed `.tmp/karen-market-closed-unify/` only  
- No product code modified by this review  
- No apply to primary  
- No commit / push / deploy  
- Artifact: `data/research/karen-globex-pre-merge-review.md`

**STOP.**
