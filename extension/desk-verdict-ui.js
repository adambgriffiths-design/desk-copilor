/**
 * Professional trading desk UI — verdict hero, evidence, market bar, previous verdict.
 */
(function () {
  const STORAGE_PREV = "dc-prev-verdict-ui";
  const LIFECYCLE = { READY: "ready", ANALYZING: "analyzing", VERDICT: "verdict", SPEAKING: "speaking" };
  let lifecycleState = LIFECYCLE.READY;
  let mockRun = null;
  const UI = () => window.DeskCopilotUI;

  function parseField(text, key) {
    const re = new RegExp(`^${key}:\\s*(.+)$`, "im");
    const m = String(text || "").match(re);
    return m ? m[1].trim() : "";
  }

  function contractFromData(data) {
    const pipe = data?.deskPipeline;
    const structuredDecision =
      pipe?.analysis_contract?.decision || data?.decisionEnvelope || data?.decision || null;
    if (pipe?.analysis_contract) {
      const c = normalizeContract(pipe.analysis_contract);
      if (structuredDecision) c.decision = structuredDecision;
      if (c.decision?.stance) {
        const s = String(c.decision.stance).toLowerCase();
        if (s === "long") c.verdict = "LONG";
        else if (s === "short") c.verdict = "SHORT";
        else if (s === "wait") c.verdict = "WAIT";
        else if (s === "flat" || s === "monitor") c.verdict = "NO_TRADE";
      }
      return c;
    }
    if (structuredDecision?.stance) return legacyFromData({ ...data, decision: structuredDecision });
    const brief = data?.verdict || data?.panel || "";
    if (/^VERDICT:/im.test(brief) && /^VERDICT:\s*(LONG|SHORT|WAIT|NO_TRADE|NO TRADE|UNAVAILABLE)/im.test(brief)) {
      return parsePanelBrief(brief);
    }
    return legacyFromData(data);
  }

  function normalizeContract(c) {
    return {
      verdict: c.verdict || "NO_TRADE",
      setup: c.setup || "none identified",
      htf_bias: c.htf_bias || "unknown",
      entry: c.entry || "—",
      invalidation: c.invalidation || "unknown",
      target: c.target || "unknown",
      risk_reward: c.risk_reward || "unknown",
      why: c.why || {},
      contradictions: c.contradictions || [],
      rejected_alternative: c.rejected_alternative || "",
      data_quality: c.data_quality || "DEGRADED",
      final_reasoning: c.final_reasoning || "",
      wait_reason: c.wait_reason || "",
      mtf: c.mtf || null,
      decision: c.decision || null,
    };
  }

  function parsePanelBrief(text) {
    const whyBlock = text.split(/^WHY:/im)[1] || "";
    const whyLines = whyBlock.split("\n").filter(Boolean);
    const pickWhy = (prefix) => {
      const line = whyLines.find((l) => l.toLowerCase().startsWith(prefix.toLowerCase()));
      return line ? line.replace(/^[^:]+:\s*/, "").trim() : "";
    };
    return normalizeContract({
      verdict: parseField(text, "VERDICT").replace(/\s+/g, "_").toUpperCase() || "NO_TRADE",
      setup: parseField(text, "SETUP"),
      htf_bias: parseField(text, "HTF BIAS").toLowerCase(),
      entry: parseField(text, "ENTRY"),
      invalidation: parseField(text, "INVALIDATION"),
      target: parseField(text, "TARGET"),
      risk_reward: parseField(text, "R:R"),
      why: {
        liquidity: pickWhy("Liquidity"),
        market_structure: pickWhy("Market structure"),
        displacement: pickWhy("Displacement"),
        fvg: pickWhy("FVG"),
        order_block: pickWhy("Order block"),
        premium_discount: pickWhy("Premium/discount"),
        session_time: pickWhy("Session/time"),
        other_ict: pickWhy("Other ICT"),
      },
      contradictions: (text.split(/^CONTRADICTIONS:/im)[1]?.split(/^REJECTED/im)[0] || "")
        .split("\n")
        .map((l) => l.replace(/^-\s*/, "").trim())
        .filter((l) => l && l !== "none"),
      rejected_alternative: parseField(text, "REJECTED ALTERNATIVE"),
      data_quality: parseField(text, "DATA QUALITY").toUpperCase() || "DEGRADED",
      final_reasoning: parseField(text, "FINAL REASONING"),
      wait_reason: parseField(text, "WHY WAIT"),
    });
  }

  function legacyFromData(data) {
    const decision = data?.decision || data?.decisionEnvelope || data?.deskPipeline?.analysis_contract?.decision || null;
    if (decision && decision.stance) {
      const stance = String(decision.stance).toLowerCase();
      const verdict =
        stance === "long" ? "LONG" : stance === "short" ? "SHORT" : stance === "wait" ? "WAIT" : "NO_TRADE";
      return normalizeContract({
        verdict,
        setup: "—",
        htf_bias: decision.htfContext?.lean || "unknown",
        entry: decision.thesis?.fromWhere || "—",
        invalidation: decision.invalidation?.condition || "unknown",
        target: decision.read?.target || "unknown",
        risk_reward: "unknown",
        why: {},
        contradictions: [],
        rejected_alternative: "",
        data_quality: data?.quality === "good" ? "GOOD" : "DEGRADED",
        final_reasoning: decision.layers?.decision || "",
        wait_reason:
          stance === "wait"
            ? decision.logicOrder?.execution || ""
            : stance === "flat"
              ? "Stay flat — no trade justified"
              : "",
        decision,
      });
    }
    return normalizeContract({
      verdict: "UNAVAILABLE",
      setup: "—",
      htf_bias: "unknown",
      entry: "—",
      invalidation: "unknown",
      target: "unknown",
      risk_reward: "unknown",
      why: {},
      contradictions: [],
      rejected_alternative: "",
      data_quality: "DEGRADED",
      final_reasoning: "NO DECISION — structured decision unavailable. Stance is not inferred from text.",
    });
  }

  function isNumericEntry(entry) {
    const e = String(entry || "");
    return /\d/.test(e) && !/wait for/i.test(e) && e !== "—" && e !== "none";
  }

  function hasStayFlatConflict(c) {
    return (c?.contradictions || []).some((t) => /opposes|stay flat|disagree/i.test(String(t)));
  }

  function isWaitForTrigger(c) {
    if (!c || c.verdict !== "WAIT") return false;
    if (/^stay flat/i.test(c.wait_reason || c.final_reasoning || "")) return false;
    if (hasStayFlatConflict(c)) return false;
    if (isNumericEntry(c.entry)) return true;
    const setup = String(c.setup || "");
    return Boolean(
      setup &&
        setup !== "none identified" &&
        /wait|sweep|retrace/i.test(`${setup} ${c.entry || ""}`)
    );
  }

  function verdictHeadline(v, stance) {
    if (stance) return String(stance).toUpperCase();
    if (v === "LONG") return "LONG";
    if (v === "SHORT") return "SHORT";
    if (v === "WAIT") return "WAIT";
    if (v === "UNAVAILABLE" || v === "NO_DECISION") return "NO DECISION";
    if (v === "NO_TRADE") return "FLAT";
    return "NO DECISION";
  }

  function verdictStatus(c) {
    const stance = String(c?.decision?.stance || "").toLowerCase();
    const v = c?.verdict;
    if (v === "UNAVAILABLE" || v === "NO_DECISION") return "NO DECISION";
    if (stance === "flat" || (v === "NO_TRADE" && stance !== "wait")) return "STAY FLAT";
    if (stance === "monitor") return "MONITOR";
    if (v === "NO_TRADE") return "INSUFFICIENT SETUP";
    if (v === "WAIT" || stance === "wait") return isWaitForTrigger(c) ? "WAITING FOR ENTRY" : "STAY FLAT";
    if (v === "LONG" || v === "SHORT") return "SETUP ACTIVE";
    return "";
  }

  function buildEvidence(c) {
    const items = [];
    const w = c.why || {};
    const add = (ok, warn, text) => {
      if (!text) return;
      items.push({ icon: ok ? "✓" : warn ? "⚠" : "○", text, tone: ok ? "ok" : warn ? "warn" : "muted" });
    };

    if (c.htf_bias === "bullish") add(true, false, "Higher timeframe bullish alignment");
    else if (c.htf_bias === "bearish") add(true, false, "Higher timeframe bearish alignment");
    else if (c.htf_bias === "neutral") add(false, true, "Higher timeframe neutral — no clear lean");
    else add(false, true, "Higher timeframe bias unknown");

    if (/taken|swept/i.test(w.liquidity)) add(true, false, "Liquidity swept");
    else if (w.liquidity && !/unknown/i.test(w.liquidity)) add(false, true, "Liquidity not yet swept");

    if (/present/i.test(w.displacement) && !/absent/i.test(w.displacement))
      add(true, false, "Displacement present");
    else if (/absent/i.test(w.displacement)) add(false, true, "Displacement absent");

    if (/present/i.test(w.fvg) && !/absent|invalid/i.test(w.fvg)) add(true, false, "Fair value gap identified");
    else if (/invalid/i.test(w.fvg)) add(false, true, "Fair value gap invalidated");

    if (c.verdict === "WAIT" && isWaitForTrigger(c)) add(false, true, "Entry confirmation pending");
    if (c.verdict === "WAIT" && !isWaitForTrigger(c)) add(false, true, c.wait_reason || c.final_reasoning || "Stay flat");
    if (c.contradictions?.length) add(false, true, `${c.contradictions.length} contradiction(s) noted`);

    return items.slice(0, 5);
  }

  function verdictClass(v, stance) {
    const s = String(stance || "").toLowerCase();
    if (s === "long" || v === "LONG") return "dc-verdict-long";
    if (s === "short" || v === "SHORT") return "dc-verdict-short";
    if (s === "wait" || v === "WAIT") return "dc-verdict-wait";
    return "dc-verdict-none";
  }

  function setAnalyzingStep(activeIndex) {
    const steps = document.querySelectorAll("#dc-analyzing-steps .dc-analyzing-step");
    steps.forEach((el, i) => {
      el.classList.toggle("dc-analyzing-step-done", i < activeIndex);
      el.classList.toggle("dc-analyzing-step-active", i === activeIndex);
      el.classList.toggle("dc-analyzing-step-pending", i > activeIndex);
    });
  }

  function toggleMockBadge(show) {
    const badge = document.getElementById("dc-mock-badge");
    const badgeAnalyzing = document.getElementById("dc-mock-badge-analyzing");
    if (badge) badge.classList.toggle("hidden", !show);
    if (badgeAnalyzing) badgeAnalyzing.classList.toggle("hidden", !show);
  }

  function toggleNewAnalysis(show) {
    const btn = document.getElementById("dc-new-analysis");
    const analyse = document.getElementById("dc-get-verdict");
    if (btn) btn.classList.toggle("hidden", !show);
    if (analyse) analyse.classList.toggle("hidden", show);
  }

  function showReadyState() {
    lifecycleState = LIFECYCLE.READY;
    mockRun?.cancel?.();
    mockRun = null;

    const card = document.getElementById("dc-verdict-card");
    const empty = document.getElementById("dc-verdict-empty");
    const body = document.getElementById("dc-verdict-body");
    const analyzing = document.getElementById("dc-verdict-analyzing");
    empty?.classList.remove("hidden");
    body?.classList.add("hidden");
    analyzing?.classList.add("hidden");
    card?.classList.remove("dc-verdict-speaking");
    if (card) card.className = "dc-verdict-card";
    document.getElementById("dc-evidence-sections")?.classList.add("hidden");
    document.getElementById("dc-evidence-wrap")?.classList.add("hidden");
    toggleMockBadge(false);
    toggleNewAnalysis(false);
  }

  function showAnalyzingState(opts = {}) {
    lifecycleState = LIFECYCLE.ANALYZING;
    const card = document.getElementById("dc-verdict-card");
    const empty = document.getElementById("dc-verdict-empty");
    const body = document.getElementById("dc-verdict-body");
    const analyzing = document.getElementById("dc-verdict-analyzing");
    empty?.classList.add("hidden");
    body?.classList.add("hidden");
    analyzing?.classList.remove("hidden");
    if (card) card.className = "dc-verdict-card dc-verdict-analyzing-card";
    toggleMockBadge(Boolean(opts.mock));
    toggleNewAnalysis(false);
    document.getElementById("dc-evidence-sections")?.classList.add("hidden");
    setAnalyzingStep(-1);
  }

  function showSpeakingState(active) {
    lifecycleState = active ? LIFECYCLE.SPEAKING : LIFECYCLE.VERDICT;
    document.getElementById("dc-verdict-card")?.classList.toggle("dc-verdict-speaking", Boolean(active));
  }

  function renderEvidenceSections(contract) {
    const wrap = document.getElementById("dc-evidence-sections");
    if (!wrap || !contract) return;
    const w = contract.why || {};

    const setSection = (id, rows) => {
      const el = document.getElementById(id);
      if (!el) return;
      const filtered = rows.filter((r) => r.value && r.value !== "—" && r.value !== "unknown");
      el.classList.toggle("hidden", filtered.length === 0);
      el.innerHTML = filtered
        .map(
          (r) =>
            `<div class="dc-evidence-kv"><span class="dc-evidence-k">${r.key}</span><span class="dc-evidence-v">${r.value}</span></div>`
        )
        .join("");
    };

    setSection("dc-evidence-why", [
      { key: "Overall", value: contract.decision?.read?.overallStance },
      { key: "HTF context", value: contract.decision?.read ? `${contract.decision.read.htfContext.horizon} ${contract.decision.read.htfContext.lean}` : "" },
      { key: "Structure", value: contract.decision?.read ? `${contract.decision.read.currentStructure.horizon} ${contract.decision.read.currentStructure.lean}` : "" },
      { key: "Opportunity", value: contract.decision?.read?.tradeableOpportunity },
      { key: "Direction", value: contract.decision?.read?.tradeDirection },
      { key: "Target", value: contract.decision?.read?.target },
      { key: "Invalidation", value: contract.decision?.read?.invalidation },
      { key: "Strategic", value: contract.decision?.logicOrder?.strategicBias },
      { key: "Tactical", value: contract.decision?.logicOrder?.tacticalBias },
      { key: "Execution", value: contract.decision?.logicOrder?.execution },
      { key: "Stance", value: contract.decision?.stance },
      { key: "Thesis", value: contract.decision?.thesis ? `complete=${contract.decision.thesis.complete ? "yes" : "no"} what=${contract.decision.thesis.what || "unanswered"} toward=${contract.decision.thesis.toward || "unanswered"}` : "" },
      { key: "Conflict log", value: contract.decision?.conflictLog ? `${contract.decision.conflictLog.htfHorizon} ${contract.decision.conflictLog.htfLean} vs ${contract.decision.conflictLog.tacticalHorizon} ${contract.decision.conflictLog.tacticalLean}; disagree=${contract.decision.conflictLog.disagree}; ltfAgainstHtfAllowed=${String(contract.decision.conflictLog.ltfAgainstHtfAllowed)}` : "" },
      { key: "Primary", value: contract.decision ? `${contract.decision.primaryHorizon.timeframe} ${contract.decision.primaryHorizon.lean}` : "" },
      { key: "HTF", value: contract.decision ? `${contract.decision.htfContext.timeframe} ${contract.decision.htfContext.lean}` : "" },
      { key: "Conflict", value: contract.decision?.conflictResolution?.sentence },
      { key: "Setup", value: contract.setup },
      { key: "Bias", value: contract.htf_bias },
      { key: "Reasoning", value: contract.final_reasoning },
    ]);

    const mtf = contract.mtf;
    setSection("dc-evidence-mtf", [
      { key: "Chart", value: mtf?.chart_timeframe },
      { key: "Short", value: mtf?.short },
      { key: "Medium", value: mtf?.medium },
      { key: "Long", value: mtf?.long },
    ]);

    setSection("dc-evidence-facts", [
      { key: "Structure", value: w.market_structure },
      { key: "Liquidity", value: w.liquidity },
      { key: "FVG", value: w.fvg },
      { key: "PD array", value: w.premium_discount },
      { key: "Displacement", value: w.displacement },
      { key: "Order block", value: w.order_block },
      { key: "Session", value: w.session_time },
      ...(contract.decision?.reasoningChain || []).map((item) => ({
        key: item.concept,
        value: `${item.checked ? "checked" : "skipped"} · detected=${item.detected ? "yes" : "no"} · used=${item.role || "NONE"} · ${item.outcome} · ${item.impact}`,
      })),
    ]);

    const riskRows = [];
    if (contract.invalidation && contract.invalidation !== "unknown") {
      riskRows.push({ key: "Invalidation", value: contract.invalidation });
    }
    if (contract.target && contract.target !== "unknown") {
      riskRows.push({ key: "Target", value: contract.target });
    }
    if (contract.risk_reward && contract.risk_reward !== "unknown") {
      riskRows.push({ key: "R:R", value: contract.risk_reward });
    }
    for (const c of contract.contradictions || []) {
      riskRows.push({ key: "Contradiction", value: c });
    }
    if (contract.rejected_alternative) {
      riskRows.push({ key: "Rejected", value: contract.rejected_alternative });
    }
    setSection("dc-evidence-risk", riskRows);

    setSection("dc-evidence-dq", [
      { key: "Data quality", value: contract.data_quality },
      { key: "Freshness", value: contract.freshness || "—" },
    ]);

    const anyVisible = ["dc-evidence-why", "dc-evidence-facts", "dc-evidence-risk", "dc-evidence-dq"].some(
      (id) => !document.getElementById(id)?.classList.contains("hidden")
    );
    wrap.classList.toggle("hidden", !anyVisible);
  }

  function renderVerdictCard(contract, fullText, opts = {}) {
    const card = document.getElementById("dc-verdict-card");
    const empty = document.getElementById("dc-verdict-empty");
    const body = document.getElementById("dc-verdict-body");
    const analyzing = document.getElementById("dc-verdict-analyzing");
    if (!card || !body) return;

    if (!contract) {
      showReadyState();
      return;
    }

    lifecycleState = LIFECYCLE.VERDICT;
    empty?.classList.add("hidden");
    analyzing?.classList.add("hidden");
    body.classList.remove("hidden");
    card.className = `dc-verdict-card ${verdictClass(contract.verdict, contract.decision?.stance)}`;
    if (opts.liveDataOffline) card.classList.add("dc-verdict-offline");
    else card.classList.remove("dc-verdict-offline");
    card.classList.toggle("dc-verdict-mock", Boolean(opts.mock));

    const headline = document.getElementById("dc-verdict-headline");
    const sym = document.getElementById("dc-verdict-symbol");
    const status = document.getElementById("dc-verdict-status");
    if (headline) {
      headline.textContent = opts.lastKnown
        ? `LAST KNOWN · ${verdictHeadline(contract.verdict, contract.decision?.stance)}`
        : verdictHeadline(contract.verdict, contract.decision?.stance);
    }
    if (sym) sym.textContent = "NASDAQ / MNQ";
    if (status) {
      status.textContent = opts.liveDataOffline
        ? "LIVE DATA: OFFLINE"
        : opts.lastKnown
          ? "LAST KNOWN STATE — NOT CURRENT LIVE STATE"
          : opts.mock
            ? "MOCK ANALYSIS — NOT LIVE DATA"
            : verdictStatus(contract);
    }

    setField(
      "dc-v-why",
      contract.decision?.conflictResolution?.sentence ||
        (contract.verdict === "WAIT" || contract.verdict === "NO_TRADE"
          ? contract.wait_reason || contract.final_reasoning || ""
          : "")
    );
    setField(
      "dc-v-bias",
      contract.decision?.htfContext
        ? `${contract.decision.htfContext.timeframe} ${contract.decision.htfContext.lean} (HTF context — not the trade)`
        : ""
    );
    setField("dc-v-short", contract.mtf?.short || "");
    setField("dc-v-medium", contract.mtf?.medium || "");
    setField("dc-v-long", contract.mtf?.long || "");
    setField("dc-v-structure", contract.why?.market_structure || "");
    setField("dc-v-liquidity", contract.why?.liquidity || "");
    setField("dc-v-fvg", contract.why?.fvg || "");
    setField("dc-v-pd", contract.why?.premium_discount || "");
    const showLevels = contract.verdict !== "WAIT" || isWaitForTrigger(contract);
    setField("dc-v-entry", showLevels && contract.entry !== "—" ? contract.entry : "");
    setInvalidation(showLevels ? contract.invalidation : "");
    setField("dc-v-target", showLevels && contract.target !== "unknown" ? contract.target : "");
    setField("dc-v-freshness", contract.freshness || (opts.mock ? "MOCK · demo only" : ""));

    UI()?.renderKarenVerdictMeta?.(contract, opts);
    toggleMockBadge(Boolean(opts.mock));
    toggleNewAnalysis(Boolean(opts.mock && opts.showNewAnalysis));

    const list = document.getElementById("dc-evidence-list");
    const evidenceWrap = document.getElementById("dc-evidence-wrap");
    const evidenceItems = buildEvidence(contract);
    if (list) {
      list.innerHTML = "";
      for (const item of evidenceItems) {
        const li = document.createElement("li");
        li.className = `dc-evidence-item dc-evidence-${item.tone}`;
        li.textContent = `${item.icon} ${item.text}`;
        list.appendChild(li);
      }
    }
    if (evidenceWrap) {
      evidenceWrap.classList.toggle("hidden", evidenceItems.length === 0);
    }

    renderEvidenceSections(contract);

    const full = document.getElementById("dc-full-analysis");
    if (full && fullText) full.textContent = fullText;
  }

  function setField(id, text) {
    const el = document.getElementById(id);
    const row = el?.closest?.(".dc-v-field");
    if (!el) return;
    if (text) {
      el.textContent = text;
      row?.classList.remove("hidden");
    } else {
      el.textContent = "";
      row?.classList.add("hidden");
    }
  }

  function setInvalidation(value) {
    const has = value && value !== "unknown";
    setField("dc-v-invalidation", has ? value : "");
    const wrap = document.getElementById("dc-verdict-invalidation-wrap");
    if (wrap) wrap.classList.toggle("hidden", !has);
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (!el) return;
    if (text) {
      el.textContent = text;
      el.classList.remove("hidden");
    } else {
      el.textContent = "";
      el.classList.add("hidden");
    }
  }

  function renderPrevious(current, deltaText) {
    const wrap = document.getElementById("dc-prev-verdict");
    if (!wrap) return;
    let prev = null;
    try {
      prev = JSON.parse(sessionStorage.getItem(STORAGE_PREV) || "null");
    } catch {
      prev = null;
    }
    if (!prev?.verdict) {
      wrap.classList.add("hidden");
      return;
    }
    if (prev.verdict === current?.verdict) {
      wrap.classList.add("hidden");
      return;
    }
    wrap.classList.remove("hidden");
    const line = document.getElementById("dc-prev-line");
    const change = document.getElementById("dc-prev-change");
    if (line) line.textContent = `${verdictHeadline(prev.verdict)} → ${verdictHeadline(current?.verdict || "—")}`;
    if (change) {
      change.textContent =
        deltaText ||
        current?.final_reasoning?.slice(0, 160) ||
        "Market structure or entry conditions changed since last read.";
    }
  }

  function savePrevious(contract) {
    if (!contract?.verdict) return;
    try {
      sessionStorage.setItem(
        STORAGE_PREV,
        JSON.stringify({ verdict: contract.verdict, ts: Date.now() })
      );
    } catch {
      /* ignore */
    }
  }

  function normalizeDataStatus(raw, connectionState) {
    const ui = UI();
    if (ui?.mapConnectionToDataStatus && connectionState && typeof raw === "object") {
      return ui.mapConnectionToDataStatus(raw, null);
    }
    const s = String(raw || "—").toUpperCase();
    if (s.includes("OFFLINE") || s.includes("LIVE DATA: OFFLINE")) return "OFFLINE";
    if (s === "LIVE") return "LIVE";
    if (s === "STALE" || s.includes("LAST KNOWN")) return "STALE";
    if (s === "DEGRADED") return "DEGRADED";
    if (s === "ERROR" || s === "UNAVAILABLE") return "UNAVAILABLE";
    return s === "—" ? "WAITING" : s;
  }

  function updateMarketBar(opts) {
    const {
      symbol,
      price,
      session,
      tf,
      dataStatus,
      updatedAt,
      connectionState,
      dataSource,
      candleCount,
    } = opts;
    const ui = UI();
    const normStatus = normalizeDataStatus(dataStatus, connectionState);
    const ageLabel = updatedAt || "";
    const source =
      dataSource ||
      (connectionState === "CONNECTED" ? "TradingView + desk" : connectionState === "DEGRADED" ? "Last known" : "");
    const tooltip = [
      source && `Source: ${source}`,
      ageLabel,
      Number.isFinite(candleCount) ? `Candles: ${candleCount}` : "",
    ]
      .filter(Boolean)
      .join(" · ");

    if (ui?.updateCurrentPrice) {
      ui.updateCurrentPrice({
        symbol: symbol || "MNQ",
        price,
        session,
        tf,
        dataStatus: normStatus,
        dataSource: source,
        updatedAt: ageLabel,
        connectionState,
        tooltip,
      });
    } else {
      setText("dc-bar-symbol", symbol || "MNQ");
      setText("dc-bar-tf", tf || "1m");
      setText("dc-bar-session", session || "—");
      const priceEl = document.getElementById("dc-bar-price");
      if (priceEl) {
        priceEl.textContent = Number.isFinite(price) ? price.toFixed(2) : "PRICE UNAVAILABLE";
      }
      const dataEl = document.getElementById("dc-bar-data");
      if (dataEl) dataEl.textContent = normStatus;
      const upEl = document.getElementById("dc-bar-updated");
      if (upEl) upEl.textContent = ageLabel;
    }

    // Header MARKET/DATA are owned by content.js syncHeaderStatus:
    // MARKET = TV Last presence, DATA = backend. Do not remap MARKET from connection.
  }

  function updateVoiceHero(opts) {
    const { listening, phase, speaking } = opts;
    const btn = document.getElementById("dc-voice-hero");
    const hint = document.getElementById("dc-voice-interrupt-hint");
    if (!btn) return;
    btn.classList.toggle("dc-voice-hero-on", Boolean(listening));
    btn.classList.toggle("dc-voice-hero-speaking", Boolean(speaking));
    if (speaking) {
      btn.textContent = "KAREN SPEAKING…";
    } else if (phase === "analyzing" || phase === "capturing" || phase === "snapshot" || phase === "thinking") {
      btn.textContent = "ANALYSING…";
    } else if (listening) {
      btn.textContent = "LISTENING…";
    } else {
      btn.textContent = "● TALK TO KAREN";
    }
    if (hint) {
      hint.classList.toggle("hidden", !speaking && !listening);
    }

    const ui = UI();
    // Header KAREN is owned by content.js. Whisper cascade is a working mic, not DEGRADED.
    ui?.updateKarenStatus?.(phase, { listening, speaking, degraded: false });
  }

  function setLevelsStatus(text, ok) {
    const ui = UI();
    const el = document.getElementById("dc-levels-status");
    if (!el) return;

    const raw = String(text || "");
    const countMatch = raw.match(/(\d+)\s*levels?/i);
    const count = countMatch ? Number(countMatch[1]) : null;

    if (ui?.updateLevelStatus && (count || /degraded/i.test(raw))) {
      ui.updateLevelStatus({
        count: count || undefined,
        synced: ok !== false && !/partial|degraded/i.test(raw),
        degraded: /degraded/i.test(raw),
        error: ok === false ? raw.replace(/^✕\s*/, "") : undefined,
      });
      return;
    }

    el.textContent = raw;
    el.className = "dc-levels-status" + (ok ? " ok" : ok === false ? " err" : "");
  }

  function applyVerdictData(data, opts = {}) {
    const contract = contractFromData(data);
    const fullText = data?.verdict || data?.panel || "";
    const delta = data?.deskPipeline?.delta?.mentor_brief || data?.deskPipeline?.delta?.observation_changes?.join(", ");
    const mergedOpts = { ...opts, mock: opts.mock || data?.mock === true };
    renderPrevious(contract, delta);
    renderVerdictCard(contract, fullText, mergedOpts);
    if (contract && !opts.liveDataOffline && !mergedOpts.mock) savePrevious(contract);
    return contract;
  }

  function clearVerdict() {
    showReadyState();
  }

  function runMockAnalysis(handlers) {
    mockRun?.cancel?.();
    const Mock = window.DeskCopilotMockAnalysis;
    if (!Mock?.runLifecycle) return null;
    showAnalyzingState({ mock: true });
    mockRun = Mock.runLifecycle({
      onAnalyzing: () => {
        handlers?.onAnalyzing?.();
        setAnalyzingStep(0);
      },
      onStep: (_step, index) => {
        setAnalyzingStep(index);
        handlers?.onStep?.(_step, index);
      },
      onVerdict: (data) => {
        applyVerdictData(data, { mock: true, showNewAnalysis: false });
        handlers?.onVerdict?.(data);
      },
      onSpeaking: (data) => {
        showSpeakingState(true);
        handlers?.onSpeaking?.(data);
      },
      onSpeakingDone: (data) => {
        showSpeakingState(false);
        toggleNewAnalysis(true);
        handlers?.onSpeakingDone?.(data);
      },
    });
    return mockRun;
  }

  function resetMockAnalysis() {
    showReadyState();
    handlersClear();
  }

  function handlersClear() {
    /* placeholder for external cleanup hooks */
  }

  function getLifecycleState() {
    return lifecycleState;
  }

  window.DeskCopilotVerdictUI = {
    LIFECYCLE,
    applyVerdictData,
    updateMarketBar,
    updateVoiceHero,
    setLevelsStatus,
    clearVerdict,
    contractFromData,
    showReadyState,
    showAnalyzingState,
    showSpeakingState,
    runMockAnalysis,
    resetMockAnalysis,
    getLifecycleState,
    setAnalyzingStep,
  };
})();
