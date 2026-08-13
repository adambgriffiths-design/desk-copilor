import { NextRequest, NextResponse } from "next/server";
import { parseChartPriceInput } from "@/lib/chart-live-price";
import { applyVoiceRules, interpretVoiceInput, needsVoiceInterpret } from "@/lib/voice-interpret";
import { buildDeskMarketIntelligence } from "@/lib/market-intelligence";
import { attachApiDataQuality, resolveApiDataQuality } from "@/lib/api-data-quality";
import {
  answerFromIntelligence,
  type ConversationContext,
} from "@/lib/conversational-query";

export const runtime = "nodejs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const CACHE_MS = 10_000;
let cache: { key: string; body: Record<string, unknown>; expires: number } | null = null;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) {
      return NextResponse.json({ error: "question required" }, { status: 400, headers: cors });
    }

    if (body.voiceInput) {
      if (needsVoiceInterpret(question)) {
        question = (await interpretVoiceInput(question)).text;
      } else {
        question = applyVoiceRules(question);
      }
    }

    const chartLastPrice = parseChartPriceInput(body.chartLastPrice);
    const conversationContext: ConversationContext | undefined = body.conversationContext;
    const cacheKey = `${question}|${chartLastPrice ?? "none"}|${conversationContext?.lastTopic ?? ""}`;
    const now = Date.now();
    if (cache && cache.key === cacheKey && now < cache.expires) {
      return NextResponse.json(cache.body, { headers: cors });
    }

    const intel = await buildDeskMarketIntelligence({
      chartLastPrice,
      forceFresh: chartLastPrice != null,
    });

    const dq = resolveApiDataQuality(intel, chartLastPrice);
    const answer = answerFromIntelligence(intel, question, conversationContext);
    if (!answer) {
      return NextResponse.json(
        { error: "Question not handled by market intelligence layer", needsChartRead: true },
        { status: 400, headers: cors }
      );
    }

    const safeAnswer =
      dq.dataQuality === "UNAVAILABLE" || dq.dataQuality === "STALE"
        ? {
            ...answer,
            spoken: "Live market data is unavailable — I can't quote price or bias yet.",
            facts: [],
            tradeable_bias: "unknown",
          }
        : dq.dataQuality === "DEGRADED" && intel.observation.htf_bias.tradeable_bias === "unknown"
          ? { ...answer, tradeable_bias: "unknown" }
          : answer;

    const payload = attachApiDataQuality(
      {
        ...safeAnswer,
        observation_summary: intel.observation.data_quality,
        tradeable_bias:
          dq.canDecide && intel.observation.htf_bias.tradeable_bias !== "unknown"
            ? intel.observation.htf_bias.tradeable_bias
            : "unknown",
      },
      dq
    );

    cache = { key: cacheKey, body: payload, expires: now + CACHE_MS };
    return NextResponse.json(payload, { headers: cors });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500, headers: cors });
  }
}
