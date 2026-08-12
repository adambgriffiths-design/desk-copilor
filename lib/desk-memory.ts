/** Long-term bond memory — user + Karen rapport (sent from extension storage). */

export type DeskMemory = {
  userName?: string;
  userNotes: string[];
  karenNotes: string[];
  topics: string[];
  updatedAt?: string;
};

export const EMPTY_MEMORY: DeskMemory = {
  userNotes: [],
  karenNotes: [],
  topics: [],
};

const MAX_USER_NOTES = 24;
const MAX_KAREN_NOTES = 12;
const MAX_TOPICS = 16;

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function pushUnique(list: string[], line: string, max: number): string[] {
  const t = clean(line);
  if (!t || t.length < 3) return list;
  const lower = t.toLowerCase();
  if (list.some((x) => x.toLowerCase() === lower)) return list;
  return [t, ...list].slice(0, max);
}

export function normalizeMemory(raw: unknown): DeskMemory {
  if (!raw || typeof raw !== "object") return { ...EMPTY_MEMORY };
  const m = raw as Partial<DeskMemory>;
  return {
    userName: typeof m.userName === "string" ? clean(m.userName).slice(0, 40) : undefined,
    userNotes: Array.isArray(m.userNotes)
      ? m.userNotes.map(String).map(clean).filter(Boolean).slice(0, MAX_USER_NOTES)
      : [],
    karenNotes: Array.isArray(m.karenNotes)
      ? m.karenNotes.map(String).map(clean).filter(Boolean).slice(0, MAX_KAREN_NOTES)
      : [],
    topics: Array.isArray(m.topics)
      ? m.topics.map(String).map(clean).filter(Boolean).slice(0, MAX_TOPICS)
      : [],
    updatedAt: typeof m.updatedAt === "string" ? m.updatedAt : undefined,
  };
}

export function formatMemoryForPrompt(memory: DeskMemory | null | undefined): string {
  const m = normalizeMemory(memory);
  const lines: string[] = [];
  if (m.userName) lines.push(`User's name: ${m.userName}`);
  if (m.topics.length) lines.push(`Shared topics: ${m.topics.slice(0, 8).join(", ")}`);
  if (m.userNotes.length) {
    lines.push("What you know about them:");
    for (const n of m.userNotes.slice(0, 10)) lines.push(`- ${n}`);
  }
  if (m.karenNotes.length) {
    lines.push("Your running rapport with them:");
    for (const n of m.karenNotes.slice(0, 6)) lines.push(`- ${n}`);
  }
  if (!lines.length) return "";
  return [
    "Long-term memory (use naturally — don't recite as a list, don't say you are 'remembering'):",
    ...lines,
  ].join("\n");
}

/** Rule-based fact extraction from the latest exchange. */
export function extractMemoryUpdates(
  userMsg: string,
  assistantMsg?: string,
  prior?: DeskMemory | null
): DeskMemory {
  const base = normalizeMemory(prior);
  const q = userMsg.trim();
  const lower = q.toLowerCase();
  let { userName, userNotes, karenNotes, topics } = base;

  const nameMatch =
    q.match(/\b(?:my name'?s|my name is|i'm|i am|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/) ||
    q.match(/\b(?:my name'?s|my name is|call me)\s+([a-z]+(?:\s+[a-z]+)?)\b/i);
  if (nameMatch?.[1]) {
    const n = clean(nameMatch[1]);
    if (n.length >= 2 && n.length <= 32) userName = n.charAt(0).toUpperCase() + n.slice(1);
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

  const topicWords: Array<[RegExp, string]> = [
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

  const a = (assistantMsg || "").trim();
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

const USER_LOCATION_PATTERNS = [
  /\b(?:i live in|i'm from|im from|i am from|based in|located in)\s+(.+?)(?:[.?!,]|$)/i,
  /\b(?:my (?:home|office|town|city) is)\s+(.+?)(?:[.?!,]|$)/i,
];

function cleanLocation(raw: string): string {
  return raw
    .replace(/\b(right now|today|currently|now|please|uk|united kingdom|england|scotland|wales)\b/gi, "")
    .replace(/[,.]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** City/place from bond memory — e.g. "I live in Telford". */
export function extractUserLocation(memory: DeskMemory | null | undefined): string | null {
  const m = normalizeMemory(memory);
  for (const note of m.userNotes) {
    for (const re of USER_LOCATION_PATTERNS) {
      const match = note.match(re);
      if (match?.[1]) {
        const loc = cleanLocation(match[1]);
        if (loc.length >= 2 && loc.length <= 48) return loc;
      }
    }
  }
  return null;
}

export function mergeMemory(prior: DeskMemory | null | undefined, patch: DeskMemory): DeskMemory {
  const a = normalizeMemory(prior);
  const b = normalizeMemory(patch);
  let userNotes = [...a.userNotes];
  let karenNotes = [...a.karenNotes];
  let topics = [...a.topics];
  for (const n of b.userNotes) userNotes = pushUnique(userNotes, n, MAX_USER_NOTES);
  for (const n of b.karenNotes) karenNotes = pushUnique(karenNotes, n, MAX_KAREN_NOTES);
  for (const t of b.topics) topics = pushUnique(topics, t, MAX_TOPICS);
  return {
    userName: b.userName || a.userName,
    userNotes,
    karenNotes,
    topics,
    updatedAt: b.updatedAt || new Date().toISOString(),
  };
}

function normalizeMemoryQuestion(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/\s+/g, " ");
}

/** User asking Karen to recall bond memory — not live web lookup. */
export function isUserMemoryQuestion(text: string): boolean {
  const q = normalizeMemoryQuestion(text);
  if (!q) return false;
  if (/\bwhat('s| is) my name\b/.test(q)) return true;
  if (/\bdo you (know|remember) my name\b/.test(q)) return true;
  if (/\bwhat did i (tell you|say) my name\b/.test(q)) return true;
  if (/\bwhat do you call me\b/.test(q)) return true;
  if (/\bwho am i\b/.test(q) && !/\b(trading|market|chart|nasdaq|futures)\b/.test(q)) return true;
  return false;
}

export function userMemoryReply(
  question: string,
  memory?: DeskMemory | null
): string | null {
  if (!isUserMemoryQuestion(question)) return null;
  const m = normalizeMemory(memory);
  const q = normalizeMemoryQuestion(question);
  if (
    /\bwhat('s| is) my name\b/.test(q) ||
    /\bdo you (know|remember) my name\b/.test(q) ||
    /\bwhat did i (tell you|say) my name\b/.test(q) ||
    /\bwhat do you call me\b/.test(q) ||
    /\bwho am i\b/.test(q)
  ) {
    if (m.userName) return `You're ${m.userName} — I've got you.`;
    return "You haven't told me yet — what should I call you?";
  }
  return null;
}
