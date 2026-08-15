# Clean-tree TypeScript diagnosis — `lib/observation-facts.ts`

**Date:** 2026-08-15  
**Mode:** Investigate ONLY — no code changes, no commit/push/deploy/apply  
**Clean tree:** `C:\Users\adamg\Projects\desk-copilot\.tmp\karen-six-feature-clean`  
**HEAD:** `74183b24553757a22fd71d79d0f8954d7c72872f` (detached)

---

## TYPECHECK ROOT CAUSE

`lib/observation-facts.ts` (working-tree edit, not HEAD) reads three properties that **do not exist** on clean-tree / baseline `MarketObservation.liquidity.levels`:

| Line | Access | Declared type on clean HEAD |
|------|--------|-----------------------------|
| 279 | `level.side` | absent |
| 282–283 | `level.status` | absent |
| 295 | `l.id` | absent |

Clean-tree `lib/desk-schema.ts` (unchanged from HEAD):

```ts
levels: Array<{ label: string; price: number; taken: boolean | "unknown" }>;
```

Confirmed `npx tsc --noEmit` in clean tree — **exactly these five TS2339 errors**, no others when this file is the patched shape.

**What is wrong:** the *consumer* (`observation-facts.ts` working copy), not the HEAD schema. The edit was written against the **dirty main WT** richer level shape (`id?`, `status?`, `side?`, … in main `lib/desk-schema.ts`). Clean-tree intentionally kept HEAD’s narrow schema (see clean-patch build notes: avoid shipping WT `desk-schema` churn).

`session-liquidity.ts` itself is fine at HEAD: optional `side?` on a local `LiquidityLevelLike`, with label-heuristic fallback. Official clean patch review already noted that mismatch and said it typechecks. The failure is only where `observation-facts` indexes `side` / `status` / `id` on the **schema** level type.

---

## BASELINE: PASS

| Configuration | `tsc --noEmit` |
|---------------|----------------|
| HEAD `observation-facts.ts` + rest of clean-tree six-feature working set | **PASS** (`NO_TS_ERRORS`) |
| Current working `observation-facts.ts` (uses `side`/`status`/`id`) | **FAIL** (5× TS2339) |

Baseline HEAD source (pre-edit) only used `label` / `price` / `taken` for liquidity levels — matches schema.

---

## PATCH CAUSED IT: NO

- Official six-feature clean patch (`karen-six-feature-clean.patch` / in-tree `karen-six-feature.patch`) **does not** modify `lib/observation-facts.ts` or `lib/desk-schema.ts`.
- It **does** add `lib/session-liquidity.ts` (and wires it into `decision-envelope.ts`). That alone does **not** break tsc.
- The failing delta is an **extra** dirty-WT-shaped edit to `observation-facts.ts` layered onto the clean tree (import of session-liquidity helpers + `level.side` / `level.status` / `l.id` / PDH–PDL gate / session sweep notes).

So: **not pre-existing baseline breakage**; **not introduced by the official six-feature patch file**; introduced by a separate observation-facts overlay that assumes dirty-WT schema.

---

## LIQUIDITY CONNECTION: YES

Same *family* as liquidity / sweep presentation work, **not** the same root cause as the `liquidity_swept` false-negative investigation:

| Topic | Relation |
|-------|----------|
| `liquidity_swept` FN (`taken` never `true`) | Observation mapping / CLOSED_BEYOND proof — separate |
| These TS errors | Presentation code assuming richer level fields (`side`/`status`/`id`) from dirty WT |

Dirty WT `desk-schema` comments tie `status` to interaction provenance (“never collapse to `taken=true` without CLOSED_BEYOND”). The broken branches (`status !== "UNTOUCHED"`, `l.id === sweep.levelId`, BSL/SSL `side` notes) are collateral from that richer model + session-liquidity copy, not from the six-feature memory/QG/routing core.

---

## MINIMAL FIX (describe only — not implemented)

**Prefer: edit `observation-facts.ts` only to match HEAD level shape** (same strategy as clean-patch HEAD-compat for envelope):

1. **L279:** `classifyLevelSide(level.label)` — drop `level.side` (heuristics already cover PDH/PDL/high/low).
2. **L280–284:** drop `level.status` branch; keep taken-based copy only, e.g.  
   `taken === true` → `sweptStatusNote(...)`; `taken === "unknown"` → “sweep not confirmed”; else → “not swept”.
3. **L295:** match by label only:  
   `l.label.toLowerCase() === sweep.levelId`  
   (optional: also compare normalized `liquidity.${label}` ids if needed — still no `l.id`).

Keep: `session-liquidity` imports, `describeSweepFact(sweep.label, sweep.side)`, `?? []` on sweeps, session-level swept notes via `classifyLevelSide(label)` — those already typecheck.

**Do not** widen clean-tree `desk-schema` just to silence tsc unless deliberately shipping dirty-WT observation provenance (out of six-feature clean carve).

---

## FILES THAT WOULD CHANGE

- `lib/observation-facts.ts` only (minimal)

Optional non-minimal: `lib/desk-schema.ts` optional `id?` / `status?` / `side?` — **not recommended** for clean-tree six-feature carve.

---

## FORBIDDEN DEPENDENCY: NO

Fix does **not** require:

- continuous-decision-recorder  
- decision-memory-material  
- verdict-engine recorder changes  
- live-latency-profile  
- market-data-errors  

---

## RECOMMENDATION: FIX

Align the observation-facts overlay to HEAD level types (or drop the overlay entirely and keep HEAD facts + envelope-only session-liquidity). Do **not** accept as pre-existing — baseline and official patch typecheck without this file’s dirty-WT field reads.

---

## Evidence appendix

### `tsc` (patched observation-facts)

```
lib/observation-facts.ts(279,72): error TS2339: Property 'side' does not exist on type '{ label: string; price: number; taken: boolean | "unknown"; }'.
lib/observation-facts.ts(282,21): error TS2339: Property 'status' does not exist on type '{ label: string; price: number; taken: boolean | "unknown"; }'.
lib/observation-facts.ts(282,37): error TS2339: Property 'status' does not exist on type '{ label: string; price: number; taken: boolean | "unknown"; }'.
lib/observation-facts.ts(283,29): error TS2339: Property 'status' does not exist on type '{ label: string; price: number; taken: boolean | "unknown"; }'.
lib/observation-facts.ts(295,18): error TS2339: Property 'id' does not exist on type '{ label: string; price: number; taken: boolean | "unknown"; }'.
```

### A/B

- Restore HEAD `lib/observation-facts.ts` → `tsc` clean with six-feature adds still present.  
- Restore patched file → five errors return.

### Patch file scope

`diff --git` in `karen-six-feature-clean.patch` includes `lib/session-liquidity.ts`, not `observation-facts.ts` / `desk-schema.ts`.
