/** Expand desk abbreviations for voice TTS and chat bubbles (extension mirror of lib/plain-language.ts). */
(function () {
  function expandTradingAbbreviations(text) {
    if (!text || !String(text).trim()) return text || "";

    let s = String(text);
    s = s.replace(/\(\s*PDH\s*\)/gi, "");
    s = s.replace(/\(\s*PDL\s*\)/gi, "");
    s = s.replace(/\(\s*PDC\s*\)/gi, "");
    s = s.replace(/\(\s*PDO\s*\)/gi, "");
    s = s.replace(/\(\s*NDOG\s*\)/gi, "");
    s = s.replace(/\(\s*NWOG\s*\)/gi, "");
    s = s.replace(/\(\s*FVG\s*\)/gi, "");
    s = s.replace(/\(\s*MSS\s*\)/gi, "");
    s = s.replace(/\(\s*ORG\s*\)/gi, "");
    s = s.replace(/\(\s*CE\s*\)/gi, "");
    s = s.replace(/\(\s*OB\s*\)/gi, "");

    const replacements = [
      [/\bMNQ\b/g, "Nasdaq futures"],
      [/\bNQ\b(?!\w)/g, "Nasdaq futures"],
      [/\bPDH\b/gi, "previous day high"],
      [/\bPDL\b/gi, "previous day low"],
      [/\bPDC\b/gi, "previous day close"],
      [/\bPDO\b/gi, "previous day open"],
      [/\bNDOG top\b/gi, "new day opening gap top"],
      [/\bNDOG bottom\b/gi, "new day opening gap bottom"],
      [/\bNDOG\b/gi, "new day opening gap"],
      [/\bNWOG top\b/gi, "new week opening gap top"],
      [/\bNWOG bottom\b/gi, "new week opening gap bottom"],
      [/\bNWOG\b/gi, "new week opening gap"],
      [/\bFVGs\b/gi, "fair value gaps"],
      [/\bFVG\b/gi, "fair value gap"],
      [/\bMSS\b/gi, "market structure shift"],
      [/\bCHoCH\b/gi, "change of character"],
      [/\bORG\b/gi, "opening range gap"],
      [/\bHTF\b/gi, "higher timeframe"],
      [/\bLTF\b/gi, "lower timeframe"],
      [/\bOB\b/gi, "order block"],
      [/\bCE\b/gi, "consequent encroachment"],
      [/\bOTE\b/gi, "optimal trade entry"],
      [/\bEQH\b/gi, "relative equal highs"],
      [/\bEQL\b/gi, "relative equal lows"],
      [/\bIVFVG\b/gi, "inverse fair value gap"],
      [/\bFPFVG\b/gi, "first presented fair value gap"],
      [/\bRTH\b/gi, "regular trading hours"],
      [/\bAMD\b/gi, "accumulation manipulation distribution"],
      [/\bDaily bullish FVG\b/gi, "daily bullish fair value gap"],
      [/\bDaily bearish FVG\b/gi, "daily bearish fair value gap"],
      [/\b1m\b/gi, "one-minute"],
      [/\b5m\b/gi, "five-minute"],
      [/\b15m\b/gi, "fifteen-minute"],
      [/\b1H\b/gi, "one-hour"],
      [/\b4H\b/gi, "four-hour"],
      [/\bD1\b/gi, "daily"],
      [/\bPD target\b/gi, "premium-discount target"],
      [/\bPD targets\b/gi, "premium-discount targets"],
      [/\bPD brief\b/gi, "premium-discount brief"],
      [/\bPD-array\b/gi, "premium-discount array"],
      [/\bPD led\b/gi, "premium-discount led"],
      [/\bPD-led\b/gi, "premium-discount led"],
      [/\bmedium\+\b/gi, "medium or higher confidence"],
      [/\b(\d)\/3 timeframes\b/gi, "$1 of three timeframes"],
      [/\bNY RTH\b/gi, "New York regular trading hours"],
      [/\bNY pre\b/gi, "New York pre-market"],
      [/\bNY PM\b/gi, "New York afternoon session"],
      [/\bNY AM\b/gi, "New York morning session"],
      [/\bTarget one\b/gi, "First target"],
      [/\bentry wait\b/gi, "waiting for entry"],
      [/\bentry active\b/gi, "entry active now"],
      [/\bWAIT\b/g, "waiting"],
    ];

    for (const [re, rep] of replacements) {
      s = s.replace(re, rep);
    }

    return s.replace(/\s{2,}/g, " ").replace(/\s+([,.])/g, "$1").trim();
  }

  const CHART_INVISIBLE = /[\u200B-\u200D\u2060\uFEFF]/g;
  const CHART_ID_LABELS = {
    pdh: "Previous Day High",
    pdl: "Previous Day Low",
    pdc: "Previous Day Close",
    pdo: "Previous Day Open",
    cdo: "Current Day Open",
    cdeq: "Current Day Equilibrium",
    pdeq: "Previous Day Equilibrium",
    ndog_top: "New Day Opening Gap Top",
    ndog_bot: "New Day Opening Gap Bottom",
    nwog_top: "New Week Opening Gap Top",
    nwog_bottom: "New Week Opening Gap Bottom",
    nwog_bot: "New Week Opening Gap Bottom",
    org_top: "Opening Range Gap Top",
    org_bottom: "Opening Range Gap Bottom",
    org_ce: "Opening Range Gap Midpoint",
    fhdr_band: "First Hour Dealing Range (9:30–10:30)",
    fpfvg_ny_opening: "First Presented One-Minute Fair Value Gap",
    asia_high: "Asia Session High",
    asia_low: "Asia Session Low",
    london_high: "London Session High",
    london_low: "London Session Low",
    ny_pre_high: "New York Pre-Market High",
    ny_pre_low: "New York Pre-Market Low",
    ny_rth_high: "New York Regular Trading Hours High",
    ny_rth_low: "New York Regular Trading Hours Low",
    ny_pm_high: "New York Afternoon Session High",
    ny_pm_low: "New York Afternoon Session Low",
  };
  const CHART_ABBREV = [
    [/\bFirst presented 1m FVG\b/gi, "First Presented One-Minute Fair Value Gap"],
    [/\bORG bot\b/gi, "Opening Range Gap Bottom"],
    [/\bORG top\b/gi, "Opening Range Gap Top"],
    [/\bORG 50%\b/gi, "Opening Range Gap Midpoint"],
    [/\bORG 25%\b/gi, "Opening Range Gap 25%"],
    [/\bNY pre H\b/gi, "New York Pre-Market High"],
    [/\bNY pre L\b/gi, "New York Pre-Market Low"],
    [/\bNY RTH H\b/gi, "New York Regular Trading Hours High"],
    [/\bNY RTH L\b/gi, "New York Regular Trading Hours Low"],
    [/\bD EQ\b/gi, "Daily Equilibrium"],
    [/\bFHDR\b/gi, "First Hour Dealing Range"],
    [/\bFPFVG\b/gi, "First Presented Fair Value Gap"],
    [/\bIVFVG\b/gi, "Inverse Fair Value Gap"],
    [/\bNDOG\b/gi, "New Day Opening Gap"],
    [/\bNWOG\b/gi, "New Week Opening Gap"],
    [/\bBPR\b/gi, "Balanced Price Range"],
    [/\bFVGs\b/gi, "Fair Value Gaps"],
    [/\bFVG\b/gi, "Fair Value Gap"],
    [/\bPDH\b/gi, "Previous Day High"],
    [/\bPDL\b/gi, "Previous Day Low"],
    [/\bPDC\b/gi, "Previous Day Close"],
    [/\bPDO\b/gi, "Previous Day Open"],
    [/\bCDO\b/gi, "Current Day Open"],
    [/\bEQH\b/gi, "Relative Equal Highs"],
    [/\bEQL\b/gi, "Relative Equal Lows"],
    [/\bREH\b/gi, "Relative Equal Highs"],
    [/\bREL\b/gi, "Relative Equal Lows"],
    [/\bORG\b/gi, "Opening Range Gap"],
    [/\bOTE\b/gi, "Optimal Trade Entry"],
    [/\bMSS\b/gi, "Market Structure Shift"],
    [/\bRTH\b/gi, "Regular Trading Hours"],
    [/\bOB\b/gi, "Order Block"],
    [/\b1m\b/gi, "One-Minute"],
    [/\bCE\b/gi, "Consequent Encroachment"],
    [/\bEQ\b/gi, "Equilibrium"],
  ];

  function chartIdKey(id) {
    const raw = String(id || "");
    if (/^reh(_|$)/i.test(raw)) return "reh";
    if (/^rel(_|$)/i.test(raw)) return "rel";
    return raw;
  }

  function stripChartOwnershipPrefix(label) {
    let s = String(label || "").replace(CHART_INVISIBLE, "").trim();
    s = s.replace(/^DC\s+/i, "");
    s = s.replace(/^DC(?=[A-Z(])/, "");
    s = s.replace(
      /\(\s*(PDH|PDL|PDC|PDO|CDO|NDOG|NWOG|FVG|ORG|CE|OB|EQ|REH|REL|FHDR|BPR|EQH|EQL)\s*\)/gi,
      ""
    );
    return s.replace(/\s{2,}/g, " ").trim();
  }

  function titleCaseChartLabel(s) {
    return s.replace(/[A-Za-z][A-Za-z']*/g, (word, offset) => {
      if (offset > 0 && /^(and|of|to|the|or)$/i.test(word)) return word.toLowerCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
  }

  function formatChartLevelLabel(label, id) {
    const key = chartIdKey(id);
    if (key === "reh") return "Relative Equal Highs";
    if (key === "rel") return "Relative Equal Lows";
    if (CHART_ID_LABELS[key]) {
      const extra = String(label || "").match(/[·•].+$/);
      return extra ? `${CHART_ID_LABELS[key]} ${extra[0].trim()}` : CHART_ID_LABELS[key];
    }

    let s = stripChartOwnershipPrefix(label);
    if (!s) return "";
    for (const [re, rep] of CHART_ABBREV) s = s.replace(re, rep);
    return titleCaseChartLabel(s).replace(/\s{2,}/g, " ").trim();
  }

  window.DeskCopilotPlainLanguage = { expandTradingAbbreviations, formatChartLevelLabel };
})();
