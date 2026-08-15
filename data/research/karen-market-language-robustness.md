# KAREN — Market Language Robustness + Conversational Edge-Case Sweep

**DATE:** 2026-08-15  
**TREE:** `.tmp/karen-final-integration/`  
**PHASE:** hardening  
**DID_THIS_MOVE_EDGE_VALIDATION_FORWARD:** NO — interface hardening only.

---

## REAL_REPRO

**PASS** (diagnosed)

Chrome failure:
- Prior: teaching copy about previous day high/low/close  
- User: `what is the previous daily high`  
- Actual: `I'm game. What's a small thing that always puts you in a better mood?`

---

## ROOT_CAUSE

Exact-phrase matchers only recognized **`previous day high`**, not **`previous daily high`** (and similar natural synonyms like `yesterday's high`).

Because the concept was unrecognized:

1. `isClearlyTrading` → false (TRADING_WORDS has `pdh` but not natural PD paraphrases)  
2. `isGeneralConversation` → true (`what is …`)  
3. `isCasualChat` → true  
4. Extension `shouldRouteCasual` → casual path  
5. Casual initiator / fallback pool → **“I'm game…”** (DOMAIN_ESCAPE)

Same class: keyword miss → casual domain escape. Not a data/QG failure.

---

## FIRST_BROKEN_HOP

**Concept recognition / alias normalization before casual gate**

Specifically: `isSimplePdLevelValueAsk` / `classifyChartQuestion` / `isClearlyTrading` failed to map `previous daily high` → canonical **PDH** before `isCasualChat` / extension casual routing.

Secondary hop: no early light-PD short-circuit that could override a stale `casualOnly` from the extension.

---

## FIX (class-level — not exact-phrase patch)

Introduced **`lib/market-concept-normalize.ts`**:

- human wording → canonical concept id  
- `expandMarketConceptAliases` rewrites to surfaces existing owners already match (`previous day high`)  
- **Single value owner unchanged** (light PD / snapshot / Yahoo daily)

Wired into:

- `casual-chat-intent` (`isClearlyTrading`, `isCasualChat` early exit)  
- `light-pd-level`  
- `chart-question-intent`  
- `market-snapshot`  
- `conversational-query`  
- `app/api/chat/stream/route.ts` — early light PD before casual  
- `extension/casual-chat.js` — mirror `hasMarketConceptAsk`

Recognized market concept + missing data → honest unavailable (stays in market domain). Never invents PDH.

---

## METRICS

| Metric | Result |
|--------|--------|
| MARKET_ALIAS_RESOLUTION (unit) | **151/151 PASS** |
| PDH_ALIASES | covered in unit matrix (incl. previous daily / yesterday / prior) |
| PDL_ALIASES | covered |
| PDC_ALIASES | covered |
| DOMAIN_ESCAPE (I'm game / better mood) | **0** on PDH paraphrases after fix |
| OPENAI_ON_DETERMINISTIC_ALIASES | **0** (light PD path) |
| UNNECESSARY_INTEL_BUILDS | **0** for pure PD alias asks |
| BEHAVIOURAL_HARNESS `--fast` | **68 PASS / 0 FAIL / 4 SKIP** |
| TYPECHECK | **PASS** |
| FOCUSED_TESTS | `scripts/test-karen-market-alias-robustness.ts` **151 PASS** |

### Not fully closed this session (residuals)

| Area | Status |
|------|--------|
| SHORT_FOLLOWUPS full matrix | PARTIAL — prior work exists; not re-fuzzed end-to-end here |
| CONTEXT_CHALLENGES (`really is that true`) | In-flight / sibling class (`Same energy`) — verify after reload |
| CORRECTIONS / TYPO / TOPIC_SWITCH full fuzz | Seeded directionally; expand corpus next if needed |
| COMPOSER_SHORT_TURNS | Sibling brief; verify in Chrome after reload |

---

## P0_REMAINING

**0** for the reported class (market paraphrase → casual domain escape for PDH/PDL/PDC).

## P1_REMAINING

- Broader controlled fuzz generator (Part 13–14) not fully automated beyond PD alias seed  
- Challenge/skepticism + one-word composer (separate class) — confirm in Chrome  
- Full multi-concept alias families beyond PD arrays (ONH/session/etc. mapped but not fully corpus-fuzzed)

---

## FILES_CHANGED

- `lib/market-concept-normalize.ts` **(new)**  
- `lib/light-pd-level.ts`  
- `lib/casual-chat-intent.ts`  
- `lib/chart-question-intent.ts`  
- `lib/market-snapshot.ts`  
- `lib/conversational-query.ts`  
- `app/api/chat/stream/route.ts`  
- `extension/casual-chat.js`  
- `scripts/test-karen-market-alias-robustness.ts` **(new)**  
- `scripts/karen-e2e/corpus.ts` (alias / domain-escape cases)  
- `scripts/_diag-previous-daily-high.ts` (diag)

---

## WHAT_WAS_NOT_CHANGED

QG / freshness / DecisionEnvelope SoT / actionable-history semantics / trading decision rules / anti-hallucination thresholds / Decision Validation engine.

---

## FREEZE_RECOMMENDATION

**CONTINUE_HARDENING** briefly for:

1. Chrome smoke: `what is the previous daily high` after **reload + preview redeploy** (server + extension)  
2. Confirm challenge/composer sibling fixes  
3. Optional: expand alias fuzz corpus for ONH/session

Then **CONVERSATIONAL_FREEZE_BUGFIX_ONLY** and pivot primary effort to:

**Trading-logic correctness → Decision Validation v0 → historical replay**

(`npm run test:karen-decision-validation:v0` already scaffolded)

---

## BEFORE → AFTER

| Prompt | Before | After |
|--------|--------|-------|
| `what is the previous daily high` | casual → “I'm game…” | desk PDH path (`light_pd_level` / snapshot); value or honest unavailable |
| `yesterday's high` | casual/general miss | PDH |
| `previous day high` | already level in some paths but still `isCasualChat=true` | not casual; trading owned |

---

## NEXT

1. Redeploy preview including this tree + reload extension  
2. Human smoke: previous daily high / yesterday's high / PDL paraphrases  
3. Freeze conversational expansion  
4. Push Decision Validation
