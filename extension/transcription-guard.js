/** STT junk filter — mirrored from lib/transcription-guard.ts */
(function () {
  const PROMPT_ECHO_PHRASES = [
    "chart read",
    "fair value gap",
    "opening range gap",
    "market structure shift",
    "liquidity sweep",
    "what do you see on the chart",
    "get the read",
    "ict trading desk",
  ];

  const GARBAGE_ONLY =
    /^(mnq|mnq futures|nasdaq|nasdaq futures|mini nasdaq|futures|thank you|thanks|you|uh|um|hmm|okay|ok|hello|hey)[.!?\s]*$/i;

  const ACRONYM_SOUP =
    /\b(fvg|org|ce|mss|ivfvg|ndog|nwog|ote|pdh|pdl|pdc)\b[\s,;]+(?:\b(fvg|org|ce|mss|liquidity|bias|premium|discount|ivfvg|ndog|nwog|ote|pdh|pdl|pdc)\b[\s,;]+){2,}/i;

  function isTradingViewDisclaimer(text) {
    const lower = String(text || "").toLowerCase();
    if (!lower.trim()) return false;
    return (
      /\bcomplete disclaimer\b/.test(lower) ||
      /\bplease see the complete disclaimer\b/.test(lower) ||
      /sites\.google\.com/.test(lower) ||
      (/\bdisclaimer\b/.test(lower) && /\b(tradingview|trading view)\b/.test(lower))
    );
  }

  function sanitizeUserTranscript(text) {
    let t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t) return t;

    if (isTradingViewDisclaimer(t)) {
      const before = t
        .split(/\b(?:please see (?:the )?complete disclaimer|sites\.google\.com)/i)[0]
        ?.trim();
      if (before && before.length >= 2 && !isTradingViewDisclaimer(before)) {
        t = before;
      } else {
        return "";
      }
    }

    t = t
      .replace(/\s*(?:please see (?:the )?complete disclaimer\b.*)$/i, "")
      .replace(/\s*https?:\/\/\S+.*$/i, "")
      .trim();

    return t;
  }

  function isTranscriptionHallucination(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t) return true;
    if (GARBAGE_ONLY.test(t)) return true;

    const lower = t.toLowerCase();
    const words = lower.split(/\s+/).filter(Boolean);

    if (words.length < 2 && !/\?/.test(t)) return true;
    if (ACRONYM_SOUP.test(t)) return true;

    const acronymCount = (
      lower.match(/\b(fvg|org|ce|mss|ivfvg|ndog|nwog|ote|pdh|pdl|pdc)\b/gi) || []
    ).length;
    if (acronymCount >= 4 && words.length <= acronymCount + 5) return true;

    let phraseHits = 0;
    for (const phrase of PROMPT_ECHO_PHRASES) {
      if (lower.includes(phrase)) phraseHits++;
    }
    if (phraseHits >= 2 && words.length < 18) return true;
    if (
      phraseHits >= 2 &&
      acronymCount >= 2 &&
      !/\b(i|we|you|the|a|is|are|was|were|can|could|should|would|buy|sell|wait|look|thanks|hello|hey|what|how)\b/i.test(
        t
      )
    ) {
      return true;
    }

    return false;
  }

  function shouldDropUserTranscript(text) {
    const t = sanitizeUserTranscript(text);
    if (!t) return isTradingViewDisclaimer(text);
    const casual = window.DeskCopilotCasual;
    if (
      isTranscriptionHallucination(t) &&
      casual?.isGreeting?.(t) !== true &&
      casual?.isFarewell?.(t) !== true
    ) {
      return true;
    }
    return false;
  }

  window.DeskCopilotTranscriptGuard = {
    isTradingViewDisclaimer,
    sanitizeUserTranscript,
    isTranscriptionHallucination,
    shouldDropUserTranscript,
  };
})();
