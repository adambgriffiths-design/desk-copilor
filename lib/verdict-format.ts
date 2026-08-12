import { LIVE_VERDICT_OUTPUT_WRAPPER } from "@/lib/playbook";

const META_LINE = /^META:.*$/gim;

export function parseVerdictSections(raw: string): {
  verdict: string;
  spokenBrief: string;
} {
  const text = raw.trim();
  const panelMatch = text.match(/===PANEL===\s*([\s\S]*?)(?:===SPOKEN===|$)/i);
  const spokenMatch = text.match(/===SPOKEN===\s*([\s\S]*?)(?:\nMETA:|$)/i);
  const metaMatch = text.match(/^META:.*$/im);

  let verdict = (panelMatch?.[1] || text).replace(META_LINE, "").trim();
  let spokenBrief = (spokenMatch?.[1] || "").replace(META_LINE, "").trim();

  if (metaMatch) {
    verdict = verdict ? `${verdict}\n${metaMatch[0].trim()}` : metaMatch[0].trim();
  }

  if (!spokenBrief && verdict) {
    const lines = verdict
      .split("\n")
      .filter((l) => l.trim() && !/^META:/i.test(l.trim()));
    const callLine = lines.find((l) => /^Call:/i.test(l.trim()));
    const entryLine = lines.find((l) => /^Entry zone:/i.test(l.trim()));
    const targetLine = lines.find((l) => /^Target 1:/i.test(l.trim()));
    const biasLine = lines.find((l) => /^Bias:/i.test(l.trim()));
    spokenBrief = [callLine, biasLine, entryLine, targetLine]
      .filter((l): l is string => Boolean(l))
      .map((l) => l.replace(/^[A-Za-z ]+:\s*/, "").trim())
      .join(". ")
      .replace(/\.\./g, ".");
    if (spokenBrief && !spokenBrief.endsWith(".")) spokenBrief += ".";
  }

  if (!verdict.trim() && spokenBrief) {
    verdict = spokenBrief;
  }

  return { verdict, spokenBrief };
}

export function liveVerdictUserTail(voiceInput?: boolean): string {
  const base =
    "LIVE SESSION — Analyze this Nasdaq futures one-minute chart. Use auto-fetched daily/fifteen-minute/five-minute JSON context. **All MNQ prices must come from JSON (lastClose, PD arrays, Execution scaffold) — typically 25000–32000. Never cite volume-axis numbers (~15000) from the chart image.** **Make a directional call (potential buy or potential sell) at medium confidence by default** — stand aside only if a hard no-trade rule applies. **Include Entry zone, Entry status (ACTIVE/WAIT/EXTENDED), Target 1** from Execution scaffold. **Do NOT recommend stops.** **Multiple FVGs: retrace to most recent gap only.**";

  if (voiceInput) {
    return `${base}\n\n${LIVE_VERDICT_OUTPUT_WRAPPER}`;
  }

  return `${base} Respond with a dense labeled desk brief in full words (no abbreviations).`;
}
