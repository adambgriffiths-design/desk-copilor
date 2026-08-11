import { NextResponse } from "next/server";
import { runBacktestTraining } from "@/lib/backtest-runner";

export const runtime = "nodejs";
export const maxDuration = 300;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      dryRun?: boolean;
      maxMoments?: number;
      forwardBars?: number;
      model?: string;
    };

    const result = await runBacktestTraining({
      dryRun: body.dryRun,
      maxMoments: body.maxMoments,
      forwardBars: body.forwardBars,
      model: body.model,
    });

    return NextResponse.json(result, { headers: cors });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500, headers: cors });
  }
}

export async function GET() {
  return NextResponse.json(
    {
      description: "POST to run historical NY AM replay trainer",
      defaults: { forwardBars: 30, model: "gpt-4o-mini", momentsPerSession: 6 },
    },
    { headers: cors }
  );
}
