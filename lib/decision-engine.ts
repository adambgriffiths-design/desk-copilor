/**
 * @deprecated Use desk-pipeline.ts — three-layer architecture.
 * Kept for backward-compatible imports.
 */
export {
  NO_TRADE_EXPORT_MESSAGE,
  runDeskPipeline,
  runDecisionPipeline,
  buildDecisionReasoningLog,
  pipelineBiasSummary,
  getLastPipelineResult,
} from "./desk-pipeline";

export { buildMarketObservation, formatObservationNarrative } from "./observation-engine";
export { buildMarketInterpretation } from "./interpretation-engine";
export { buildTradingDecision } from "./decision-layer";
export { validateInterpretationContamination } from "./contamination-guard";
