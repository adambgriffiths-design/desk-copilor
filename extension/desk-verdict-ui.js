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
    if (pipe?.analysis_contract) return normalizeContract(pipe.analysis_contract);
    const brief = data?.verdict || data?.panel || "";
    if (/^VERDICT:/im.test(brief)) return parsePanelBrief(brief);
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
    });
  }

  function legacyFromData(data) {
    const spoken = data?.spokenBrief || "";
    const v = data?.decisionVerdict || "";
    let verdict = "NO_TRADE";
    if (/long|buy|bullish/i.test(spoken) && !/no trade|wait/i.test(spoken)) verdict = "LONG";
    else if (/short|sell|bearish/i.test(spoken) && !/no trade|wait/i.test(spoken)) verdict = "SHORT";
    else if (v === "wait" || /wait/i.test(spoken)) verdict = "WAIT";
    return normalizeContract({
      verdict,
      setup: "—",
      htf_bias: /bullish/i.test(spoken) ? "bullish" : /bearish/i.test(spoken) ? "bearish" : "unknown",
      entry: "—",
      invalidation: "unknown",
      target: "unknown",
      risk_reward: "unknown",
      why: {},
      contradictions: [],
      rejected_alternative: "",
      data_quality: data?.quality === "good" ? "GOOD" : "DEGRADED",
      final_reasoning: spoken.slice(0, 280),
    });
  }

  function verdictHeadline(v) {
    if (v === "LONG") return "LONG BIAS";
    if (v === "SHORT") return "SHORT BIAS";
    if (v === "WAIT") return "WAIT";
    return "NO TRADE";
  }

  function verdictStatus(v, entry) {
    if (v === "NO_TRADE") return "INSUFFICIENT SETUP";
    if (v === "WAIT" || /wait/i.test(entry)) return "WAITING FOR ENTRY";
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

    if (c.verdict === "WAIT") add(false, true, "Entry confirmation pending");
    if (c.contradictions?.length) add(false, true, `${c.contradictions.length} contradiction(s) noted`);

    return items.slice(0, 5);
  }

  function verdictClass(v) {
    if (v === "LONG") return "dc-verdict-long";
    if (v === "SHORT") return "dc-verdict-short";
    if (v === "WAIT") return "dc-verdict-wait";
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
      { key: "Setup", value: contract.setup },
      { key: "Bias", value: contract.htf_bias },
      { key: "Reasoning", value: contract.final_reasoning },
    ]);

    setSection("dc-evidence-facts", [
      { key: "Structure", value: w.market_structure },
      { key: "Liquidity", value: w.liquidity },
      { key: "FVG", value: w.fvg },
      { key: "PD array", value: w.premium_discount },
      { key: "Displacement", value: w.displacement },
      { key: "Order block", value: w.order_block },
      { key: "Session", value: w.session_time },
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
    card.className = `dc-verdict-card ${verdictClass(contract.verdict)}`;
    if (opts.liveDataOffline) card.classList.add("dc-verdict-offline");
    else card.classList.remove("dc-verdict-offline");
    card.classList.toggle("dc-verdict-mock", Boolean(opts.mock));

    const headline = document.getElementById("dc-verdict-headline");
    const sym = document.getElementById("dc-verdict-symbol");
    const status = document.getElementById("dc-verdict-status");
    if (headline) {
      headline.textContent = opts.lastKnown
        ? `LAST KNOWN · ${verdictHeadline(contract.verdict)}`
        : verdictHeadline(contract.verdict);
    }
    if (sym) sym.textContent = "NASDAQ / MNQ";
    if (status) {
      status.textContent = opts.liveDataOffline
        ? "LIVE DATA: OFFLINE"
        : opts.lastKnown
          ? "LAST KNOWN STATE — NOT CURRENT LIVE STATE"
          : opts.mock
            ? "MOCK ANALYSIS — NOT LIVE DATA"
            : verdictStatus(contract.verdict, contract.entry);
    }

    setField("dc-v-bias", contract.htf_bias && contract.htf_bias !== "unknown" ? contract.htf_bias : "");
    setField("dc-v-structure", contract.why?.market_structure || "");
    setField("dc-v-liquidity", contract.why?.liquidity || "");
    setField("dc-v-fvg", contract.why?.fvg || "");
    setField("dc-v-pd", contract.why?.premium_discount || "");
    setField("dc-v-entry", contract.entry !== "—" ? contract.entry : "");
    setInvalidation(contract.invalidation);
    setField("dc-v-target", contract.target !== "unknown" ? contract.target : "");
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
    if (prev.verdict === current?.verdict && !deltaText) {
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

    if (ui?.updateHeaderStatus) {
      const hasPrice = Number.isFinite(price);
      const conn =
        typeof connectionState === "object"
          ? connectionState
          : { state: connectionState, backendUp: normStatus !== "OFFLINE" };
      ui.updateHeaderStatus({
        market: ui.mapConnectionToMarketStatus?.(conn, hasPrice) || normStatus,
        data: ui.mapConnectionToDataStatus?.(conn, normStatus) || normStatus,
        marketTip: tooltip,
        dataTip: tooltip,
      });
    }
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
    const degraded = window.DeskCopilotVoice?.getEngineMode?.() === "cascade" && listening;
    ui?.updateKarenStatus?.(phase, { listening, speaking, degraded });
    if (ui?.updateHeaderStatus) {
      ui.updateHeaderStatus({
        karen: ui.mapKarenStatus?.(phase, { listening, speaking, degraded }),
        karenTip: speaking ? "Karen is speaking" : listening ? "Karen is listening" : "Karen ready",
      });
    }
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
