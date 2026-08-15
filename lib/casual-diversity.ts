/**
 * Casual diversity pools — jokes, ask-me prompts.
 * Uses response-repetition-memory; never touches trading semantics.
 */

import {
  inferPriorIntent,
  isRephraseFollowUp,
  selectFromPool,
  type ConversationTurn,
} from "./response-repetition-memory";

export type JokeItem = { id: string; text: string };
export type AskMeItem = { id: string; text: string };

/** Large enough that ×10 repeats should not force immediate recycle. */
export const JOKE_POOL: JokeItem[] = [
  {
    id: "ladder",
    text: "Why did the trader bring a ladder to the desk? The market kept hitting new highs.",
  },
  {
    id: "scarecrow",
    text: "Why did the scarecrow win an award? He was outstanding in his field.",
  },
  {
    id: "bulls",
    text: "I told the bulls a joke about gravity — they didn't fall for it.",
  },
  {
    id: "bears",
    text: "Why don't bears use elevators? They prefer taking the stairs down.",
  },
  {
    id: "coffee",
    text: "My coffee asked for a raise. I said liquidity's tight — try again next session.",
  },
  {
    id: "chart",
    text: "A chart walks into a bar. The bartender says, 'We don't serve your type — too many wicks.'",
  },
  {
    id: "stop",
    text: "Why did the stop-loss break up with the entry? Too much emotional attachment.",
  },
  {
    id: "fvg",
    text: "What's a fair value gap's favorite genre? Incomplete stories.",
  },
  {
    id: "pdh",
    text: "PDH and PDL walked into therapy. The therapist said, 'You two need more space.'",
  },
  {
    id: "latency",
    text: "I asked my feed for a joke. It said 'buffering' — classic timing joke.",
  },
  {
    id: "monk",
    text: "A monk, a pirate, and a day trader walk into a bar. Only the trader leaves with a P&L.",
  },
  {
    id: "wifi",
    text: "Why was the Wi-Fi mad at the tick stream? Too many reconnects, not enough commitment.",
  },
  {
    id: "alarm",
    text: "My alarm is set for the London open. It has commitment issues with Asia.",
  },
  {
    id: "mirror",
    text: "I looked in the mirror and said 'be patient.' The mirror said 'that's not financial advice.'",
  },
  {
    id: "pencil",
    text: "Why did the pencil refuse to mark the chart? It was already drawn to conclusions.",
  },
];

export const ASK_ME_POOL: AskMeItem[] = [
  {
    id: "weekend",
    text: "What's one thing you're looking forward to this weekend — desk or not?",
  },
  {
    id: "food",
    text: "If we had to pick a desk lunch right now, burger or something lighter?",
  },
  {
    id: "music",
    text: "What are you running in the background when the tape goes quiet?",
  },
  {
    id: "habit",
    text: "What's a small habit that actually helps you stay sharp on long sessions?",
  },
  {
    id: "city",
    text: "Coffee city or tea city — where do you land?",
  },
  {
    id: "movie",
    text: "Last good movie or show you actually finished — what was it?",
  },
  {
    id: "travel",
    text: "If you could take a short trip next month with no chart open, where?",
  },
  {
    id: "color",
    text: "Quick one — favorite color for a workspace that doesn't fry your eyes?",
  },
  {
    id: "sport",
    text: "Any team or sport you still check scores for, even during a session?",
  },
  {
    id: "book",
    text: "Got a book or podcast that didn't feel like homework?",
  },
  {
    id: "morning",
    text: "Morning person or night owl when the real work happens?",
  },
  {
    id: "snack",
    text: "Desk snack of choice when you're deep in it — sweet or salty?",
  },
];

export function pickJokeReply(opts?: {
  messages?: ConversationTurn[];
  variant?: number;
}): string {
  return selectFromPool(JOKE_POOL, {
    family: "joke",
    messages: opts?.messages,
    variant: opts?.variant,
  }).text;
}

export function pickAskMeReply(opts?: {
  messages?: ConversationTurn[];
  variant?: number;
}): string {
  return selectFromPool(ASK_ME_POOL, {
    family: "ask_me",
    messages: opts?.messages,
    variant: opts?.variant,
  }).text;
}

export function isJokeRequest(q: string): boolean {
  return /\bjoke\b|\bfunny\b|\bmake me laugh\b/.test(String(q || "").toLowerCase());
}

export function isAskMeRequest(q: string): boolean {
  const t = String(q || "").toLowerCase();
  return (
    /\bask me (something|a question)\b/.test(t) ||
    /\bask me something interesting\b/.test(t) ||
    /\binterest(?:ing)?\b/.test(t) && /\bask\b/.test(t)
  );
}

/**
 * Resolve "another" / "say that differently" against prior intent.
 */
export function resolveCasualDiversityFollowUp(
  question: string,
  messages?: ConversationTurn[]
): string | null {
  const q = String(question || "").trim().toLowerCase();
  const prior = inferPriorIntent(messages, question);
  const rephrase = isRephraseFollowUp(q);

  if (isJokeRequest(q) || (rephrase && prior === "joke") || (rephrase && /\banother\b/.test(q) && prior === "joke")) {
    return pickJokeReply({ messages });
  }
  if (
    isAskMeRequest(q) ||
    (rephrase && prior === "ask_me") ||
    (/\banother\b/.test(q) && prior === "ask_me")
  ) {
    return pickAskMeReply({ messages });
  }

  // Bare "another" / "different one" after a joke in history.
  if (rephrase && prior === "joke") return pickJokeReply({ messages });
  if (rephrase && prior === "ask_me") return pickAskMeReply({ messages });

  return null;
}
