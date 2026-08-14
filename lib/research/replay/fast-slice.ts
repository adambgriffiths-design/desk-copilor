import type { Bar } from "../../types";

/** Binary search — last index where bar.time <= asOf. */
export function lastBarIndexAtOrBefore(bars: Bar[], asOf: Date): number {
  if (!bars.length) return -1;
  const t = asOf.getTime();
  let lo = 0;
  let hi = bars.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid]!.time.getTime() <= t) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/** Prefix slice by inclusive end index — for chronological replay stepping. */
export function sliceBarsThroughIndex(bars: Bar[], endIndex: number): Bar[] {
  if (endIndex < 0) return [];
  return bars.slice(0, endIndex + 1);
}

/** Precompute m1 bar index → last m5/m15 index at or before that m1 timestamp. */
export function buildHtfIndexMaps(m1: Bar[], m5: Bar[], m15: Bar[]) {
  const m5EndByM1: number[] = new Array(m1.length);
  const m15EndByM1: number[] = new Array(m1.length);
  let m5Idx = -1;
  let m15Idx = -1;
  for (let i = 0; i < m1.length; i++) {
    const t = m1[i]!.time;
    while (m5Idx + 1 < m5.length && m5[m5Idx + 1]!.time.getTime() <= t.getTime()) m5Idx++;
    while (m15Idx + 1 < m15.length && m15[m15Idx + 1]!.time.getTime() <= t.getTime()) m15Idx++;
    m5EndByM1[i] = m5Idx;
    m15EndByM1[i] = m15Idx;
  }
  return { m5EndByM1, m15EndByM1 };
}
