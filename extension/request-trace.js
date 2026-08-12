/**
 * Unified request trace — mirrors lib/request-trace.ts for the extension panel.
 */
(function () {
  const TRACE_RING_SIZE = 20;

  const RELEASE_THRESHOLDS = {
    voiceTotalMs: 3000,
    exportSuccessRate: 0.85,
    goldenTestsRequired: true,
    maxOpenCriticals: 0,
  };

  const STAGE_LABELS = {
    voice: "Voice",
    transcript: "Transcript",
    intent: "Intent",
    route: "Route",
    apis: "APIs",
    marketDataQuality: "Market data",
    observations: "Observations",
    llmGrounding: "LLM grounding",
    response: "Response",
  };

  const STAGE_ORDER = [
    "voice",
    "transcript",
    "intent",
    "route",
    "apis",
    "marketDataQuality",
    "observations",
    "llmGrounding",
    "response",
  ];

  let activeTrace = null;
  const ring = [];
  window.__dcRequestTraces = ring;

  function pendingStage() {
    return { status: "pending" };
  }

  function createRequestTrace(requestId, userText, voice) {
    return {
      requestId,
      startedAt: new Date().toISOString(),
      userText,
      voice: Boolean(voice),
      stages: {
        voice: pendingStage(),
        transcript: pendingStage(),
        intent: pendingStage(),
        route: pendingStage(),
        apis: pendingStage(),
        marketDataQuality: pendingStage(),
        observations: pendingStage(),
        llmGrounding: pendingStage(),
        response: pendingStage(),
      },
      performance: {},
    };
  }

  function markStage(trace, stage, patch) {
    if (!trace?.stages?.[stage]) return trace;
    trace.stages[stage] = { ...trace.stages[stage], ...patch };
    return trace;
  }

  function pushRing(trace) {
    ring.push(trace);
    if (ring.length > TRACE_RING_SIZE) ring.shift();
    window.__dcRequestTraces = ring;
    try {
      window.__dcUpdateRequestTracePanel?.();
    } catch {
      /* ignore */
    }
  }

  function beginRequest(requestId, userText, voice) {
    if (activeTrace && !activeTrace.completedAt) return activeTrace;
    activeTrace = createRequestTrace(requestId, userText, voice);
    if (!voice) {
      markStage(activeTrace, "voice", { status: "skip", reason: "typed turn" });
      markStage(activeTrace, "transcript", { status: "skip", reason: "typed turn" });
    }
    return activeTrace;
  }

  function getActiveTrace() {
    return activeTrace;
  }

  function recordApiCall(trace, endpoint, ms, ok, reason) {
    const calls = [...(trace.stages.apis.calls || []), { endpoint, status: ok ? "pass" : "fail", ms }];
    const allOk = calls.every((c) => c.status === "pass");
    markStage(trace, "apis", {
      status: allOk ? "pass" : "fail",
      calls,
      reason: allOk ? undefined : reason || calls.find((c) => c.status === "fail")?.endpoint,
      ms: calls.reduce((sum, c) => sum + c.ms, 0),
    });
  }

  function mergeVoiceLatency(trace, snapshot) {
    if (!snapshot) {
      if (trace.voice) {
        markStage(trace, "voice", { status: "skip", reason: "no voice snapshot" });
        markStage(trace, "transcript", { status: "skip", reason: "no latency data" });
      }
      return;
    }
    const totalMs = snapshot.totalMs ?? snapshot.metrics?.totalResponseLatency ?? undefined;
    const transcriptMs =
      snapshot.metrics?.timeToFinalTranscript ??
      snapshot.marks?.transcript_handoff ??
      snapshot.marks?.turn_process ??
      undefined;

    markStage(trace, "voice", {
      status: "pass",
      ms: totalMs != null ? Math.round(totalMs) : undefined,
    });
    markStage(trace, "transcript", {
      status: transcriptMs != null ? "pass" : "pending",
      ms: transcriptMs != null ? Math.round(transcriptMs) : undefined,
      text: trace.userText?.slice(0, 120),
    });

    if (transcriptMs != null) trace.performance.speechEndToTranscript = Math.round(transcriptMs);
    if (snapshot.metrics?.timeToFirstResponse != null) {
      trace.performance.apiToFirstToken = snapshot.metrics.timeToFirstResponse;
    }
    if (snapshot.metrics?.timeToFirstAudio != null) {
      trace.performance.firstTokenToAudio = snapshot.metrics.timeToFirstAudio;
    }
    if (totalMs != null) trace.performance.totalMs = Math.round(totalMs);
  }

  function mergeChartExport(trace, exportTrace) {
    if (!exportTrace) {
      markStage(trace, "marketDataQuality", { status: "skip", reason: "no chart export" });
      return;
    }
    const quality = exportTrace.quality || (exportTrace.ok ? "good" : "missing");
    const usable = quality === "good" || quality === "degraded" || quality === "partial";
    markStage(trace, "marketDataQuality", {
      status: usable ? "pass" : "fail",
      quality,
      source: exportTrace.source,
      candleCount: exportTrace.candleCount,
      barAgeMs: exportTrace.barAgeMs,
      reason: usable
        ? undefined
        : exportTrace.reason || (exportTrace.reasons || []).join(", ") || "export unusable",
    });
  }

  function mergeObservations(trace, factIds, unknown) {
    if (!factIds?.length && !unknown) {
      markStage(trace, "observations", { status: "skip", reason: "no observation facts" });
      return;
    }
    markStage(trace, "observations", {
      status: unknown ? "fail" : "pass",
      factIds: factIds || [],
      unknown: Boolean(unknown),
      reason: unknown ? "unknown facts in snapshot" : undefined,
    });
  }

  function markLlmGrounding(trace, path, grounded) {
    markStage(trace, "llmGrounding", {
      status: grounded ? "pass" : "fail",
      grounded,
      path,
      reason: grounded ? undefined : "unstructured stream without pipeline backing",
    });
  }

  function completeTrace(trace) {
    trace.completedAt = new Date().toISOString();
    const started = Date.parse(trace.startedAt);
    const ended = Date.parse(trace.completedAt);
    if (Number.isFinite(started) && Number.isFinite(ended)) {
      trace.performance.totalMs = trace.performance.totalMs ?? Math.max(0, ended - started);
    }
    for (const key of STAGE_ORDER) {
      if (trace.stages[key].status === "pending") {
        trace.stages[key] = { status: "skip", reason: "incomplete" };
      }
    }
    return trace;
  }

  function finishRequest(trace) {
    const t = completeTrace(trace || activeTrace);
    if (t) pushRing(t);
    if (activeTrace === t) activeTrace = null;
    return t;
  }

  function traceHasFailure(trace) {
    return Object.values(trace.stages).some((s) => s.status === "fail");
  }

  function formatStageIcon(status) {
    switch (status) {
      case "pass":
        return "✓";
      case "fail":
        return "✗";
      case "skip":
        return "–";
      default:
        return "…";
    }
  }

  function formatLivePipeline(trace) {
    if (!trace) return "No active trace.";
    const lines = [`Request ${trace.requestId} · ${trace.completedAt ? "done" : "in flight"}`];
    if (trace.userText) {
      lines.push(
        `"${trace.userText.slice(0, 72)}${trace.userText.length > 72 ? "…" : ""}"`
      );
    }
    for (const key of STAGE_ORDER) {
      const s = trace.stages[key];
      const ms = s.ms != null ? ` (${s.ms}ms)` : "";
      const reason = s.reason ? ` — ${s.reason}` : "";
      lines.push(`${formatStageIcon(s.status)} ${STAGE_LABELS[key]}${ms}${reason}`);
    }
    return lines.join("\n");
  }

  function formatPerformanceTable(traces) {
    const list = traces?.length ? traces : ring;
    if (!list.length) return "No traces yet.";
    const header = "req          voice  xcript route  api    total";
    const rows = list.slice(-10).map((t) => {
      const id = t.requestId.slice(0, 10).padEnd(10);
      const col = (s) => {
        const ms = t.stages[s]?.ms;
        return ms != null ? String(ms).padStart(5) : "    –";
      };
      const total = t.performance.totalMs != null ? String(t.performance.totalMs).padStart(5) : "    –";
      return `${id} ${col("voice")} ${col("transcript")} ${col("route")} ${col("apis")} ${total}`;
    });
    return [header, ...rows].join("\n");
  }

  function formatFailures(traces) {
    const list = (traces?.length ? traces : ring).filter(traceHasFailure);
    if (!list.length) return "No failed stages in recent traces.";
    return list
      .slice(-8)
      .map((t) => {
        const fails = STAGE_ORDER.filter((k) => t.stages[k].status === "fail")
          .map((k) => `${STAGE_LABELS[k]}: ${t.stages[k].reason || "fail"}`)
          .join("; ");
        return `${t.requestId} — ${fails}`;
      })
      .join("\n");
  }

  function formatRegressionTab(lastRun) {
    if (!lastRun) {
      return "No system health run stored.\nRun: npm run test:system\nResults sync to chrome.storage.local on extension load.";
    }
    const lines = [
      `Last run: ${lastRun.at || "—"}`,
      `Score: ${lastRun.score ?? "—"}/100`,
      `Status: ${lastRun.pass ? "PASS" : "FAIL"}`,
      "",
    ];
    if (lastRun.subsystems?.length) {
      lines.push("Subsystems:");
      for (const s of lastRun.subsystems) {
        lines.push(`  ${s.icon || ""} ${s.name}: ${s.status}${s.detail ? ` — ${s.detail}` : ""}`);
      }
    }
    if (lastRun.checklist?.items?.length) {
      lines.push("", "Release checklist:");
      for (const item of lastRun.checklist.items) {
        lines.push(`  ${item.pass ? "✓" : "✗"} ${item.label} (${item.detail})`);
      }
    }
    if (lastRun.summary) lines.push("", lastRun.summary);
    return lines.join("\n");
  }

  window.DeskCopilotRequestTrace = {
    TRACE_RING_SIZE,
    RELEASE_THRESHOLDS,
    STAGE_LABELS,
    STAGE_ORDER,
    createRequestTrace,
    beginRequest,
    getActiveTrace,
    markStage,
    recordApiCall,
    mergeVoiceLatency,
    mergeChartExport,
    mergeObservations,
    markLlmGrounding,
    completeTrace,
    finishRequest,
    traceHasFailure,
    formatStageIcon,
    formatLivePipeline,
    formatPerformanceTable,
    formatFailures,
    formatRegressionTab,
    getTraces() {
      return ring.slice();
    },
    getLatest() {
      return activeTrace || ring[ring.length - 1] || null;
    },
  };
})();
