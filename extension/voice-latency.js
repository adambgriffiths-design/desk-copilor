/**
 * Per-turn voice latency trace — session + turn IDs, stage marks, computed breakdown.
 * Logs to __dcVoiceLog, console, and window.__dcVoiceLatencyTrace.
 */
(function () {
  let sessionId = null;
  let turn = null;
  let turnSeq = 0;
  let firstAudioSent = false;
  let firstPcmDelta = false;

  function getSessionId() {
    if (!sessionId) {
      sessionId = `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    }
    return sessionId;
  }

  function prefix() {
    const id = turn?.id ?? turnSeq;
    return `[latency] session=${getSessionId()} turn=${id}`;
  }

  function logLine(stage, ms, extra) {
    const line = `${prefix()} ${stage} +${Math.round(ms)}ms${extra ? ` ${extra}` : ""}`;
    window.__dcVoiceLog?.(line);
    if (typeof console !== "undefined" && console.debug) {
      console.debug(line);
    }
  }

  function logMetric(name, ms) {
    if (ms == null || Number.isNaN(ms)) return;
    logLine(name, ms, "(computed)");
  }

  /** Start or reset trace — call on speech_started / new utterance. */
  function beginTurn(source) {
    turnSeq += 1;
    turn = {
      id: turnSeq,
      sessionId: getSessionId(),
      t0: performance.now(),
      marks: {},
      source: source || "voice",
    };
    firstAudioSent = false;
    firstPcmDelta = false;
    mark("speech_start");
    return turn;
  }

  /** Record first occurrence of a stage (ms from turn t0). last_* stages always update. */
  function mark(stage) {
    if (!turn || !stage) return null;
    const isLast = stage.startsWith("last_");
    if (!isLast && turn.marks[stage] != null) return turn.marks[stage];
    const ms = performance.now() - turn.t0;
    turn.marks[stage] = ms;
    logLine(stage, ms);
    return ms;
  }

  function markFirstAudioAppend() {
    if (!firstAudioSent) {
      firstAudioSent = true;
      mark("first_audio_append");
      mark("first_audio_chunk");
    }
    mark("last_audio_chunk");
  }

  function markFirstPcmDelta() {
    if (firstPcmDelta) return;
    firstPcmDelta = true;
    mark("first_response_delta");
    mark("first_audible");
  }

  function firstMark(...stages) {
    if (!turn) return null;
    let best = null;
    for (const s of stages) {
      const v = turn.marks[s];
      if (v != null && (best == null || v < best)) best = v;
    }
    return best;
  }

  function span(from, to) {
    if (!turn) return null;
    const a = turn.marks[from];
    const b = turn.marks[to];
    if (a == null || b == null) return null;
    return Math.round(b - a);
  }

  function computeMetrics(marks) {
    const m = marks || {};
    const timeToFirstTranscript = m.first_partial ?? null;
    const timeToFinalTranscript =
      m.transcript_handoff ?? m.turn_process ?? m.final_transcript ?? null;
    const timeToFirstResponse = firstMark(
      "first_sse_token",
      "first_response_delta",
      "model_response_start"
    );
    const timeToFirstAudio = m.first_audible ?? m.tts_playback ?? null;
    const totalResponseLatency =
      m.reply_complete ?? m.turn_end ?? m.turn_done ?? null;

    const interpretEnd = m.interpret_done ?? m.interpret_skip ?? null;
    const streamStart = m.first_sse_token ?? m.first_response_delta ?? null;

    return {
      timeToFirstTranscript:
        timeToFirstTranscript != null ? Math.round(timeToFirstTranscript) : null,
      timeToFinalTranscript:
        timeToFinalTranscript != null ? Math.round(timeToFinalTranscript) : null,
      timeToFirstResponse:
        timeToFirstResponse != null ? Math.round(timeToFirstResponse) : null,
      timeToFirstAudio: timeToFirstAudio != null ? Math.round(timeToFirstAudio) : null,
      totalResponseLatency:
        totalResponseLatency != null ? Math.round(totalResponseLatency) : null,
      breakdown: {
        mic_to_api: span("speech_start", "first_audio_append"),
        vad_end_of_speech: span("last_audio_chunk", "vad_speech_end"),
        transcript_settle: span("final_transcript", "transcript_handoff"),
        client_processing:
          interpretEnd != null && m.transcript_handoff != null
            ? Math.round(interpretEnd - m.transcript_handoff)
            : span("transcript_handoff", "turn_process"),
        backend_stream:
          streamStart != null && m.turn_process != null
            ? Math.round(streamStart - m.turn_process)
            : span("turn_process", "first_sse_token"),
        tts:
          timeToFirstAudio != null && (m.tts_start ?? streamStart) != null
            ? Math.round(timeToFirstAudio - (m.tts_start ?? streamStart))
            : span("tts_start", "first_audible"),
      },
    };
  }

  function endTurn(reason) {
    if (!turn) return null;
    if (reason) mark(reason);
    mark("turn_end");
    const marks = { ...turn.marks };
    const metrics = computeMetrics(marks);
    const snapshot = {
      sessionId: turn.sessionId,
      id: turn.id,
      source: turn.source,
      marks,
      metrics,
      totalMs: Math.round(performance.now() - turn.t0),
      endedAt: Date.now(),
    };
    turn = null;

    logMetric("time-to-first-transcript", metrics.timeToFirstTranscript);
    logMetric("time-to-final-transcript", metrics.timeToFinalTranscript);
    logMetric("time-to-first-response", metrics.timeToFirstResponse);
    logMetric("time-to-first-audio", metrics.timeToFirstAudio);
    logMetric("total-response-latency", metrics.totalResponseLatency);
    Object.entries(metrics.breakdown).forEach(([k, v]) => {
      if (v != null) logMetric(`breakdown.${k}`, v);
    });

    window.__dcVoiceLatencyTrace = snapshot;
    try {
      const active = window.DeskCopilotRequestTrace?.getActiveTrace?.();
      if (active) window.DeskCopilotRequestTrace.mergeVoiceLatency(active, snapshot);
    } catch {
      /* ignore */
    }
    try {
      window.__dcUpdateLatencyPanel?.(snapshot);
    } catch {
      /* ignore */
    }
    return snapshot;
  }

  /** Human-readable panel block for Diagnostics UI. */
  function formatDiagnosticsPanel(snapshot) {
    const s = snapshot || window.__dcVoiceLatencyTrace;
    if (!s?.metrics) return "No voice turn recorded yet.";
    const b = s.metrics.breakdown || {};
    const lines = [
      `Session ${s.sessionId || "—"} · turn ${s.id ?? "—"}`,
      `Mic → API: ${b.mic_to_api != null ? `${b.mic_to_api}ms` : "—"}`,
      `VAD/end-of-speech: ${b.vad_end_of_speech != null ? `${b.vad_end_of_speech}ms` : "—"}`,
      `Transcript: ${s.metrics.timeToFinalTranscript != null ? `${s.metrics.timeToFinalTranscript}ms` : "—"}`,
      `First response: ${s.metrics.timeToFirstResponse != null ? `${s.metrics.timeToFirstResponse}ms` : "—"}`,
      `First audio: ${s.metrics.timeToFirstAudio != null ? `${s.metrics.timeToFirstAudio}ms` : "—"}`,
      `TOTAL: ${s.metrics.totalResponseLatency != null ? `${(s.metrics.totalResponseLatency / 1000).toFixed(2)}s` : s.totalMs != null ? `${(s.totalMs / 1000).toFixed(2)}s` : "—"}`,
    ];
    return lines.join("\n");
  }

  function summary() {
    if (!turn) return window.__dcVoiceLatencyTrace?.marks || {};
    return { ...turn.marks };
  }

  function resetSession() {
    sessionId = null;
    turn = null;
    turnSeq = 0;
    firstAudioSent = false;
    firstPcmDelta = false;
  }

  window.DeskCopilotVoiceLatency = {
    beginTurn,
    mark,
    markFirstAudioAppend,
    markFirstPcmDelta,
    endTurn,
    summary,
    computeMetrics,
    getSessionId,
    resetSession,
    formatDiagnosticsPanel,
    current() {
      return turn;
    },
    elapsed(stage) {
      const v = turn?.marks[stage];
      return v != null ? Math.round(v) : null;
    },
  };
  window.__dcVoiceLatencyMark = mark;
})();
