/** Client mirror of lib/voice-emotion.ts */
(function () {
  const JOKE_PATTERNS = [
    /\bwhy did the trader\b/i,
    /\bladder to the desk\b/i,
    /\bmarket kept hitting new highs\b/i,
    /\bwhat do you call\b/i,
    /\bknock knock\b/i,
    /\bhow do you\b.+\?/i,
  ];

  function shouldChuckle(text) {
    const t = String(text || "").trim();
    if (!t || t.length < 20) return false;
    if (/\b(chart read|nasdaq futures|entry zone|pdh|pdl)\b/i.test(t)) return false;
    for (const re of JOKE_PATTERNS) {
      if (re.test(t)) return true;
    }
    if (/\bjoke\b/i.test(t) && /\?/.test(t) && t.length >= 28) return true;
    return false;
  }

  function ttsInstructionsFor(text) {
    if (!shouldChuckle(text)) return null;
    return (
      "Warm, natural desk co-pilot voice. Brief soft chuckle or amused breath right before the punchline, " +
      "then deliver the line conversationally — playful but not cartoonish."
    );
  }

  function speechEmotionFor(text) {
    const chuckle = shouldChuckle(text);
    return {
      chuckle,
      instructions: chuckle ? ttsInstructionsFor(text) : null,
      preferApiTts: false,
    };
  }

  window.DeskCopilotVoiceEmotion = {
    shouldChuckle,
    ttsInstructionsFor,
    speechEmotionFor,
  };
})();
