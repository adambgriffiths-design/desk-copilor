import { resolveSessionContext, sessionPhaseSummary } from "@/lib/sessions";

/** Live clock + session for Realtime voice instructions and get_desk_time tool. */
export function formatVoiceDeskContext(now = new Date()): string {
  const session = resolveSessionContext(now);
  const est = now.toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
  return [
    `Current desk time (US Eastern): ${est}.`,
    `Active session: ${sessionPhaseSummary(session)}.`,
  ].join(" ");
}
