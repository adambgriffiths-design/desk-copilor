/**
 * Desk routing classifier — mirrors lib/desk-route-intent.ts for the extension panel.
 */
(function () {
  const ROUTE_LABELS = {
    levels: "Mark levels",
    chart_read: "Chart read",
    price: "Live price",
    snapshot: "Market snapshot",
    live_web: "Live web lookup",
    casual: "Casual chat",
    trading: "Trading Q&A",
  };

  function isPriceRoute(text) {
    const q = String(text || "").trim().toLowerCase();
    if (!q) return false;
    if (typeof resolveSnapshotIntent === "function" && resolveSnapshotIntent(text) === "price") {
      return true;
    }
    return (
      /\b(what price|what level|where are we|current price|trading at|currently trading|what are we at|where is price|where's price|how much is|last price)\b/.test(
        q
      ) ||
      (/\bwhat level\b/.test(q) && /\b(we|trading|at|on)\b/.test(q)) ||
      (/\bright now\b/.test(q) && /\b(price|trading|level|at)\b/.test(q))
    );
  }

  function isLevelsCommand(text) {
    return /\b(mark|draw|show) levels\b/i.test(String(text || ""));
  }

  function wouldRouteCasual(text, routeText, messages) {
    const mentorCtx = window.DeskCopilotMentor?.mentorContextFromMessages?.(messages) || {};
    if (
      window.DeskCopilotCasual?.isBareAnaphoraFollowUp?.(text) === true &&
      (mentorCtx.lastTurnCategory === "GENERAL_KNOWLEDGE" || mentorCtx.lastTurnCategory === "GENERAL_CHAT")
    ) {
      if (typeof isChartReadCommand === "function" && isChartReadCommand(text)) return false;
      return window.DeskCopilotCasual?.isNonTradingConversation?.(text) === true;
    }
    if (
      routeText &&
      window.DeskCopilotCasual?.isBareAnaphoraFollowUp?.(routeText) === true &&
      (mentorCtx.lastTurnCategory === "GENERAL_KNOWLEDGE" || mentorCtx.lastTurnCategory === "GENERAL_CHAT")
    ) {
      if (typeof isChartReadCommand === "function" && isChartReadCommand(text)) return false;
      return window.DeskCopilotCasual?.isNonTradingConversation?.(text) === true;
    }
    if (
      window.DeskCopilotCasual?.isStandaloneGeneralTurn?.(text) === true ||
      (routeText && window.DeskCopilotCasual?.isStandaloneGeneralTurn?.(routeText) === true)
    ) {
      // Standalone general must still lose to chart/price/trading gates (match lib/desk-route-intent.ts).
      if (typeof isChartReadCommand === "function" && isChartReadCommand(text)) return false;
      if (typeof isChartStatusQuestion === "function") {
        if (isChartStatusQuestion(text) || (routeText && isChartStatusQuestion(routeText))) return false;
      }
      if (typeof needsScopedChartAnswer === "function") {
        if (needsScopedChartAnswer(text) || (routeText && needsScopedChartAnswer(routeText))) return false;
      }
      const lastA = [...(messages || [])].reverse().find((m) => m.role === "assistant")?.content;
      const routeMentorCtx = mentorCtx.lastAssistant ? mentorCtx : { lastAssistant: lastA };
      if (window.DeskCopilotMentor?.isMentorMarketTurn?.(text, routeMentorCtx)) return false;
      if (routeText && window.DeskCopilotMentor?.isMentorMarketTurn?.(routeText, routeMentorCtx)) {
        return false;
      }
      if (window.DeskCopilotCasual?.isClearlyTrading?.(text)) return false;
      if (routeText && window.DeskCopilotCasual?.isClearlyTrading?.(routeText)) return false;
      if (isPriceRoute(text) || (routeText && isPriceRoute(routeText))) return false;
      if (typeof prefersRichTradingAnswer === "function") {
        if (prefersRichTradingAnswer(text) || (routeText && prefersRichTradingAnswer(routeText))) {
          return false;
        }
      }
      return window.DeskCopilotCasual?.isNonTradingConversation?.(text) === true;
    }
    if (window.DeskCopilotPending?.shouldDeferCasualRoute?.(text, messages) === true) return false;
    const route = routeText || text;
    if (window.DeskCopilotPending?.shouldDeferCasualRoute?.(route, messages) === true) return false;
    if (typeof isChartReadCommand === "function" && isChartReadCommand(text)) return false;
    if (typeof isChartStatusQuestion === "function") {
      if (isChartStatusQuestion(text) || isChartStatusQuestion(route)) return false;
    }
    if (typeof needsScopedChartAnswer === "function") {
      if (needsScopedChartAnswer(text) || needsScopedChartAnswer(route)) return false;
    }
    if (window.DeskCopilotCasual?.isClearlyTrading?.(text)) return false;
    if (window.DeskCopilotCasual?.isClearlyTrading?.(route)) return false;
    const lastA = [...(messages || [])].reverse().find((m) => m.role === "assistant")?.content;
    const routeMentorCtx = mentorCtx.lastAssistant ? mentorCtx : { lastAssistant: lastA };
    if (window.DeskCopilotMentor?.isMentorMarketTurn?.(text, routeMentorCtx)) return false;
    if (window.DeskCopilotMentor?.isMentorMarketTurn?.(route, routeMentorCtx)) return false;
    if (isPriceRoute(text) || isPriceRoute(route)) return false;
    if (typeof prefersRichTradingAnswer === "function") {
      if (prefersRichTradingAnswer(text) || prefersRichTradingAnswer(route)) return false;
    }
    return window.DeskCopilotCasual?.isNonTradingConversation?.(text) === true;
  }

  function shouldUseLiveWebData(text, messages) {
    const q = String(text || "").trim();
    if (!q) return false;
    if (window.DeskCopilotPending?.pendingNeedsLiveWebSearch?.(q, messages) === true) return true;
    if (window.DeskCopilotCasual?.isPersonaQuestion?.(q)) return false;
    if (typeof isChartStatusQuestion === "function" && isChartStatusQuestion(q)) return false;
    const resolved =
      window.DeskCopilotPending?.resolveSearchQuestion?.(q, messages) ||
      window.DeskCopilotCasual?.resolveWebSearchQuestion?.(q, messages) ||
      q;
    if (window.DeskCopilotCasual?.isPersonaQuestion?.(resolved)) return false;
    if (typeof isChartStatusQuestion === "function" && isChartStatusQuestion(resolved)) return false;
    if (window.DeskCopilotCasual?.needsWebSearch?.(resolved)) return true;
    return (
      window.DeskCopilotCasual?.needsWebSearch?.(q) ||
      window.DeskCopilotCasual?.needsWebSearch?.(resolved)
    );
  }

  function classifyDeskRoute(input) {
    const repair = window.DeskCopilotCasual?.repairConversationalStt;
    const core = (repair ? repair(String(input?.text || "")) : String(input?.text || "")).trim();
    const routed = (repair ? repair(String(input?.routeText || core)) : String(input?.routeText || core)).trim();
    const q = routed || core;
    const resolved = window.DeskCopilotPending?.resolveTurnQuestion?.(q, input?.messages) || q;
    const routeQ = resolved !== q ? resolved : q;
    if (!q) {
      return { route: "casual", label: ROUTE_LABELS.casual, detail: "empty" };
    }

    if (isLevelsCommand(routeQ) || isLevelsCommand(core)) {
      return { route: "levels", label: ROUTE_LABELS.levels };
    }

    const mentorCtx = window.DeskCopilotMentor?.mentorContextFromMessages?.(input?.messages, input?.lastMentorIntent) || {
      lastAssistant: input?.lastAssistant,
    };
    if (!mentorCtx.lastAssistant && input?.lastAssistant) mentorCtx.lastAssistant = input.lastAssistant;
    if (window.DeskCopilotMentor?.isMentorMarketTurn?.(routeQ, mentorCtx) || window.DeskCopilotMentor?.isMentorMarketTurn?.(core, mentorCtx)) {
      const intent = window.DeskCopilotMentor.classifyMentorIntent(routeQ, mentorCtx);
      return {
        route: "trading",
        label: ROUTE_LABELS.trading,
        detail: window.DeskCopilotMentor.mentorIntentSlug?.(intent) || "current_market_read",
      };
    }

    if (wouldRouteCasual(core, routed, input?.messages)) {
      if (shouldUseLiveWebData(routeQ, input?.messages)) {
        return { route: "live_web", label: ROUTE_LABELS.live_web, detail: "search" };
      }
      let detail = "stream";
      if (window.DeskCopilotCasual?.isUserMemoryQuestion?.(routeQ)) detail = "memory";
      else if (window.DeskCopilotCasual?.isPersonaQuestion?.(routeQ)) detail = "persona";
      return { route: "casual", label: ROUTE_LABELS.casual, detail };
    }

    const ctx = { lastAssistant: input?.lastAssistant || mentorCtx.lastAssistant };
    if (
      (typeof isChartReadCommand === "function" && isChartReadCommand(routeQ)) ||
      (typeof needsFullChartRead === "function" && needsFullChartRead(routeQ, ctx))
    ) {
      return { route: "chart_read", label: ROUTE_LABELS.chart_read, detail: "structured" };
    }

    if (
      typeof prefersRichTradingAnswer !== "function" ||
      !prefersRichTradingAnswer(routeQ)
    ) {
      if (
        (typeof needsScopedChartAnswer === "function" && needsScopedChartAnswer(routeQ)) ||
        (typeof isChartStatusQuestion === "function" && isChartStatusQuestion(routeQ))
      ) {
        const intent =
          typeof resolveSnapshotIntent === "function" ? resolveSnapshotIntent(routeQ) : "status";
        return { route: "snapshot", label: ROUTE_LABELS.snapshot, detail: intent };
      }
    }

    if (shouldUseLiveWebData(routeQ, input?.messages)) {
      return { route: "live_web", label: ROUTE_LABELS.live_web, detail: "search" };
    }

    const intent =
      typeof classifyChartQuestion === "function" ? classifyChartQuestion(routeQ) : "general";
    return {
      route: "trading",
      label: ROUTE_LABELS.trading,
      detail: intent !== "general" ? intent : undefined,
    };
  }

  function formatDeskRouteDebug(result) {
    if (!result) return "";
    return result.detail ? `${result.route} · ${result.detail}` : result.route;
  }

  function isTeachingQuestion(q) {
    const t = String(q || "").trim().toLowerCase();
    if (!t) return false;
    return (
      /\b(what is|what's|explain|define|tell me about|teach me)\b/.test(t) &&
      /\b(mss|market structure|fvg|fair value gap|nwog|ndog|org|order block|liquidity|ict|premium|discount|kill zone|displacement)\b/.test(
        t
      )
    );
  }

  function classifyAnalysisDepth(input) {
    const core = String(input?.text || "").trim();
    const routed = String(input?.routeText || core).trim();
    const q = routed || core;
    if (!q) return "GENERAL_QUESTION";

    const ctx = { lastAssistant: input?.lastAssistant };

    if (isTeachingQuestion(q)) return "GENERAL_QUESTION";
    if (window.DeskCopilotCasual?.isStandaloneGeneralTurn?.(q) === true) return "GENERAL_QUESTION";
    if (window.DeskCopilotCasual?.isPersonaQuestion?.(q) && !window.DeskCopilotMentor?.isMentorMarketTurn?.(q)) {
      return "GENERAL_QUESTION";
    }
    if (window.DeskCopilotMentor?.isMentorMarketTurn?.(q)) {
      return window.DeskCopilotMentor.teachingLengthFor(q) === "SHORT" ? "FAST_FACT" : "DEEP_ANALYSIS";
    }
    if (
      window.DeskCopilotCasual?.isNonTradingConversation?.(q) &&
      !window.DeskCopilotCasual?.isClearlyTrading?.(q) &&
      !(typeof prefersRichTradingAnswer === "function" && prefersRichTradingAnswer(q))
    ) {
      return "GENERAL_QUESTION";
    }

    if (
      (typeof isChartReadCommand === "function" && isChartReadCommand(q)) ||
      (typeof needsFullChartRead === "function" && needsFullChartRead(q, ctx))
    ) {
      return "DEEP_ANALYSIS";
    }
    if (typeof prefersRichTradingAnswer === "function" && prefersRichTradingAnswer(q)) {
      return "DEEP_ANALYSIS";
    }
    if (typeof classifyChartQuestion === "function" && classifyChartQuestion(q) === "full_read") {
      return "DEEP_ANALYSIS";
    }
    if (/\b(market verdict|full verdict|ict verdict|current verdict|give me.*verdict)\b/i.test(q)) {
      return "DEEP_ANALYSIS";
    }

    if (typeof needsScopedChartAnswer === "function" && needsScopedChartAnswer(q)) {
      return "FAST_FACT";
    }

    if (window.DeskCopilotCasual?.isClearlyTrading?.(q)) return "DEEP_ANALYSIS";

    return "GENERAL_QUESTION";
  }

  function voiceAckKeyForDepth(depth) {
    if (depth === "DEEP_ANALYSIS") return "deep_analysis";
    return null;
  }

  window.DeskCopilotRoute = {
    classifyDeskRoute,
    wouldRouteCasual,
    formatDeskRouteDebug,
    classifyAnalysisDepth,
    voiceAckKeyForDepth,
    deskRouteLabel(route) {
      return ROUTE_LABELS[route] || route;
    },
  };
})();
