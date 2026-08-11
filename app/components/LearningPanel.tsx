"use client";

import { useEffect, useState } from "react";
import type { LearnedRulesFile } from "@/lib/feedback-types";

export function LearningPanel() {
  const [conceptErrors, setConceptErrors] = useState<Record<string, number>>({});
  const [learned, setLearned] = useState<LearnedRulesFile | null>(null);
  const [failureCount, setFailureCount] = useState(0);
  const [missCount, setMissCount] = useState(0);
  const [learnableCount, setLearnableCount] = useState(0);
  const [learnFrozen, setLearnFrozen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/learn");
      const data = await res.json();
      setConceptErrors(data.conceptErrors ?? {});
      setLearned(data.learned ?? null);
      setFailureCount(data.failureCount ?? 0);
      setMissCount(data.missCount ?? 0);
      setLearnableCount(data.learnableCount ?? 0);
      setLearnFrozen(Boolean(data.learnFrozen));
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function runLearning() {
    setLoading(true);
    setError("");
    setAnalysis("");
    try {
      const res = await fetch("/api/learn", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Learning failed");
      setAnalysis(data.analysis);
      setLearned(data.learned);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Learning failed");
    } finally {
      setLoading(false);
    }
  }

  const topConcepts = Object.entries(conceptErrors)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <div className="learning">
      <h2>Learning module</h2>
      <p className="feedback-hint">
        Learns from wrong/partial ({failureCount}) and misses ({missCount}) — under-calling when
        you stood aside but price moved. Misses are not scored as failures in backtest accuracy.
      </p>
      {learnFrozen && (
        <p className="feedback-hint">
          Learning is <strong>paused</strong> (LEARN_FROZEN=true). Set false in .env.local to
          update rules.
        </p>
      )}

      {topConcepts.length > 0 && (
        <div className="concept-errors">
          <h3>Weakest ICT concepts</h3>
          <div className="concept-tags">
            {topConcepts.map(([concept, count]) => (
              <span key={concept} className="concept-tag">
                {concept} ×{count}
              </span>
            ))}
          </div>
        </div>
      )}

      {learned && learned.rules.length > 0 && (
        <div className="grade-block">
          <h3>Active learned rules (v{learned.version})</h3>
          <pre>
            {learned.rules
              .slice(-8)
              .map((r) => `[${r.concept}] ${r.rule}`)
              .join("\n")}
          </pre>
        </div>
      )}

      <button
        type="button"
        className="reveal-btn learn-btn"
        disabled={loading || learnFrozen || learnableCount < 2}
        onClick={runLearning}
      >
        {loading
          ? "Analyzing failures…"
          : learnFrozen
            ? "Learning paused"
            : `Update brain (${failureCount} errors + ${missCount} misses)`}
      </button>

      {learnableCount < 2 && !learnFrozen && (
        <p className="feedback-hint">
          Need 2+ learnable entries. Rerun backtest to capture misses, or grade predict charts.
        </p>
      )}

      {analysis && (
        <div className="grade-block">
          <h3>Latest analysis</h3>
          <pre>{analysis}</pre>
        </div>
      )}

      {error && <p className="feedback-error">{error}</p>}
    </div>
  );
}
