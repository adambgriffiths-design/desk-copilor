/**
 * Collect structured chart snapshot from TradingView via tv-bridge (MAIN world).
 * Quality scoring mirrors lib/chart-snapshot.ts — keep in sync.
 */
(function () {
  const PAGE_SCRIPT_ID = "dc-tv-page-bridge";
  const MIN_CANDLES = 20;
  const STALE_BAR_SEC = 120;
  const EXPORT_FAST_TIMEOUT_MS = 3500;
  const EXPORT_RETRY_TIMEOUT_MS = 4500;
  const EXPORT_MAX_ATTEMPTS = 3;
  const EXPORT_RETRY_BACKOFF_MS = [400, 900];
  const EXPORT_READY_WAIT_MS = 2200;

  window.__dcChartReasoningLog = window.__dcChartReasoningLog || [];
  window.__dcChartExportTrace = window.__dcChartExportTrace || [];
  let exportRequestSeq = 0;

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function computeBarAgeMs(lastBarTsSec, nowMs = Date.now()) {
    if (lastBarTsSec == null || !Number.isFinite(lastBarTsSec)) return null;
    return Math.max(0, nowMs - lastBarTsSec * 1000);
  }

  function computeExportRetryDelayMs(attempt) {
    if (attempt <= 0) return 0;
    return EXPORT_RETRY_BACKOFF_MS[Math.min(attempt - 1, EXPORT_RETRY_BACKOFF_MS.length - 1)] ?? 900;
  }

  function shouldRetryExportAttempt(snap, attempt, maxAttempts = EXPORT_MAX_ATTEMPTS) {
    if (attempt >= maxAttempts) return false;
    if (!snap) return true;
    const reason = snap.reason || "";
    if (reason === "widget_not_found" || reason === "export_not_ready" || reason === "timeout") return true;
    if (snap.ok === true) return false;
    if (reason === "insufficient_candles" && attempt < 2) return true;
    return false;
  }

  function exportTimeoutForAttempt(attempt) {
    return attempt <= 0 ? EXPORT_FAST_TIMEOUT_MS : EXPORT_RETRY_TIMEOUT_MS;
  }

  function normalizeTfKey(tf) {
    if (tf == null) return "";
    const s = String(tf).trim().toLowerCase();
    if (s === "1m") return "1";
    if (s === "5m") return "5";
    if (s === "15m") return "15";
    if (s === "1h" || s === "60m") return "60";
    return s;
  }

  function symbolKeysMatch(a, b) {
    if (!a || !b) return true;
    const norm = (s) =>
      s
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9!]/g, "");
    const na = norm(a);
    const nb = norm(b);
    if (!na || !nb) return true;
    return na === nb || na.includes(nb) || nb.includes(na);
  }

  function timeframeKeysMatch(a, b) {
    if (!a || !b) return true;
    return normalizeTfKey(a) === normalizeTfKey(b);
  }

  function classifyExportQuality(input) {
    const reasons = [...new Set(input.reasons || [])];
    const exportFailed =
      input.source === "none" ||
      input.reason === "widget_not_found" ||
      input.reason === "export_not_ready" ||
      input.reason === "timeout" ||
      reasons.includes("export_failed");
    if (exportFailed || input.candleCount < MIN_CANDLES || reasons.includes("insufficient_candles")) {
      return "missing";
    }
    if (reasons.includes("stale_last_bar")) return "stale";
    if (input.exportPartial || reasons.includes("export_partial_failure") || reasons.includes("missing_ohlc_fields")) {
      return "partial";
    }
    if (reasons.length) return "degraded";
    return "good";
  }

  function injectPageBridge() {
    if (document.getElementById(PAGE_SCRIPT_ID)) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.id = PAGE_SCRIPT_ID;
      script.src = chrome.runtime.getURL("tv-bridge.js");
      script.onload = () => setTimeout(resolve, 100);
      script.onerror = () => {
        script.remove();
        resolve();
      };
      (document.head || document.documentElement).appendChild(script);
    });
  }

  function requestBridgeSnapshot(opts) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        window.removeEventListener("message", handler);
        clearTimeout(timer);
        resolve(value);
      };
      const handler = (event) => {
        if (event.source !== window || event.data?.type !== "DC_CHART_SNAPSHOT") return;
        finish(event.data);
      };
      window.addEventListener("message", handler);
      window.postMessage(
        {
          type: "DC_GET_CHART_SNAPSHOT",
          maxBars: opts?.maxBars || 120,
          waitForReadyMs: opts?.waitForReadyMs || 0,
        },
        "*"
      );
      const timer = setTimeout(
        () =>
          finish({
            ok: false,
            reason: "timeout",
            candles: [],
            drawings: [],
            source: "none",
            sync: { drawingExportFailed: true, widgetFound: false },
            exportStartTs: Date.now(),
            exportCompleteTs: Date.now(),
          }),
        opts?.timeoutMs || EXPORT_FAST_TIMEOUT_MS
      );
    });
  }

  function dcOverlayDrawings() {
    try {
      const cached = window.DeskCopilotDraw?.loadCache?.();
      const levels = cached?.levels || window.DeskCopilotDraw?.getActiveLevels?.() || [];
      const zones = cached?.zones || [];
      const drawings = [];
      for (const level of levels) {
        const price = Number(level.price);
        if (!Number.isFinite(price)) continue;
        drawings.push({
          type: "horizontal_line",
          label: level.label || level.displayLabel || "desk level",
          price,
          source: "desk_copilot",
        });
      }
      for (const zone of zones) {
        const top = Number(zone.top);
        const bottom = Number(zone.bottom);
        if (!Number.isFinite(top) || !Number.isFinite(bottom)) continue;
        drawings.push({
          type: "rectangle",
          label: zone.label || zone.kind || "desk zone",
          top: Math.max(top, bottom),
          bottom: Math.min(top, bottom),
          source: "desk_copilot",
        });
      }
      return drawings;
    } catch {
      return [];
    }
  }

  function scoreQuality(snap) {
    const reasons = [];
    const candles = snap.candles || [];
    const nowSec = Math.floor(Date.now() / 1000);
    const lastBarTime = candles.length ? candles[candles.length - 1].t : snap.sync?.lastBarTime;

    if (snap.source === "none" || snap.reason === "timeout" || snap.reason === "widget_not_found" || snap.reason === "export_not_ready") {
      reasons.push("export_failed");
    }
    if (candles.length < MIN_CANDLES) reasons.push("insufficient_candles");
    if (snap.sync?.exportPartial && candles.length >= MIN_CANDLES) reasons.push("export_partial_failure");
    if (snap.sync?.drawingExportFailed) reasons.push("drawing_export_failed");

    if (lastBarTime != null && snap.visibleRange?.to != null) {
      const drift = Math.abs(snap.visibleRange.to - lastBarTime);
      if (drift > 180) reasons.push("timestamp_drift");
    }
    if (lastBarTime != null && nowSec - lastBarTime > STALE_BAR_SEC) {
      reasons.push("stale_last_bar");
    }

    const quality = classifyExportQuality({
      source: snap.source,
      reason: snap.reason,
      candleCount: candles.length,
      reasons,
      exportPartial: snap.sync?.exportPartial,
    });

    return {
      quality,
      reasons: [...new Set(reasons)],
      lastBarTime,
      timestampDriftSec: snap.sync?.timestampDriftSec,
      candleCount: candles.length,
      drawingCount: (snap.drawings || []).length,
      exportPartial: snap.sync?.exportPartial === true,
      drawingExportFailed: snap.sync?.drawingExportFailed === true,
    };
  }

  function isQualityUsable(meta) {
    return meta && (meta.quality === "good" || meta.quality === "degraded" || meta.quality === "partial");
  }

  function buildExportTraceRecord(input) {
    const candles = input.snap.candles || [];
    const firstCandleTs = candles.length ? candles[0].t : null;
    const lastCandleTs = candles.length ? candles[candles.length - 1].t : input.snap.sync?.lastBarTime ?? null;
    const meta = input.snap.qualityMeta;
    const qualityRejectionReasons = meta?.reasons?.length
      ? [...meta.reasons]
      : input.snap.reason
        ? [input.snap.reason]
        : [];
    const quality = input.snap.quality || classifyExportQuality({
      source: input.snap.source,
      reason: input.snap.reason,
      candleCount: candles.length,
      reasons: qualityRejectionReasons,
      exportPartial: input.snap.sync?.exportPartial,
    });
    const widgetFound = input.snap.sync?.widgetFound !== false && input.snap.reason !== "widget_not_found";
    const barAgeMs = computeBarAgeMs(lastCandleTs, input.exportCompleteTs);
    const symbolMatch = symbolKeysMatch(input.snap.symbol, input.expectedSymbol);
    const timeframeMatch = timeframeKeysMatch(input.snap.timeframe, input.expectedTimeframe);
    if (!symbolMatch) qualityRejectionReasons.push("symbol_mismatch");
    if (!timeframeMatch) qualityRejectionReasons.push("timeframe_mismatch");

    return {
      requestId: input.requestId,
      symbol: input.snap.symbol ?? null,
      timeframe: input.snap.timeframe ?? null,
      exportStartTs: input.exportStartTs,
      exportCompleteTs: input.exportCompleteTs,
      durationMs: Math.max(0, input.exportCompleteTs - input.exportStartTs),
      widgetFound,
      candleCount: candles.length,
      firstCandleTs,
      lastCandleTs,
      currentLivePrice: input.currentLivePrice ?? null,
      barAgeMs,
      quality,
      qualityRejectionReasons: [...new Set(qualityRejectionReasons)],
      attempt: input.attempt,
      success: input.snap.ok === true && isQualityUsable(meta || { quality }),
      bridgeReason: input.snap.reason,
      expectedSymbol: input.expectedSymbol ?? null,
      expectedTimeframe: input.expectedTimeframe ?? null,
      symbolMatch,
      timeframeMatch,
    };
  }

  function recordExportTrace(trace) {
    window.__dcChartExportTrace.push(trace);
    if (window.__dcChartExportTrace.length > 30) window.__dcChartExportTrace.shift();
    try {
      console.info("[dc chart reasoning]", JSON.stringify(trace));
    } catch {
      /* ignore */
    }
    try {
      window.__dcUpdateChartExportPanel?.(trace);
    } catch {
      /* ignore */
    }
  }

  function formatExportDiagnosticsPanel(trace) {
    const t = trace || window.__dcChartExportTrace[window.__dcChartExportTrace.length - 1];
    if (!t) return "No chart export recorded yet.";
    const lines = [
      `request: ${t.requestId} · attempt ${t.attempt}`,
      `symbol/tf: ${t.symbol || "—"} / ${t.timeframe || "—"}${t.expectedSymbol ? ` (expected ${t.expectedSymbol}/${t.expectedTimeframe || "—"})` : ""}`,
      `duration: ${t.durationMs}ms · widget: ${t.widgetFound ? "yes" : "no"}`,
      `candles: ${t.candleCount}${t.lastCandleTs != null ? ` · barAge ${t.barAgeMs != null ? `${Math.round(t.barAgeMs / 1000)}s` : "—"}` : ""}`,
      `quality: ${t.quality} · success: ${t.success ? "yes" : "no"}`,
    ];
    if (t.qualityRejectionReasons?.length) lines.push(`reasons: ${t.qualityRejectionReasons.join(", ")}`);
    if (t.bridgeReason) lines.push(`bridge: ${t.bridgeReason}`);
    if (t.currentLivePrice != null) lines.push(`livePx: ${t.currentLivePrice}`);
    return lines.join("\n");
  }

  function pushReasoningLog(entry) {
    window.__dcChartReasoningLog.push(entry);
    if (window.__dcChartReasoningLog.length > 40) {
      window.__dcChartReasoningLog.shift();
    }
    try {
      console.info("[dc chart reasoning]", entry);
    } catch {
      /* ignore */
    }
  }

  const EXPORT_REASON_LABELS = {
    timeout: "chart export timed out",
    widget_not_found: "TradingView chart widget not found",
    export_not_ready: "chart not ready for export yet",
    export_failed: "chart export failed",
    export_partial_failure: "partial OHLC export",
    insufficient_candles: "not enough candles exported",
    stale_last_bar: "last bar is stale",
    drawing_export_failed: "user drawings unavailable",
  };

  function buildUnavailableMessage(reasons, bridgeReason) {
    const base = "No call — couldn't read the chart data right now.";
    const br = bridgeReason != null ? String(bridgeReason).trim() : "";
    if (br && br !== "insufficient_candles") {
      const label = EXPORT_REASON_LABELS[br] || br.replace(/_/g, " ");
      return `${base} (${label})`;
    }
    const hasHardFailure =
      (reasons || []).includes("export_failed") ||
      (reasons || []).some((r) => /^insufficient/.test(r));
    const actionable = (reasons || []).filter(
      (r) =>
        r &&
        r !== "export_failed" &&
        !/^insufficient/.test(r) &&
        !(hasHardFailure && r === "export_partial_failure")
    );
    const snippet = actionable
      .slice(0, 2)
      .map((r) => EXPORT_REASON_LABELS[r] || r.replace(/_/g, " "))
      .join(", ");
    return snippet ? `${base} (${snippet})` : base;
  }

  function readExpectedContext(opts) {
    return {
      expectedSymbol: opts?.expectedSymbol || null,
      expectedTimeframe: opts?.expectedTimeframe || null,
    };
  }

  async function collectSnapshotWithRetry(opts = {}) {
    await injectPageBridge();
    const requestId = opts.requestId || `export-${++exportRequestSeq}-${Date.now()}`;
    const { expectedSymbol, expectedTimeframe } = readExpectedContext(opts);
    const overallStart = Date.now();
    let lastSnap = null;
    let lastTrace = null;

    for (let attempt = 0; attempt < EXPORT_MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await sleep(computeExportRetryDelayMs(attempt));
      }
      const exportStartTs = Date.now();
      const snap = await requestBridgeSnapshot({
        maxBars: opts.maxBars || 120,
        timeoutMs: exportTimeoutForAttempt(attempt),
        waitForReadyMs: attempt === 0 ? EXPORT_READY_WAIT_MS : 800,
      });
      const exportCompleteTs = Date.now();
      const dcDrawings = dcOverlayDrawings();
      const mergedDrawings = [...(snap.drawings || []), ...dcDrawings].slice(0, 60);
      const merged = { ...snap, drawings: mergedDrawings };
      const qualityMeta = scoreQuality(merged);
      const enriched = {
        ...merged,
        qualityMeta,
        quality: qualityMeta.quality,
        ok: isQualityUsable(qualityMeta) && (merged.candles || []).length >= MIN_CANDLES,
        requestId,
        exportAttempt: attempt + 1,
      };

      const trace = buildExportTraceRecord({
        requestId,
        attempt: attempt + 1,
        exportStartTs: snap.exportStartTs || exportStartTs,
        exportCompleteTs: snap.exportCompleteTs || exportCompleteTs,
        snap: enriched,
        expectedSymbol,
        expectedTimeframe,
      });
      recordExportTrace(trace);
      lastSnap = enriched;
      lastTrace = trace;

      if (!shouldRetryExportAttempt(snap, attempt + 1)) break;
      if (enriched.ok && isQualityUsable(qualityMeta)) break;
    }

    if (lastSnap) {
      lastSnap.exportTrace = lastTrace;
      lastSnap.exportDurationMs = Date.now() - overallStart;
    }
    return lastSnap;
  }

  async function collectSnapshot(opts = {}) {
    return collectSnapshotWithRetry(opts);
  }

  async function payload(opts = {}) {
    const requestId = opts.requestId || `payload-${++exportRequestSeq}-${Date.now()}`;
    const [snap, pricePayload] = await Promise.all([
      collectSnapshotWithRetry({ ...opts, requestId }),
      window.DeskCopilotChartPrice?.payload?.() || Promise.resolve({}),
    ]);
    const livePx = Number(pricePayload?.chartLastPrice);
    const lastPrice =
      Number.isFinite(livePx) && livePx >= 20000 && livePx <= 45000
        ? livePx
        : snap.lastPrice ?? null;

    if (snap?.exportTrace) {
      snap.exportTrace.currentLivePrice = lastPrice;
      recordExportTrace({ ...snap.exportTrace, currentLivePrice: lastPrice });
    }

    const chartSnapshot = {
      ...snap,
      lastPrice,
      symbol: snap.symbol || undefined,
    };
    return {
      chartSnapshot,
      chartLastPrice: lastPrice ?? undefined,
      qualityUsable: isQualityUsable(chartSnapshot.qualityMeta),
      exportTrace: snap.exportTrace || null,
    };
  }

  window.DeskCopilotChartSnapshot = {
    collect: collectSnapshot,
    payload,
    scoreQuality,
    isQualityUsable,
    pushReasoningLog,
    recordExportTrace,
    formatExportDiagnosticsPanel,
    buildUnavailableMessage,
    shouldRetryExportAttempt,
    computeExportRetryDelayMs,
    exportTimeoutForAttempt,
    classifyExportQuality,
    buildExportTraceRecord,
    NO_CALL: "No call — couldn't read the chart data right now.",
    EXPORT_FAST_TIMEOUT_MS,
    EXPORT_RETRY_TIMEOUT_MS,
    EXPORT_MAX_ATTEMPTS,
  };
})();
