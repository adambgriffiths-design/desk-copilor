/**
 * Trading SSE flush: first delta must leave before the LLM iterator finishes.
 * Also proves done/delta parse still works when many small deltas precede done.
 */
import { flushTradingLlmDeltas, encodeSseEvent } from "../lib/sse-trading-flush";
import { simulatePanelStreamReader } from "../lib/conversation-state";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
  console.log("ok:", msg);
}

async function testFlushBeforeIteratorFinishes() {
  let firstDeltaSeen = false;
  let iteratorStillRunningWhenFirstDelta = false;
  let iteratorFinished = false;

  async function* tokens() {
    yield { choices: [{ delta: { content: "" } }] };
    yield { choices: [{ delta: { content: "WAIT" } }] };
    iteratorStillRunningWhenFirstDelta = firstDeltaSeen;
    if (!firstDeltaSeen) {
      throw new Error("first delta was not flushed before the stream iterator continued");
    }
    await new Promise((r) => setTimeout(r, 30));
    yield { choices: [{ delta: { content: " — named trigger" } }] };
    iteratorFinished = true;
  }

  const received: string[] = [];
  const raw = await flushTradingLlmDeltas(tokens(), (text) => {
    firstDeltaSeen = true;
    received.push(text);
  });

  assert(iteratorStillRunningWhenFirstDelta, "first delta emitted before iterator finished");
  assert(iteratorFinished, "iterator completed after first delta");
  assert(received[0] === "WAIT", "first visible delta is the first non-empty token, not the full reply");
  assert(received.join("") === "WAIT — named trigger", "deltas concatenate to full raw reply");
  assert(raw === "WAIT — named trigger", "helper returns full raw text for final validation");
  assert(received[0] !== raw, "first delta is not the entire reply wait");
}

function testSseDoneDeltaParse() {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const parts = [
    decoder.decode(encodeSseEvent(encoder, { type: "delta", text: "WAIT" })),
    decoder.decode(encodeSseEvent(encoder, { type: "delta", text: " — named trigger" })),
    decoder.decode(
      encodeSseEvent(encoder, {
        type: "done",
        reply: "WAIT — named trigger",
        responseSource: "trading_stream",
      })
    ),
  ];
  const body = parts.join("");
  const events: Array<Record<string, unknown>> = [];
  for (const block of body.split("\n\n")) {
    const line = block.split("\n").find((l) => l.startsWith("data: "));
    if (!line) continue;
    events.push(JSON.parse(line.slice(6)) as Record<string, unknown>);
  }
  assert(events[0]?.type === "delta", "parses first delta");
  assert(events[1]?.type === "delta", "parses second delta");
  assert(events[2]?.type === "done", "parses done after deltas");
  assert(events[2]?.reply === "WAIT — named trigger", "done.reply is the complete validated text");
  assert(events[2]?.responseSource === "trading_stream", "done keeps responseSource");

  const panel = simulatePanelStreamReader(
    [
      { type: "sse", data: { type: "delta", reply: "WAIT" } },
      { type: "sse", data: { type: "done", reply: "WAIT — named trigger" } },
    ],
    { finishOnSseDone: true }
  );
  assert(panel.finished, "panel reader still finishes on SSE done");
  assert(panel.reply === "WAIT — named trigger", "panel reader still takes done.reply as final");
}

async function testFlushRecordsCompletionTokens() {
  const { beginLiveLatency, clearLiveLatency, snapshotLiveLatency } = await import(
    "../lib/live-latency-profile"
  );
  beginLiveLatency("usage-test");
  async function* withUsage() {
    yield { choices: [{ delta: { content: "WAIT" } }] };
    yield {
      choices: [{ delta: { content: "" } }],
      usage: { prompt_tokens: 120, completion_tokens: 42, total_tokens: 162 },
    };
  }
  const raw = await flushTradingLlmDeltas(withUsage(), () => {});
  assert(raw === "WAIT", "usage chunk does not alter raw text");
  const snap = snapshotLiveLatency();
  assert(snap?.counters.completion_tokens === 42, "completion_tokens recorded on profile");
  assert(snap?.counters.prompt_tokens === 120, "prompt_tokens recorded on profile");
  assert(
    (snap?.notes ?? []).some((n) => n === "completion_tokens=42"),
    "completion_tokens note present"
  );
  clearLiveLatency();
}

async function main() {
  await testFlushBeforeIteratorFinishes();
  testSseDoneDeltaParse();
  await testFlushRecordsCompletionTokens();
  console.log("test-sse-trading-flush: ok");
}

void main();
