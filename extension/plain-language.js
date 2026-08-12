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

  window.DeskCopilotPlainLanguage = { expandTradingAbbreviations };
})();
