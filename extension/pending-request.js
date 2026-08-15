/**
 * Multi-turn pending state — mirrors lib/pending-request.ts for the extension panel.
 */
(function () {
  const CLARIFICATION_PREFIX =
    /^(?:i\s+mean|no[, ]+|actually[, ]+|sorry[, ]+|not that[, ]+|the one in)\s+/i;
  const CHART_SHOW_FOLLOWUP =
    /\b(show|mark|draw|point|highlight|where).*\b(on the chart|on chart|chart)\b/i;
  const VERDICT_MARKERS =
    /\b(verdict|wait|no trade|long|short|stand aside|bias|entry zone|invalidation)\b/i;

  function lastAssistant(messages) {
    if (!messages?.length) return "";
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].content || "";
    }
    return "";
  }

  function lastUser(messages) {
    if (!messages?.length) return "";
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") return messages[i].content || "";
    }
    return "";
  }

  function isWeatherClarificationPrompt(text) {
    return (
      window.DeskCopilotWeather?.isWeatherLocationPrompt?.(text) === true ||
      window.DeskCopilotCasual?.isWeatherAmbiguousPrompt?.(text) === true
    );
  }

  function cityFromAmbiguousPrompt(text) {
    const m = String(text || "").match(/\bplaces called\s+([A-Za-z][A-Za-z\s'-]{0,32})\b/i);
    return m?.[1]?.trim() || null;
  }

  function isRegionOnlyClarification(text) {
    const t = String(text || "")
      .trim()
      .replace(CLARIFICATION_PREFIX, "")
      .replace(/[.!?,]+$/, "")
      .trim();
    if (!t || t.length > 48) return false;
    if (/\b(weather|chart|trade|news|bitcoin|stock)\b/i.test(t)) return false;
    return /^[A-Za-z][A-Za-z\s,'-]{0,40}$/.test(t);
  }

  function isWeatherClarificationTurn(text) {
    const t = String(text || "").trim();
    if (!t) return false;
    if (window.DeskCopilotWeather?.isWeatherLocationSwapFollowUp?.(t) === true) return false;
    if (CLARIFICATION_PREFIX.test(t) && isRegionOnlyClarification(t)) return true;
    if (isRegionOnlyClarification(t)) return true;
    return false;
  }

  function mergeWeatherClarification(city, clarification) {
    const region = String(clarification || "")
      .trim()
      .replace(CLARIFICATION_PREFIX, "")
      .replace(/[.!?,]+$/, "")
      .trim();
    if (!city) return region;
    if (!region) return city;
    if (/\bin\b/i.test(region) || /,/.test(region)) return region;
    return `${city} ${region}`;
  }

  function weatherCityFromHistory(messages) {
    const assistant = lastAssistant(messages);
    const fromPrompt = cityFromAmbiguousPrompt(assistant);
    if (fromPrompt) return fromPrompt;
    if (!messages?.length) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== "user") continue;
      if (window.DeskCopilotWeather?.isWeatherIntent?.(msg.content) !== true) continue;
      const loc = window.DeskCopilotWeather?.resolveWeatherLocation?.(msg.content, {
        history: messages,
      })?.location;
      if (!loc) continue;
      const bare = loc.replace(/^the\s+/i, "").trim();
      if (window.DeskCopilotWeather?.isAmbiguousWeatherLocation?.(bare)) return bare;
      return bare.split(/\s+in\s+|\s*,\s*/i)[0]?.trim() || bare;
    }
    return null;
  }

  function isFollowUpWhyQuestion(question, messages) {
    const mentorCtx = window.DeskCopilotMentor?.mentorContextFromMessages?.(messages);
    return window.DeskCopilotCasual?.isLinguisticMarketFollowUp?.(question, mentorCtx) === true;
  }

  function isFollowUpInvalidationQuestion(question) {
    const q = String(question || "")
      .trim()
      .toLowerCase();
    return (
      /\b(has that|has it|was that|is that|did that|still valid|been invalidated|invalidate|invalidated yet|still hold|still good)\b/.test(
        q
      ) ||
      (/^(still|valid)\??$/.test(q) && q.length < 20)
    );
  }

  function inferPendingRequest(messages, ctx) {
    if (!messages?.length) return null;
    const assistant = lastAssistant(messages);
    if (!assistant) return null;
    const priorQuestion = lastUser(messages);

    if (isWeatherClarificationPrompt(assistant)) {
      const city = cityFromAmbiguousPrompt(assistant) || weatherCityFromHistory(messages);
      return {
        intent: "CURRENT_EXTERNAL",
        originalRequest: priorQuestion || (city ? `weather in ${city}` : ""),
        missingParam: "location",
        entities: city ? { city, task: "WEATHER" } : { task: "WEATHER" },
      };
    }

    if (
      window.DeskCopilotWeather?.isWeatherIntent?.(priorQuestion) === true &&
      !isWeatherClarificationPrompt(assistant)
    ) {
      const location =
        window.DeskCopilotWeather?.resolveWeatherLocation?.(priorQuestion, { history: messages })
          ?.location || "";
      return {
        intent: "CURRENT_EXTERNAL",
        originalRequest: priorQuestion,
        entities: { task: "WEATHER", location },
      };
    }

    if (VERDICT_MARKERS.test(assistant) && /\b(VERDICT|Bias|Entry|Wait|Long|Short)\b/i.test(assistant)) {
      return { intent: "VERDICT_EXPLAIN", originalRequest: priorQuestion, entities: {} };
    }

    if (
      typeof detectTeachingConcept === "function" &&
      detectTeachingConcept(priorQuestion) &&
      !/\[(structure|gaps|liquidity|session|bias|market_state)\./i.test(assistant) &&
      !/\b\d{4,5}(?:\.\d+)?\b/.test(assistant)
    ) {
      const topic = detectTeachingConcept(priorQuestion);
      return { intent: "TEACHING", originalRequest: priorQuestion, entities: topic ? { concept: topic } : {} };
    }

    if (
      /\[(structure|gaps|liquidity|session|bias|market_state)\./i.test(assistant) ||
      (/\b(MSS|NWOG|NDOG|FVG|market structure shift)\b/i.test(assistant) &&
        /\b\d{4,5}(?:\.\d+)?\b/.test(assistant))
    ) {
      const topic = /\bnwog\b/i.test(assistant)
        ? "gaps.nwog"
        : /\bndog\b/i.test(assistant)
          ? "gaps.ndog"
          : /\bmss\b/i.test(assistant)
            ? "structure.mss"
            : /\bfvg\b/i.test(assistant)
              ? "structure.fvg"
              : ctx?.lastTopic || "";
      return { intent: "MARKET_INTEL", originalRequest: priorQuestion, entities: topic ? { lastTopic: topic } : {} };
    }

    if (ctx?.lastFactIds?.length || ctx?.lastTopic) {
      return {
        intent: "MARKET_INTEL",
        originalRequest: priorQuestion,
        entities: { lastTopic: ctx.lastTopic || ctx.lastFactIds?.[0] || "" },
      };
    }

    return null;
  }

  function classifyTurn(text, messages, ctx) {
    const q = (window.DeskCopilotCasual?.repairConversationalStt?.(text) || String(text || "")).trim();
    if (!q) return "NEW_REQUEST";
    if (window.DeskCopilotCasual?.isStandaloneGeneralTurn?.(q) === true) return "NEW_REQUEST";
    const pending = inferPendingRequest(messages, ctx);
    if (
      pending?.intent === "CURRENT_EXTERNAL" &&
      pending.missingParam === "location" &&
      isWeatherClarificationTurn(q)
    ) {
      return "CLARIFICATION";
    }
    if (
      pending?.intent === "CURRENT_EXTERNAL" &&
      pending.entities?.task === "WEATHER" &&
      window.DeskCopilotWeather?.isWeatherLocationSwapFollowUp?.(q) === true
    ) {
      return "FOLLOW_UP";
    }
    if (pending?.intent === "MARKET_INTEL" || pending?.intent === "VERDICT_EXPLAIN") {
      if (isFollowUpInvalidationQuestion(q) || isFollowUpWhyQuestion(q, messages)) return "FOLLOW_UP";
      if (window.DeskCopilotMentor?.isInvalidationConditionQuestion?.(q) || window.DeskCopilotMentor?.isBareMentorFollowUp?.(q)) {
        return "FOLLOW_UP";
      }
      if (/\bwhat about\b/i.test(q) && pending.entities?.lastTopic) return "FOLLOW_UP";
      if (window.DeskCopilotMentor?.isMentorMarketTurn?.(q)) return "FOLLOW_UP";
    }
    if (pending?.intent === "TEACHING" && CHART_SHOW_FOLLOWUP.test(q)) return "FOLLOW_UP";
    return "NEW_REQUEST";
  }

  function resolveTurnQuestion(text, messages, ctx) {
    const q = String(text || "").trim();
    const pending = inferPendingRequest(messages, ctx);
    const kind = classifyTurn(q, messages, ctx);
    if (!pending || kind === "NEW_REQUEST") return q;

    if (pending.intent === "CURRENT_EXTERNAL" && kind === "CLARIFICATION") {
      const city = pending.entities?.city || weatherCityFromHistory(messages) || "";
      const region = q.replace(CLARIFICATION_PREFIX, "").replace(/[.!?,]+$/, "").trim();
      const merged = mergeWeatherClarification(city, region);
      return `What's the weather in ${merged}?`;
    }

    if (pending.intent === "CURRENT_EXTERNAL" && kind === "FOLLOW_UP") {
      const loc = window.DeskCopilotWeather?.extractWeatherSwapLocation?.(q);
      if (loc) return `What's the weather in ${loc}?`;
    }

    if (pending.intent === "MARKET_INTEL" && kind === "FOLLOW_UP") {
      if (/\bwhat about\b/i.test(q) && pending.entities?.lastTopic?.includes("nwog") && /\bndog\b/i.test(q)) {
        return "where is the last NDOG?";
      }
      return q;
    }

    if (pending.intent === "TEACHING" && kind === "FOLLOW_UP" && CHART_SHOW_FOLLOWUP.test(q)) {
      const concept = pending.entities?.concept || "mss";
      if (concept === "mss") return "where is the last MSS?";
      if (concept === "fvg") return "where is the last FVG?";
      if (concept === "nwog") return "where is the last NWOG?";
      return "where is the last MSS?";
    }

    return q;
  }

  function shouldDeferCasualRoute(text, messages, ctx) {
    if (window.DeskCopilotCasual?.isStandaloneGeneralTurn?.(text) === true) return false;
    const mentorCtx = window.DeskCopilotMentor?.mentorContextFromMessages?.(messages);
    if (
      window.DeskCopilotCasual?.isBareAnaphoraFollowUp?.(text) === true &&
      (mentorCtx?.lastTurnCategory === "GENERAL_KNOWLEDGE" || mentorCtx?.lastTurnCategory === "GENERAL_CHAT")
    ) {
      return false;
    }
    const pending = inferPendingRequest(messages, ctx);
    if (!pending) {
      return !!(
        window.DeskCopilotMentor?.isMentorMarketTurn?.(text) &&
        (window.DeskCopilotMentor?.isBareMentorFollowUp?.(text) ||
          window.DeskCopilotMentor?.isInvalidationConditionQuestion?.(text))
      );
    }
    const kind = classifyTurn(text, messages, ctx);
    if (kind === "CLARIFICATION" && pending.intent === "CURRENT_EXTERNAL") return true;
    if (kind === "FOLLOW_UP") {
      if (pending.intent === "CURRENT_EXTERNAL") return true;
      if (pending.intent === "MARKET_INTEL" || pending.intent === "VERDICT_EXPLAIN") return true;
      if (pending.intent === "TEACHING" && CHART_SHOW_FOLLOWUP.test(text)) return true;
    }
    if (isFollowUpWhyQuestion(text, messages) && pending.intent === "VERDICT_EXPLAIN") return true;
    if (
      window.DeskCopilotMentor?.isMentorMarketTurn?.(text) &&
      (window.DeskCopilotMentor?.isBareMentorFollowUp?.(text) ||
        window.DeskCopilotMentor?.isInvalidationConditionQuestion?.(text))
    ) {
      return true;
    }
    return false;
  }

  function pendingNeedsLiveWebSearch(text, messages, ctx) {
    const pending = inferPendingRequest(messages, ctx);
    if (!pending || pending.intent !== "CURRENT_EXTERNAL") return false;
    const kind = classifyTurn(text, messages, ctx);
    return kind === "CLARIFICATION" || kind === "FOLLOW_UP";
  }

  function resolveSearchQuestion(question, messages, ctx) {
    const expanded =
      window.DeskCopilotCasual?.resolveWebSearchQuestion?.(question, messages) || question;
    if (expanded !== String(question || "").trim()) return expanded;
    const resolved = resolveTurnQuestion(question, messages, ctx);
    return resolved !== String(question || "").trim() ? resolved : expanded;
  }

  function blocksCasualFallback(text, messages, ctx) {
    const kind = classifyTurn(text, messages, ctx);
    return kind === "CLARIFICATION" || kind === "FOLLOW_UP";
  }

  window.DeskCopilotPending = {
    inferPendingRequest,
    classifyTurn,
    resolveTurnQuestion,
    shouldDeferCasualRoute,
    pendingNeedsLiveWebSearch,
    resolveSearchQuestion,
    blocksCasualFallback,
    mergeWeatherClarification,
  };
})();
