/**
 * Professional trading desk UI — verdict hero, evidence, market bar, previous verdict.
 */
(function () {
  const STORAGE_PREV = "dc-prev-verdict-ui";

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

  function renderVerdictCard(contract, fullText, opts = {}) {
    const card = document.getElementById("dc-verdict-card");
    const empty = document.getElementById("dc-verdict-empty");
    const body = document.getElementById("dc-verdict-body");
    if (!card || !body) return;

    if (!contract) {
      empty?.classList.remove("hidden");
      body.classList.add("hidden");
      card.className = "dc-verdict-card";
      document.getElementById("dc-evidence-wrap")?.classList.add("hidden");
      return;
    }

    empty?.classList.add("hidden");
    body.classList.remove("hidden");
    card.className = `dc-verdict-card ${verdictClass(contract.verdict)}`;
    if (opts.liveDataOffline) card.classList.add("dc-verdict-offline");
    else card.classList.remove("dc-verdict-offline");

    const headline = document.getElementById("dc-verdict-headline");
    const sym = document.getElementById("dc-verdict-symbol");
    const status = document.getElementById("dc-verdict-status");
    if (headline) {
      headline.textContent = opts.lastKnown
        ? `LAST KNOWN · ${verdictHeadline(contract.verdict)}`
        : verdictHeadline(contract.verdict);
    }
    if (sym) sym.textContent = "NASDAQ / NQ";
    if (status) {
      status.textContent = opts.liveDataOffline
        ? "LIVE DATA: OFFLINE"
        : opts.lastKnown
          ? "LAST KNOWN STATE — NOT CURRENT LIVE STATE"
          : verdictStatus(contract.verdict, contract.entry);
    }

    setText("dc-v-entry", contract.entry !== "—" ? `Potential entry: ${contract.entry}` : "");
    setText("dc-v-invalidation", contract.invalidation !== "unknown" ? `Invalidation: ${contract.invalidation}` : "");
    setText("dc-v-target", contract.target !== "unknown" ? `Target: ${contract.target}` : "");
    setText("dc-v-rr", contract.risk_reward !== "unknown" ? `R:R: ${contract.risk_reward}` : "");
    setText("dc-v-setup", contract.setup !== "none identified" ? contract.setup : "");

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

    const full = document.getElementById("dc-full-analysis");
    if (full && fullText) full.textContent = fullText;
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

  function updateMarketBar(opts) {
    const { symbol, price, session, tf, dataStatus, updatedAt, connectionState } = opts;
    setText("dc-bar-symbol", symbol || "NQ");
    setText("dc-bar-tf", tf || "1m");
    setText("dc-bar-session", session || "—");
    const priceEl = document.getElementById("dc-bar-price");
    if (priceEl) {
      if (connectionState && connectionState !== "CONNECTED") {
        priceEl.textContent = Number.isFinite(price) ? `${price.toFixed(2)}*` : "—";
        priceEl.title = "LAST KNOWN STATE — not confirmed live";
      } else {
        priceEl.textContent = Number.isFinite(price) ? price.toFixed(2) : "—";
        priceEl.title = "";
      }
    }
    const dataEl = document.getElementById("dc-bar-data");
    if (dataEl) {
      const s = dataStatus || "—";
      dataEl.textContent = s;
      dataEl.className = "dc-bar-data";
      if (s === "LIVE") dataEl.classList.add("dc-data-live");
      else if (s === "STALE" || String(s).includes("LAST KNOWN")) dataEl.classList.add("dc-data-stale");
      else if (s === "ERROR" || String(s).includes("OFFLINE")) dataEl.classList.add("dc-data-error");
    }
    const upEl = document.getElementById("dc-bar-updated");
    if (upEl) upEl.textContent = updatedAt || "";
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
  }

  function setLevelsStatus(text, ok) {
    const el = document.getElementById("dc-levels-status");
    if (!el) return;
    el.textContent = text || "";
    el.className = "dc-levels-status" + (ok ? " ok" : ok === false ? " err" : "");
  }

  function applyVerdictData(data, opts = {}) {
    const contract = contractFromData(data);
    const fullText = data?.verdict || data?.panel || "";
    const delta = data?.deskPipeline?.delta?.mentor_brief || data?.deskPipeline?.delta?.observation_changes?.join(", ");
    renderPrevious(contract, delta);
    renderVerdictCard(contract, fullText, opts);
    if (contract && !opts.liveDataOffline) savePrevious(contract);
    return contract;
  }

  function clearVerdict() {
    renderVerdictCard(null, "");
  }

  window.DeskCopilotVerdictUI = {
    applyVerdictData,
    updateMarketBar,
    updateVoiceHero,
    setLevelsStatus,
    clearVerdict,
    contractFromData,
  };
})();
