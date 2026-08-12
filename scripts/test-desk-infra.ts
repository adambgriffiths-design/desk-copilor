import { auditDataQuality } from "../lib/data-quality-check";
import { buildContradictionReport } from "../lib/contradiction-report";
import { buildExplainabilityReport } from "../lib/explainability";
import { runDeskPipeline } from "../lib/desk-pipeline";
import { REPLAY_FIXTURES } from "../lib/replay-fixtures";
import { PIPELINE_VERSION, buildPipelineMeta, isVersionMismatch } from "../lib/pipeline-version";
import {
  createPreTradeEntry,
  saveJournalEntry,
  validateJournalEntry,
} from "../lib/trade-journal";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const fixture = REPLAY_FIXTURES["ny-open-long-a-plus"];
assert(!!fixture, "fixture ny-open-long-a-plus exists");

const pipeline = runDeskPipeline(fixture.ctx, fixture.state);

assert(pipeline.meta?.pipeline_version === PIPELINE_VERSION, "pipeline version attached");
assert(pipeline.data_quality_report != null, "data quality report present");
assert(pipeline.contradiction_report != null, "contradiction report present");
assert(pipeline.explainability != null, "explainability report present");
assert(pipeline.explainability!.citations.length >= 2, "multiple evidence citations");
assert(pipeline.uncertainty != null, "uncertainty report present");

const quality = auditDataQuality(fixture.ctx, fixture.state);
assert(typeof quality.can_observe === "boolean", "can_observe flag");

const contradictions = buildContradictionReport(pipeline.observation, pipeline.interpretation);
assert(typeof contradictions.summary === "string", "contradiction summary");

const explain = buildExplainabilityReport(
  pipeline.observation,
  pipeline.interpretation,
  pipeline.decision,
  contradictions
);
assert(explain.verdict_citation.claim.includes(pipeline.decision.verdict), "verdict cited");

const meta = buildPipelineMeta();
assert(!isVersionMismatch(meta), "current version matches itself");
assert(isVersionMismatch({ pipeline_version: "0.0.1" }), "detects version mismatch");

const journal = createPreTradeEntry({
  id: "test-journal-entry",
  thinking_before: "Sweep into FVG — wait for retrace before long",
  planned_verdict: "WAIT",
});
assert(validateJournalEntry(journal).length === 0, "valid journal entry");
assert(validateJournalEntry({ id: "x", phase: "pre_trade" }).length > 0, "invalid journal rejected");

console.log("test-desk-infra: ok");
