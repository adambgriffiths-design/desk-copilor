import { NextRequest, NextResponse } from "next/server";
import {
  isFirstPresentedFvgQuestion,
  isSnapshotIntent,
  resolveSnapshotIntent,
} from "@/lib/chart-question-intent";
import { parseChartPriceInput, parseChartPriceMeta, formatAuthoritativePriceAnswer } from "@/lib/chart-live-price";
import { parseChartSnapshotInput } from "@/lib/chart-snapshot";
import { expandTradingAbbreviations } from "@/lib/plain-language";
import { resolveSnapshotFromQuestion } from "@/lib/market-snapshot";
import { applyVoiceRules, interpretVoiceInput, needsVoiceInterpret } from "@/lib/voice-interpret";
import { buildDeskMarketIntelligence } from "@/lib/market-intelligence";
import { attachApiDataQuality, resolveApiDataQuality } from "@/lib/api-data-quality";
import {
  answerFromIntelligence,
  classifyQueryMode,
  needsMarketIntelligenceAnswer,
  type ConversationContext,
  type MarketIntelligenceAnswer,
} from "@/lib/conversational-query";

export const runtime = "nodejs";

const SNAPSHOT_RESPONSE_CACHE_MS = 10_000;
const SNAPSHOT_LIVE_PRICE_CACHE_MS = 3_000;
let snapshotResponseCache: {
  key: string;
  body: Record<string, unknown>;
  expires: number;
} | null = null;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) {
      return NextResponse.json(
        { error: "question required" },
        { status: 400, headers: cors }
      );
    }

    if (body.voiceInput) {
      if (needsVoiceInterpret(question)) {
        const interpreted = await interpretVoiceInput(question);
        question = interpreted.text;
      } else {
        question = applyVoiceRules(question);
      }
    }

    const intent = resolveSnapshotIntent(question);
    const chartLastPrice = parseChartPriceInput(body.chartLastPrice);
    const priceMeta = parseChartPriceMeta(body);
    const chartSnapshot = parseChartSnapshotInput(body.chartSnapshot);
    const chartExportFailed = body.chartExportFailed === true;
    const conversationContext: ConversationContext | undefined = body.conversationContext;
    const cacheKey = `${intent}|${question}|${chartLastPrice ?? "none"}|${conversationContext?.lastTopic ?? ""}`;
    const now = Date.now();
    if (
      snapshotResponseCache &&
      snapshotResponseCache.key === cacheKey &&
      now < snapshotResponseCache.expires
    ) {
      return NextResponse.json(snapshotResponseCache.body, { headers: cors });
    }

    const forceFresh = intent === "price" || chartLastPrice != null;
    const intel = await buildDeskMarketIntelligence({
      chartLastPrice,
      chartLastPriceSource: priceMeta.source,
      chartLastPriceTs: priceMeta.timestamp,
      chartSnapshot,
      chartExportFailed,
      forceFresh,
    });
    const dq = resolveApiDataQuality(intel, chartLastPrice, priceMeta);
    const intelMode = classifyQueryMode(question, conversationContext);

    if (intelMode !== "legacy_snapshot" || needsMarketIntelligenceAnswer(question)) {
      const answer = answerFromIntelligence(intel, question, conversationContext);
      if (answer) {
        let payload: Omit<MarketIntelligenceAnswer, "updated_at"> & { fpfvg?: boolean } = {
          intent: answer.intent || intent,
          spoken: answer.spoken,
          panel: answer.panel,
          scoped: true,
          mode: answer.mode,
          facts: answer.facts,
          interpretation: answer.interpretation,
          confidence: answer.confidence,
          missing: answer.missing,
          evidence_refs: answer.evidence_refs,
          state_hash: answer.state_hash,
          last_fact_ids: answer.last_fact_ids,
          ...(isFirstPresentedFvgQuestion(question) && answer.intent === "first_presented_fvg"
            ? { fpfvg: true }
            : {}),
        };
        if (!dq.canDecide) {
          payload = {
            ...payload,
            tradeable_bias: "unknown",
            spoken:
              dq.dataQuality === "UNAVAILABLE" || dq.dataQuality === "STALE"
                ? "Live market data is unavailable — I can't quote that yet."
                : payload.spoken,
          };
        } else if (intent === "price" && intel.authoritativePrice) {
          payload = {
            ...payload,
            spoken: formatAuthoritativePriceAnswer(intel.ctx.daily.lastClose, intel.authoritativePrice),
            panel: formatAuthoritativePriceAnswer(intel.ctx.daily.lastClose, intel.authoritativePrice),
          };
        }
        payload = attachApiDataQuality(payload, dq);
        snapshotResponseCache = {
          key: cacheKey,
          body: payload,
          expires:
            now +
            (chartLastPrice != null ? SNAPSHOT_LIVE_PRICE_CACHE_MS : SNAPSHOT_RESPONSE_CACHE_MS),
        };
        return NextResponse.json(payload, { headers: cors });
      }
    }

    if (!isSnapshotIntent(intent)) {
      return NextResponse.json(
        {
          error: "Question needs chart read, not snapshot",
          intent,
          needsChartRead: true,
        },
        { status: 400, headers: cors }
      );
    }

    const ctx = intel.ctx;
    const snapshot = resolveSnapshotFromQuestion(ctx, question);

    let payload: Record<string, unknown> = {
      intent: snapshot.intent,
      spoken: expandTradingAbbreviations(snapshot.spoken),
      panel: expandTradingAbbreviations(snapshot.panel),
      scoped: true,
      state_hash: intel.state_hash,
      ...(isFirstPresentedFvgQuestion(question) && snapshot.intent === "first_presented_fvg"
        ? { fpfvg: true }
        : {}),
    };
    if (!dq.canDecide) {
      payload = {
        ...payload,
        spoken:
          dq.dataQuality === "UNAVAILABLE" || dq.dataQuality === "STALE"
            ? "Live market data is unavailable — I can't quote that yet."
            : payload.spoken,
      };
    } else if (intent === "price" && intel.authoritativePrice) {
      const spoken = formatAuthoritativePriceAnswer(intel.ctx.daily.lastClose, intel.authoritativePrice);
      payload = {
        ...payload,
        spoken: expandTradingAbbreviations(spoken),
        panel: expandTradingAbbreviations(spoken),
      };
    }
    payload = attachApiDataQuality(payload, dq);
    snapshotResponseCache = {
      key: cacheKey,
      body: payload,
      expires:
        now +
        (chartLastPrice != null ? SNAPSHOT_LIVE_PRICE_CACHE_MS : SNAPSHOT_RESPONSE_CACHE_MS),
    };

    return NextResponse.json(payload, { headers: cors });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500, headers: cors });
  }
}
