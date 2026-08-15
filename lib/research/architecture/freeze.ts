/**
 * Freeze production architecture-v1 as the research baseline.
 * Do not mutate this snapshot when experimenting with v2/v3 overlays.
 */

import { ARCHITECTURE_SNAPSHOTS, architectureSnapshot } from "./versions";
import type { FrozenArchitectureSnapshot } from "./types";

export const PRODUCTION_BASELINE_ID = "architecture-v1" as const;

/** Frozen copy of production rules — identity overlay, weights none. */
export const FROZEN_PRODUCTION_BASELINE: FrozenArchitectureSnapshot = Object.freeze({
  ...architectureSnapshot("architecture-v1"),
});

export function assertProductionBaselineFrozen(): string[] {
  const errors: string[] = [];
  const v1 = ARCHITECTURE_SNAPSHOTS["architecture-v1"];
  if (!v1.production) errors.push("architecture-v1 must be marked production");
  if (v1.overlay !== "identity") errors.push("architecture-v1 overlay must be identity");
  if (v1.weights !== "none") errors.push("architecture-v1 must not invent weights");
  if (ARCHITECTURE_SNAPSHOTS["architecture-v2"].production) {
    errors.push("architecture-v2 must not be marked production");
  }
  if (ARCHITECTURE_SNAPSHOTS["architecture-v3"].production) {
    errors.push("architecture-v3 must not be marked production");
  }
  if (FROZEN_PRODUCTION_BASELINE.id !== PRODUCTION_BASELINE_ID) {
    errors.push("frozen baseline id mismatch");
  }
  return errors;
}
