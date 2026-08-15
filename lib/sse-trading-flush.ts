/**
 * Trading SSE display vs final validation.
 * STREAMING DISPLAY: flush each LLM token as an unvalidated delta.
 * FINAL: caller still runs polish + enforceVisibleDecisionContract on the complete text.
 */

import { noteLlmUsage, type LlmUsageLike } from "./live-latency-profile";

export type ChatCompletionLikeChunk = {
  choices?: Array<{ delta?: { content?: string | null } | null } | null> | null;
  /** Present on the final chunk when stream_options.include_usage is set. */
  usage?: LlmUsageLike | null;
};

export const SSE_NO_BUFFER_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
  "Content-Encoding": "identity",
};

export function encodeSseEvent(encoder: TextEncoder, payload: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * Invoke onDelta for every non-empty token before the iterator yields the next chunk.
 * Returns the accumulated raw completion (unvalidated).
 * When OpenAI sends a final usage chunk (include_usage), records completion_tokens
 * onto the active live-latency profile — measurement only.
 */
export async function flushTradingLlmDeltas(
  stream: AsyncIterable<ChatCompletionLikeChunk>,
  onDelta: (text: string) => void
): Promise<string> {
  let full = "";
  for await (const chunk of stream) {
    if (chunk.usage) noteLlmUsage(chunk.usage);
    const delta = chunk.choices?.[0]?.delta?.content || "";
    if (!delta) continue;
    full += delta;
    onDelta(delta);
  }
  return full;
}
