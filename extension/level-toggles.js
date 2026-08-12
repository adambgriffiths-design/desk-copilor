/**
 * Level visibility toggles — chrome.storage.local + client-side filter before draw.
 * Categories mirror lib/drawing-levels.ts (see LEVEL_DRAW_CATALOG there).
 */
(function () {
  const STORAGE_KEY = "dcLevelToggles";

  /** @type {ReadonlyArray<{ key: string; label: string; teach: string; defaultOn: boolean }>} */
  const LEVEL_CATEGORIES = [
    {
      key: "showOrg",
      label: "ORG (top · CE · bottom)",
      teach: "Opening range gap from 4:15 close to 9:30 open — CE is the equilibrium magnet.",
      defaultOn: true,
    },
    {
      key: "showPd",
      label: "PDH · PDL · PDC · EQ",
      teach: "Prior day high, low, close, and equilibrium — HTF draw liquidity for rebalances.",
      defaultOn: true,
    },
    {
      key: "showGap",
      label: "NWOG · NDOG",
      teach: "New week/day opening gaps — unfinished auction between sessions, often revisited.",
      defaultOn: true,
    },
    {
      key: "showSession",
      label: "Session highs & lows",
      teach: "Asia, London, NY pre/RTH/PM extremes — session liquidity pools for runs and reversals.",
      defaultOn: true,
    },
    {
      key: "showDailyFvg",
      label: "Daily FVG zones",
      teach: "Higher-timeframe fair value gaps — imbalance blocks where price often reprices.",
      defaultOn: true,
    },
    {
      key: "showFpfvg",
      label: "First presented 1m FVG",
      teach: "First 1m FVG after NY open — early imbalance that sets the opening delivery bias.",
      defaultOn: true,
    },
    {
      key: "showRehRel",
      label: "REH · REL",
      teach: "Relative equal highs and lows — clustered swing liquidity pools (pre-market + session).",
      defaultOn: true,
    },
  ];

  function defaultToggles() {
    /** @type {Record<string, boolean>} */
    const out = {};
    for (const cat of LEVEL_CATEGORIES) out[cat.key] = cat.defaultOn;
    return out;
  }

  function mergeToggles(stored) {
    const base = defaultToggles();
    if (!stored || typeof stored !== "object") return base;
    for (const cat of LEVEL_CATEGORIES) {
      if (typeof stored[cat.key] === "boolean") base[cat.key] = stored[cat.key];
    }
    return base;
  }

  async function loadToggles() {
    try {
      const data = await chrome.storage.local.get(STORAGE_KEY);
      return mergeToggles(data[STORAGE_KEY]);
    } catch {
      return defaultToggles();
    }
  }

  async function saveToggles(toggles) {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: mergeToggles(toggles) });
    } catch {
      /* ignore */
    }
  }

  /**
   * Filter API/cache payload to enabled categories only.
   * REH/REL lines are also clipped to chart live price when known.
   * @param {object} payload
   * @param {Record<string, boolean>} toggles
   */
  const REH_REL_PRICE_EPS = 0.25;

  function filterRehRelByPrice(levels, currentPrice) {
    if (!Array.isArray(levels)) return levels;
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) return levels;
    return levels.filter((l) => {
      if (l.group !== "structure") return true;
      const id = String(l.id || "");
      const price = Number(l.price);
      if (!Number.isFinite(price)) return true;
      if (id.startsWith("reh")) return price >= currentPrice + REH_REL_PRICE_EPS;
      if (id.startsWith("rel")) return price <= currentPrice - REH_REL_PRICE_EPS;
      return true;
    });
  }

  function filterPayload(payload, toggles) {
    if (!payload) return payload;
    const t = mergeToggles(toggles);

    const levels = (payload.levels || []).filter((l) => {
      const group = l.group;
      const id = l.id || "";
      if (group === "org") return t.showOrg;
      if (group === "session") return t.showSession;
      if (group === "gap") return t.showGap;
      if (group === "daily") {
        if (id.startsWith("ndog")) return t.showGap;
        return t.showPd;
      }
      if (group === "structure") return t.showRehRel;
      return true;
    });

    const livePrice = Number(payload.lastPrice1m ?? payload.priceHint?.last);
    const priceFiltered = filterRehRelByPrice(levels, livePrice);

    const zones = (payload.zones || []).filter((z) => {
      if (z.kind === "fhdr" || z.id === "fhdr_band") return false;
      if (z.id === "fpfvg_ny_opening") return t.showFpfvg;
      if (z.kind === "fvg" && String(z.id || "").startsWith("d_fvg_")) return t.showDailyFvg;
      return true;
    });

    return { ...payload, levels: priceFiltered, zones };
  }

  window.DeskCopilotLevelToggles = {
    CATEGORIES: LEVEL_CATEGORIES,
    defaultToggles,
    load: loadToggles,
    save: saveToggles,
    filter: filterPayload,
  };
})();
