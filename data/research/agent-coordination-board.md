# Agent coordination board

**Written:** 2026-08-14 ~17:52 local (Europe/London)  
**Workspace:** `C:\Users\adamg\Projects\desk-copilot`  
**Mode:** Operational only. No commit / push / deploy. No new replay/bench unless user explicitly asks.

---

## RUNNING NOW (post-audit)

| Process | Port | PIDs | Notes |
|---------|------|------|-------|
| `npm run dev:karen` (`next dev -p 3020`) | **3020** | 4532 (wrapper), 17200 (server) | **KEEP — canonical local server** |
| `next dev` (default) | — | — | **KILLED** (was 13968/23752 on :3000) |
| Replay / parity / bench / tsx research | — | — | **None running** |
| Port 3001 | — | — | Not listening |

---

## COMPLETED (do not rerun)

| Task ID / session | Outcome |
|-------------------|---------|
| `research-live-replay-parity` / `13f15307` | **PASS** 72/0 — live ≡ replay at 13 cutoffs. Report: `data/supervisor/results/research-live-replay-parity.md` |
| `cursor-performance-audit` / `a7099062` | Found **3 concurrent** `test:live-replay-parity` workers (~2.4 cores, ~1.9 GB). All stopped. Report: `data/research/cursor-performance-audit.md` |
| `karen-incremental-replay-parity` / `983704df` | **PASS** parity + PIT. 4.44× checkpoint speedup (CURRENT→OPTIMIZED). Report: `data/research/karen-incremental-replay-parity.md` |
| `karen-research-candidate-filter-audit` / `5149e660` | **Analysis only — NOT safe to enable** candidate skip yet. Report: `data/research/karen-research-candidate-filter-audit.md` |
| `karen-research-performance-audit` | Bottleneck mapped; opt-in OPTIMIZED path documented. Report: `data/research/karen-research-performance-audit.md` |
| `karen-connection-reliability` / `2c34ab00` | Audit + one fix; extension **v1.4.118**. Report: `data/research/karen-connection-reliability.md` |
| `karen-intent-routing` / `747b5062` | Intent isolation tests 91/91. Report: `data/research/karen-intent-routing.md` |
| `research-karen-path-unification` / `b317696e` | Partial — envelope unification mapped; report on disk. Do not restart from scratch |
| Connectivity / dev-server restarts / `533e3e94`, `6b4354fc`, `b2a93dfc`, `f8e5c803` | Multiple agents bounced `next dev` on **:3000** — wrong port. Canonical is **:3020** (`dev:karen`) |

---

## IN FLIGHT

| Session | Status | Owner |
|---------|--------|-------|
| `eff2a2b2` | This coordination audit (writing this board) | Current agent |
| User parent chat | Operational steering | User |

No active replay, parity, bench, or historical-experiment OS workers.

---

## DO NOT RESTART (duplicates)

| Work | Why |
|------|-----|
| `npm run test:live-replay-parity` | Report exists — **PASS**. Was triplicated earlier (~19 min + ~8 min + third copy). |
| `npx tsx scripts/test-live-replay-parity.ts` | Same — duplicate of above. |
| `next dev` on **:3000** or **:3001** | Extension expects `dev:karen` on **:3020**. Multiple agents spawned wrong-port servers today. |
| `scripts/bench-candidate-filter-audit.ts` / `bench-candidate-scan-only.ts` | Benchmark artifacts already written (`karen-candidate-filter-benchmark.json`, `karen-candidate-scan-only.json`). |
| `scripts/profile-research-pipeline-audit.ts` | Profile captured in `live-pipeline-profile.md`. |
| Incremental replay parity re-run | **PASS** on `nq-aug12-2026-cme`. Only rerun if code changes touch replay engine. |
| Second connectivity “fix pass” | Audit complete; point extension at **localhost:3020** + reload **v1.4.118**. |
| Vercel deploy / prod health probes | User said forget Vercel (`f8e5c803`) — local-only until asked. |
| Supervisor inbox leftovers (`dry-*`, `mt-*`) | Completed pilot copies — do not pickup. |

---

## SINGLE OWNER — next work items

| Priority | Item | Owner | Blocked by |
|----------|------|-------|------------|
| 1 | Local Karen on **:3020** only | **User + one agent** | Nothing — server running |
| 2 | Extension reload + verify connection badges | **One agent** (not parallel) | Must use :3020, not :3000 |
| 3 | Path unification finish (`b317696e` residue) | **One agent** when user asks | Must not touch trading semantics |
| 4 | Candidate-filter **implementation** | **Nobody** until user approves | Audit says NOT safe yet |
| 5 | OPTIMIZED replay opt-in (`RESEARCH_REPLAY_MODE=OPTIMIZED`) | **Nobody** until user approves | Parity PASS but needs explicit sign-off |
| 6 | New replay / backtest / bench | **Nobody** | User must explicitly request |

---

## Overlap resolved (incremental replay vs candidate filter vs performance audit)

These three threads touched the same replay path today but are **sequenced, not concurrent**:

1. **Performance audit** — measured cost (`buildMarketContextAt` ~95%+). Done.
2. **Incremental replay parity** — proved OPTIMIZED ≡ CURRENT (4.44×). Done.
3. **Candidate filter audit** — proved cheap filters don't help yet. Done, no implementation.

**Do not spawn a fourth pass** on the same fixture unless semantics change.

---

## Killed this pass

- `next dev` on port **3000** — PIDs **21036, 19564** (first attempt) and **13968, 23752** (respawn). Stopped; **3020 kept alive**.
