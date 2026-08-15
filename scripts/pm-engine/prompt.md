# Desk Copilot — PM Sprint Prioritization Prompt

Use this template after running `npm run pm:scan`. Paste the scan report and recent git activity into Cursor (or any LLM) to plan a focused sprint.

---

## Inputs (paste below)

### PM scan report
<!-- Paste contents of reports/pm-scan-YYYY-MM-DD.md -->

### Recent changes
<!-- git log --oneline -20 -->
<!-- Optional: open bugs, user feedback, stabilization failures -->

### Sprint constraints
- **Duration:** 1 week (default)
- **Team size:** 1 developer
- **Focus areas (pick 2–3):** routing / voice / live data / extension UX / reliability

---

## Your task

You are a product-minded tech lead for **Desk Copilot** — a TradingView Chrome extension + Next.js backend ICT desk copilot ("Karen").

Given the PM scan report and recent git changes:

1. **Cluster findings** into themes (e.g. "routing parity", "live price freshness", "plain language").
2. **Score each theme** using:
   - **Impact (1–5):** user-visible improvement, reduces wrong-route / wrong-reply incidents
   - **Effort (1–5):** 1 = hours, 5 = multi-day (use scan effort S/M/L as hint)
   - **User pain (1–5):** how often traders hit this during a session
   - **Priority score = (Impact × User pain) ÷ Effort**
3. **Pick top 5 sprint items** with clear acceptance criteria.
4. **Call out quick wins** (effort S, severity medium+) that can ship in day 1.
5. **Flag deferrals** — low severity + low pain items to backlog.
6. **Recommend test gates** before merge (`npm run test:routing`, `test:regression`, manual STABILIZATION_CHECKLIST).

---

## Scoring rubric

| Score | Impact | User pain | Effort |
|-------|--------|-----------|--------|
| 5 | Fixes critical misroutes or data wrongness | Every session / voice turn | S — ≤2 hours |
| 4 | Major UX or reliability win | Most sessions | M — half day |
| 3 | Noticeable polish | Weekly | L — 1–2 days |
| 2 | Minor inconsistency | Rare | |
| 1 | Docs / cosmetic | Almost never | |

**Prioritize:** critical/high severity first, then highest priority score.

---

## Output format

### Sprint goal (one sentence)

### Top 5 backlog (ranked)

For each item:
- **Title**
- **Why now** (scan evidence + git context)
- **Acceptance criteria** (testable)
- **Files likely touched**
- **Test plan**
- **Priority score**

### Quick wins (≤1 day total)

### Backlog / defer

### Risks & dependencies

---

## Desk Copilot context (keep in mind)

- Extension routing must mirror `lib/desk-route-intent.ts` (`extension/desk-route-intent.js`).
- Golden phrases live in `data/routing-golden.csv` — expand when adding routes.
- Live data fallback copy: only when web search was expected and failed.
- Plain language: voice and chat should spell out ICT terms (see `lib/plain-language.ts`).
- Tick-aware price should beat stale Yahoo cache when TradingView chart is open.
- Voice barge-in must cancel TTS/realtime before taking a new turn.

---

## Example priority statement

> "Fix version drift + routing golden gaps first (critical path for trust), then tick-aware price for snapshot route (high session pain), then plain-language leaks in spoken brief (medium UX, quick win batch)."

Replace with your actual ranked list after reviewing the scan.
