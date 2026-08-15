/** Client-side STT cleanup — mirrors lib/voice-interpret.ts rule fixes. */
(function () {
  const CANONICAL_RULE_FIXES = [
      [/\bem en q\b/gi, "MNQ"],
      [/\bm and q\b/gi, "MNQ"],
      [/\bwhats\b/gi, "what's"],
      [/\bwhos\b/gi, "who's"],
      [/\bwheres\b/gi, "where's"],
      [/\bhows\b/gi, "how's"],
    [/\bf v g\b/gi, "fair value gap"],
    [/\bo r g\b/gi, "opening range gap"],
    [/\bwhat do you see on the char\b/gi, "what do you see on the chart"],
    [/\blook at the char\b/gi, "look at the chart"],
    [/\bcheck the char\b/gi, "check the chart"],
    [/\bon the char\b/gi, "on the chart"],
    [/\bwhat(?:'s|s| is) the char doing\b/gi, "what is the chart doing"],
    [/\bhow(?:'s|s| is) the char doing\b/gi, "how is the chart doing"],
    [/\bwhat(?:'s|s| is) the mark it doing\b/gi, "what is the market doing"],
    [/\bhow(?:'s|s| is) the mark it doing\b/gi, "how is the market doing"],
    [/\bchart reed\b/gi, "chart read"],
    [/\byour reed\b/gi, "your read"],
    [/\bgive me a reed\b/gi, "give me a read"],
    [/\bwhereas previews stay low\b/gi, "where is previous day low"],
    [/\bwhere is previews day low\b/gi, "where is previous day low"],
    [/\bwhere is previews day high\b/gi, "where is previous day high"],
    [/\bpreviews day low\b/gi, "previous day low"],
    [/\bpreviews day high\b/gi, "previous day high"],
    [/\bpreview day low\b/gi, "previous day low"],
    [/\bpreview day high\b/gi, "previous day high"],
    [/\bp d l\b/gi, "PDL"],
    [/\bp d h\b/gi, "PDH"],
    [/\bnas deck\b/gi, "nasdaq"],
    [/\bnas duck\b/gi, "nasdaq"],
    [/\bdealing ranch\b/gi, "dealing range"],
    [/\bpremium this count\b/gi, "premium discount"],
    [/\bem mini\b/gi, "e-mini"],
    [/\bmicro many\b/gi, "micro mini"],
    [/\bliquidity sweet\b/gi, "liquidity sweep"],
    [/\bfair value photo\b/gi, "fair value gap"],
    [/\bfirst percentage (?:of )?fair value gap\b/gi, "first presented fair value gap"],
    [/\bfirst percent (?:of )?fair value gap\b/gi, "first presented fair value gap"],
    [/\bfirst percentage fvg\b/gi, "first presented fvg"],
    [/\bfirst percent fvg\b/gi, "first presented fvg"],
    [/\bwhere is the first percentage fair value gap\b/gi, "where is the first presented fair value gap"],
    [/\bwhere(?:'s| is) the first percentage fair value gap\b/gi, "where is the first presented fair value gap"],
    [/\blast daily bullish photo\b/gi, "where is the last daily bullish fvg"],
    [/\bdaily bullish photo\b/gi, "daily bullish fvg"],
    [/\bdaily bearish photo\b/gi, "daily bearish fvg"],
    [/\bwhat(?:'s|s| is)\s+(?:the\s+)?whether\b/gi, "what's the weather"],
    [/\bhow(?:'s|s| is)\s+(?:the\s+)?whether\b/gi, "how's the weather"],
    [/\bwhat(?:'s|s| is)\s+(?:the\s+)?wetter\b/gi, "what's the weather"],
    [/\bhow(?:'s|s| is)\s+(?:the\s+)?wetter\b/gi, "how's the weather"],
    [/\bwetter\s+(?:in|at|for)\b/gi, "weather in"],
    [/\bwhat(?:'s|s| is)\s+(?:the\s+)?weird\s+(?:in|at|for)\b/gi, "what's the weather in"],
    [/\bhow(?:'s|s| is)\s+(?:the\s+)?weird\s+(?:in|at|for)\b/gi, "how's the weather in"],
    [/\balamalfi coast\b/gi, "Amalfi Coast"],
    [/\balamalfi\b/gi, "Amalfi"],
  ];

  const ROUTING_ONLY_RULE_FIXES = [
    [/\beli macdonald\b/gi, "do you like mcdonalds"],
    [/\bat our mcdonald'?s?\b/gi, "do you like mcdonalds"],
    [/\bdo you like mcdonald'?s?\b/gi, "do you like mcdonalds"],
  ];

  function applyCanonicalVoiceRules(raw) {
    let t = String(raw || "").trim();
    for (const [pattern, replacement] of CANONICAL_RULE_FIXES) {
      t = t.replace(pattern, replacement);
    }
    return t.replace(/\s+/g, " ").trim();
  }

  function applyVoiceRules(raw) {
    let t = applyCanonicalVoiceRules(raw);
    for (const [pattern, replacement] of ROUTING_ONLY_RULE_FIXES) {
      t = t.replace(pattern, replacement);
    }
    return t.replace(/\s+/g, " ").trim();
  }

  /** Incomplete greetings only — never rewrite unrelated short words. */
  function fixGreetingStt(raw, recentContext) {
    const t = String(raw || "").trim();
    if (!t) return t;
    const lower = t.toLowerCase().replace(/[.!?,]+$/, "").trim();
    if (/^how are$/i.test(lower)) return "how are you";
    if (/^(hi how|hey how)\s+are\b/i.test(t)) {
      return t.replace(/^(hi|hey)\s+how\s+are\b/i, "$1 how are you");
    }
    const ctx = String(recentContext || "").toLowerCase();
    const greetingThread =
      /\b(how are you|hello|hey|hi|good morning|good evening|what's up|whats up)\b/.test(ctx);
    if (/^(by|buy)$/i.test(lower) && greetingThread) return "hi how are you";
    return t;
  }

  function needsInterpret(text, recentContext) {
    const ctx = String(recentContext || "");
    const ruled = applyVoiceRules(text);
    if (window.DeskCopilotVoiceContext?.needsContextualInterpret?.(ruled, ctx)) return true;
    if (/\b(whereas|previews stay|preview day|previews day)\b/i.test(ruled)) return true;
    const words = ruled.split(/\s+/).filter(Boolean);
    const fillerOnly = words.length <= 2 && words.every((w) => /^(uh+|um+|hmm+)$/i.test(w));
    if (fillerOnly) return false;
    if (/\b(uh+|um+)\b/i.test(ruled) && words.length <= 3) return true;
    if (/\b(char|reed)\b/i.test(ruled) && !/\bchart\b/i.test(ruled)) return true;
    return false;
  }

  window.DeskCopilotVoiceInterpret = {
    applyCanonicalVoiceRules,
    applyVoiceRules,
    needsInterpret,
    fixGreetingStt,
  };
})();
