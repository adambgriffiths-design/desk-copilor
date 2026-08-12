/** Merge final + interim STT from the same utterance — ignore stale interim. */

export function sttTranscriptsRelated(a: string, b: string): boolean {
  const x = String(a || "").trim().toLowerCase();
  const y = String(b || "").trim().toLowerCase();
  if (!x || !y) return false;
  if (x === y) return true;
  return x.startsWith(y) || y.startsWith(x);
}

/** True when longer clearly extends shorter (same utterance growth). */
export function isSttExtension(shorter: string, longer: string): boolean {
  const s = String(shorter || "").trim().toLowerCase();
  const l = String(longer || "").trim().toLowerCase();
  if (!s || !l || l.length <= s.length) return false;
  return l.startsWith(s);
}

/** Prefer final when interim is from a different utterance. */
export function mergeSttTranscript(finalRaw: string, interimRaw: string): string {
  const fin = String(finalRaw || "").trim();
  const interim = String(interimRaw || "").trim();
  if (!interim) return fin;
  if (!fin) return interim;
  if (!sttTranscriptsRelated(fin, interim)) return fin;
  const fl = fin.toLowerCase();
  const il = interim.toLowerCase();
  if (isSttExtension(fin, interim)) return interim;
  if (isSttExtension(interim, fin)) return fin;
  // Related but not a clear prefix extension — trust Whisper final over streaming interim.
  return fin;
}

/** Pick the best related transcript; prefer primary when unrelated. */
export function pickRelatedSttTranscript(primary: string, secondary: string): string {
  const a = String(primary || "").trim();
  const b = String(secondary || "").trim();
  if (!b) return a;
  if (!a) return b;
  if (!sttTranscriptsRelated(a, b)) return a;
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  if (bl.startsWith(al) && b.length > a.length) return b;
  if (al.startsWith(bl) && a.length >= b.length) return a;
  return a.length >= b.length ? a : b;
}
