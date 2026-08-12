import type { DeskPipelineResult } from "./desk-schema";
import { expandTradingAbbreviations } from "./plain-language";

/** Voice agent — narrates mentor brief from three-layer pipeline. Verdict immutable. */
export function narrateDeskPipeline(result: DeskPipelineResult): {
  panel: string;
  spoken: string;
} {
  return {
    panel: expandTradingAbbreviations(result.panel_brief),
    spoken: expandTradingAbbreviations(result.mentor_brief || result.spoken_brief),
  };
}
