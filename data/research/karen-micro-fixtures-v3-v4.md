# Micro-fixtures v3/v4 — invent-path probe

**EDGE_CLAIM: NONE** · Candidates only · 2026-08-15T15:28:27.769Z

## Context probe (forced invent)

| Path | Triggered? | Evidence |
|------|:----------:|----------|
| PD lastPrice (v2 invent / v3 refuse) | **true** | v2 PDH/PDL=24999.5/24999.5 (=last); v3 PDH/PDL=NaN/NaN |
| Empty-session HL (v2 invent / v4 refuse) | **true** | v2 asia finite+from-today; v4 asia/london/nyPre non-finite; nyRth finite |

## DV deltas

| Compare | Paired | Verdict Δ | Structure Δ | Actionable Δ |
|---------|-------:|----------:|------------:|-------------:|
| v2→v3 (PD fixture) | 3 | 2 | 2 | -2 |
| v2→v4 (empty-session) | 3 | 0 | 0 | 0 |

## Status

- **v3:** FIX_PROVEN_ON_MICROFIXTURE — path fires; delta observed; still CANDIDATE
- **v4:** PATH_TRIGGERED_DELTA0 — invent/refuse differ in context; DV verdict structure unchanged; still CANDIDATE
- Confounder tag `empty_session_hl_fallback` still auto-inactive (no provenance flags).
- **Promotion:** NOT_PROMOTED

**EDGE_CLAIM: NONE**
