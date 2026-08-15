/**
 * Adaptive parallel concurrency — scale workers from machine pressure and throughput.
 */
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { ensureSupervisorDataRoot, SUPERVISOR_DATA_ROOT } from "./paths";
import type { SupervisorTask } from "./types";

export const ADAPTIVE_CONFIG_FILENAME = "adaptive-config.json";

export interface AdaptiveConcurrencyConfig {
  version: 1;
  minParallel: number;
  maxParallel: number;
  /** Do not launch new workers when CPU usage exceeds this (%). */
  cpuLimitPct: number;
  /** Do not launch new workers when RAM usage exceeds this (%). */
  ramLimitPct: number;
  /** Scale up when CPU below this and other conditions met. */
  scaleUpThresholdCpu: number;
  /** Scale up when RAM below this (% used). */
  scaleUpThresholdRam: number;
  /** Scale down when CPU above this. */
  scaleDownThresholdCpu: number;
  /** Scale down when RAM above this (% used). */
  scaleDownThresholdRam: number;
  /** Consecutive comfortable batches before scale-up after pressure. */
  recoveryStableBatches: number;
  /** Learned optimal from benchmark (persisted). */
  optimalParallel?: number;
  /** ISO timestamp of last benchmark / re-eval. */
  lastBenchmarkAt?: string;
  updatedAt: string;
}

export interface MachineMetrics {
  timestamp: string;
  cpuCores: number;
  cpuThreads: number;
  cpuUsagePct: number;
  totalRamMb: number;
  freeRamMb: number;
  ramUsagePct: number;
  source: "os" | "wmi" | "injected";
}

export interface AdaptiveScaleDecision {
  currentParallel: number;
  effectiveParallel: number;
  action: "hold" | "scale_up" | "scale_down" | "pressure_hold" | "recovery";
  reason: string;
  metrics: MachineMetrics;
  launchBlocked: boolean;
}

export interface AdaptiveBatchOutcome {
  tasksLaunched: number;
  tasksCompleted: number;
  tasksFailed: number;
  tasksBlocked: number;
  averageTaskDurationMs: number;
  parallelismLevel: number;
}

const DEFAULT_CONFIG: AdaptiveConcurrencyConfig = {
  version: 1,
  minParallel: 1,
  maxParallel: 3,
  cpuLimitPct: 90,
  ramLimitPct: 92,
  scaleUpThresholdCpu: 65,
  scaleUpThresholdRam: 75,
  scaleDownThresholdCpu: 82,
  scaleDownThresholdRam: 85,
  recoveryStableBatches: 2,
  updatedAt: new Date(0).toISOString(),
};

let lastCpuSample: { idle: number; total: number; at: number } | undefined;

function adaptiveConfigPath(root: string): string {
  return path.join(root, ADAPTIVE_CONFIG_FILENAME);
}

function envInt(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

function applyEnvOverrides(config: AdaptiveConcurrencyConfig): AdaptiveConcurrencyConfig {
  const next = { ...config };
  const min = envInt("SUPERVISOR_MIN_PARALLEL");
  const max = envInt("SUPERVISOR_MAX_PARALLEL");
  const cpuLimit = envInt("SUPERVISOR_CPU_LIMIT");
  const ramLimit = envInt("SUPERVISOR_RAM_LIMIT");
  if (min !== undefined) next.minParallel = Math.max(1, min);
  if (max !== undefined) next.maxParallel = Math.max(next.minParallel, max);
  if (cpuLimit !== undefined) next.cpuLimitPct = cpuLimit;
  if (ramLimit !== undefined) next.ramLimitPct = ramLimit;
  return next;
}

function isValidConfig(raw: unknown): raw is AdaptiveConcurrencyConfig {
  if (!raw || typeof raw !== "object") return false;
  const c = raw as AdaptiveConcurrencyConfig;
  return (
    c.version === 1 &&
    typeof c.minParallel === "number" &&
    typeof c.maxParallel === "number" &&
    c.minParallel >= 1 &&
    c.maxParallel >= c.minParallel
  );
}

export function loadAdaptiveConfig(root: string = SUPERVISOR_DATA_ROOT): AdaptiveConcurrencyConfig {
  const primary = adaptiveConfigPath(root);
  if (fs.existsSync(primary)) {
    try {
      const raw = JSON.parse(fs.readFileSync(primary, "utf8"));
      if (isValidConfig(raw)) return applyEnvOverrides(raw);
    } catch {
      /* fall through */
    }
  }
  return applyEnvOverrides({ ...DEFAULT_CONFIG, updatedAt: new Date().toISOString() });
}

export function saveAdaptiveConfig(
  patch: Partial<AdaptiveConcurrencyConfig>,
  root: string = SUPERVISOR_DATA_ROOT,
): AdaptiveConcurrencyConfig {
  ensureSupervisorDataRoot(root);
  const current = loadAdaptiveConfig(root);
  const next: AdaptiveConcurrencyConfig = {
    ...current,
    ...patch,
    version: 1,
    minParallel: Math.max(1, patch.minParallel ?? current.minParallel),
    maxParallel: Math.max(
      patch.minParallel ?? current.minParallel,
      patch.maxParallel ?? current.maxParallel,
    ),
    updatedAt: new Date().toISOString(),
  };
  const target = adaptiveConfigPath(root);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  try {
    fs.renameSync(tmp, target);
  } catch {
    if (fs.existsSync(target)) fs.unlinkSync(target);
    fs.renameSync(tmp, target);
  }
  return next;
}

function cpuUsageFromTimes(): number {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const t of Object.values(cpu.times)) total += t;
    idle += cpu.times.idle;
  }
  const now = Date.now();
  if (!lastCpuSample) {
    lastCpuSample = { idle, total, at: now };
    return 0;
  }
  const idleDelta = idle - lastCpuSample.idle;
  const totalDelta = total - lastCpuSample.total;
  lastCpuSample = { idle, total, at: now };
  if (totalDelta <= 0) return 0;
  const usage = (1 - idleDelta / totalDelta) * 100;
  return Math.max(0, Math.min(100, Math.round(usage * 10) / 10));
}

function tryWmiMetrics(): Partial<MachineMetrics> | null {
  if (process.platform !== "win32") return null;
  try {
    const out = execSync(
      "powershell -NoProfile -Command \"(Get-CimInstance Win32_OperatingSystem | Select-Object -First 1 TotalVisibleMemorySize,FreePhysicalMemory | ConvertTo-Json -Compress)\"",
      { encoding: "utf8", timeout: 8000, stdio: ["pipe", "pipe", "ignore"] },
    ).trim();
    if (!out) return null;
    const parsed = JSON.parse(out) as { TotalVisibleMemorySize?: number; FreePhysicalMemory?: number };
    const totalKb = parsed.TotalVisibleMemorySize ?? 0;
    const freeKb = parsed.FreePhysicalMemory ?? 0;
    if (totalKb <= 0) return null;
    const totalRamMb = Math.round(totalKb / 1024);
    const freeRamMb = Math.round(freeKb / 1024);
    return {
      totalRamMb,
      freeRamMb,
      ramUsagePct: Math.round((1 - freeKb / totalKb) * 1000) / 10,
      source: "wmi",
    };
  } catch {
    return null;
  }
}

/** One-shot host profile (benchmark / report). Avoid in hot dispatch loops. */
export function sampleMachineProfile(): MachineMetrics {
  const wmi = tryWmiMetrics();
  return sampleMachineMetrics(
    wmi
      ? {
          totalRamMb: wmi.totalRamMb,
          freeRamMb: wmi.freeRamMb,
          ramUsagePct: wmi.ramUsagePct,
          cpuUsagePct: cpuUsageFromTimes(),
        }
      : undefined,
  );
}

export function sampleMachineMetrics(injected?: Partial<MachineMetrics>): MachineMetrics {
  if (injected?.cpuUsagePct !== undefined && injected.ramUsagePct !== undefined) {
    const totalRamMb = injected.totalRamMb ?? Math.round(os.totalmem() / (1024 * 1024));
    const freeRamMb =
      injected.freeRamMb ?? Math.round((totalRamMb * (100 - injected.ramUsagePct)) / 100);
    return {
      timestamp: new Date().toISOString(),
      cpuCores: injected.cpuCores ?? os.cpus().length,
      cpuThreads: injected.cpuThreads ?? os.cpus().length,
      cpuUsagePct: injected.cpuUsagePct,
      totalRamMb,
      freeRamMb,
      ramUsagePct: injected.ramUsagePct,
      source: "injected",
    };
  }

  const totalRamMb = injected?.totalRamMb ?? Math.round(os.totalmem() / (1024 * 1024));
  const freeRamMb =
    injected?.freeRamMb ?? Math.round(os.freemem() / (1024 * 1024));
  const ramUsagePct =
    injected?.ramUsagePct ??
    Math.round((1 - freeRamMb / Math.max(1, totalRamMb)) * 1000) / 10;

  return {
    timestamp: new Date().toISOString(),
    cpuCores: injected?.cpuCores ?? os.cpus().length,
    cpuThreads: injected?.cpuThreads ?? os.cpus().length,
    cpuUsagePct: injected?.cpuUsagePct ?? cpuUsageFromTimes(),
    totalRamMb,
    freeRamMb,
    ramUsagePct,
    source: injected ? "injected" : "os",
  };
}

export function resetCpuSampleCache(): void {
  lastCpuSample = undefined;
}

export class AdaptiveConcurrencyController {
  private config: AdaptiveConcurrencyConfig;
  private currentParallel: number;
  private recoveryBatches = 0;
  private underPressure = false;

  constructor(
    private root: string = SUPERVISOR_DATA_ROOT,
    initialConfig?: AdaptiveConcurrencyConfig,
  ) {
    this.config = initialConfig ?? loadAdaptiveConfig(root);
    const start =
      this.config.optimalParallel ??
      Math.min(this.config.maxParallel, Math.max(this.config.minParallel, 1));
    this.currentParallel = clampParallel(start, this.config);
  }

  getConfig(): AdaptiveConcurrencyConfig {
    return { ...this.config };
  }

  getCurrentParallel(): number {
    return this.currentParallel;
  }

  isUnderPressure(): boolean {
    return this.underPressure;
  }

  shouldLaunchNewWorkers(metrics: MachineMetrics): boolean {
    if (metrics.cpuUsagePct >= this.config.cpuLimitPct) return false;
    if (metrics.ramUsagePct >= this.config.ramLimitPct) return false;
    return true;
  }

  evaluate(metrics: MachineMetrics, runningCount = 0): AdaptiveScaleDecision {
    const launchBlocked = !this.shouldLaunchNewWorkers(metrics);
    const pressure =
      metrics.cpuUsagePct >= this.config.scaleDownThresholdCpu ||
      metrics.ramUsagePct >= this.config.scaleDownThresholdRam ||
      launchBlocked;

    let action: AdaptiveScaleDecision["action"] = "hold";
    let reason = "resources within target band";

    if (pressure) {
      this.underPressure = true;
      this.recoveryBatches = 0;
      if (this.currentParallel > this.config.minParallel) {
        this.currentParallel = Math.max(this.config.minParallel, this.currentParallel - 1);
        action = "scale_down";
        reason = `pressure cpu=${metrics.cpuUsagePct}% ram=${metrics.ramUsagePct}%`;
      } else {
        action = "pressure_hold";
        reason = `at minParallel under pressure cpu=${metrics.cpuUsagePct}% ram=${metrics.ramUsagePct}%`;
      }
    } else if (this.underPressure) {
      this.recoveryBatches++;
      if (this.recoveryBatches >= this.config.recoveryStableBatches) {
        this.underPressure = false;
        this.recoveryBatches = 0;
        action = "recovery";
        reason = "pressure cleared — resuming adaptive scale";
      } else {
        action = "recovery";
        reason = `recovery ${this.recoveryBatches}/${this.config.recoveryStableBatches} stable batches`;
      }
    } else if (
      this.currentParallel < this.config.maxParallel &&
      metrics.cpuUsagePct <= this.config.scaleUpThresholdCpu &&
      metrics.ramUsagePct <= this.config.scaleUpThresholdRam
    ) {
      this.currentParallel = Math.min(this.config.maxParallel, this.currentParallel + 1);
      action = "scale_up";
      reason = `comfortable cpu=${metrics.cpuUsagePct}% ram=${metrics.ramUsagePct}%`;
    }

    const headroom = Math.max(0, this.currentParallel - runningCount);
    const effectiveParallel = launchBlocked ? runningCount : runningCount + headroom;

    return {
      currentParallel: this.currentParallel,
      effectiveParallel: Math.max(this.config.minParallel, effectiveParallel || this.currentParallel),
      action,
      reason,
      metrics,
      launchBlocked,
    };
  }

  recordBatchOutcome(outcome: AdaptiveBatchOutcome, metrics: MachineMetrics): AdaptiveScaleDecision {
    const failedRatio =
      outcome.tasksLaunched > 0 ? outcome.tasksFailed / outcome.tasksLaunched : 0;
    if (failedRatio >= 0.5 && this.currentParallel > this.config.minParallel) {
      this.currentParallel = Math.max(this.config.minParallel, this.currentParallel - 1);
      this.underPressure = true;
      this.recoveryBatches = 0;
    }
    return this.evaluate(metrics, outcome.parallelismLevel);
  }

  persistOptimal(parallel: number): AdaptiveConcurrencyConfig {
    const optimal = clampParallel(parallel, this.config);
    this.config = saveAdaptiveConfig(
      { optimalParallel: optimal, lastBenchmarkAt: new Date().toISOString() },
      this.root,
    );
    this.currentParallel = optimal;
    return this.config;
  }

  reload(): void {
    this.config = loadAdaptiveConfig(this.root);
    const start =
      this.config.optimalParallel ??
      Math.min(this.config.maxParallel, Math.max(this.config.minParallel, 1));
    this.currentParallel = clampParallel(start, this.config);
  }
}

function clampParallel(n: number, config: AdaptiveConcurrencyConfig): number {
  return Math.max(config.minParallel, Math.min(config.maxParallel, n));
}

/** Synthetic benchmark tasks — clearly labeled, disjoint read-only scopes. */
export function syntheticBenchmarkTasks(): SupervisorTask[] {
  return [
    {
      id: "bench-ro-supervisor",
      title: "[SYNTHETIC BENCHMARK] Read-only supervisor audit",
      prompt: "[SYNTHETIC BENCHMARK] READ-ONLY audit lib/supervisor/. Report only.",
      category: "audit",
      allowedPaths: ["lib/supervisor/"],
      priority: 1,
      confidence: 1,
    },
    {
      id: "bench-ro-research-replay",
      title: "[SYNTHETIC BENCHMARK] Read-only replay audit",
      prompt: "[SYNTHETIC BENCHMARK] READ-ONLY audit lib/research/replay/. Report only.",
      category: "audit",
      allowedPaths: ["lib/research/replay/"],
      priority: 2,
      confidence: 1,
    },
    {
      id: "bench-ro-research-dataset",
      title: "[SYNTHETIC BENCHMARK] Read-only dataset audit",
      prompt: "[SYNTHETIC BENCHMARK] READ-ONLY audit lib/research/dataset/. Report only.",
      category: "diagnostic",
      allowedPaths: ["lib/research/dataset/"],
      priority: 3,
      confidence: 1,
    },
    {
      id: "bench-ro-scripts-research",
      title: "[SYNTHETIC BENCHMARK] Read-only scripts audit",
      prompt: "[SYNTHETIC BENCHMARK] READ-ONLY audit scripts/research-run-replay.ts. Report only.",
      category: "diagnostic",
      allowedPaths: ["scripts/research-run-replay.ts"],
      priority: 4,
      confidence: 1,
    },
  ];
}

export function getAdaptiveConcurrencyDocumentation(): string {
  return [
    "## Adaptive parallel concurrency",
    "- Config: data/supervisor/adaptive-config.json (+ SUPERVISOR_* env overrides)",
    "- Scales minParallel..maxParallel from CPU/RAM pressure and batch outcomes",
    "- Under pressure: stop launching new workers; active tasks finish; scale down",
    "- Persists optimalParallel from benchmark for future runs",
    "- Respects scheduler blocks: dependsOn, path conflicts, verifyScript serialization",
  ].join("\n");
}
