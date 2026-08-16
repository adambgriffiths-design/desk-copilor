# Karen research notes

**Canonical handoff:** [`KAREN-HANDOFF.md`](./KAREN-HANDOFF.md) (as of 2026-08-16)

## Commands (Lane 2 — measurement / governance)

```bash
npm run karen:research:status            # bottleneck, active measurement, parked, next
npm run karen:research:sot-check         # SoT drift vs feature-gap lock
npm run karen:research:governance-check  # HOLDOUT/VAL unauthorized-touch scan
```

## Primary SoT docs

| Doc | Role |
|-----|------|
| [`karen-wait-quality-feature-gap-lock.md`](./karen-wait-quality-feature-gap-lock.md) | Upstream framing + STOP_CONDITION |
| [`karen-research-queue-one-bottleneck.md`](./karen-research-queue-one-bottleneck.md) | One CURRENT + five QUEUED_SUSPECTS |
| [`karen-next-single-change-dev-candidate.md`](./karen-next-single-change-dev-candidate.md) | NEXT_SINGLE_ACTION pointer |
| [`karen-research-debt-inventory.md`](./karen-research-debt-inventory.md) | Debt inventory |

**Rules:** EDGE_CLAIM NONE · HOLDOUT SEALED · VAL DO NOT TOUCH · selective unlock PARKED · C4 NOT_DEFINED
