import { getEstMinutes } from "./market-data";

export type SessionId =
  | "asia"
  | "london"
  | "ny_pre"
  | "ny_am"
  | "ny_pm"
  | "overnight";

export type AmdPhase =
  | "accumulation"
  | "manipulation"
  | "distribution"
  | "ranging";

export type SessionContext = {
  id: SessionId;
  label: string;
  killZone: boolean;
  amdPhase: AmdPhase;
  macroWindow: string | null;
};

function inRange(m: number, start: number, end: number): boolean {
  if (start <= end) return m >= start && m < end;
  return m >= start || m < end;
}

/** ICT kill zones and AMD phase for the current EST clock. */
export function resolveSessionContext(now: Date): SessionContext {
  const m = getEstMinutes(now);

  if (inRange(m, 9 * 60 + 30, 11 * 60)) {
    let amdPhase: AmdPhase = "distribution";
    let macroWindow: string | null = null;
    if (m < 9 * 60 + 50) {
      amdPhase = "manipulation";
    } else if (m < 10 * 60 + 10) {
      amdPhase = "distribution";
      macroWindow = m < 10 * 60 ? "9:50 macro" : "10:10 macro";
    }
    return {
      id: "ny_am",
      label: "New York AM",
      killZone: true,
      amdPhase,
      macroWindow,
    };
  }

  if (inRange(m, 13 * 60 + 30, 16 * 60)) {
    return {
      id: "ny_pm",
      label: "New York PM",
      killZone: true,
      amdPhase: "distribution",
      macroWindow: inRange(m, 14 * 60 + 50, 15 * 60 + 10) ? "2:50 PM macro" : null,
    };
  }

  if (inRange(m, 7 * 60, 9 * 60 + 30)) {
    return {
      id: "ny_pre",
      label: "New York pre-market",
      killZone: m >= 7 * 60 && m < 9 * 60,
      amdPhase: "accumulation",
      macroWindow: null,
    };
  }

  if (inRange(m, 2 * 60, 5 * 60)) {
    return {
      id: "london",
      label: "London",
      killZone: m >= 3 * 60 && m < 5 * 60,
      amdPhase: m < 3 * 60 ? "manipulation" : "distribution",
      macroWindow: null,
    };
  }

  if (inRange(m, 18 * 60, 2 * 60)) {
    return {
      id: "asia",
      label: "Asia",
      killZone: inRange(m, 20 * 60, 24 * 60) || inRange(m, 0, 60),
      amdPhase: "accumulation",
      macroWindow: null,
    };
  }

  return {
    id: "overnight",
    label: "Overnight",
    killZone: false,
    amdPhase: "ranging",
    macroWindow: null,
  };
}

export function sessionPhaseSummary(ctx: SessionContext): string {
  const parts = [ctx.label, ctx.amdPhase];
  if (ctx.killZone) parts.push("kill zone");
  if (ctx.macroWindow) parts.push(ctx.macroWindow);
  return parts.join(" — ");
}
