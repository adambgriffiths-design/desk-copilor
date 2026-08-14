/**
 * Isolated mock desk analysis — dev/diagnostics only. No network calls.
 */
(function () {
  const STORAGE_ENABLED = "dc-mock-analysis-enabled";
  const STORAGE_SCENARIO = "dc-mock-scenario";

  const ANALYZING_STEPS = [
    { id: "market", label: "Reading market" },
    { id: "structure", label: "Checking structure" },
    { id: "liquidity", label: "Checking liquidity" },
    { id: "quality", label: "Checking data quality" },
  ];

  const SCENARIO_KEYS = ["WAIT", "LONG", "SHORT"];

  function contractBase(overrides) {
    return {
      verdict: "WAIT",
      setup: "none identified",
      htf_bias: "unknown",
      entry: "—",
      invalidation: "unknown",
      target: "unknown",
      risk_reward: "unknown",
      why: {},
      contradictions: [],
      rejected_alternative: "",
      data_quality: "GOOD",
      final_reasoning: "",
      freshness: "Demo · not live",
      ...overrides,
    };
  }

  const SCENARIOS = {
    WAIT: {
      key: "WAIT",
      label: "WAIT — no entry yet",
      contract: contractBase({
        verdict: "WAIT",
        setup: "NY AM range — waiting for liquidity sweep",
        htf_bias: "neutral",
        entry: "Wait for sell-side sweep then 1m MSS + FVG retrace",
        invalidation: "Close above prior session high before sweep",
        target: "Range midpoint then PD array",
        risk_reward: "1:2.5 (planned)",
        why: {
          liquidity: "Not yet swept — resting below Asia low",
          market_structure: "Internal range — no clear 1m shift",
          displacement: "Absent on current leg",
          fvg: "No unfilled gap at entry zone",
          order_block: "Not confirmed",
          premium_discount: "Mid-range — no PD edge",
          session_time: "NY AM kill zone — early chop",
          other_ict: "Mock scenario — patience required",
        },
        contradictions: ["HTF neutral vs local bullish micro-structure"],
        rejected_alternative: "Premature long into mid-range without sweep",
        data_quality: "GOOD",
        final_reasoning:
          "Mock read: conditions not aligned for entry — wait for liquidity event and confirmation.",
        freshness: "MOCK · 2s ago",
      }),
      spokenBrief:
        "Wait — no trade yet. Sell-side liquidity still resting. I need a sweep and a one-minute structure shift before leaning long.",
    },
    LONG: {
      key: "LONG",
      label: "LONG — setup active",
      contract: contractBase({
        verdict: "LONG",
        setup: "Sell-side sweep + bullish displacement into FVG",
        htf_bias: "bullish",
        entry: "Retrace to 1m FVG 21452.25–21454.00",
        invalidation: "1m close below 21448.50",
        target: "21472.00 prior session high",
        risk_reward: "1:2.8",
        why: {
          liquidity: "Asia low swept — stops taken",
          market_structure: "1m MSS bullish after sweep",
          displacement: "Present — strong up leg",
          fvg: "Unfilled bullish FVG at entry zone",
          order_block: "Last down candle before displacement",
          premium_discount: "Discount array after sweep — long bias",
          session_time: "NY AM — favorable timing",
          other_ict: "Mock scenario — A+ alignment",
        },
        contradictions: [],
        rejected_alternative: "Short into discount after sweep",
        data_quality: "GOOD",
        final_reasoning:
          "Mock read: PD, liquidity, and 1m structure align for a long — manage risk at invalidation.",
        freshness: "MOCK · just now",
      }),
      spokenBrief:
        "Long bias. Sell-side liquidity taken, one-minute structure shifted bullish. Look for retrace into the fair value gap near twenty-one four fifty-two.",
    },
    SHORT: {
      key: "SHORT",
      label: "SHORT — setup active",
      contract: contractBase({
        verdict: "SHORT",
        setup: "Buy-side sweep + bearish displacement from premium",
        htf_bias: "bearish",
        entry: "Retrace to 1m FVG 21508.75–21506.50",
        invalidation: "1m close above 21514.25",
        target: "21488.00 NY open gap fill",
        risk_reward: "1:2.4",
        why: {
          liquidity: "London high swept — buy stops taken",
          market_structure: "1m MSS bearish from premium",
          displacement: "Present — sharp sell leg",
          fvg: "Bearish FVG open at entry",
          order_block: "Last up candle before displacement",
          premium_discount: "Premium array — short bias",
          session_time: "NY PM — reversal window",
          other_ict: "Mock scenario — premium fade",
        },
        contradictions: ["Macro headline risk if trend day"],
        rejected_alternative: "Long from premium without structure shift",
        data_quality: "DEGRADED",
        final_reasoning:
          "Mock read: premium + swept buy-side liquidity favors short — size down on degraded demo data.",
        freshness: "MOCK · 4s ago",
      }),
      spokenBrief:
        "Short bias. Buy-side liquidity swept at the London high. One-minute structure shifted bearish from premium — retrace into the gap near twenty-one five oh eight.",
    },
  };

  function readStorage(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : v;
    } catch {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  }

  function isEnabled() {
    return readStorage(STORAGE_ENABLED, "0") === "1";
  }

  function setEnabled(on) {
    writeStorage(STORAGE_ENABLED, on ? "1" : "0");
  }

  function getScenarioKey() {
    const k = String(readStorage(STORAGE_SCENARIO, "WAIT") || "WAIT").toUpperCase();
    return SCENARIO_KEYS.includes(k) ? k : "WAIT";
  }

  function setScenarioKey(key) {
    const k = String(key || "WAIT").toUpperCase();
    writeStorage(STORAGE_SCENARIO, SCENARIO_KEYS.includes(k) ? k : "WAIT");
  }

  function getScenario() {
    return SCENARIOS[getScenarioKey()] || SCENARIOS.WAIT;
  }

  function buildPanelBrief(contract) {
    const w = contract.why || {};
    const lines = [
      "VERDICT: " + contract.verdict.replace(/_/g, " "),
      "SETUP: " + contract.setup,
      "HTF BIAS: " + contract.htf_bias,
      "ENTRY: " + contract.entry,
      "INVALIDATION: " + contract.invalidation,
      "TARGET: " + contract.target,
      "R:R: " + contract.risk_reward,
      "",
      "WHY:",
      "Liquidity: " + (w.liquidity || "—"),
      "Market structure: " + (w.market_structure || "—"),
      "Displacement: " + (w.displacement || "—"),
      "FVG: " + (w.fvg || "—"),
      "Order block: " + (w.order_block || "—"),
      "Premium/discount: " + (w.premium_discount || "—"),
      "Session/time: " + (w.session_time || "—"),
      "Other ICT: " + (w.other_ict || "—"),
      "",
      "CONTRADICTIONS:",
      ...(contract.contradictions?.length
        ? contract.contradictions.map((c) => "- " + c)
        : ["- none"]),
      "REJECTED ALTERNATIVE: " + (contract.rejected_alternative || "none"),
      "DATA QUALITY: " + contract.data_quality,
      "FRESHNESS: " + (contract.freshness || "MOCK"),
      "FINAL REASONING: " + contract.final_reasoning,
    ];
    return lines.join("\n");
  }

  function buildVerdictPayload(scenarioKey) {
    const scenario = SCENARIOS[String(scenarioKey || getScenarioKey()).toUpperCase()] || SCENARIOS.WAIT;
    const contract = { ...scenario.contract, why: { ...scenario.contract.why } };
    const panel = buildPanelBrief(contract);
    return {
      mock: true,
      intent: "chart_read",
      verdict: panel,
      panel,
      spokenBrief: scenario.spokenBrief,
      decisionVerdict: scenario.contract.verdict.toLowerCase(),
      quality: scenario.contract.data_quality === "GOOD" ? "good" : "degraded",
      deskPipeline: {
        analysis_contract: contract,
        delta: { mentor_brief: "Mock scenario — " + scenario.label },
      },
    };
  }

  /**
   * Timed mock lifecycle — no fetch, no chrome.runtime.
   * @returns {{ cancel: () => void }}
   */
  function runLifecycle(handlers) {
    const h = handlers || {};
    let cancelled = false;
    const timers = [];

    function later(ms, fn) {
      const t = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      timers.push(t);
      return t;
    }

    function cancel() {
      cancelled = true;
      for (const t of timers) clearTimeout(t);
    }

    h.onAnalyzing?.();
    ANALYZING_STEPS.forEach((step, i) => {
      later(400 + i * 450, () => {
        h.onStep?.(step, i, ANALYZING_STEPS.length);
      });
    });

    const verdictAt = 2400;
    later(verdictAt, () => {
      const data = buildVerdictPayload();
      h.onVerdict?.(data);
      later(350, () => h.onSpeaking?.(data));
      later(2800, () => h.onSpeakingDone?.(data));
    });

    return { cancel };
  }

  window.DeskCopilotMockAnalysis = {
    ANALYZING_STEPS,
    SCENARIO_KEYS,
    SCENARIOS,
    isEnabled,
    setEnabled,
    getScenarioKey,
    setScenarioKey,
    getScenario,
    buildVerdictPayload,
    buildPanelBrief,
    runLifecycle,
  };
})();
