# KAREN — Short-Turn Composer + Conversational Challenge Follow-up

**Date:** 2026-08-15  
**Tree:** `.tmp/karen-final-integration/`  
**Mode:** DIAGNOSE → SMALLEST FIX → VERIFY  
**Deploy / commit / push:** none  

**Fix class:** **class-level** (challenge/skepticism follow-up class + composer typed-submit contract). Not an exact-phrase patch for `"Really is that true"`.

---

## ROOT_CAUSE_CONTEXT

Generic casual acknowledgement in `followUpReply` treated skepticism containing `\btrue\b` / `\breally\b` as agreement (`"Same energy."`), and challenge utterances were **not** classified as discourse follow-ups against the prior assistant claim — so they fell through to canned ack / initiation / nonsense instead of answering the challenge.

## FIRST_BROKEN_HOP_CONTEXT

**Follow-up class → casual local reply**  
Specifically: missing **challenge/skepticism** class before the acknowledgement pool in `followUpReply` / before unresolved casual fallback. Prior assistant text was available; the hop that broke was classification + reply selection (not history transport).

---

## ROOT_CAUSE_ONE_WORD

Typed composer shared the STT hallucination guard (`isTranscriptionHallucination`: `words.length < 2 && !?` → drop) via `enqueueUserMessage` → `shouldDropUserTranscript`. One-word typed turns (`why`, `really`, `k`, …) were dropped before routing.

## FIRST_BROKEN_HOP_ONE_WORD

**submit guard / sanitisation** in `enqueueUserMessage` (STT drop applied to typed SEND/Enter), not the input widget or Enter handler itself.

---

## FIX

1. **Challenge class** in `conversation-context-resolve`: `isChallengeOrSkepticismFollowUp`, kind `"challenge"`, anaphora membership, `answerGeneralChatFollowUp` contextual affirm against `priorAssistant` (persona / casual preference). Domain preserved for `MARKET_READ` / `MARKET_LEVEL` so trading does not get casual invention.
2. **Precedence:** challenge handled before `"Same energy."` acknowledgement regex; bare agreement (`true`/`nice`/`facts`) still allowed.
3. **Trading:** mentor bare follow-up + `isExplainPreviousMarketRead` include challenge particles after market; level comparative owns challenge when prior levels exist (re-check closer arithmetic); `isCasualChat` excludes market/level + challenge.
4. **Composer:** SEND/Enter pass `{ typed: true, source: "composer" }`; typed path = trim → empty reject → SEND (no STT one-word drop). Shift+Enter unchanged (no submit).

### FILES_CHANGED

| File | Change |
|------|--------|
| `lib/conversation-context-resolve.ts` | challenge class + answer |
| `lib/casual-chat-intent.ts` | precedence; market/level exclusions |
| `lib/mentor-intent.ts` | trading challenge → explain prior |
| `lib/level-comparative-followup.ts` | challenge → locked closer re-check |
| `extension/casual-chat.js` | mirror challenge + level ownership |
| `extension/content.js` | typed composer submit contract |
| `scripts/test-karen-short-turn-challenge-composer.ts` | focused boundary matrix |

---

## Scoreboard

| Field | Result |
|-------|--------|
| CONTEXT_CHALLENGE | **PASS** |
| TRADING_CHALLENGE_LOCKED_EVIDENCE | **PASS** |
| CASUAL_CHALLENGE | **PASS** |
| NO_PRIOR_CONTEXT_HONEST | **PASS** |
| ONE_WORD_TYPE | **PASS** |
| ONE_WORD_CLICK_SEND | **PASS** (same handler as Enter→click SEND) |
| ONE_WORD_ENTER_SEND | **PASS** |
| WHITESPACE_REJECTED | **PASS** |
| NO_DUPLICATE_SEND | **PASS** |
| BEHAVIOURAL_HARNESS | **NOT RE-RUN** this pass (avoided env/secret peek). Focused **112/0** + continuity/variability/levels/pronoun/initiation regressions PASS. Prior baseline **56/0/4** remains the last full scoreboard. |
| TYPECHECK | **PASS** (`tsc --noEmit`) |
| FOCUSED_TESTS | **PASS** `scripts/test-karen-short-turn-challenge-composer.ts` — **112/0** |

---

## Matrix notes (E1–E8)

| # | Case | Result |
|---|------|--------|
| E1 | persona → really? | PASS — role affirm, not canned |
| E2 | persona → is that actually true? | PASS |
| E3 | PDL nearer → really? | PASS — comparative arithmetic |
| E4 | WAIT → why? | PASS — mentor explain prior |
| E5 | WAIT → really? | PASS — not casual / not Same energy |
| E6 | pasta → why? | PASS — casual referent |
| E7 | pasta → seriously? / Really is that true | PASS — stand-by claim |
| E8 | why / really with no prior | PASS — honest, no invented market |

**Precedence F:** challenge before generic ack; domain ownership (history / market / levels / trading why / casual challenge / generic) preserved.

---

## Regressions checked

- `tsc --noEmit` PASS  
- `test-karen-general-chat-pronoun-context` PASS  
- `test-karen-comparative-level-followups` PASS  
- `test-karen-conversational-continuity-ux` PASS  
- `test-karen-response-variability` PASS  
- `test-conversation-initiation` PASS  
- `test-karen-casual-conversation-p1`: **1 pre-existing FAIL** — `what about Chinese` blocked as weather `CURRENT_EXTERNAL` (`location: Chinese`). Unrelated to challenge/composer; weather residual (coord agent `22233f3c`).

---

## Manual Chrome (composer)

1. Reload unpacked extension from `.tmp/karen-final-integration/extension`.  
2. Type `why` / `k` / `really` → SEND and Enter — user bubble + one request.  
3. Type `   ` → SEND must no-op (input may clear only after non-empty).  
4. Persona line → `Really is that true` → contextual role confirm, never `Same energy.`

---

## STOP

No prod deploy / commit / push. No second memory system. No feature expansion beyond these two class bugs.
