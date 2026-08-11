"use client";

import { useEffect, useState } from "react";
import type { FeedbackRating, FeedbackStats } from "@/lib/feedback-types";
import type { GradeResult } from "@/lib/grade-prompt";

type AutoGrade = GradeResult & {
  saved?: boolean;
  skipped?: boolean;
  confidence?: string;
  reason?: string;
};

type FeedbackPanelProps = {
  verdict: string;
  predictMode: boolean;
  chartTime: string;
  note: string;
  marketContext: unknown;
  autoGrade: AutoGrade | null;
  grading: boolean;
  onSubmitted: (stats: FeedbackStats) => void;
};

export function FeedbackPanel({
  verdict,
  predictMode,
  chartTime,
  note,
  marketContext,
  autoGrade,
  grading,
  onSubmitted,
}: FeedbackPanelProps) {
  const [rating, setRating] = useState<FeedbackRating | null>(null);
  const [correction, setCorrection] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    setRating(null);
    setCorrection("");
    setSaved(false);
    setError("");
    setShowManual(false);
  }, [verdict]);

  useEffect(() => {
    if (autoGrade?.saved) {
      setSaved(true);
      setRating(autoGrade.rating);
    }
  }, [autoGrade]);

  async function submit(selected: FeedbackRating) {
    setRating(selected);
    setError("");

    if ((selected === "wrong" || selected === "partial") && !correction.trim()) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: selected,
          verdict,
          predictMode,
          chartTime: chartTime || undefined,
          note: note || undefined,
          correction: correction.trim() || undefined,
          marketContext: marketContext || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save feedback");
      setSaved(true);
      onSubmitted(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setRating(null);
    } finally {
      setSaving(false);
    }
  }

  const needsCorrection = rating === "wrong" || rating === "partial";
  const ratingClass =
    autoGrade?.rating === "correct"
      ? "grade-correct"
      : autoGrade?.rating === "partial"
        ? "grade-partial"
        : "grade-wrong";

  if (predictMode && autoGrade) {
    if (autoGrade.skipped) {
      return (
        <div className="feedback">
          <h2>Auto-grade skipped</h2>
          <div className="grade-badge grade-skipped">NOT GRADED</div>
          <p className="reveal-note">{autoGrade.reason}</p>
          <p className="feedback-hint">
            Confidence: {autoGrade.confidence} — low confidence predictions are
            excluded from scoring and training.
          </p>
        </div>
      );
    }

    return (
      <div className="feedback">
        <h2>Auto-grade</h2>
        <div className={`grade-badge ${ratingClass}`}>
          {autoGrade.rating.toUpperCase()}
        </div>

        <div className="grade-block">
          <h3>Actual outcome</h3>
          <pre>{autoGrade.outcome}</pre>
        </div>

        <div className="grade-block">
          <h3>Reasoning</h3>
          <pre>{autoGrade.reasoning}</pre>
        </div>

        {autoGrade.correction && (
          <div className="grade-block">
            <h3>Correction saved for training</h3>
            <pre>{autoGrade.correction}</pre>
          </div>
        )}

        {autoGrade.failedConcepts && autoGrade.failedConcepts.length > 0 && (
          <div className="concept-tags">
            {autoGrade.failedConcepts.map((c) => (
              <span key={c} className="concept-tag concept-tag-fail">
                {c}
              </span>
            ))}
          </div>
        )}

        {autoGrade.saved && (
          <p className="reveal-note">
            Graded and saved automatically — used in future prompts.
          </p>
        )}

        {!showManual && (
          <button
            type="button"
            className="fb-btn fb-override"
            onClick={() => setShowManual(true)}
          >
            Override grade
          </button>
        )}

        {showManual && (
          <ManualGrade
            saving={saving}
            needsCorrection={needsCorrection}
            rating={rating}
            correction={correction}
            setCorrection={setCorrection}
            setRating={setRating}
            submit={submit}
            error={error}
          />
        )}
      </div>
    );
  }

  if (predictMode && grading) {
    return (
      <div className="feedback">
        <h2>Auto-grade</h2>
        <p className="feedback-hint">Analyzing outcome and grading prediction…</p>
      </div>
    );
  }

  return (
    <div className="feedback">
      <h2>Train the copilot</h2>
      <p className="feedback-hint">
        Grade this verdict — corrections are injected into future prompts
      </p>

      {!saved && (
        <ManualGrade
          saving={saving}
          needsCorrection={needsCorrection}
          rating={rating}
          correction={correction}
          setCorrection={setCorrection}
          setRating={setRating}
          submit={submit}
          error={error}
        />
      )}

      {saved && !autoGrade && (
        <p className="reveal-note">
          Saved — future verdicts will use your corrections as training examples.
        </p>
      )}

      {error && !autoGrade && <p className="feedback-error">{error}</p>}
    </div>
  );
}

function ManualGrade({
  saving,
  needsCorrection,
  rating,
  correction,
  setCorrection,
  setRating,
  submit,
  error,
}: {
  saving: boolean;
  needsCorrection: boolean;
  rating: FeedbackRating | null;
  correction: string;
  setCorrection: (v: string) => void;
  setRating: (v: FeedbackRating | null) => void;
  submit: (r: FeedbackRating) => void;
  error: string;
}) {
  return (
    <>
      <div className="feedback-buttons">
        <button
          type="button"
          className="fb-btn fb-correct"
          disabled={saving}
          onClick={() => submit("correct")}
        >
          Correct
        </button>
        <button
          type="button"
          className="fb-btn fb-partial"
          disabled={saving}
          onClick={() => setRating("partial")}
        >
          Partial
        </button>
        <button
          type="button"
          className="fb-btn fb-wrong"
          disabled={saving}
          onClick={() => setRating("wrong")}
        >
          Wrong
        </button>
      </div>

      {needsCorrection && (
        <div className="feedback-correction">
          <label>
            What should it have said?
            <textarea
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
              placeholder="Write the verdict you would give at this moment…"
              rows={4}
            />
          </label>
          <button
            type="button"
            className="reveal-btn"
            disabled={saving || !correction.trim()}
            onClick={() => submit(rating!)}
          >
            {saving ? "Saving…" : "Save correction"}
          </button>
        </div>
      )}

      {error && <p className="feedback-error">{error}</p>}
    </>
  );
}
