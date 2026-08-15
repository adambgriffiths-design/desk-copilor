# Cursor performance / resource audit

Measured on the user machine. No processes were stopped. No code was changed.

- **Host:** adamspc
- **OS:** Windows 10.0.26200 (win32)
- **CPU:** 13th Gen Intel(R) Core(TM) i3-1315U — 6 cores / 8 logical processors
- **Clock (CIM):** CurrentClockSpeed=1200 MHz, MaxClockSpeed=1200 MHz (base clock; turbo not reported by CIM)
- **Boot:** 2026-08-14 07:09:22
- **Sample A:** 2026-08-14 14:24:00 local
- **Sample B:** 2026-08-14 ~14:26–14:27 local
- **Report written:** 2026-08-14 14:28 local
- **Method:** Get-CimInstance Win32_OperatingSystem / Win32_Processor / Win32_Process / Win32_PerfFormattedData_PerfProc_Process / Win32_LogicalDisk / Win32_PageFileUsage; Get-Counter; Get-Process; terminal metadata under `C:\Users\adamg\.cursor\projects\c-Users-adamg-Projects-desk-copilot\terminals`

Note: this audit spawned extra PowerShell/WMI processes (Sample B: 23 powershell, ~467 MB working set). Those slightly inflate RAM/CPU during sampling. Core findings (replay workers, Cursor renderer, paging) were already present in Sample A before most of those shells existed.

---

## Headline numbers

SYSTEM CPU:
- Sample A: Processor LoadPercentage = **100**; Get-Counter `\Processor(_Total)\% Processor Time` = **98.8%**
- Sample B: `\Processor(_Total)\% Processor Time` = **98.48%**
- Machine is CPU-saturated on both samples.

SYSTEM RAM:
- TotalVisibleMemory = **7.70 GB**
- Sample A: Free = **0.12 GB (1.6%)**; Used = **7.58 GB**
- Sample B: Free = **0.36 GB (4.7%)**; Used = **7.33 GB**; Available MBytes = **352**
- Sample A Available MBytes = **280**
- Committed Bytes (Sample A) = **25,053,839,360** (**23.33 GB**) — **3.0× physical RAM**
- Pagefile `C:\pagefile.sys`: Allocated = **18,913 MB**; CurrentUsage = **4,088 MB**; PeakUsage = **5,940 MB**; `% Usage` Sample B = **32.21%**
- Pages/sec Sample B = **10,850.36** (severe hard-page thrash; healthy idle is typically << 1,000)

DISK/I/O:
- C: **474.72 GB** total, **229.33 GB** free (**51.7%** used) — not a free-space problem
- Sample A (thrash spike): Disk Bytes/sec = **180,598,958.69** (~**172 MB/s**); Avg. Disk Queue Length = **20.84**; `% Disk Time` = **2083.95** (counter saturation / queued I/O)
- Sample B: Disk Bytes/sec = **43,805,961.97** (~**41.8 MB/s**); Avg. Disk Queue Length = **1.52**
- Disk is not full; it is being used as swap backing because RAM is exhausted.

ACTIVE RESEARCH PROCESSES:
- **3 concurrent** live `scripts/test-live-replay-parity.ts` workers (plus npm/npx/tsx wrapper trees)
- Instantaneous CPU (Sample B, `% Processor Time` per process): PID 20968 = **81**, PID 13192 = **81**, PID 9340 = **77** → **239** of 800 logical-CPU units (~**30% of the whole machine**)
- Working set at that instant: 159 + 407.6 + 493 = **~1,060 MB** resident; private bytes 666.9 + 496.7 + 751.4 = **~1,915 MB** committed
- Wrapper count matching `test-live-replay-parity` in command lines: **15** processes (3 real workers + npm/npx/tsx/cmd parents)
- `buildMarketContextAt` is **not** a standalone process; it is invoked inside those replay-parity scripts
- No `npm run supervisor -- --live --autonomous` process was running (earlier live-loop terminal `109333.txt` status=succeeded)

ACTIVE CURSOR AGENTS:
- **1** Cursor application (main PID 6260, started 07:09:49)
- **23** `Cursor.exe` processes (renderer, GPU, network, multiple `node.mojom.NodeService` utilities, language servers)
- Two inspect-port NodeService hosts: PID **1224** (extension host, started 07:48:37) and PID **14984**
- Concurrent agent-launched shells (inferred from parent PID 1224 / separate PowerShell parents): at least **3** live-replay tasks + this audit + a `npx tsx -e` desk-pipeline one-liner (`352942.txt`)
- OS cannot count Cursor chat tabs; **measured concurrent heavy agent tasks ≥ 3 research runners**

LONG-RUNNING TASKS:
1. `npm.cmd run supervisor:pickup -- --watch` — terminal `846530.txt`, PID 4804, started **07:56:06 UTC / 08:56:06 local**, running_for_ms **19,933,077** (~5.5 h). Worker node PID **8816** still alive. CPU total **12.3 sec** over 5.5 h. WS **~3–5 MB**. Idle watcher.
2. `npx next start -p 3010` — node PID **22540**, started **12:22:09**. Private **457 MB**, WS collapsed to **1.2 MB** (paged out). CPU total **807.7 sec**, then idle in Sample B (0%).
3. `next dev` → `next/dist/server/lib/start-server.js` — node PID **22124**, started **13:14:31**. Private **2,233.2 MB**, WS **8–34 MB** (heavily paged out). CPU total **1,255.4 sec**, then idle in Sample B (0%).
4. `npm run test:live-replay-parity` — terminal `630319.txt`, PID 9092, started **13:09:11 UTC / 14:09:11 local**, running_for_ms **1,143,776** (~19 min). Worker PID **20968**. HOT.
5. `npx tsx scripts/test-live-replay-parity.ts` — terminal `630320.txt`, PID 22120, started **13:19:58 UTC / 14:19:58 local**, running_for_ms **501,732** (~8.4 min). Worker PID **13192**. HOT.
6. Third `npx tsx scripts/test-live-replay-parity.ts` — worker PID **9340**, parent chain from PID 24496 (Cursor extension-host shell). HOT. Not in the pre-audit terminal list as a named long-runner; started during this window (~14:24).
7. TypeScript language servers (Cursor helpers): PID **23392** private **758–781 MB**, PID **9916** private **247 MB**. Sample B CPU **0%** (paged / idle).
8. Cursor UI itself since **07:09:49** (~7.3 h): renderer PID 3076 cumulative CPU **18,173–18,213 sec** (~5.0 CPU-hours).

BIGGEST RESOURCE CONSUMER:
- **Right now (instant CPU):** three `test-live-replay-parity.ts` workers (**81+81+77**) plus Cursor renderer PID 3076 (**106**) plus Cursor GPU PID 6820 (**72**). Combined **417 / 800** logical-CPU units.
- **Right now (RAM / commit):** Cursor family **1,793 MB WS / 4,418 MB private**; node family **843 MB WS / 5,910 MB private**. Together **~10.3 GB private** on a **7.7 GB** machine → pagefile.
- **Single fattest private node:** `next dev` start-server PID 22124 = **2,233 MB private** (almost entirely swapped).
- **Single fattest live CPU+RAM:** Cursor renderer PID 3076 = **106% CPU**, **978–1,243 MB WS**, **1,950–2,056 MB private**.
- **Cumulative CPU since boot (not current rate):** Cursor renderer 3076 **18,212 sec**; Cursor GPU 6820 **13,970 sec**; Spotify 4112 **6,241 sec**; chrome 14040 **4,809 sec**.

LIKELY CAUSE OF CURSOR SLOWNESS:
**RAM exhaustion + hard paging, with CPU already at ~99%.** Cursor’s renderer is competing with **three concurrent historical-replay parity tests** (each calling into market-context / replay code including `buildMarketContextAt`) on an **8 GB / 8-thread i3-1315U**. Committed memory is **23.3 GB**. Pages/sec **10,850**. Next.js `dev` + `start` servers add **~2.7 GB** more commit even while swapped and idle. Cursor feels slow because the OS is swapping the editor’s working set in and out while three replay workers pin ~2.4 cores and Defender (`MsMpEng` **53%** CPU, **256 MB WS**) scans the same disk.

CONFIDENCE:
**High (90%)** for CPU, RAM, paging, process identity, and “research concurrency is actively hurting Cursor.”
**Medium-high (75%)** for exact Cursor chat-agent count (inferred from shells, not the Cursor UI).
**High** that folder size / indexing of `data/research` is **not** the primary cause (see sizes below).

---

## 1. Active Cursor / agent processes

| PID | Role (from CommandLine) | CPU sec (lifetime) | WS MB | Private MB | Start |
|-----|-------------------------|--------------------|-------|------------|-------|
| 6260 | Cursor main | 1655.7 | 82–125 | 217–220 | 07:09:49 |
| 3076 | renderer | 18172–18213 | 401–1243 | 1933–2056 | 07:10:09 |
| 6820 | gpu-process | 13945–13970 | 59–72 | 249–251 | 07:10:08 |
| 1224 | extension host (NodeService, inspect-port=0) | 2413–2422 | 118–301 | 607–628 | 07:48:37 |
| 14984 | NodeService inspect-port=0 | 1049.8 | 86–147 | 305–308 | 07:10:11 |
| 15636 | NodeService | 364.1 | 41–44 | 97.5 | 07:10:12 |
| others | crashpad, network, audio, html/json LS, gitWorker | small | | | |

**Totals:** 23 Cursor.exe; WS **1,792.6 MB**; private **4,418 MB**; lifetime CPU **38,005.9 sec**.

Language servers (node helpers, not Cursor.exe):
- PID 23392 `tsserver.js` `--max-old-space-size=3072` — private **758–781 MB**, WS 21–167 MB, Sample B CPU 0%
- PID 9916 `tsserver.js` partialSemantic — private **247 MB**, Sample B CPU 0%

No separate Cursor indexing process. Windows `SearchIndexer` PID 11156 WS **5 MB**; `SearchHost` PID 9804 WS **8.4 MB**. Workspace indexing, if active, is inside the renderer / extension host, not a distinct hog.

---

## 2. Active Node / npm processes

**23 node.exe**; WS **842.6 MB**; private **5,910.3 MB**; lifetime CPU **2,930 sec**.

Identified command lines:

| PID | Command | WS MB (range) | Private MB | Notes |
|-----|---------|---------------|------------|-------|
| 22124 | `next/dist/server/lib/start-server.js` (`next dev`) | 8–326 | **2233–2727** | started 13:14:31; swapped; Sample B CPU 0% |
| 22540 | `next start -p 3010` | 1–184 | 425–457 | started 12:22:09; swapped; Sample B CPU 0% |
| 20968 | `tsx … scripts/test-live-replay-parity.ts` | 133–506 | 667–669 | HOT 81% |
| 13192 | same script (2nd copy) | 188–553 | 304–620 | HOT 81% |
| 9340 | same script (3rd copy) | 160–577 | 251–751 | HOT 77% |
| 8816 | `tsx … scripts/supervisor-pickup.ts --watch` | 3–5 | 64.5 | idle; 12.3 CPU-sec since 08:56 |
| 23392 | tsserver max-old-space 3072 | 54–167 | 758–781 | idle now |
| 9916 | tsserver partialSemantic | 0–57 | 247 | idle now |
| wrappers | npm/npx/tsx/cmd parents for the above | ~0 | 47–107 each | 15 replay-parity cmdlines total |

`npm run dev` is **yes** (`next dev` start-server 22124). `next start -p 3010` is **also** yes. Both coexist.

---

## 3. Research / replay processes

**Yes — three overlapping live-replay-parity runs, all calling the same historical replay / market-context path.**

Pre-audit terminals still `status: running`:
- `630319.txt` — `npm run test:live-replay-parity` since 14:09:11 local (~19+ min)
- `630320.txt` — `npx tsx scripts/test-live-replay-parity.ts` since 14:19:58 local (~8+ min)
- Third worker PID 9340 started ~14:24 from another Cursor shell (`npx tsx scripts/test-live-replay-parity.ts`)

No standalone `buildMarketContextAt` PID. That function runs **inside** these three Node workers.

No `test:research-*` / `research-liquidity-*` process in the live CIM snapshot. Earlier research terminals (Yahoo screening, Aug 12 PIT liquidity) are **succeeded/failed**, not running.

---

## 4–6. CPU / RAM / Disk (raw)

See Headline numbers. Extra per-process CPU (Win32_PerfFormattedData, Sample B):

| Name | PID | % Processor Time | WS MB | Private MB |
|------|-----|------------------|-------|------------|
| Cursor#4 (renderer) | 3076 | **106** | 977.6 | 1950.2 |
| node#15 (replay) | 20968 | **81** | 159 | 666.9 |
| node#18 (replay) | 13192 | **81** | 407.6 | 496.7 |
| node#21 (replay) | 9340 | **77** | 493 | 751.4 |
| Cursor#2 (GPU) | 6820 | **72** | 62.3 | 250.2 |
| chrome#8 | 14040 | 57 | 94.2 | 733.2 |
| MsMpEng (Defender) | 4748 | 53 | 256.3 | 601 |
| System | 4 | 24 | 0.4 | 0.1 |
| Spotify#5 | 4112 | 24 | 75.2 | 309.6 |
| Cursor#14 (ext host) | 1224 | 9 | 238.4 | 625.9 |

Other app groups (Sample B):
- chrome 14 procs: WS 316.1 MB, private 1,774.9 MB, lifetime CPU 11,294 sec
- Spotify 7 procs: WS 164 MB, lifetime CPU 7,490 sec
- Discord 6 procs: WS 102.5 MB
- Notion 8 procs: WS 39.2 MB
- powershell 23 procs: WS 467 MB (includes this audit)

---

## 7. Concurrent agents / tasks

Measured, not guessed:
- **3** concurrent `test-live-replay-parity` workers
- **1** supervisor pickup watcher (idle)
- **2x Next.js servers (`dev` + `start -p 3010`), both paged out
- **1** Cursor app / **23** Cursor processes / **2** extension-host-like NodeService processes
- **≥1** extra agent shell running `npx tsx -e` desk-pipeline voice text (`352942.txt`, still running at audit start)
- This audit itself: many parallel PowerShell CIM queries

---

## 8. Long-running terminals (metadata)

Folder: `C:\Users\adamg\.cursor\projects\c-Users-adamg-Projects-desk-copilot\terminals`

Pre-audit still `status: running` (filtered; audit’s own shells omitted):

| File | pid | started_at (UTC) | running_for_ms | title / command |
|------|-----|------------------|----------------|-----------------|
| 846530.txt | 4804 | 2026-08-14T07:56:06.817Z | 19,933,077 | Start supervisor inbox watch daemon / `npm.cmd run supervisor:pickup -- --watch` |
| 630319.txt | 9092 | 2026-08-14T13:09:11.107Z | 1,143,776 | Run live vs replay parity tests / `npm run test:live-replay-parity` |
| 630320.txt | 22120 | 2026-08-14T13:19:58.161Z | 501,732 | Run optimized live-replay parity tests / `npx tsx scripts/test-live-replay-parity.ts` |
| 352942.txt | 24336 | 2026-08-14T13:24:39.045Z | 86,582+ | Print updated wait-fixture voice text / `npx tsx -e` desk-pipeline |

Dozens of other terminals exist but are succeeded/failed (research scripts, builds, probes). They are not live CPU.

Supervisor PID check requested: **npm-watch chain still running**. powershell **4804** alive (parent Cursor 1224). node worker **8816** alive (CPU 12.3 sec, WS ~3 MB). Harmless compared with replay workers.

---

## 9. Background watchers

| Watcher | Running? | Resource |
|---------|----------|----------|
| `supervisor:pickup --watch` | **YES** (PIDs 4804 → 7076 npm → 10120 → 8384 npx → 22480 tsx → **8816**) | idle, ~5 MB WS, 12 CPU-sec / 5.5 h |
| `npm run supervisor -- --live --autonomous` | **NO** (terminal 109333 succeeded) | — |
| `next dev` | **YES** PID 22124 | **2.2 GB private**, swapped |
| `next start -p 3010` | **YES** PID 22540 | **457 MB private**, swapped |
| tsserver (2) | **YES** | 247 + 758 MB private, CPU 0% now |
| npm/file watchers from Next | implied by `next dev` | not separately measured |

---

## 10. Cursor workspace / indexing

Observable:
- No dedicated Cursor indexer process with large CPU/RAM
- Windows SearchIndexer **5 MB**
- tsserver allowed `--max-old-space-size=3072` (3 GB cap) — private **758 MB** on the semantic server
- Extension host PID 1224 WS **118–301 MB**
- Git SCM was actively running `git diff HEAD --numstat` from Cursor during the sample (PIDs 24544 / 8284)

Not observable from OS: Cursor’s internal file-index job state. Given folder sizes below, indexing **data/research** is unlikely to be the bottleneck versus paging + 3x replay workers.

---

## 11. Large generated research files / logs

Sizes measured with recursive `Measure-Object Length` (count files, do not delete):

| Path | Files | Size |
|------|-------|------|
| `data/research` | 154 | **48.9 MB** (0.048 GB) |
| `data/supervisor` | 238 | **6.1 MB** |
| `agent-transcripts` | 575 | **43.6 MB** |
| `node_modules` | 11,047 | **351.2 MB** |
| `.next` | 189 | **214.5 MB** |
| `data` (all) | 423 | **57.4 MB** |

Largest files:
- `data/research/liquidity-quality-aug12/snapshots.jsonl` **44.97 MB** (one file; not being rewritten by a live process in this snapshot)
- `data/supervisor/executions.jsonl` **5.24 MB**
- largest agent-transcript **5.08 MB**; 575 transcript files is a moderate watcher set, not a multi-GB scan target

**Conclusion:** generated research logs are **small**. They are not the reason Cursor is slow. Repeated scanning of these folders would not explain 10,850 pages/sec or 99% CPU.

---

## 12. Processes consuming excessive resources

Excessive **relative to 8 GB / 8 threads**:

1. **Three concurrent `test-live-replay-parity.ts`** — 239% CPU-units, ~1.9 GB private. This is the incremental research load.
2. **Cursor renderer 3076** — 106% CPU, ~1–2 GB. Expected for a busy IDE, unaffordable while (1) is running.
3. **`next dev` PID 22124** — **2.2 GB private** sitting in pagefile. Not burning CPU now; it **is** burning commit and causing swap.
4. **`next start -p 3010` PID 22540** — 457 MB private, swapped. Duplicate local server.
5. **tsserver 23392** — 758 MB private, `--max-old-space-size=3072`.
6. **MsMpEng** — 53% CPU + 256 MB while disk is busy (antivirus amplifying thrash).
7. **Chrome + Spotify** — extra 57% + 24% CPU and ~0.5 GB WS; secondary, not primary.

---

## Direct answers (asked specifically)

| Question | Measured answer |
|----------|-----------------|
| Is `buildMarketContextAt` consuming significant resources? | **Indirectly yes** — no standalone PID; it runs inside **3** live `test-live-replay-parity.ts` workers that together use **~30% of CPU** and **~1.9 GB private**. |
| Historical replay? | **Yes. Three copies at once.** |
| Autonomous supervisor live loop? | **No.** Only `supervisor:pickup --watch`, idle. |
| Multiple Cursor agents? | **Yes, concurrent agent shells.** One Cursor app, multiple tasks (3x replay + other shells). |
| Test suites? | **Yes — the live-replay-parity suite, triplicated.** |
| npm processes? | **23 node + npm/npx wrappers.** Heavy ones listed above. |
| Are current research workloads slowing the overall project? | **Yes.** On this 7.7 GB machine they are the difference between “Cursor heavy but usable” and “99% CPU + hard paging.” Replay workers alone are ~2.4 cores. Combined with Cursor + two Next servers, committed memory is 23 GB. Pages/sec 10,850 means the IDE is waiting on disk. Research jobs also slow each other (three copies of the same suite). |

---

## Smallest change to restore Cursor responsiveness

**Do not stop anything in this audit. Recommendation only:**

**Smallest high-leverage change:** run **at most one** `test:live-replay-parity` / historical replay at a time. Right now copies 2 and 3 are duplicate work on an 8 GB box. Dropping from 3 to 1 would free ~**160 CPU-units** (~1.6 cores) and ~**1.2–1.5 GB** private immediately, and cut Defender/disk contention.

**Next-smallest if still thrashing:** stop the unused local Next server. If you are not hitting localhost:3010, stop `next start -p 3010` (457 MB commit). If you are not iterating the web app, stop `next dev` (**2.2 GB commit**, currently swapped). Do **not** stop `supervisor:pickup --watch` for performance — it is idle (~5 MB).

**Do not** look to deleting `data/research` or transcripts for relief; they are 49 MB + 44 MB.

**Do not** expect Cursor to feel normal while committed memory stays ~3x RAM. The i3-1315U + 8 GB cannot host: Cursor + 2x Next + 3x replay + Chrome + Spotify concurrently.

---

## What was not done (per instructions)

- No Karen logic changes
- No backtest / code optimization
- No process kills
- No research-run termination
- No production / deploy / commit / push
