/**
 * Conversation request lifecycle — IDLE → REQUESTING → STREAMING → COMPLETE → IDLE
 * or ERROR → IDLE. Never silent-stuck after a user bubble.
 */
import {
  classifyMentorIntent,
  isMentorMarketTurn,
  mentorContextFromMessages,
  type MentorIntent,
  type MentorIntentContext,
} from "./mentor-intent";
import { isChartReadCommand, needsFullChartRead } from "./chart-read-intent";
import { wouldRouteCasual } from "./desk-route-intent";
import { mustUseTradingStream } from "./routing";

export type ConversationPhase = "IDLE" | "REQUESTING" | "STREAMING" | "COMPLETE" | "ERROR";

export const CONVERSATION_STAGES = [
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
] as const;

export type ConversationStage = (typeof CONVERSATION_STAGES)[number];

export type StageMark = {
  at: number;
  turn: number;
  requestId: string;
  detail?: string;
};

export type ConversationReplyMeta = {
  conversationTurn: number;
  conversationId: string;
  intent: string | null;
  responseSource: string | null;
  marketSnapshotId?: string | null;
};

export type ConversationSnapshot = {
  conversationId: string;
  conversationTurn: number;
  requestId: string;
  phase: ConversationPhase;
  loading: boolean;
  streaming: boolean;
  requestInFlight: boolean;
  abortPending: boolean;
  streamOpen: boolean;
  historyLength: number;
  lastIntent: string | null;
  lastResponseSource: string | null;
  marketSnapshotId: string | null;
  lastReplyLength: number;
  error: string | null;
  stages: Record<ConversationStage, StageMark | null>;
};

export type TextTurnDispatch = {
  path: "stream" | "screenshot" | "casual";
  intent: MentorIntent;
  tradingStream: boolean;
  silentVoid: false;
};

const EMPTY_STAGES = (): Record<ConversationStage, StageMark | null> => {
  const stages = {} as Record<ConversationStage, StageMark | null>;
  for (const s of CONVERSATION_STAGES) stages[s] = null;
  return stages;
};

function newConversationId(): string {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function newRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export class ConversationSession {
  conversationId: string;
  conversationTurn = 0;
  requestId = "";
  phase: ConversationPhase = "IDLE";
  loading = false;
  streaming = false;
  requestInFlight = false;
  abortPending = false;
  streamOpen = false;
  historyLength = 0;
  lastIntent: string | null = null;
  lastResponseSource: string | null = null;
  marketSnapshotId: string | null = null;
  lastReplyLength = 0;
  error: string | null = null;
  stages: Record<ConversationStage, StageMark | null> = EMPTY_STAGES();
  lastRecoverReason: string | null = null;

  constructor(conversationId?: string) {
    this.conversationId = conversationId || newConversationId();
  }

  snapshot(): ConversationSnapshot {
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
      stages: { ...this.stages },
    };
  }

  replyMeta(): ConversationReplyMeta {
    return {
      conversationTurn: this.conversationTurn,
      conversationId: this.conversationId,
      intent: this.lastIntent,
      responseSource: this.lastResponseSource,
      marketSnapshotId: this.marketSnapshotId,
    };
  }

  mark(stage: ConversationStage, detail?: string): void {
    this.stages[stage] = {
      at: Date.now(),
      turn: this.conversationTurn,
      requestId: this.requestId,
      detail: detail ? String(detail).slice(0, 160) : undefined,
    };
  }

  recoverIfStuck(reason: string): boolean {
    if (this.phase === "IDLE" && !this.requestInFlight && !this.streamOpen && !this.loading && !this.abortPending) {
      return false;
    }
    this.lastRecoverReason = reason;
    this.abortPending = false;
    this.streamOpen = false;
    this.requestInFlight = false;
    this.streaming = false;
    this.loading = false;
    this.phase = "IDLE";
    this.mark("CLEANUP", `recover:${reason}`);
    return true;
  }

  beginTurn(opts: { requestId?: string; text?: string; historyLength?: number }): void {
    this.recoverIfStuck("new-turn");
    this.conversationTurn += 1;
    this.requestId = opts.requestId || newRequestId();
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
    this.stages = EMPTY_STAGES();
    this.mark("TURN_START", opts.text);
    this.mark("USER_MESSAGE", opts.text);
    this.mark("HISTORY_LENGTH", String(this.historyLength));
  }

  setIntent(intent: string | null | undefined): void {
    this.lastIntent = intent || null;
    this.mark("INTENT", this.lastIntent || "undefined");
  }

  setMarketSnapshotId(id: string | null | undefined): void {
    this.marketSnapshotId = id || null;
    this.mark("MARKET_STATE", this.marketSnapshotId || "none");
  }

  markApiStart(status?: string): void {
    this.mark("API_START");
    this.mark("STATUS", status || "start");
  }

  markStreamStart(): void {
    this.phase = "STREAMING";
    this.streaming = true;
    this.streamOpen = true;
    this.mark("STREAM_START");
  }

  markFirstToken(): void {
    if (!this.stages.FIRST_TOKEN) this.mark("FIRST_TOKEN");
  }

  complete(opts?: { replyLen?: number; responseSource?: string }): void {
    this.lastReplyLength = opts?.replyLen ?? this.lastReplyLength;
    if (opts?.responseSource) this.lastResponseSource = opts.responseSource;
    this.phase = "COMPLETE";
    this.streaming = false;
    this.streamOpen = false;
    this.mark("STREAM_END");
    this.mark("RESPONSE_LENGTH", String(this.lastReplyLength));
  }

  fail(error: string, responseSource = "error"): void {
    this.error = error;
    this.lastResponseSource = responseSource;
    this.phase = "ERROR";
    this.streaming = false;
    this.streamOpen = false;
    this.mark("ERROR", error);
  }

  settleIdle(): ConversationSnapshot {
    this.phase = "IDLE";
    this.loading = false;
    this.streaming = false;
    this.requestInFlight = false;
    this.abortPending = false;
    this.streamOpen = false;
    this.mark("CLEANUP", "idle");
    return this.snapshot();
  }

  assertIdle(): string[] {
    const issues: string[] = [];
    if (this.phase !== "IDLE") issues.push(`phase=${this.phase}`);
    if (this.loading) issues.push("loading");
    if (this.streaming) issues.push("streaming");
    if (this.requestInFlight) issues.push("requestInFlight");
    if (this.abortPending) issues.push("abortPending");
    if (this.streamOpen) issues.push("streamOpen");
    return issues;
  }
}

export function createConversationSession(conversationId?: string): ConversationSession {
  return new ConversationSession(conversationId);
}

export function dispatchTextTurn(
  text: string,
  ctx?: MentorIntentContext,
  messages?: Array<{ role: string; content: string }>
): TextTurnDispatch {
  const intent = classifyMentorIntent(text, ctx);
  const tradingStream = mustUseTradingStream(text, ctx);
  if (isChartReadCommand(text)) {
    return { path: "screenshot", intent, tradingStream: false, silentVoid: false };
  }
  if (isMentorMarketTurn(text, ctx) || tradingStream) {
    return { path: "stream", intent, tradingStream: true, silentVoid: false };
  }
  if (needsFullChartRead(text, { lastAssistant: ctx?.lastAssistant })) {
    return { path: "screenshot", intent, tradingStream: false, silentVoid: false };
  }
  if (wouldRouteCasual(text, text, messages)) {
    return { path: "casual", intent, tradingStream: false, silentVoid: false };
  }
  return { path: "stream", intent, tradingStream: false, silentVoid: false };
}

export function contextFromHistory(
  messages: Array<{ role: string; content: string }>,
  lastMentorIntent?: MentorIntent
): MentorIntentContext {
  return mentorContextFromMessages(messages, lastMentorIntent);
}

/**
 * Models the panel stream reader. The regression: SSE `done` rendered the reply
 * but the Promise stayed open until the HTTP body ended — Turn 2 queued forever.
 */
export function simulatePanelStreamReader(
  events: Array<{ type: string; data?: { type?: string; reply?: string; error?: string } }>,
  opts: { finishOnSseDone: boolean }
): { finished: boolean; reply: string; error: string | null; blockedFollowUp: boolean } {
  let finished = false;
  let reply = "";
  let error: string | null = null;
  const finish = (err?: string) => {
    if (finished) return;
    finished = true;
    if (err) error = err;
  };
  for (const ev of events) {
    if (ev.type === "sse") {
      const data = ev.data || {};
      if (data.type === "delta" && data.reply) reply += data.reply;
      if (data.type === "done") {
        reply = data.reply || reply;
        if (opts.finishOnSseDone) finish();
      }
      if (data.type === "error") finish(data.error || "Stream failed");
    } else if (ev.type === "done") {
      finish();
    } else if (ev.type === "error") {
      finish(ev.data?.error || "Stream failed");
    }
  }
  return { finished, reply, error, blockedFollowUp: !finished };
}

export const GOLDEN_FOLLOWUP_SEQUENCE = [
  { q: "Give me a read on the chart.", intent: "CURRENT_MARKET_READ" as MentorIntent },
  { q: "why are you leaning that way", intent: "EXPLAIN_PREVIOUS_MARKET_READ" as MentorIntent },
  { q: "What would change your mind?", intent: "INVALIDATION" as MentorIntent },
  { q: "What changed?", intent: "CHANGE_ANALYSIS" as MentorIntent },
  { q: "Which liquidity matters most right now?", intent: "LIQUIDITY_EXPLANATION" as MentorIntent },
];

export const SHORT_WHY_SEQUENCE = ["Why?", "Why?", "What changed?", "Why?"];
