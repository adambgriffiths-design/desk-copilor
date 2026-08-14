/**
 * MNQ-favoured symbol classifier — run: npx tsx scripts/test-nasdaq-symbol.ts
 */
import {
  classifyNasdaqRoot,
  resolveQuoteInstrument,
  yahooSymbolForRoot,
  tvContinuousSymbol,
} from "../lib/nasdaq-symbol";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(classifyNasdaqRoot("MNQ") === "MNQ", "MNQ");
assert(classifyNasdaqRoot("MNQ1!") === "MNQ", "MNQ1!");
assert(classifyNasdaqRoot("CME_MINI:MNQ1!") === "MNQ", "CME_MINI:MNQ1!");
assert(classifyNasdaqRoot("MNQU2026") === "MNQ", "MNQU2026");
assert(classifyNasdaqRoot("NQ") === "NQ", "NQ");
assert(classifyNasdaqRoot("NQ1!") === "NQ", "NQ1!");
assert(classifyNasdaqRoot("CME_MINI:NQ1!") === "NQ", "CME_MINI:NQ1!");
assert(classifyNasdaqRoot("NQU2026") === "NQ", "NQU2026");
assert(classifyNasdaqRoot("MNQ and NQ") === "MNQ", "both → MNQ first");
assert(classifyNasdaqRoot("ES1!") == null, "ES not nasdaq");
assert(classifyNasdaqRoot("") == null, "empty");
assert(resolveQuoteInstrument(null) === "MNQ", "null → MNQ");
assert(resolveQuoteInstrument("garbage") === "MNQ", "ambiguous → MNQ");
assert(resolveQuoteInstrument("NQ1!") === "NQ", "clear NQ");
assert(yahooSymbolForRoot("MNQ") === "MNQ=F", "yahoo MNQ");
assert(yahooSymbolForRoot("NQ") === "NQ=F", "yahoo NQ");
assert(tvContinuousSymbol("MNQ") === "MNQ1!", "tv MNQ");
assert(tvContinuousSymbol("NQ") === "NQ1!", "tv NQ");

console.log("test-nasdaq-symbol: all checks passed");
