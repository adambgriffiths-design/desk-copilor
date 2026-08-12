import fs from "fs";
import path from "path";
import { JOURNAL_SCHEMA_VERSION, PIPELINE_VERSION } from "./pipeline-version";
import type { TradingVerdict } from "./desk-schema";

export type JournalOutcome = "win" | "loss" | "breakeven" | "skipped" | "pending";

export type TradeJournalEntry = {
  schema_version: string;
  pipeline_version: string;
  id: string;
  created_at: string;
  updated_at?: string;
  /** pre_trade = thinking before; post_trade = review after */
  phase: "pre_trade" | "post_trade";
  setup_id?: string;
  market_state_snapshot?: string;
  state_hash?: string;
  /** Pre-trade: your read before acting */
  thinking_before?: string;
  planned_verdict?: TradingVerdict;
  planned_invalidation?: number;
  planned_target?: number;
  planned_entry_zone?: string;
  /** Post-trade: honest review */
  outcome?: JournalOutcome;
  review_after?: string;
  what_worked?: string;
  what_failed?: string;
  /** Link to labeled-setup for replay training */
  label_link?: string;
  /** Pipeline observation snapshot at time of entry (optional path) */
  observation_snapshot?: string;
};

const JOURNAL_DIR = path.join(process.cwd(), "data", "trade-journal", "entries");

export function validateJournalEntry(entry: unknown): string[] {
  const errors: string[] = [];
  if (!entry || typeof entry !== "object") return ["entry must be an object"];
  const e = entry as Record<string, unknown>;
  if (!e.id || typeof e.id !== "string") errors.push("missing id");
  if (!e.phase || (e.phase !== "pre_trade" && e.phase !== "post_trade")) errors.push("invalid phase");
  if (e.phase === "pre_trade") {
    if (!e.thinking_before || String(e.thinking_before).length < 10) {
      errors.push("pre_trade requires thinking_before (min 10 chars)");
    }
  }
  if (e.phase === "post_trade") {
    if (!e.review_after || String(e.review_after).length < 10) {
      errors.push("post_trade requires review_after (min 10 chars)");
    }
  }
  return errors;
}

export function createPreTradeEntry(input: {
  id: string;
  thinking_before: string;
  planned_verdict?: TradingVerdict;
  planned_invalidation?: number;
  planned_target?: number;
  planned_entry_zone?: string;
  state_hash?: string;
  setup_id?: string;
}): TradeJournalEntry {
  return {
    schema_version: JOURNAL_SCHEMA_VERSION,
    pipeline_version: PIPELINE_VERSION,
    id: input.id,
    created_at: new Date().toISOString(),
    phase: "pre_trade",
    thinking_before: input.thinking_before,
    planned_verdict: input.planned_verdict,
    planned_invalidation: input.planned_invalidation,
    planned_target: input.planned_target,
    planned_entry_zone: input.planned_entry_zone,
    state_hash: input.state_hash,
    setup_id: input.setup_id,
  };
}

export function createPostTradeEntry(input: {
  id: string;
  pre_trade_id: string;
  review_after: string;
  outcome: JournalOutcome;
  what_worked?: string;
  what_failed?: string;
  label_link?: string;
}): TradeJournalEntry {
  return {
    schema_version: JOURNAL_SCHEMA_VERSION,
    pipeline_version: PIPELINE_VERSION,
    id: input.id,
    created_at: new Date().toISOString(),
    phase: "post_trade",
    setup_id: input.pre_trade_id,
    review_after: input.review_after,
    outcome: input.outcome,
    what_worked: input.what_worked,
    what_failed: input.what_failed,
    label_link: input.label_link,
  };
}

export function saveJournalEntry(entry: TradeJournalEntry): string {
  const errors = validateJournalEntry(entry);
  if (errors.length) throw new Error(errors.join("; "));
  if (!fs.existsSync(JOURNAL_DIR)) fs.mkdirSync(JOURNAL_DIR, { recursive: true });
  const filePath = path.join(JOURNAL_DIR, `${entry.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(entry, null, 2));
  return filePath;
}

export function loadJournalEntry(id: string): TradeJournalEntry | null {
  const filePath = path.join(JOURNAL_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as TradeJournalEntry;
}

export function listJournalEntries(): string[] {
  if (!fs.existsSync(JOURNAL_DIR)) return [];
  return fs.readdirSync(JOURNAL_DIR).filter((f) => f.endsWith(".json"));
}

export function pairJournalEntries(): Array<{ pre: TradeJournalEntry; post?: TradeJournalEntry }> {
  const entries = listJournalEntries()
    .map((f) => loadJournalEntry(f.replace(".json", "")))
    .filter(Boolean) as TradeJournalEntry[];
  const pre = entries.filter((e) => e.phase === "pre_trade");
  const post = entries.filter((e) => e.phase === "post_trade");
  return pre.map((p) => ({
    pre: p,
    post: post.find((r) => r.setup_id === p.id),
  }));
}
