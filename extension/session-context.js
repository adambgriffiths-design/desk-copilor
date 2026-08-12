/**
 * ICT session / kill zone context for the desk panel (client-side EST clock).
 */
(function () {
  function getEstMinutes(date) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    }).formatToParts(date);
    const hour = Number(parts.find((p) => p.type === "hour")?.value || 0);
    const minute = Number(parts.find((p) => p.type === "minute")?.value || 0);
    return hour * 60 + minute;
  }

  function inRange(m, start, end) {
    if (start <= end) return m >= start && m < end;
    return m >= start || m < end;
  }

  function resolveSessionContext(now) {
    const m = getEstMinutes(now || new Date());

    if (inRange(m, 9 * 60 + 30, 11 * 60)) {
      let amdPhase = "distribution";
      let macroWindow = null;
      if (m < 9 * 60 + 50) {
        amdPhase = "manipulation";
      } else if (m < 10 * 60 + 10) {
        amdPhase = "distribution";
        macroWindow = m < 10 * 60 ? "9:50 macro" : "10:10 macro";
      }
      return {
        id: "ny_am",
        label: "NY AM",
        killZone: true,
        amdPhase,
        macroWindow,
      };
    }

    if (inRange(m, 13 * 60 + 30, 16 * 60)) {
      return {
        id: "ny_pm",
        label: "NY PM",
        killZone: true,
        amdPhase: "distribution",
        macroWindow: inRange(m, 14 * 60 + 50, 15 * 60 + 10) ? "2:50 PM macro" : null,
      };
    }

    if (inRange(m, 7 * 60, 9 * 60 + 30)) {
      return {
        id: "ny_pre",
        label: "NY Pre",
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

  function sessionBadgeText(ctx) {
    const parts = [ctx.label];
    if (ctx.killZone) parts.push("KZ");
    if (ctx.macroWindow) parts.push(ctx.macroWindow.replace(" macro", ""));
    return parts.join(" · ");
  }

  window.DeskCopilotSession = {
    resolve: resolveSessionContext,
    badgeText: sessionBadgeText,
  };
})();
