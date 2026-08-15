# TickStream historical depth — Adam key vs OWNED Archive

**Generated:** 2026-08-15T12:12Z  
**EDGE_CLAIM:** NONE  
**Key env:** `TICKSTREAM_API_KEY` only (len=56; `sk_live_…`; no other TickStream keys in `.env*`)  
**Docs used (source of truth this turn):**
- [Historical archive](https://tick-stream.xyz/docs/historical)
- [Level 2](https://tick-stream.xyz/docs/level2)
- [Level 3](https://tick-stream.xyz/docs/level3)

**Probe artifact:** `.tmp/karen-final-integration/data/karen-decision-validation/acquisition/reports/tickstream-archive-keys-probe.json`  
**Docs-aligned probe:** `…/tickstream-history-docs-aligned-probe.json` (written by history pull script)

---

## SKU → DOC TIER (critical)

| Adam dashboard product | Matching docs | Correct API | Wrong API |
| --- | --- | --- | --- |
| **NQ Tick + L2 Archive** (OWNED → 2026-08-15; 2019→today) | **[Historical](https://tick-stream.xyz/docs/historical)** (+ L2 book archive section) | `GET /v1/history/ticks`, `GET /v1/history/book` | `/v1/l3`, WS `channel:l3` |
| Live L2 stream (Realtime + L2 monthly) | [Level 2](https://tick-stream.xyz/docs/level2) | WS `channel:book` | — |
| L3 / Market-by-order | [Level 3](https://tick-stream.xyz/docs/level3) | WS `channel:l3`, `GET /v1/l3` | — |

**Verdict:** Adam’s SKU matches the **Historical archive** product (“NQ ticks archive”), **not** the L3 page. L3 docs explicitly say there is **no** multi-year MBO archive; tick/L2 archive 2019→ is separate and does **not** include L3.

---

## How Archive auth works (docs)

1. **One account key** (`sk_live_…`) — [Authentication](https://tick-stream.xyz/docs/authentication): *“one active key per account today”*.
2. **Same Bearer header** for stream + REST + archive. No separate archive token, no `/archive` base URL, no special header.
3. **Entitlement = packages on the account**, not a different key product flag in the request.
4. `/history/ticks` + `/history/book` **require the NQ ticks archive** package. Over-deep ranges are **clamped** (`history_clamped` / `snapshot_until`), not HTTP-refused.
5. Archive forms: **one-time purchase** (frozen to purchase date → `snapshot_until`) **or** updates subscription ($10/mo, always reaches live).
6. Free sample (no signup): `https://api.tick-stream.xyz/v1/preview/nq-ticks-free-preview-2mo.zip` (~245 MB; Feb–Mar 2025).

**Per-request limits (Historical):** `limit` default 50k, **max 500k**; page with `truncated:true` → set `start` to last `ts`. Docs recommend **day chunks** for large ranges. (Not “no row cap” on a single HTTP call — dashboard marketing ≠ per-request max.)

---

## L2 vs L3 (for Adam’s confusion)

| | L2 (matches SKU) | L3 (does **not** match SKU) |
| --- | --- | --- |
| Live | WS `book` (needs Realtime+L2) | WS `l3` (needs L3 plan) |
| History | `/history/book` since **2019** via Archive | `/v1/l3` replay **only since TickStream started recording** — no vendor MBO back-years |
| Auth fail | `403` without L2 package | `403 plan_required` without L3 |
| OHLC for Karen | Prefer **`/history/ticks`** (trades) | Wrong product for multi-year OHLC |

`welcomePlan=delayed` on WebSocket = **live stream delay tier**, **not** archive depth. Docs allow delayed stream while `/history/*` still reflects archive packages on the same key.

---

## LIVE FLOOR (this key, re-probed 2026-08-15T12:10Z)

| Probe | Result |
| --- | --- |
| WS `welcome.plan` | **`delayed`** (unchanged) |
| `/history/ticks` 2026-08-14 hour | 2000 ticks, `history_clamped:false` |
| `/history/ticks` **2025-03-03** hour | **2000 ticks**, `history_clamped:false` |
| `/history/ticks` **2024-06** | **2000 ticks**, unclamped |
| `/history/ticks` **2020-06** | **2000 ticks**, unclamped |
| `/history/book` 2025-03 sample | **2000** book rows (L2 archive present) |
| Archive access | **YES** on current `TICKSTREAM_API_KEY` |

**Earlier probe (~12:04Z)** reported Feb-2025/2020 `history_clamped:true` empty. **~6 minutes later** the same key returned deep archive ticks. Likely causes (ordered):
1. **Purchase entitlement just propagated** to the account key (OWNED → 2026-08-15).
2. Prior confusion between `/v1/ticks` (hard **7d**) empty bodies and `/history` clamp.
3. Not a separate Archive key requirement — docs: one key; packages attach to account.

---

## Why OWNED could still look “clamped” (checklist for Adam)

If deep `/history` is empty again:

1. Open TickStream **dashboard** → confirm logged into the account that shows **NQ Tick + L2 Archive**.
2. Open **API key** page → copy the **current** `sk_live_…` (docs: rotating invalidates old immediately).
3. Paste into repo `.env.local` as **`TICKSTREAM_API_KEY=…`** (only TickStream var we use).
4. Confirm product is **Archive / NQ ticks** (Historical), not only Free delayed stream — and if one-time purchase, expect `snapshot_until` past purchase date.
5. Do **not** look for an L3 key or `/v1/l3` for 2019–2025 ticks — wrong tier.
6. Smoke test:  
   `GET /v1/history/ticks?symbol=NQ&start=2020-06-15T14:30:00Z&end=2020-06-15T15:00:00Z`  
   Expect `count>0` and `history_clamped` ≠ true.

**Not required per docs:** separate archive header, different base URL, product query flag, or L3 upgrade for tick OHLC.

---

## RECOMMENDED_PULL_STRATEGY (Archive unlocked)

1. **Trades first:** day-chunk `GET /v1/history/ticks` on **NQ**, `limit=500000`, page on last `ts`.
2. Skip weekends; backoff on 429.
3. Immutable raw per day → streaming 1m OHLC → DQ → DV.
4. L2 `/history/book` later; **skip L3** for multi-year OHLC.
5. Free ZIP remains a no-key fallback for Feb–Mar 2025 only.

Script: `.tmp/karen-final-integration/scripts/karen-dv-tickstream-history-days.ts`

---

## SAMPLE PULL LANDED (2026-08-15)

| Field | Value |
| --- | --- |
| Endpoint | `GET /v1/history/ticks` |
| Days | **2025-02-03 … 2025-03-31** (**41** weekdays — full Feb–Mar window) |
| Ticks | **22,825,476** |
| 1m bars | **54,600** |
| DQ | **ok** (0 errors, 46 gap warnings) |
| DV (v2 bounded @15m, limit 200) | lookAhead/smoke **PASS**; **Z=52** actionable (20L/32S); 0 invalid; shortage flags cleared for actionable/regimes at this sample |
| L3 `/v1/l3` | **403 plan_required** — expected (SKU is Archive, not L3) |
| L2 `/history/book` | **works** (2000 rows on Mar sample) |

---

## Concise answer card

```
SKU_DOC_TIER: Historical archive (/history/ticks + /history/book) — NOT L3
AUTH: same Bearer sk_live_… ; packages on account; no separate archive key/header
WELCOME delayed ≠ archive denied (stream delay vs /history package window)
LIVE_FLOOR: Archive YES on TICKSTREAM_API_KEY (2020 + Feb–Mar 2025 unclamped)
L3: 403 plan_required on this key (correct — Adam owns Archive not L3)
PRIOR_CLAMP: likely pre-propagation; now unlocked
PULL_LANDED: 41d Feb–Mar 2025 → 22.8M ticks → 54600×1m → DQ ok → DV Z=52
NEXT: multi-month expand; denser DV / VALIDATION+HOLDOUT carve; L2 book later
ADAM_CHECK: only if clamp returns — same account + current key; ignore L3 for 7y ticks
```
