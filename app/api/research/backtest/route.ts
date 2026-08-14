import { NextResponse } from "next/server";
import { loadResearchDatasetFixture } from "@/lib/research/replay/fixtures";
import {
  exportBacktestRun,
  getDemoStrategy,
  runBacktest,
} from "@/lib/research/backtest";
import { buildRunId } from "@/lib/research/manifest";
import { isResearchApiEnabled } from "@/lib/research/gate";

/** Internal research API — gated. Prefer CLI: npm run research:backtest */
function devGate() {
  if (!isResearchApiEnabled()) {
    return NextResponse.json(
      { error: "Research backtest API disabled. Use: npm run research:backtest" },
      { status: 404 }
    );
  }
  return null;
}

export async function POST(req: Request) {
  const blocked = devGate();
  if (blocked) return blocked;

  try {
    const body = (await req.json()) as {
      fixtureId?: string;
      strategyId?: string;
      export?: boolean;
      format?: "json" | "jsonl";
    };

    const fixtureId = body.fixtureId ?? "synthetic-ny-am";
    const strategyId = body.strategyId ?? "prior-session-high-break";
    const strategy = getDemoStrategy(strategyId);
    if (!strategy) {
      return NextResponse.json({ error: `Unknown strategy: ${strategyId}` }, { status: 400 });
    }

    const fixture = loadResearchDatasetFixture(fixtureId);
    const engineConfig = {
      dataset: {
        id: fixture.id,
        symbol: fixture.symbol,
        m1: fixture.m1,
        daily: fixture.daily,
        m5: fixture.m5,
        m15: fixture.m15,
      },
      strategy,
    };
    const result = runBacktest(engineConfig);

    let exportInfo: { filepath: string; fingerprint: string; runDir: string } | null = null;
    if (body.export !== false) {
      const runId = buildRunId("backtest");
      const exported = exportBacktestRun(result, engineConfig, runId, body.format ?? "json");
      exportInfo = {
        filepath: exported.resultsPath,
        fingerprint: exported.fingerprint,
        runDir: exported.runDir,
      };
    }

    return NextResponse.json({ ...result, export: exportInfo });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Backtest failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const blocked = devGate();
  if (blocked) return blocked;

  return NextResponse.json({
    strategies: [{ id: "prior-session-high-break", name: "Long on PDH cross" }],
  });
}
