import { NextResponse } from "next/server";
import {
  readAllFeedback,
  readFeedbackForLearning,
  isHandGradedEntry,
} from "@/lib/feedback-store";
import { aggregateConceptErrors } from "@/lib/learning-engine";
import { isLearnFrozen, includeBacktestWrongInLearning, includeBacktestMissesInLearning, learnFromMisses } from "@/lib/learn-config";
import { readLearnedRules } from "@/lib/learned-rules-store";
import { runLearnFromFeedback } from "@/lib/learn-runner";

export const runtime = "nodejs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function GET() {
  const learned = await readLearnedRules();
  const all = await readAllFeedback();
  const includeBacktestWrong = includeBacktestWrongInLearning();
  const includeBacktestMisses = includeBacktestMissesInLearning();
  const fromMisses = learnFromMisses();
  const eligible = await readFeedbackForLearning({
    includeBacktestWrong,
    includeBacktestMisses,
    learnFromMisses: fromMisses,
  });
  const conceptErrors = aggregateConceptErrors(eligible);
  const failures = eligible.filter((e) => e.rating === "wrong" || e.rating === "partial");
  const misses = eligible.filter((e) => e.rating === "miss");

  return NextResponse.json(
    {
      learned,
      conceptErrors,
      failureCount: failures.length,
      missCount: misses.length,
      learnableCount: failures.length + (fromMisses ? misses.length : 0),
      handGradedCount: all.filter(isHandGradedEntry).length,
      eligibleCount: eligible.length,
      backtestExcludedCount: all.length - eligible.length,
      learnFrozen: isLearnFrozen(),
      includeBacktestWrong,
      includeBacktestMisses,
    },
    { headers: cors }
  );
}

export async function POST() {
  try {
    const result = await runLearnFromFeedback();
    const learned = await readLearnedRules();
    return NextResponse.json(
      {
        analysis: result.analysis,
        newRulesCount: result.newRulesCount,
        version: result.version,
        failureCount: result.failureCount,
        missCount: result.missCount,
        learned,
      },
      { headers: cors }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message.includes("Need at least") || message.includes("paused") ? 400 : 500;
    return NextResponse.json({ error: message, learnFrozen: isLearnFrozen() }, { status, headers: cors });
  }
}
