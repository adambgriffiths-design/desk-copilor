/**
 * Load TICKSTREAM_* into process.env (no secret logging).
 * Portable discovery via lib/karen-env — no hardcoded desktop paths.
 */
import { loadTickstreamEnv } from "../lib/karen-env";

export function loadTickstreamEnvFromRoot(): {
  keyConfigured: boolean;
  apiUrl: string | null;
  envPathTried: string[];
} {
  const r = loadTickstreamEnv();
  return {
    keyConfigured: r.keyConfigured,
    apiUrl: r.apiUrl,
    envPathTried: r.envPathTried,
  };
}
