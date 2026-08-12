/** Context-aware STT fixes — mirrored from lib/voice-context-fix.ts */
(function () {
  const TRAVEL_CTX =
    /\b(travel|trip|vacation|holiday|visit|coast|beach|sea|italy|italian|amalfi|positano|capri|rome|florence|pizza|gelato|limoncello|best thing to do|things to do|where to go|recommend)\b/i;

  const GHOST_OK =
    /\b(ghost|haunted|spooky|halloween|paranormal|ghost story|ghost stories)\b/i;

  function applyContextualSttFixes(text, recentContext) {
    let t = String(text || "").trim();
    if (!t) return t;
    const ctx = String(recentContext || "");
    const lower = t.toLowerCase();

    if (/\b(amalfi|almafi)\s+ghost\b/i.test(t)) {
      if (TRAVEL_CTX.test(ctx) || TRAVEL_CTX.test(t) || !GHOST_OK.test(ctx)) {
        t = t.replace(/\b(amalfi|almafi)\s+ghost\b/gi, "Amalfi Coast");
      }
    }

    if (/\bghost\b/i.test(lower) && TRAVEL_CTX.test(ctx) && !GHOST_OK.test(ctx) && !GHOST_OK.test(t)) {
      t = t.replace(/\bghost\b/gi, "coast");
    }

    if (/\bitalian ghost\b/i.test(t) && TRAVEL_CTX.test(ctx)) {
      t = t.replace(/\bitalian ghost\b/gi, "Italian coast");
    }

    if (/\bbutter kitchen\b/i.test(t) && /\b(indian|curry|food|eat|order|chicken)\b/i.test(ctx)) {
      t = t.replace(/\bbutter kitchen\b/gi, "butter chicken");
    }

    return t.replace(/\s+/g, " ").trim();
  }

  function needsContextualInterpret(text, recentContext) {
    const t = String(text || "").trim();
    if (!t) return false;
    const ctx = String(recentContext || "");
    const fixed = applyContextualSttFixes(t, ctx);
    if (fixed.toLowerCase() !== t.toLowerCase()) return true;
    if (/\b(amalfi|almafi)\s+ghost\b/i.test(t) && TRAVEL_CTX.test(ctx)) return true;
    if (/\bghost\b/i.test(t) && TRAVEL_CTX.test(ctx) && !GHOST_OK.test(t) && !GHOST_OK.test(ctx)) {
      return true;
    }
    if (/\b(coast|ghost|post|most|host)\b/i.test(t) && ctx.length > 20) {
      if (/\bwhat (did|do) you (say|mean)|that's what i said|i said|i meant\b/i.test(t)) {
        return true;
      }
    }
    return false;
  }

  function formatRecentContext(messages, limit) {
    const n = typeof limit === "number" ? limit : 6;
    return (messages || [])
      .slice(-n)
      .map((m) => `${m.role}: ${String(m.content || "").trim()}`)
      .filter((line) => line.length > 6)
      .join("\n");
  }

  window.DeskCopilotVoiceContext = {
    applyContextualSttFixes,
    needsContextualInterpret,
    formatRecentContext,
  };
})();
