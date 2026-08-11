/** Injected into user-facing LLM prompts — responses must spell out ICT terms. */
export const PLAIN_LANGUAGE_RULE = `## Plain language (strict — all user-facing text)
Never use abbreviations, acronyms, or ticker shorthand in responses. Spell everything out.

Required expansions:
- fair value gap (never FVG)
- market structure shift (never MSS or CHoCH)
- order block (never OB)
- opening range gap (never ORG)
- consequent encroachment (never CE)
- new week opening gap (never NWOG)
- new day opening gap (never NDOG)
- accumulation, manipulation, distribution (never AMD)
- higher timeframe (never HTF)
- premium/discount array (never PD)
- relative equal highs / relative equal lows (never EQH/EQL)
- optimal trade entry (never OTE)
- one-minute / five-minute / fifteen-minute chart (never 1m, 5m, 15m)
- Nasdaq futures or Micro E-mini Nasdaq (never MNQ)
- previous day high, previous day low, previous day close (never PDH, PDL, PDC)
- inverse fair value gap / fair value gap profile (never IVFVG, FPFVG as acronyms)

Short label prefixes are OK (Bias:, Structure:, Key levels:) but every value after the colon must use full words only.

The final META line keeps its fixed format for logging only — never read aloud.`;
