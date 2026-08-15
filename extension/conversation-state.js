/**
 * Conversation request lifecycle — mirrors lib/conversation-state.ts for the panel.
 * IDLE → REQUESTING → STREAMING → COMPLETE → IDLE | ERROR → IDLE
 */
(function () {
  const STAGES = [
    "TURN_START",
    "USER_MESSAGE",
    "HISTORY_LENGTH",
    "INTENT",
    "MARKET_STATE",
    "API_START",
    "STATUS",
    "STREAM_START",
    "FIRST_TOKEN",
    "STREAM_END",
    "RESPONSE_LENGTH",
    "ERROR",
    "CLEANUP",
  ];

  function emptyStages() {
    const stages = {};
    for (const s of STAGES) stages[s] = null;
    return stages;
  }

  function newConversationId() {
    return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function ConversationSession(conversationId) {
    this.conversationId = conversationId || newConversationId();
    this.conversationTurn = 0;
    this.requestId = "";
    this.phase = "IDLE";
    this.loading = false;
    this.streaming = false;
    this.requestInFlight = false;
    this.abortPending = false;
    this.streamOpen = false;
    this.historyLength = 0;
    this.lastIntent = null;
    this.lastResponseSource = null;
    this.marketSnapshotId = null;
    this.lastReplyLength = 0;
    this.error = null;
    this.stages = emptyStages();
    this.lastRecoverReason = null;
  }

  ConversationSession.prototype.snapshot = function () {
    return {
      conversationId: this.conversationId,
      conversationTurn: this.conversationTurn,
      requestId: this.requestId,
      phase: this.phase,
      loading: this.loading,
      streaming: this.streaming,
      requestInFlight: this.requestInFlight,
      abortPending: this.abortPending,
      streamOpen: this.streamOpen,
      historyLength: this.historyLength,
      lastIntent: this.lastIntent,
      lastResponseSource: this.lastResponseSource,
      marketSnapshotId: this.marketSnapshotId,
      lastReplyLength: this.lastReplyLength,
      error: this.error,
      stages: Object.assign({}, this.stages),
    };
  };

  ConversationSession.prototype.replyMeta = function () {
    return {
      conversationTurn: this.conversationTurn,
      conversationId: this.conversationId,
      intent: this.lastIntent,
      responseSource: this.lastResponseSource,
      marketSnapshotId: this.marketSnapshotId,
    };
  };

  ConversationSession.prototype.mark = function (stage, detail) {
    this.stages[stage] = {
      at: Date.now(),
      turn: this.conversationTurn,
      requestId: this.requestId,
      detail: detail ? String(detail).slice(0, 160) : undefined,
    };
  };

  ConversationSession.prototype.recoverIfStuck = function (reason) {
    if (
      this.phase === "IDLE" &&
      !this.requestInFlight &&
      !this.streamOpen &&
      !this.loading &&
      !this.abortPending
    ) {
      return false;
    }
    this.lastRecoverReason = reason;
    this.abortPending = false;
    this.streamOpen = false;
    this.requestInFlight = false;
    this.streaming = false;
    this.loading = false;
    this.phase = "IDLE";
    this.mark("CLEANUP", "recover:" + reason);
    return true;
  };

  ConversationSession.prototype.beginTurn = function (opts) {
    opts = opts || {};
    this.recoverIfStuck("new-turn");
    this.conversationTurn += 1;
    this.requestId = opts.requestId || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    this.phase = "REQUESTING";
    this.loading = true;
    this.streaming = false;
    this.requestInFlight = true;
    this.abortPending = false;
    this.streamOpen = false;
    this.error = null;
    this.lastReplyLength = 0;
    this.lastResponseSource = null;
    if (typeof opts.historyLength === "number") this.historyLength = opts.historyLength;
    this.stages = emptyStages();
    this.mark("TURN_START", opts.text);
    this.mark("USER_MESSAGE", opts.text);
    this.mark("HISTORY_LENGTH", String(this.historyLength));
  };

  ConversationSession.prototype.setIntent = function (intent) {
    this.lastIntent = intent || null;
    this.mark("INTENT", this.lastIntent || "undefined");
  };

  ConversationSession.prototype.setMarketSnapshotId = function (id) {
    this.marketSnapshotId = id || null;
    this.mark("MARKET_STATE", this.marketSnapshotId || "none");
  };

  ConversationSession.prototype.markApiStart = function (status) {
    this.mark("API_START");
    this.mark("STATUS", status || "start");
  };

  ConversationSession.prototype.markStreamStart = function () {
    this.phase = "STREAMING";
    this.streaming = true;
    this.streamOpen = true;
    this.mark("STREAM_START");
  };

  ConversationSession.prototype.markFirstToken = function () {
    if (!this.stages.FIRST_TOKEN) this.mark("FIRST_TOKEN");
  };

  ConversationSession.prototype.complete = function (opts) {
    opts = opts || {};
    this.lastReplyLength = opts.replyLen != null ? opts.replyLen : this.lastReplyLength;
    if (opts.responseSource) this.lastResponseSource = opts.responseSource;
    this.phase = "COMPLETE";
    this.streaming = false;
    this.streamOpen = false;
    this.mark("STREAM_END");
    this.mark("RESPONSE_LENGTH", String(this.lastReplyLength));
  };

  ConversationSession.prototype.fail = function (error, responseSource) {
    this.error = error;
    this.lastResponseSource = responseSource || "error";
    this.phase = "ERROR";
    this.streaming = false;
    this.streamOpen = false;
    this.mark("ERROR", error);
  };

  ConversationSession.prototype.settleIdle = function () {
    this.phase = "IDLE";
    this.loading = false;
    this.streaming = false;
    this.requestInFlight = false;
    this.abortPending = false;
    this.streamOpen = false;
    this.mark("CLEANUP", "idle");
    return this.snapshot();
  };

  ConversationSession.prototype.assertIdle = function () {
    const issues = [];
    if (this.phase !== "IDLE") issues.push("phase=" + this.phase);
    if (this.loading) issues.push("loading");
    if (this.streaming) issues.push("streaming");
    if (this.requestInFlight) issues.push("requestInFlight");
    if (this.abortPending) issues.push("abortPending");
    if (this.streamOpen) issues.push("streamOpen");
    return issues;
  };

  window.DeskCopilotConversation = {
    createSession(id) {
      return new ConversationSession(id);
    },
    STAGES,
  };
})();
