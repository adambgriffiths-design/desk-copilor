/** Client mirror of lib/desk-memory.ts — chrome.storage.local bond memory. */
(function () {
  const STORAGE_KEY = "dc-desk-memory";
  const MAX_USER_NOTES = 24;
  const MAX_KAREN_NOTES = 12;
  const MAX_TOPICS = 16;

  let cache = null;

  function clean(s) {
    return String(s || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function pushUnique(list, line, max) {
    const t = clean(line);
    if (!t || t.length < 3) return list;
    const lower = t.toLowerCase();
    if (list.some((x) => String(x).toLowerCase() === lower)) return list;
    return [t, ...list].slice(0, max);
  }

  function normalizeMemory(raw) {
    if (!raw || typeof raw !== "object") {
      return { userNotes: [], karenNotes: [], topics: [] };
    }
    return {
      userName: typeof raw.userName === "string" ? clean(raw.userName).slice(0, 40) : undefined,
      userNotes: Array.isArray(raw.userNotes)
        ? raw.userNotes.map(clean).filter(Boolean).slice(0, MAX_USER_NOTES)
        : [],
      karenNotes: Array.isArray(raw.karenNotes)
        ? raw.karenNotes.map(clean).filter(Boolean).slice(0, MAX_KAREN_NOTES)
        : [],
      topics: Array.isArray(raw.topics)
        ? raw.topics.map(clean).filter(Boolean).slice(0, MAX_TOPICS)
        : [],
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
    };
  }

  function extractMemoryUpdates(userMsg, assistantMsg, prior) {
    const base = normalizeMemory(prior);
    const q = String(userMsg || "").trim();
    const lower = q.toLowerCase();
    let userName = base.userName;
    let userNotes = [...base.userNotes];
    let karenNotes = [...base.karenNotes];
    let topics = [...base.topics];

    const nameMatch =
      q.match(/\b(?:my name'?s|my name is|i'm|i am|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/) ||
      q.match(/\b(?:my name'?s|my name is|call me)\s+([a-z]+(?:\s+[a-z]+)?)\b/i);
    if (nameMatch?.[1]) {
      const n = clean(nameMatch[1]);
      if (n.length >= 2 && n.length <= 32) {
        userName = n.charAt(0).toUpperCase() + n.slice(1);
      }
    }

    if (/\bi (like|love|prefer|enjoy|hate|can't stand)\b/i.test(q)) {
      userNotes = pushUnique(userNotes, q.replace(/\?+$/, "").trim(), MAX_USER_NOTES);
    }
    if (/\b(i trade|i'm a|i am a|my setup|my style)\b/i.test(q)) {
      userNotes = pushUnique(userNotes, q.replace(/\?+$/, "").trim(), MAX_USER_NOTES);
    }
    if (/\b(i live in|i'm from|i work|my job|my office)\b/i.test(q)) {
      userNotes = pushUnique(userNotes, q.replace(/\?+$/, "").trim(), MAX_USER_NOTES);
    }

    const topicWords = [
      [/\b(chinese|indian|thai|sushi|food|burger|pizza|mcdonald|kfc)\b/i, "food"],
      [/\b(music|song|band|artist|hip-hop|rap)\b/i, "music"],
      [/\b(travel|italy|amalfi|vacation|holiday|trip|beach)\b/i, "travel"],
      [/\b(colou?r|red|blue|navy|green)\b/i, "colours"],
      [/\b(nba|football|sport|game|team)\b/i, "sport"],
      [/\b(mnq|nasdaq|futures|ict|trading|scalp|swing)\b/i, "trading"],
      [/\b(weather|temperature|forecast)\b/i, "weather"],
    ];
    for (const [re, topic] of topicWords) {
      if (re.test(lower)) topics = pushUnique(topics, topic, MAX_TOPICS);
    }

    const a = String(assistantMsg || "").trim();
    if (a && a.length >= 12 && !/\b(chart read|nasdaq futures|entry zone)\b/i.test(a)) {
      if (/\b(my usual|team navy|desk co-pilot|sweet and sour|tikka masala)\b/i.test(a)) {
        karenNotes = pushUnique(karenNotes, a.slice(0, 120), MAX_KAREN_NOTES);
      }
    }

    return {
      userName,
      userNotes,
      karenNotes,
      topics,
      updatedAt: new Date().toISOString(),
    };
  }

  function mergeMemory(prior, patch) {
    const a = normalizeMemory(prior);
    const b = normalizeMemory(patch);
    return {
      userName: b.userName || a.userName,
      userNotes: [...b.userNotes, ...a.userNotes]
        .reduce((acc, n) => pushUnique(acc, n, MAX_USER_NOTES), [])
        .filter(Boolean),
      karenNotes: [...b.karenNotes, ...a.karenNotes]
        .reduce((acc, n) => pushUnique(acc, n, MAX_KAREN_NOTES), [])
        .filter(Boolean),
      topics: [...b.topics, ...a.topics]
        .reduce((acc, t) => pushUnique(acc, t, MAX_TOPICS), [])
        .filter(Boolean),
      updatedAt: b.updatedAt || a.updatedAt,
    };
  }

  async function loadMemory() {
    if (cache) return cache;
    try {
      const data = await chrome.storage.local.get(STORAGE_KEY);
      cache = normalizeMemory(data[STORAGE_KEY]);
    } catch {
      cache = normalizeMemory(null);
    }
    return cache;
  }

  function getMemorySync() {
    return cache || normalizeMemory(null);
  }

  async function saveMemory(memory) {
    cache = normalizeMemory(memory);
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: cache });
    } catch {
      /* ignore */
    }
    return cache;
  }

  async function rememberExchange(userMsg, assistantMsg) {
    const prior = await loadMemory();
    const patch = extractMemoryUpdates(userMsg, assistantMsg, prior);
    return saveMemory(mergeMemory(prior, patch));
  }

  async function getMemoryPayload() {
    return loadMemory();
  }

  window.DeskCopilotMemory = {
    loadMemory,
    saveMemory,
    rememberExchange,
    getMemoryPayload,
    getMemorySync,
    normalizeMemory,
  };
})();
