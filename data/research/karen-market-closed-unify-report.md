# KAREN — Market-closed unify (weekend ≡ normal closed)

**Date:** 2026-08-15 (Saturday)  
**Mode:** Investigate → implement only if needed → report  
**Workspace:** isolated `.tmp/karen-market-closed-unify/` (primary was hot; did **not** touch `.tmp/karen-six-feature-clean/`)  
**Baseline:** detached `74183b2` (v1.4.73)  
**Constraints honored:** no deploy / commit / push; no `LIVE_PRICE_MAX_AGE_MS` inflate; no Friday invent-as-live; no weekend-specific hacks; no decision-memory / six-feature / continuous-recorder / verdict-engine / interpretation changes  

**Prior read:** `data/research/karen-live-market-data-stopping-diagnosis.md`

---

## Verdict

**Architecture already unifies weekend and normal closed hours via shared age-gate freshness.**  
There is **no weekend-specific “stale/broken/stopped feed” branch**.  
**Smallest fix: NONE** (no product code changes).

---

## Existing closed-session authority

| Layer | What exists | Role |
|-------|-------------|------|
| **CME session *day* identity** | `cmeSessionDateKey` in `lib/tickstream/htf-aggregate.ts` (primary also mirrors helpers in `lib/market-data.ts`) | Globex **day key**: at/after **18:00 ET** rolls to next session date. Used for HTF daily buckets / PD session membership — **not** an open/closed switch. |
| **ICT clock sessions** | `lib/sessions.ts` → `resolveSessionContext` | Asia / London / NY labels from EST minutes. Clock-only; **does not know Globex is halted**. |
| **Live vs not-live (actual closed authority)** | Age gates only | Tickstream reject if age > `LIVE_PRICE_MAX_AGE_MS` (60s); UI tick **LIVE** needs age ≤ **2s**; connection hop `MARKET_FRESH_MS` = **60s** → `CONNECTED` else `DEGRADED` when backend up. |

**There is no `isGlobexOpen(now)` / calendar market-closed flag.**  
“Closed” is operationally: **no new ticks → print age grows → LIVE clears → STALE / DEGRADED**, with last print retained.

---

## Current weekend behavior

From diagnosis (live Saturday probe) + code path:

| Layer | Behavior |
|-------|----------|
| **SOURCE** | Upstream still answers; print frozen at Friday last (Yahoo / Tickstream). |
| **SERVER / API** | Continues to serve last print; Tickstream live path rejects when age > 60s; Yahoo fallback returns Friday stamp. |
| **CLIENT** | Poll timers keep running (not a one-shot stop). |
| **UI** | Tick LIVE ≤2s → then last-print / STALE labeling; connection → **DEGRADED** (backend up + stale pulse), **not** API-failure DISCONNECTED solely from missing ticks. |
| **Redis / decision memory / reasoning** | Not the stop point (diagnosis); no weekend kill switch in freshness path. |

No `weekend` / `Saturday` / `getDay` forks in `extension/chart-price.js`, `extension/content.js` freshness, or `lib/connection-state.ts`.

---

## Current normal-close behavior

Same machinery as weekend:

- **Weekday daily halt** (e.g. Wed ~17:30 ET) and **Fri after Globex close** use the **same** `LIVE` / age / `DEGRADED` path.
- Last known price remains showable as last print (`Last print · … ago`, price with `*` when STALE/OFFLINE in desk bar).
- Absence of new ticks does **not** by itself flip backend to DISCONNECTED — that requires backend down / failed probe path.

---

## Mismatch?

**None for weekend vs normal closed.**

Boundary probe (Fri after close / Sat / Sun before reopen / Wed halt / Wed open) showed:

| Instant | ICT clock label | Stale pulse → | Fresh pulse → |
|---------|-----------------|---------------|---------------|
| Fri 17:30 ET | Overnight | **DEGRADED** | CONNECTED |
| Sat midday | Overnight | **DEGRADED** | CONNECTED |
| Sun 17:00 ET (pre-Globex) | Overnight | **DEGRADED** | CONNECTED |
| Wed 17:30 ET (daily halt) | Overnight | **DEGRADED** | CONNECTED |
| Sun 18:30 ET / Wed 10:00 ET | Asia / NY AM | **DEGRADED** if stale | CONNECTED if fresh |

Calendar day does **not** change connection evaluation — only pulse age does.

**Human/diagnostic language** (“pipeline stopped”, “broken feed”) is easy to misread from STALE/DEGRADED, but that wording is **not** a weekend-only code path. Fri close and Sat behave the same under the gates.

**Out of scope (not a weekend mismatch):** there is still no dedicated shared `MARKET CLOSED` badge (diagnosis UX idea). Adding one would be a **shared** closed-session enhancement, not a weekend unify fix — and was **not** required once paths already match.

---

## Smallest fix

**NONE**

Do not add weekend-specific polling, do not widen live age to fake LIVE, do not invent Friday as live.

---

## Tests

| Test | Result |
|------|--------|
| `.tmp-market-closed-unify-probe.ts` (Fri close / Sat / Sun-pre / Wed halt / open; session keys; shared DEGRADED) | **ok** |
| `npx tsx scripts/test-connection-state.ts` | **ok** |
| `npx tsx scripts/test-chart-live-price.ts` | **ok** |
| Grep freshness path for weekend / `getDay` forks | **none found** |

Probe artifact (isolated only): `.tmp/karen-market-closed-unify/.tmp-market-closed-unify-probe.ts`

---

## Files that would change / did change

| Area | Change |
|------|--------|
| Product (`lib/`, `extension/`, `app/`) | **None** |
| `.tmp/karen-six-feature-clean/` | **Untouched** |
| Isolated worktree | Created at `.tmp/karen-market-closed-unify/`; probe script only |
| This report | `data/research/karen-market-closed-unify-report.md` (primary) |

---

## Per-layer closed semantics (shared)

```
SOURCE:   no new ticks expected when CME halted (Fri→Sun or weekday maintenance)
SERVER:   may still answer; does not invent ticks
API:      last print OK; live Tickstream rejected past age gate
CLIENT:   timers continue; freshness demotes LIVE
UI:       last print without LIVE once age thresholds fire; DEGRADED ≠ API failure
MEMORY:   not interpreted as “stopped” by market-closed age gates
```

**STOP.**
