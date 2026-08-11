import type { FeedbackEntry, LearnedRulesFile } from "./feedback-types";

export function aggregateConceptErrors(entries: FeedbackEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of entries) {
    if (e.rating === "correct") continue;
    for (const c of e.failedConcepts ?? ["unknown"]) {
      counts[c] = (counts[c] ?? 0) + 1;
    }
  }
  return counts;
}

export function buildFailureDigest(entries: FeedbackEntry[]): string {
  const failures = entries.filter(
    (e) => e.rating === "wrong" || e.rating === "partial"
  );
  if (failures.length === 0) return "No wrong/partial entries.";

  return failures
    .slice(-15)
    .map((e, i) => {
      const concepts = e.failedConcepts?.join(", ") || "unknown";
      return `### Failure ${i + 1} (${e.rating}) — concepts: ${concepts}
Time: ${e.chartTime ?? "n/a"} EST
Verdict:
${e.verdict.trim()}
${e.failureReason ? `Failure reason: ${e.failureReason}` : ""}
${e.correction ? `Correction:\n${e.correction.trim()}` : ""}`;
    })
    .join("\n\n");
}

export function buildMissDigest(entries: FeedbackEntry[]): string {
  const misses = entries.filter((e) => e.rating === "miss");
  if (misses.length === 0) return "No miss entries.";

  return misses
    .slice(-15)
    .map((e, i) => {
      const concepts = e.failedConcepts?.join(", ") || "under_calling";
      return `### Miss ${i + 1} — concepts: ${concepts}
Time: ${e.chartTime ?? "n/a"} EST
Stood aside / low call:
${e.verdict.trim()}
${e.failureReason ? `Why miss: ${e.failureReason}` : ""}
${e.correction ? `Should have said:\n${e.correction.trim()}` : ""}`;
    })
    .join("\n\n");
}

const MAX_LEARNED_RULES = 8;
const MAX_NEW_RULES_PER_RUN = 3;

export function mergeLearnedRules(
  existing: LearnedRulesFile,
  incoming: {
    rules: Array<{ concept: string; rule: string; source: string }>;
    promptAddendum: string;
    conceptErrorCounts: Record<string, number>;
  }
): LearnedRulesFile {
  const seen = new Set(existing.rules.map((r) => `${r.concept}:${r.rule}`));
  const newRules = [...existing.rules];

  for (const r of incoming.rules.slice(0, MAX_NEW_RULES_PER_RUN)) {
    const key = `${r.concept}:${r.rule}`;
    if (!seen.has(key)) {
      seen.add(key);
      newRules.push({ ...r, addedAt: new Date().toISOString() });
    }
  }

  return {
    version: existing.version + 1,
    updatedAt: new Date().toISOString(),
    conceptErrorCounts: incoming.conceptErrorCounts,
    rules: newRules.slice(-MAX_LEARNED_RULES),
    promptAddendum: incoming.promptAddendum || existing.promptAddendum,
  };
}
