/** Karen desk co-pilot — client mirror of lib/desk-persona.ts */
(function () {
  const ASSISTANT_NAME = "Karen";

  const LEADING_ASSISTANT_NAME =
    /^(?:hey[\s,—–-]+)?karen(?:\s+here)?\s*(?:[:—–-]|,)\s+/i;

  function stripAssistantNamePrefix(text) {
    let t = String(text || "").trim();
    if (!t) return t;
    let prev = "";
    while (t !== prev) {
      prev = t;
      t = t.replace(LEADING_ASSISTANT_NAME, "").trim();
    }
    return t;
  }

  const KAREN_TOOL_ACKS = {
    mark_levels:
      "On it — pulling PD and session levels. Give me about thirty seconds — your mic stays live.",
    get_chart_read: "One sec — pulling chart data and building your read.",
    get_market_snapshot: "Checking that now.",
    get_last_verdict: "Repeating your last read.",
    capturing: "Hold on — capturing the chart.",
    analyzing: "Building your brief — ten seconds or so.",
    levels_busy:
      "Levels are already loading — Yahoo takes thirty to sixty seconds. Lines will land when ready.",
    levels_progress: [
      "Still on those levels — almost there.",
      "Yahoo's being slow — hang tight, lines are coming.",
    ],
    thinking: "One sec…",
    snapshot: "Pulling live prices…",
    connected: "Karen online — talk anytime.",
  };

  const KAREN_STATUS = {
    idle: "",
    listening: "KAREN · listening",
    thinking: "KAREN · thinking",
    speaking: "KAREN · speaking",
    chatting: "KAREN · chatting",
    capturing: "KAREN · capturing chart",
    analyzing: "KAREN · building read",
    marking_levels: "KAREN · marking levels",
    snapshot: "KAREN · live prices",
  };

  const KAREN_WELCOME =
    "Hey — Karen here. Press Analyse Market for the desk verdict, ask me price or levels, or just talk.";

  /** Brief spoken acks while async work runs (voice on, noticeable wait). */
  const KAREN_WORKING_ACKS = {
    chart_read: "Reading the chart.",
    thinking: "One moment.",
    check: "Let me check.",
    lookup: "Looking that up.",
    snapshot: "Checking that now.",
    deep_analysis:
      "Yep — give me a second, I'm checking the current market state.",
    market_verdict:
      "Yep — give me a second, I'm checking the current market state.",
    market_check: "Right — let me work through the structure on that.",
  };

  /** Short spoken confirmations when the user clicks panel buttons. */
  const KAREN_UI_ACKS = {
    voice_on: "Voice on.",
    voice_off: "Turning voice off.",
    chart_read: "Reading the chart.",
    mark_levels: "Marking levels.",
    strip_levels: "Stripping levels.",
    reconnect: "Reconnecting.",
    check_mic: "Checking your mic.",
    stop_audio: "Stopping.",
    hands_free_on: "Hands-free on.",
    hands_free_off: "Hands-free off.",
    read_aloud_on: "I'll read briefs aloud.",
    read_aloud_off: "Read aloud off.",
  };

  function karenToolAck(tool, variant) {
    const entry = KAREN_TOOL_ACKS[tool];
    if (!entry) return "";
    if (Array.isArray(entry)) return entry[(variant || 0) % entry.length] || entry[0];
    return entry;
  }

  function karenStatusLine(phase) {
    return KAREN_STATUS[phase] || "";
  }

  function karenUiAck(key) {
    return KAREN_UI_ACKS[key] || "";
  }

  function karenWorkingAck(key) {
    return KAREN_WORKING_ACKS[key] || "";
  }

  window.DeskCopilotPersona = {
    name: ASSISTANT_NAME,
    welcome: KAREN_WELCOME,
    stripAssistantNamePrefix,
    karenToolAck,
    karenUiAck,
    karenWorkingAck,
    karenStatusLine,
  };
})();
