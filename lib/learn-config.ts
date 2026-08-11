/** Set LEARN_FROZEN=true to pause rule updates. */
export function isLearnFrozen(): boolean {
  const v = process.env.LEARN_FROZEN?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/** Learn from "miss" rows (under-calling). Default: on. */
export function learnFromMisses(): boolean {
  const v = process.env.LEARN_FROM_MISSES?.trim().toLowerCase();
  if (v === "false" || v === "0" || v === "no") return false;
  return true;
}

/** Opt-in: include backtest "wrong" rows. Higher overfit risk. */
export function includeBacktestWrongInLearning(): boolean {
  const v = process.env.LEARN_INCLUDE_BACKTEST_WRONG?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/** Include backtest "miss" rows (stand aside when move happened). Default: on. */
export function includeBacktestMissesInLearning(): boolean {
  const v = process.env.LEARN_INCLUDE_BACKTEST_MISSES?.trim().toLowerCase();
  if (v === "false" || v === "0" || v === "no") return false;
  return true;
}

export class LearnFrozenError extends Error {
  constructor() {
    super(
      "Learning is paused (LEARN_FROZEN=true). Remove or set LEARN_FROZEN=false in .env.local to update rules."
    );
    this.name = "LearnFrozenError";
  }
}

export function assertLearningAllowed(): void {
  if (isLearnFrozen()) throw new LearnFrozenError();
}
