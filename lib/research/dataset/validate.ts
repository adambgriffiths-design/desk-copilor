import { cmeSessionDateKey } from "../../tickstream/htf-aggregate";
import type {
  ResearchCandle,
  ValidationIssue,
  ValidationReport,
  ValidationSeverity,
} from "./types";

export type ValidateCandlesOptions = {
  requestedStart?: number;
  requestedEnd?: number;
};

function isFinitePrice(v: number): boolean {
  return Number.isFinite(v) && v > 0;
}

function summarizeStatus(issues: ValidationIssue[]): ValidationSeverity {
  if (issues.some((i) => i.severity === "INVALID")) return "INVALID";
  if (issues.some((i) => i.severity === "WARNING")) return "WARNING";
  return "VALID";
}

/**
 * Classifies candle integrity issues — does NOT repair or mutate input.
 */
export function validateCandles(
  candles: ResearchCandle[],
  opts: ValidateCandlesOptions = {}
): ValidationReport {
  const issues: ValidationIssue[] = [];
  let duplicateCount = 0;
  let missingMinuteCount = 0;
  let invalidOhlcCount = 0;

  if (candles.length === 0) {
    issues.push({
      severity: "WARNING",
      code: "EMPTY_DATASET",
      message: "Dataset contains zero candles",
    });
    return {
      status: summarizeStatus(issues),
      issues,
      candleCount: 0,
      duplicateCount: 0,
      missingMinuteCount: 0,
      invalidOhlcCount: 0,
    };
  }

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;

    if (!Number.isFinite(c.timestamp) || c.timestamp <= 0) {
      invalidOhlcCount++;
      issues.push({
        severity: "INVALID",
        code: "IMPOSSIBLE_TIMESTAMP",
        message: `Non-positive or non-finite timestamp at index ${i}`,
        timestamp: c.timestamp,
      });
    }

    const pricesValid =
      isFinitePrice(c.open) &&
      isFinitePrice(c.high) &&
      isFinitePrice(c.low) &&
      isFinitePrice(c.close);

    if (!pricesValid) {
      invalidOhlcCount++;
      issues.push({
        severity: "INVALID",
        code: "INVALID_OHLC",
        message: `Non-finite or non-positive OHLC at index ${i}`,
        timestamp: c.timestamp,
      });
      continue;
    }

    if (c.high < c.low) {
      invalidOhlcCount++;
      issues.push({
        severity: "INVALID",
        code: "HIGH_BELOW_LOW",
        message: `high (${c.high}) < low (${c.low}) at index ${i}`,
        timestamp: c.timestamp,
      });
    }

    if (c.open > c.high || c.open < c.low) {
      invalidOhlcCount++;
      issues.push({
        severity: "INVALID",
        code: "OPEN_OUTSIDE_RANGE",
        message: `open (${c.open}) outside [low, high] at index ${i}`,
        timestamp: c.timestamp,
      });
    }

    if (c.close > c.high || c.close < c.low) {
      invalidOhlcCount++;
      issues.push({
        severity: "INVALID",
        code: "CLOSE_OUTSIDE_RANGE",
        message: `close (${c.close}) outside [low, high] at index ${i}`,
        timestamp: c.timestamp,
      });
    }

    if (i > 0) {
      const prev = candles[i - 1]!;
      if (c.timestamp < prev.timestamp) {
        issues.push({
          severity: "INVALID",
          code: "OUT_OF_ORDER",
          message: `Timestamp ${c.timestamp} precedes ${prev.timestamp} at index ${i}`,
          timestamp: c.timestamp,
        });
      } else if (c.timestamp === prev.timestamp) {
        duplicateCount++;
        issues.push({
          severity: "INVALID",
          code: "DUPLICATE_TIMESTAMP",
          message: `Duplicate timestamp ${c.timestamp} at index ${i}`,
          timestamp: c.timestamp,
        });
      } else {
        const gapMinutes = (c.timestamp - prev.timestamp) / 60 - 1;
        if (gapMinutes >= 1) {
          missingMinuteCount += gapMinutes;
          const prevSession = cmeSessionDateKey(prev.timestamp);
          const curSession = cmeSessionDateKey(c.timestamp);
          issues.push({
            severity: prevSession !== curSession ? "WARNING" : "WARNING",
            code: prevSession !== curSession ? "SESSION_BOUNDARY_GAP" : "MISSING_MINUTES",
            message:
              prevSession !== curSession
                ? `Gap of ${gapMinutes} minute(s) across CME session boundary (${prevSession} → ${curSession})`
                : `Missing ${gapMinutes} minute(s) between ${prev.timestamp} and ${c.timestamp}`,
            timestamp: c.timestamp,
          });
        }
      }
    }
  }

  const first = candles[0]!;
  const last = candles.at(-1)!;

  if (opts.requestedStart != null && first.timestamp > opts.requestedStart) {
    issues.push({
      severity: "WARNING",
      code: "PARTIAL_FIRST",
      message: `First candle ${first.timestamp} starts after requested window ${opts.requestedStart}`,
      timestamp: first.timestamp,
    });
  }

  if (opts.requestedEnd != null && last.timestamp < opts.requestedEnd) {
    issues.push({
      severity: "WARNING",
      code: "PARTIAL_LAST",
      message: `Last candle ${last.timestamp} ends before requested window ${opts.requestedEnd}`,
      timestamp: last.timestamp,
    });
  }

  return {
    status: summarizeStatus(issues),
    issues,
    candleCount: candles.length,
    duplicateCount,
    missingMinuteCount,
    invalidOhlcCount,
  };
}
