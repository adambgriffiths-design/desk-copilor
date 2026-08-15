# KAREN — Automated Intent-Family Robustness Sweep (Pre-Conversational Freeze)

**DATE:** 2026-08-15  
**TREE:** `.tmp/karen-final-integration/`  
**PHASE:** hardening  
**DID_THIS_MOVE_EDGE_VALIDATION_FORWARD:** NO — interface / intent-family hardening only; Decision Validation unchanged.

---

## PRODUCT DIRECTION

Conversation = interface; trading decision engine = product.  
This sweep finishes **LEVEL_PROXIMITY** family hardening so conversational expansion can freeze. Adam = max ~8 human smoke prompts. Harness owns sibling discovery.

---

## REAL_REPRO

**PASS** (original Chrome failure class fixed; verified unit + HTTP)

| Seed | Prior context | Original failure | After |
|------|---------------|------------------|-------|
| A `what is current price closer to` | `Previous day low: 30025.00 — swept…` | `Live market data is unavailable — I can't quote that yet.` | `level_compare` → Friday-close nearer-level arithmetic |
| B `what level are we nearest to` | same | same | same |

HTTP path (`POST /api/chat/stream` @ `http://127.0.0.1:3020`, extension-shaped payload):

- `responseSource=level_compare`
- `openaiCalls=0`
- `liveUnavailMisuse=false`
- `marketConcept=level_proximity`

---

## ROOT_CAUSE (first broken hop)

**Historical first broken hop:** phrase → comparative route.

Natural proximity paraphrases (esp. “current price closer to”, “level … nearest to”) were classified as **price snapshot** (or missed comparative), then hit OPEN-session LIVE unavailable copy on a **CLOSED** weekend — correct safety for live quotes, wrong owner for level-distance follow-ups.

**Secondary hop (this sweep):** concept identity.

`resolveMarketConcept("what is current price closer to")` previously returned `current_price` because the bare current-price alias fired first. Comparative routing still worked via `isComparativeDistancePhrase`, but ownership was ambiguous. Canonicalized to **`level_proximity`** (LEVEL_PROXIMITY ≡ LEVEL_DISTANCE ≡ LEVEL_COMPARISON).

---

## WHAT_CHANGED (minimal class-level)

1. **`lib/market-concept-normalize.ts`**
   - Add `level_proximity` MarketConceptId
   - Resolve via `isComparativeDistancePhrase` **before** `current_price`
   - Desk-owned; do not rewrite proximity surfaces in `expandMarketConceptAliases`

2. **`lib/level-comparative-followup.ts`** (+ extension mirror)
   - Expand proximity family: `near`, `market`/`it` referents, `distance to`, `around … price`, `one's` → `one is`
   - Bare `which` / `which one` is **context-gated** (prior levels only) so colour “which one?” stays casual
   - Single arithmetic owner unchanged (`answerComparativeLevelFollowUp`)

3. **Harness**
   - `scripts/karen-e2e/intent-family-fuzz.ts` — bounded deterministic paraphrase generator
   - `scripts/test-karen-intent-family-proximity.ts` — proximity + session matrix unit suite
   - `scripts/karen-e2e/evaluate.ts` — `DOMAIN_ESCAPE` detector + `LIVE_UNAVAILABLE_MISUSE` for CLOSED+has close
   - `scripts/karen-e2e/corpus.ts` — Chrome seeds + paraphrase matrix + session probes + colour gate
   - `scripts/karen-e2e/report.ts` — semantic-family scoreboard + failing clusters

**Not changed:** market truth, freshness/QG, DecisionEnvelope SoT, anti-hallucination, closed-market semantics, OpenAI routing for deterministic proximity.

---

## HOP TRACE (Chrome seeds)

| Hop | Result |
|-----|--------|
| Normalized text | chrome seeds unchanged |
| Market concept | `level_proximity` |
| Comparative detection | true (`closer`) |
| Chart-question class | `level` |
| Casual class | false |
| Mentor intent | not GENERAL_CHAT for owned path |
| Desk route | `snapshot/level_compare` |
| responseSource | `level_compare` |
| Price basis (weekend) | `last_close` / Friday preface |
| Session | CLOSED / `expectFresh=false` |
| Light/snapshot/comparative | **comparative** |
| MarketState/intel built? | **no** (distance math only; Yahoo last only if chart price absent) |
| OpenAI called? | **0** |
| Final response | nearer-level pts with Friday close (CLOSED+close) |

---

## METRICS

| Metric | Result |
|--------|--------|
| REAL_REPRO | **PASS** |
| PROXIMITY_PARAPHRASES | **102/102 PASS** |
| SHORT_ANAPHORIC | **6/6 PASS** |
| SESSION_MATRIX | OPEN+LIVE / OPEN+NO_LIVE / CLOSED+CLOSE / CLOSED+NO_CLOSE — **all PASS** (unit) |
| DOMAIN_ESCAPE | **0** on market-owned proximity / PDH alias cases |
| OPENAI_ON_DETERMINISTIC_PROXIMITY | **0** |
| UNNECESSARY_INTEL_BUILDS | **0** for comparative path |
| BEHAVIOURAL_HARNESS `--fast` | **83 PASS / 0 FAIL / 4 SKIP** |
| TYPECHECK | **PASS** (`tsc --noEmit`) |
| FOCUSED comparative | **ALL PASS** |
| FOCUSED market-alias | **151/151 PASS** |
| Semantic family (harness) | proximity/level_compare/chrome-repro/session_matrix/domain_escape **100%** |

### Session matrix contracts

| Cell | Contract |
|------|----------|
| OPEN + live | live basis; no Friday preface; distance language |
| OPEN + no live | trustworthy-current-price unavailable (not invent) |
| CLOSED + close | Friday/last close preface; **never** `Live market data is unavailable — I can't quote that yet.` |
| CLOSED + no close | weekend/closed honest miss; **≠** LIVE feed broken |

---

## TOP_FAILURE_CLUSTERS (unresolved)

**None** for LEVEL_PROXIMITY P0/P1 after this sweep.

### Reported separately (pre-existing / out of scope)

| Item | Notes |
|------|-------|
| `test-karen-casual-conversation-p1.ts` — `what about Chinese: non-empty` | 1 FAIL; empty casual follow-up; **not** proximity routing (confirmed not comparative). Do not expand conversational features here. |
| Other intent families (why/challenge/corrections full fuzz) | Seeds present in `intent-family-fuzz`; ownership tests are report-oriented — expand only if Chrome shows class failures. |
| HTTP OPEN+live true open-session | Weekend server clock still labels Friday close; unit session inject covers OPEN contracts. |

---

## HUMAN TESTING POLICY

**STOP using Adam as phrase-by-phrase fuzz tester.**

Harness owns sibling discovery (`intent-family-fuzz` + behavioural corpus + unit proximity suite).

### HUMAN_SMOKE_REQUIRED (max 8)

After extension reload against this tree:

1. Prior: ask PDL → get swept low with price  
2. `what is current price closer to`  
3. `what level are we nearest to`  
4. `which is closer?`  
5. `nearest level?`  
6. Colour chain: favourite colour → `which one?` (must stay casual)  
7. `how far away are they?` after PDH+PDL  
8. One PDH alias: `previous daily high` (no “I'm game”)

If all 8 smoke OK → freeze conversational expansion.

---

## FREEZE_RECOMMENDATION

**CONVERSATIONAL_FREEZE_BUGFIX_ONLY**

Rationale: Chrome proximity class closed; automated paraphrase + session matrix green; DOMAIN_ESCAPE detector in harness; openai=0 on deterministic proximity. Remaining conversational holes are residual/non-blocking — fix only with identifiable first broken hop. Next product focus: **trading-logic correctness + Decision Validation**.

---

## NEXT

1. Adam smoke ≤8 (list above) after extension reload  
2. Do **not** open new conversational feature work  
3. Move energy to Decision Validation / trading-logic correctness  
4. Optionally triage pre-existing casual `what about Chinese` empty reply as a separate P2 if it recurs in smoke  

---

## VERIFICATION COMMANDS RUN

```text
npx tsc --noEmit -p tsconfig.json                          → PASS
npx tsx scripts/test-karen-comparative-level-followups.ts  → ALL PASS
npx tsx scripts/test-karen-market-alias-robustness.ts      → 151 PASS
npx tsx scripts/test-karen-intent-family-proximity.ts      → 102/102 + 6/6 + session PASS
npm run test:karen-e2e-behavioural:fast -- --base=http://127.0.0.1:3020
  → 83 PASS / 0 FAIL / 4 SKIP
npx tsx scripts/_repro-chrome-proximity-http.ts            → level_compare, openai=0
```

No commit / push / production deploy performed.
