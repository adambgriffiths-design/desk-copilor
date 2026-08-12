/** Voice-only spoken brief trim — mirrored from lib/voice-spoken-sanitize.ts */
(function () {
  const MNQ_PRICE = /\b(?:2[5-9]\d{3}|3[01]\d{3}|32000)(?:\.\d{1,2})?\b/g;
  const LEVEL_LIST_SENTENCE =
    /\b(?:previous day (?:high|low)|opening range|central equilibrium|prior day|session (?:high|low))\b.*\b(?:previous day|opening range|central equilibrium|prior day|session (?:high|low)|at \d{5})/i;
  const LABELLED_PANEL_FRAGMENT =
    /\b(?:Key levels|Watch next|Entry zone|Target \d|Bias|Call|Nearest support|Nearest resistance):\s*[^.!?]+[.!?]?/gi;

  function sanitizeSpokenBrief(text, opts) {
    opts = opts || {};
    const maxPrices = typeof opts.maxPrices === "number" ? opts.maxPrices : opts.levelsQuestion ? 4 : 3;
    let out = String(text || "")
      .replace(/^META:.*$/gim, "")
      .replace(/\*\*/g, "")
      .replace(LABELLED_PANEL_FRAGMENT, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (!out) return "";

    const sentences = out.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
    const kept = [];
    let priceBudget = maxPrices;

    for (const raw of sentences) {
      const sent = raw.trim();
      if (!sent) continue;
      if (LEVEL_LIST_SENTENCE.test(sent)) continue;

      const prices = sent.match(MNQ_PRICE) || [];
      if (prices.length === 0) {
        kept.push(sent);
        continue;
      }
      if (priceBudget <= 0) continue;

      if (prices.length <= priceBudget) {
        kept.push(sent);
        priceBudget -= prices.length;
        continue;
      }

      let seen = 0;
      let trimmed = sent.replace(MNQ_PRICE, (m) => {
        seen += 1;
        return seen <= priceBudget ? m : "";
      });
      trimmed = trimmed
        .replace(/\s{2,}/g, " ")
        .replace(/,\s*,/g, ",")
        .replace(/\s+([,.])/g, "$1")
        .replace(/\bat\s+[,.]/gi, "")
        .replace(/\bnear\s+[,.]/gi, "near")
        .trim();
      if (trimmed.length > 14) kept.push(trimmed);
      priceBudget = 0;
    }

    out = kept.join(" ").replace(/\s{2,}/g, " ").trim();
    if (out && !/[.!?]$/.test(out)) out += ".";
    return out;
  }

  window.DeskCopilotVoiceSpokenSanitize = { sanitizeSpokenBrief };
})();
