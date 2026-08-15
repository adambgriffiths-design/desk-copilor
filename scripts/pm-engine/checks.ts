import fs from "fs";
import path from "path";
import { classifyDeskRoute, type DeskRoute } from "../../lib/desk-route-intent";
import { LIVE_DATA_FALLBACK } from "../../lib/routing";
import type { Finding } from "./types";
import { extractObjectKeys, findPatternLines, listFiles, readText } from "./util";

const ROOT = process.cwd();

function id(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(3, "0")}`;
}

function parseGoldenCsv(text: string): Array<{ phrase: string; expectedRoute: DeskRoute; detail?: string }> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: Array<{ phrase: string; expectedRoute: DeskRoute; detail?: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0 && /^phrase,/i.test(line)) continue;
    const parts = line.split(",");
    if (parts.length < 2) continue;
    rows.push({
      phrase: parts[0].trim(),
      expectedRoute: parts[1].trim() as DeskRoute,
      detail: parts[2]?.trim() || undefined,
    });
  }
  return rows;
}

function checkVersionDrift(): Finding[] {
  const findings: Finding[] = [];
  let n = 0;
  const pkg = JSON.parse(readText(path.join(ROOT, "package.json"))) as { version: string };
  const manifest = JSON.parse(readText(path.join(ROOT, "extension", "manifest.json"))) as { version: string };
  const checklist = readText(path.join(ROOT, "STABILIZATION_CHECKLIST.md"));

  if (pkg.version !== manifest.version) {
    findings.push({
      id: id("docs", ++n),
      title: "package.json and extension manifest versions differ",
      dimension: "docs",
      severity: "high",
      evidence: `package.json=${pkg.version}, extension/manifest.json=${manifest.version}`,
      suggestedFix: "Align versions when shipping extension + backend together; document if intentional split.",
      effort: "S",
    });
  }

  const checklistVersion = checklist.match(/manifest\s+\*\*([\d.]+)\*\*/i)?.[1];
  if (checklistVersion && checklistVersion !== manifest.version) {
    findings.push({
      id: id("docs", ++n),
      title: "STABILIZATION_CHECKLIST references stale extension version",
      dimension: "docs",
      severity: "medium",
      evidence: `STABILIZATION_CHECKLIST.md cites manifest ${checklistVersion}; actual manifest is ${manifest.version}`,
      suggestedFix: "Update smoke-test checklist header to current manifest version after each extension bump.",
      effort: "S",
    });
  }

  const routingHeader = readText(path.join(ROOT, "lib", "routing.ts")).match(/routing matrix \(v([\d.]+)\)/i)?.[1];
  if (routingHeader && routingHeader !== pkg.version.split(".").slice(0, 2).join(".")) {
    findings.push({
      id: id("docs", ++n),
      title: "Routing matrix comment version may be stale",
      dimension: "docs",
      severity: "low",
      evidence: `lib/routing.ts header v${routingHeader}; package.json is v${pkg.version}`,
      suggestedFix: "Refresh routing matrix comment when routing behavior changes.",
      effort: "S",
    });
  }

  return findings;
}

function checkRoutingGolden(): Finding[] {
  const findings: Finding[] = [];
  let n = 0;
  const csvPath = path.join(ROOT, "data", "routing-golden.csv");
  const golden = parseGoldenCsv(readText(csvPath));
  const failures: string[] = [];

  for (const row of golden) {
    const result = classifyDeskRoute({ text: row.phrase, routeText: row.phrase });
    const routeOk = result.route === row.expectedRoute;
    const detailOk = !row.detail || result.detail === row.detail;
    if (!routeOk || !detailOk) {
      failures.push(
        `"${row.phrase}" → expected ${row.expectedRoute}${row.detail ? ` · ${row.detail}` : ""}, got ${result.route}${result.detail ? ` · ${result.detail}` : ""}`
      );
    }
  }

  if (failures.length > 0) {
    findings.push({
      id: id("routing", ++n),
      title: `${failures.length} routing golden test failure(s)`,
      dimension: "routing",
      severity: "critical",
      evidence: failures.slice(0, 5).join("; ") + (failures.length > 5 ? ` … +${failures.length - 5} more` : ""),
      suggestedFix: "Fix classifyDeskRoute or update data/routing-golden.csv; run npm run test:routing.",
      effort: failures.length > 3 ? "L" : "M",
    });
  }

  const byRoute = new Map<DeskRoute, number>();
  for (const row of golden) {
    byRoute.set(row.expectedRoute, (byRoute.get(row.expectedRoute) || 0) + 1);
  }
  const routes: DeskRoute[] = ["levels", "chart_read", "price", "snapshot", "live_web", "casual", "trading"];
  const thin = routes.filter((r) => (byRoute.get(r) || 0) < 3);
  if (thin.length) {
    findings.push({
      id: id("routing", ++n),
      title: "Thin golden coverage for some desk routes",
      dimension: "tests",
      severity: "medium",
      evidence: thin.map((r) => `${r}: ${byRoute.get(r) || 0} phrase(s)`).join(", "),
      suggestedFix: "Add 3–5 real user phrases per route to data/routing-golden.csv (especially under-covered routes).",
      effort: "M",
    });
  }

  if (golden.length < 50) {
    findings.push({
      id: id("routing", ++n),
      title: "Routing golden set is small for regression safety",
      dimension: "tests",
      severity: "medium",
      evidence: `${golden.length} rows in data/routing-golden.csv (target ≥50 for voice + chat parity)`,
      suggestedFix: "Harvest phrases from session logs and stabilization checklist into golden CSV.",
      effort: "M",
    });
  }

  return findings;
}

function checkExtensionBackendParity(): Finding[] {
  const findings: Finding[] = [];
  let n = 0;
  const libSrc = readText(path.join(ROOT, "lib", "desk-route-intent.ts"));
  const extSrc = readText(path.join(ROOT, "extension", "desk-route-intent.js"));

  const libLabels = extractObjectKeys(libSrc, "ROUTE_LABELS");
  const extLabels = extractObjectKeys(extSrc, "ROUTE_LABELS");
  const labelDiff = [...new Set([...libLabels, ...extLabels])].filter(
    (k) => !libLabels.includes(k) || !extLabels.includes(k)
  );
  if (labelDiff.length) {
    findings.push({
      id: id("routing", ++n),
      title: "Extension and backend route labels diverge",
      dimension: "routing",
      severity: "high",
      evidence: `lib keys=[${libLabels.join(", ")}]; extension keys=[${extLabels.join(", ")}]`,
      suggestedFix: "Keep extension/desk-route-intent.js in sync with lib/desk-route-intent.ts.",
      effort: "M",
    });
  }

  const priceRe =
    /\b\(what price\|what level\|where are we\|current price\|trading at\|currently trading\|what are we at\|where is price\|where's price\|how much is\|last price\)/;
  const libHasPrice = priceRe.test(libSrc);
  const extHasPrice = priceRe.test(extSrc);
  if (libHasPrice !== extHasPrice) {
    findings.push({
      id: id("routing", ++n),
      title: "Price-route regex differs between extension and backend",
      dimension: "routing",
      severity: "high",
      evidence: `lib/desk-route-intent.ts price regex present=${libHasPrice}; extension/desk-route-intent.js present=${extHasPrice}`,
      suggestedFix: "Mirror isPriceRoute() exactly in both classifiers.",
      effort: "S",
    });
  }

  const extFallback = extSrc.match(/LIVE_DATA_FALLBACK_MSG\s*=\s*\n?\s*"([^"]+)"/)?.[1];
  if (extFallback && extFallback !== LIVE_DATA_FALLBACK) {
    findings.push({
      id: id("reliability", ++n),
      title: "LIVE_DATA_FALLBACK copy differs in extension vs backend",
      dimension: "reliability",
      severity: "medium",
      evidence: `lib/routing.ts: "${LIVE_DATA_FALLBACK}"; extension/content.js: "${extFallback}"`,
      suggestedFix: "Single-source fallback string or shared constant to avoid voice/chat mismatch.",
      effort: "S",
    });
  }

  return findings;
}

function checkApiReliability(): Finding[] {
  const findings: Finding[] = [];
  let n = 0;
  const apiDir = path.join(ROOT, "app", "api");
  const routes = listFiles(apiDir, { ext: [".ts"] }).filter((f) => f.endsWith("route.ts"));

  const noTryCatch: string[] = [];
  const noCors: string[] = [];
  const jsonNoGuard: string[] = [];

  for (const routeFile of routes) {
    const rel = path.relative(ROOT, routeFile).replace(/\\/g, "/");
    const src = readText(routeFile);
    const hasHandler = /export async function (GET|POST|PUT|DELETE|PATCH)/.test(src);
    if (!hasHandler) continue;

    if (!/\btry\s*\{/.test(src)) noTryCatch.push(rel);
    if (!/Access-Control-Allow-Origin/.test(src)) noCors.push(rel);

    if (/await request\.json\(\)/.test(src) && !/try\s*\{[\s\S]*await request\.json\(\)/.test(src)) {
      jsonNoGuard.push(rel);
    }
  }

  if (noTryCatch.length) {
    findings.push({
      id: id("reliability", ++n),
      title: `${noTryCatch.length} API route(s) without try/catch`,
      dimension: "reliability",
      severity: noTryCatch.some((r) => /chat|voice|market-snapshot|live-verdict/.test(r)) ? "high" : "medium",
      evidence: noTryCatch.slice(0, 8).join(", ") + (noTryCatch.length > 8 ? ` … +${noTryCatch.length - 8}` : ""),
      suggestedFix: "Wrap handlers in try/catch; return plain-language errors with CORS headers.",
      effort: "M",
    });
  }

  const extensionFacing = noCors.filter((r) =>
    /chat|voice|market-snapshot|live-verdict|levels|warm|health|transcribe|session/.test(r)
  );
  if (extensionFacing.length) {
    findings.push({
      id: id("reliability", ++n),
      title: "Extension-facing API routes missing CORS headers",
      dimension: "reliability",
      severity: "high",
      evidence: extensionFacing.join(", "),
      suggestedFix: "Add Access-Control-Allow-Origin: * and OPTIONS handler like other extension routes.",
      effort: "S",
    });
  }

  if (jsonNoGuard.length) {
    findings.push({
      id: id("reliability", ++n),
      title: "POST routes parse JSON outside try/catch",
      dimension: "reliability",
      severity: "medium",
      evidence: jsonNoGuard.join(", "),
      suggestedFix: "Guard request.json() — malformed body should return 400, not 500.",
      effort: "S",
    });
  }

  return findings;
}

function checkVoiceReliability(): Finding[] {
  const findings: Finding[] = [];
  let n = 0;
  const voiceFiles = ["extension/voice.js", "extension/voice-realtime.js", "extension/content.js"];
  const missingBarge: string[] = [];

  for (const rel of voiceFiles) {
    const src = readText(path.join(ROOT, rel));
    if (!/barge|interrupt_response|cancel.*speak/i.test(src)) {
      missingBarge.push(rel);
    }
  }

  if (missingBarge.length) {
    findings.push({
      id: id("reliability", ++n),
      title: "Voice file may lack barge-in / interrupt handling",
      dimension: "reliability",
      severity: "medium",
      evidence: missingBarge.join(", "),
      suggestedFix: "Ensure all speak paths honor user interrupt (realtime + TTS fallback).",
      effort: "M",
    });
  }

  const voiceJs = readText(path.join(ROOT, "extension", "voice.js"));
  const swallowErrors = (voiceJs.match(/catch\s*\(\s*\)\s*\{\s*\}/g) || []).length;
  if (swallowErrors >= 3) {
    findings.push({
      id: id("reliability", ++n),
      title: "Voice layer has empty catch blocks that hide failures",
      dimension: "reliability",
      severity: "medium",
      evidence: `extension/voice.js — ${swallowErrors} empty catch {} blocks`,
      suggestedFix: "Log voice errors to panel debug or surface a short user-facing retry message.",
      effort: "M",
    });
  }

  return findings;
}

function checkPlainLanguage(): Finding[] {
  const findings: Finding[] = [];
  let n = 0;
  const abbrev = /\b(FVG|ORG|NDOG|NWOG|MSS|CHoCH|OTE|PDH|PDL)\b/;
  const userFacing = listFiles(path.join(ROOT, "lib"), { ext: [".ts"] }).filter(
    (f) =>
      /market-snapshot|voice-spoken|chat-engine|execution-plan/.test(f) &&
      !f.includes("plain-language") &&
      !f.includes("verdict-format")
  );

  const leaks: string[] = [];
  for (const file of userFacing) {
    const hits = findPatternLines(file, abbrev, 3);
    for (const h of hits) {
      if (/never FVG|no abbreviations|expandTradingAbbreviations|console\.|\/\*\*|\/\//.test(h.text)) {
        continue;
      }
      leaks.push(h.text);
    }
  }

  if (leaks.length) {
    findings.push({
      id: id("ux", ++n),
      title: "ICT abbreviations in user-facing lib paths",
      dimension: "ux",
      severity: "medium",
      evidence: leaks.slice(0, 4).join("; "),
      suggestedFix: "Run expandTradingAbbreviations on spoken/panel output; spell out terms in prompts.",
      effort: "M",
    });
  }

  const extContent = readText(path.join(ROOT, "extension", "content.js"));
  const userErrors = [
    ...findPatternLines(path.join(ROOT, "extension", "content.js"), /error|failed|couldn't|Could not/i, 3),
  ].filter((h) => !/console\.|voiceLog|catch/.test(h.text));

  const technicalErrors = userErrors.filter((h) =>
    /\b(500|502|JSON|fetch|HTTP|undefined|null|stack)\b/i.test(h.text)
  );
  if (technicalErrors.length) {
    findings.push({
      id: id("ux", ++n),
      title: "Technical error wording may reach users in extension panel",
      dimension: "ux",
      severity: "medium",
      evidence: technicalErrors.map((t) => t.text).join("; "),
      suggestedFix: "Replace with plain-language retry hints (match LIVE_DATA_FALLBACK tone).",
      effort: "S",
    });
  }

  if (/LIVE_DATA_FALLBACK/.test(extContent) && !/expandTradingAbbreviations|plainLanguage|plain-language/.test(extContent)) {
    findings.push({
      id: id("ux", ++n),
      title: "Extension content.js does not reference plain-language helpers",
      dimension: "ux",
      severity: "low",
      evidence: "extension/content.js — no expandTradingAbbreviations / plain-language import",
      suggestedFix: "Ensure bubble + voice text pass through plain-language expansion before display.",
      effort: "M",
    });
  }

  return findings;
}

function checkPerformance(): Finding[] {
  const findings: Finding[] = [];
  let n = 0;
  const marketData = readText(path.join(ROOT, "lib", "market-data.ts"));
  const cacheMatch = marketData.match(/MARKET_CACHE_MS\s*=\s*([\d_]+)/);
  if (cacheMatch) {
    const ms = Number(cacheMatch[1].replace(/_/g, ""));
    if (ms < 30_000) {
      findings.push({
        id: id("performance", ++n),
        title: "Market data cache TTL is aggressive for live desk",
        dimension: "performance",
        severity: "low",
        evidence: `lib/market-data.ts MARKET_CACHE_MS=${ms}ms (${Math.round(ms / 1000)}s)`,
        suggestedFix: "Balance Yahoo rate limits vs tick freshness; consider separate 1m TTL for price-only.",
        effort: "M",
      });
    }
    if (ms > 120_000) {
      findings.push({
        id: id("performance", ++n),
        title: "Market data cache may feel stale during active session",
        dimension: "performance",
        severity: "medium",
        evidence: `lib/market-data.ts MARKET_CACHE_MS=${ms}ms`,
        suggestedFix: "Shorten cache for snapshot/price routes or honor chart live price override.",
        effort: "M",
      });
    }
  }

  const bg = readText(path.join(ROOT, "extension", "background.js"));
  const warmCalls = (bg.match(/\/api\/warm/g) || []).length;
  if (warmCalls === 0) {
    findings.push({
      id: id("performance", ++n),
      title: "Extension background does not warm backend cache",
      dimension: "performance",
      severity: "medium",
      evidence: "extension/background.js — no /api/warm calls found",
      suggestedFix: "Call /api/warm on panel open and before chart read to hide cold-start latency.",
      effort: "S",
    });
  }

  const chartPrice = path.join(ROOT, "extension", "chart-price.js");
  if (fs.existsSync(chartPrice)) {
    const src = readText(chartPrice);
    if (!/tick|live|TradingView|priceHint/.test(src)) {
      findings.push({
        id: id("performance", ++n),
        title: "Chart price bridge may not prefer tick-aware live price",
        dimension: "performance",
        severity: "medium",
        evidence: "extension/chart-price.js — no tick/live price hints detected",
        suggestedFix: "Prefer TradingView last tick over cached Yahoo close for price route.",
        effort: "M",
      });
    }
  }

  return findings;
}

function checkTestCoverage(): Finding[] {
  const findings: Finding[] = [];
  let n = 0;
  const scripts = listFiles(path.join(ROOT, "scripts"), { ext: [".ts"] }).map((f) =>
    path.basename(f)
  );
  const expectedTests = [
    { script: "test-routing-golden.ts", npm: "test:routing", area: "routing" },
    { script: "test-regression-session.ts", npm: "test:regression", area: "session regression" },
    { script: "test-voice-quick-reply.ts", npm: "test:voice", area: "voice quick reply" },
    { script: "test-scoped-chart-qa.ts", npm: "test:scoped", area: "scoped chart Q&A" },
  ];

  const missingScripts = expectedTests.filter((t) => !scripts.includes(t.script));
  if (missingScripts.length) {
    findings.push({
      id: id("tests", ++n),
      title: "Expected regression scripts missing",
      dimension: "tests",
      severity: "high",
      evidence: missingScripts.map((m) => m.script).join(", "),
      suggestedFix: "Restore scripts referenced in STABILIZATION_CHECKLIST.md.",
      effort: "L",
    });
  }

  const apiRoutes = listFiles(path.join(ROOT, "app", "api"), { ext: [".ts"] })
    .filter((f) => f.endsWith("route.ts"))
    .map((f) => path.relative(path.join(ROOT, "app", "api"), f).replace(/\\/g, "/").replace(/\/route\.ts$/, ""));

  const untestedRoutes = apiRoutes.filter(
    (r) =>
      !/health|warm/.test(r) &&
      !scripts.some((s) => s.includes(r.replace(/\//g, "-")) || s.includes(r.split("/")[0]))
  );

  if (untestedRoutes.length >= 5) {
    findings.push({
      id: id("tests", ++n),
      title: "Several API routes lack dedicated script tests",
      dimension: "tests",
      severity: "medium",
      evidence: untestedRoutes.slice(0, 10).join(", ") + (untestedRoutes.length > 10 ? ` … +${untestedRoutes.length - 10}` : ""),
      suggestedFix: "Add golden or smoke tests for market-snapshot, voice/interpret, levels.",
      effort: "L",
    });
  }

  const stabilization = readText(path.join(ROOT, "STABILIZATION_CHECKLIST.md"));
  if (!/npm run test:routing/.test(stabilization)) {
    findings.push({
      id: id("tests", ++n),
      title: "Stabilization checklist omits routing golden test",
      dimension: "docs",
      severity: "low",
      evidence: "STABILIZATION_CHECKLIST.md — no npm run test:routing mention",
      suggestedFix: "Add automated routing test to dev checks section.",
      effort: "S",
    });
  }

  return findings;
}

function checkDeployDocs(): Finding[] {
  const findings: Finding[] = [];
  let n = 0;
  const deploy = readText(path.join(ROOT, "DEPLOY.md"));
  const envExample = readText(path.join(ROOT, ".env.example"));

  const deployEnvVars = [...deploy.matchAll(/`([A-Z_]+)`/g)].map((m) => m[1]);
  const exampleVars = [...envExample.matchAll(/^([A-Z_]+)=/gm)].map((m) => m[1]);
  const inDeployNotExample = deployEnvVars.filter((v) => !exampleVars.includes(v) && v.endsWith("_KEY"));

  if (inDeployNotExample.length) {
    findings.push({
      id: id("docs", ++n),
      title: "DEPLOY.md documents env vars missing from .env.example",
      dimension: "docs",
      severity: "medium",
      evidence: inDeployNotExample.join(", "),
      suggestedFix: "Add documented keys to .env.example with short comments.",
      effort: "S",
    });
  }

  if (/desk-copilor\.vercel\.app/.test(readText(path.join(ROOT, "extension", "manifest.json")))) {
    findings.push({
      id: id("docs", ++n),
      title: "Extension manifest host_permissions typo (copilor)",
      dimension: "docs",
      severity: "low",
      evidence: "extension/manifest.json — desk-copilor.vercel.app",
      suggestedFix: "Fix typo or confirm intentional alias; align with production URL in options default.",
      effort: "S",
    });
  }

  return findings;
}

function checkSnapshotIntents(): Finding[] {
  const findings: Finding[] = [];
  let n = 0;
  const golden = parseGoldenCsv(readText(path.join(ROOT, "data", "routing-golden.csv")));
  const snapshotDetails = new Set(
    golden.filter((r) => r.expectedRoute === "snapshot" && r.detail).map((r) => r.detail!)
  );
  const expectedDetails = ["status", "level", "entry", "target", "bias", "first_presented_fvg", "price"];
  const missing = expectedDetails.filter((d) => !snapshotDetails.has(d));

  if (missing.length) {
    findings.push({
      id: id("routing", ++n),
      title: "Snapshot intent golden gaps",
      dimension: "routing",
      severity: "medium",
      evidence: `No golden row for snapshot detail(s): ${missing.join(", ")}`,
      suggestedFix: "Add phrases from STABILIZATION_CHECKLIST for each snapshot intent.",
      effort: "S",
    });
  }

  return findings;
}

export function runAllChecks(): Finding[] {
  return [
    ...checkVersionDrift(),
    ...checkRoutingGolden(),
    ...checkExtensionBackendParity(),
    ...checkApiReliability(),
    ...checkVoiceReliability(),
    ...checkPlainLanguage(),
    ...checkPerformance(),
    ...checkTestCoverage(),
    ...checkDeployDocs(),
    ...checkSnapshotIntents(),
  ];
}
