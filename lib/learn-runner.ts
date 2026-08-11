import OpenAI from "openai";
import { readFeedbackForLearning } from "@/lib/feedback-store";
import {
  aggregateConceptErrors,
  buildFailureDigest,
  buildMissDigest,
  mergeLearnedRules,
} from "@/lib/learning-engine";
import { LEARN_SYSTEM_PROMPT, type LearnResult } from "@/lib/learn-prompt";
import { readLearnedRules, writeLearnedRules } from "@/lib/learned-rules-store";
import {
  assertLearningAllowed,
  includeBacktestMissesInLearning,
  includeBacktestWrongInLearning,
  learnFromMisses,
} from "@/lib/learn-config";

export type LearnRunResult = {
  analysis: string;
  newRulesCount: number;
  newGraderRulesCount: number;
  version: number;
  graderVersion: number;
  sourceCount: number;
  failureCount: number;
  missCount: number;
};

export async function runLearnFromFeedback(): Promise<LearnRunResult> {
  assertLearningAllowed();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const includeBacktestWrong = includeBacktestWrongInLearning();
  const includeBacktestMisses = includeBacktestMissesInLearning();
  const fromMisses = learnFromMisses();

  const entries = await readFeedbackForLearning({
    includeBacktestWrong,
    includeBacktestMisses,
    learnFromMisses: fromMisses,
  });

  const failures = entries.filter(
    (e) => e.rating === "wrong" || e.rating === "partial"
  );
  const misses = entries.filter((e) => e.rating === "miss");
  const learnable = failures.length + (fromMisses ? misses.length : 0);

  if (learnable < 2) {
    throw new Error(
      "Need at least 2 learnable entries (wrong/partial/miss). Grade predict charts or rerun backtest to capture misses."
    );
  }

  const failureDigest = buildFailureDigest(entries);
  const missDigest = fromMisses ? buildMissDigest(entries) : "Miss learning disabled.";
  const conceptErrorCounts = aggregateConceptErrors([
    ...failures,
    ...(fromMisses ? misses : []),
  ]);
  const existing = await readLearnedRules();
  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1800,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: LEARN_SYSTEM_PROMPT },
      {
        role: "user",
        content: `## Sources
- Hand-graded predict/live: always
- Backtest wrong: ${includeBacktestWrong ? "included" : "excluded"}
- Backtest miss (under-calling): ${includeBacktestMisses && fromMisses ? "included" : "excluded"}

## Concept error counts
${JSON.stringify(conceptErrorCounts, null, 2)}

## Existing learned rules (avoid duplicates)
${existing.rules.map((r) => `- [${r.concept}] ${r.rule}`).join("\n") || "None yet"}

## Wrong / partial digest (fix bad calls)
${failureDigest}

## Miss digest (fix under-calling — stood aside when should have called)
${missDigest}

Generate rules that fix BOTH bad directional calls AND excessive stand-aside when tradeableBias + structure aligned.`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error("No learning output from model");

  const result = JSON.parse(raw) as LearnResult;
  const merged = mergeLearnedRules(existing, {
    rules: result.rules ?? [],
    promptAddendum: result.promptAddendum ?? "",
    conceptErrorCounts,
  });

  await writeLearnedRules(merged);

  return {
    analysis: result.analysis,
    newRulesCount: result.rules?.length ?? 0,
    newGraderRulesCount: 0,
    version: merged.version,
    graderVersion: 0,
    sourceCount: entries.length,
    failureCount: failures.length,
    missCount: misses.length,
  };
}
