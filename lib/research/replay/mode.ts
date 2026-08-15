/**
 * Research replay context build mode — explicit CURRENT | OPTIMIZED.
 * Default CURRENT until strict parity passes on controlled benchmarks.
 */

export type ResearchReplayMode = "CURRENT" | "OPTIMIZED";

export const DEFAULT_RESEARCH_REPLAY_MODE: ResearchReplayMode = "CURRENT";

const VALID: ResearchReplayMode[] = ["CURRENT", "OPTIMIZED"];

export function parseResearchReplayMode(raw: string | undefined | null): ResearchReplayMode | null {
  if (!raw) return null;
  const u = raw.trim().toUpperCase();
  if (u === "CURRENT" || u === "OPTIMIZED") return u;
  return null;
}

/** Env `RESEARCH_REPLAY_MODE` or CLI `--mode CURRENT|OPTIMIZED`; defaults to CURRENT. */
export function resolveResearchReplayMode(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv.slice(2)
): ResearchReplayMode {
  const flagIdx = argv.indexOf("--mode");
  if (flagIdx >= 0) {
    const parsed = parseResearchReplayMode(argv[flagIdx + 1]);
    if (parsed) return parsed;
    throw new Error(`Invalid --mode (expected CURRENT | OPTIMIZED), got: ${argv[flagIdx + 1] ?? ""}`);
  }
  const fromEnv = parseResearchReplayMode(env.RESEARCH_REPLAY_MODE);
  if (fromEnv) return fromEnv;
  return DEFAULT_RESEARCH_REPLAY_MODE;
}

export function assertResearchReplayMode(mode: string): asserts mode is ResearchReplayMode {
  if (!VALID.includes(mode as ResearchReplayMode)) {
    throw new Error(`Invalid research replay mode: ${mode}`);
  }
}
