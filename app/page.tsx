"use client";

import { FormEvent, useEffect, useState } from "react";
import { cropImageLeftHalf, cropImageRightHalf } from "@/lib/crop-image";
import { FeedbackPanel } from "@/app/components/FeedbackPanel";
import { LearningPanel } from "@/app/components/LearningPanel";
import type { FeedbackStats } from "@/lib/feedback-types";
import type { GradeResult } from "@/lib/grade-prompt";

export default function Home() {
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [chartTime, setChartTime] = useState("");
  const [note, setNote] = useState("");
  const [predictMode, setPredictMode] = useState(false);
  const [verdict, setVerdict] = useState("");
  const [levels, setLevels] = useState("");
  const [marketContext, setMarketContext] = useState<unknown>(null);
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [wasPredictMode, setWasPredictMode] = useState(false);
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [grading, setGrading] = useState(false);
  const [autoGrade, setAutoGrade] = useState<(GradeResult & { saved?: boolean }) | null>(
    null
  );

  useEffect(() => {
    fetch("/api/feedback")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  function handleImageChange(file: File | null) {
    setImage(file);
    setRevealed(false);
    setAutoGrade(null);
    setGrading(false);
    setWasPredictMode(false);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!image) {
      setError("Upload a chart screenshot first.");
      return;
    }

    setLoading(true);
    setError("");
    setVerdict("");
    setLevels("");
    setMarketContext(null);
    setWarning("");
    setRevealed(false);
    setAutoGrade(null);
    setGrading(false);

    const imageToSend = predictMode ? await cropImageLeftHalf(image) : image;

    const formData = new FormData();
    formData.append("image", imageToSend);
    if (chartTime) formData.append("chartTime", chartTime);
    if (note) formData.append("note", note);
    if (predictMode) formData.append("predictMode", "true");

    try {
      const res = await fetch("/api/verdict", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setVerdict(data.verdict);
      setWasPredictMode(predictMode);
      if (data.marketContext) {
        setMarketContext(data.marketContext);
        setLevels(JSON.stringify(data.marketContext, null, 2));
      }
      if (data.marketDataWarning) setWarning(data.marketDataWarning);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleReveal() {
    if (!image || !verdict) return;
    setRevealed(true);
    setGrading(true);
    setAutoGrade(null);
    setError("");

    try {
      const rightHalf = await cropImageRightHalf(image);
      const formData = new FormData();
      formData.append("image", rightHalf);
      formData.append("prediction", verdict);
      if (chartTime) formData.append("chartTime", chartTime);
      if (note) formData.append("note", note);
      if (marketContext) {
        formData.append("marketContext", JSON.stringify(marketContext));
      }

      const res = await fetch("/api/grade", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Grading failed");

      setAutoGrade(data);
      if (data.stats) setStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auto-grade failed");
    } finally {
      setGrading(false);
    }
  }

  return (
    <main>
      <h1>The Trading Desk</h1>
      <p className="subtitle">
        No signals. Just the read. Upload 1m — levels auto-load, desk delivers the brief.
        {stats && stats.trainingExamples > 0 && (
          <> · {stats.trainingExamples} training examples loaded</>
        )}
      </p>

      <form onSubmit={handleSubmit}>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={predictMode}
            onChange={(e) => {
              setPredictMode(e.target.checked);
              setRevealed(false);
              setAutoGrade(null);
              setGrading(false);
            }}
          />
          <span>
            <strong>Predict mode</strong> — copilot sees left half only, you
            reveal the outcome after
          </span>
        </label>

        <label>
          Chart screenshot (1m MNQ)
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
          />
          {preview && (
            <div
              className={`preview ${predictMode && !revealed ? "preview-masked" : ""}`}
            >
              <img src={preview} alt="Chart preview" />
              {predictMode && !revealed && (
                <div className="preview-overlay">
                  <span className="label-left">Copilot sees</span>
                  <span className="label-right">Hidden outcome</span>
                </div>
              )}
              {predictMode && revealed && (
                <div className="preview-divider" aria-hidden />
              )}
            </div>
          )}
        </label>

        <label>
          Time on chart (EST, optional)
          <input
            type="text"
            placeholder="e.g. 9:55"
            value={chartTime}
            onChange={(e) => setChartTime(e.target.value)}
          />
        </label>

        <label>
          Note (optional)
          <textarea
            placeholder="e.g. FVG entry zone, targeting CE of ORG"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        <button type="submit" disabled={loading || !image}>
          {loading
            ? "Pulling levels + building brief…"
            : predictMode
              ? "RUN PREDICT"
              : "GET THE READ"}
        </button>
      </form>

      {error && <div className="error">{error}</div>}
      {warning && <div className="error">{warning}</div>}

      {levels && (
        <div className="verdict levels">
          <h2>Auto-fetched levels (D / 15m / 5m)</h2>
          <pre>{levels}</pre>
        </div>
      )}

      {verdict && (
        <>
          <div className="verdict">
            <h2>{wasPredictMode ? "Prediction" : "Verdict"}</h2>
            <pre>{verdict}</pre>
            {wasPredictMode && !revealed && preview && (
              <button
                type="button"
                className="reveal-btn"
                onClick={handleReveal}
                disabled={grading}
              >
                {grading ? "Grading…" : "REVEAL OUTCOME"}
              </button>
            )}
            {wasPredictMode && revealed && (
              <p className="reveal-note">
                Compare your prediction above to what actually happened on the
                right half ↑
              </p>
            )}
          </div>

          <FeedbackPanel
            verdict={verdict}
            predictMode={wasPredictMode}
            chartTime={chartTime}
            note={note}
            marketContext={marketContext}
            autoGrade={autoGrade}
            grading={grading}
            onSubmitted={setStats}
          />
        </>
      )}

      {stats && stats.total > 0 && (
        <p className="stats-line">
          Training log: {stats.total} graded · {stats.correct} correct ·{" "}
          {stats.partial} partial · {stats.wrong} wrong
        </p>
      )}

      <LearningPanel />

      <p className="disclaimer">
        Educational decision-support only. Not financial advice. You are solely
        responsible for all trading decisions.
      </p>
    </main>
  );
}
