/**
 * SoT drift detector — feature-gap lock vs next-single-change / queue.
 * Fails if AUDIT_STATUS / STOP_CONDITION / ONE_FEATURE contradict.
 * EDGE_CLAIM: NONE · no secrets · no VAL/HOLDOUT I/O.
 *
 * Usage: npm run karen:research:sot-check
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const RESEARCH = join(process.cwd(), "data", "research");

const FILES = {
  lock: "karen-wait-quality-feature-gap-lock.md",
  next: "karen-next-single-change-dev-candidate.md",
  queue: "karen-research-queue-one-bottleneck.md",
  stop: "karen-wait-upstream-stop-condition.md",
} as const;

type Findings = { key: string; value: string | null };

function read(name: string): string {
  const p = join(RESEARCH, name);
  if (!existsSync(p)) throw new Error(`missing SoT: ${name}`);
  return readFileSync(p, "utf8");
}

function field(md: string, key: string): string | null {
  const patterns = [
    new RegExp(`\\*\\*${key}\\*\\*\\s*\\|\\s*\\*\\*([^*]+)\\*\\*`, "i"),
    new RegExp(`\\*\\*${key}\\*\\*:?\\s*\\*\\*([^*]+)\\*\\*`, "i"),
    new RegExp(`\\*\\*${key}\\*\\*:?\\s*([^\\n|*]+)`, "i"),
  ];
  for (const re of patterns) {
    const m = md.match(re);
    if (m?.[1]) return m[1].replace(/\s+/g, " ").trim();
  }
  return null;
}

/** Normalize STOP_CONDITION tokens to YES | NO | UNKNOWN */
function normalizeStop(raw: string | null): "YES" | "NO" | "UNKNOWN" {
  if (!raw) return "UNKNOWN";
  const u = raw.toUpperCase();
  if (/\bYES\b/.test(u) || /\bCLOSED\b/.test(u)) return "YES";
  if (/\bNO\b/.test(u) && !/\bYES\b/.test(u)) return "NO";
  return "UNKNOWN";
}

function normalizeAudit(raw: string | null): string {
  if (!raw) return "UNKNOWN";
  const u = raw.toLowerCase();
  if (u.includes("complete")) return "complete";
  if (u.includes("open") || u.includes("in progress") || u.includes("pending"))
    return "incomplete";
  return raw.trim().toLowerCase();
}

function normalizeOneFeature(raw: string | null): string {
  if (!raw) return "UNKNOWN";
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_|_$/g, "");
}

function collect(label: string, md: string): Findings[] {
  return [
    { key: `${label}.AUDIT_STATUS`, value: field(md, "AUDIT_STATUS") },
    { key: `${label}.STOP_CONDITION`, value: field(md, "STOP_CONDITION") },
    { key: `${label}.ONE_FEATURE`, value: field(md, "ONE_FEATURE") },
    { key: `${label}.SELECTIVE_UNLOCK`, value: field(md, "SELECTIVE_UNLOCK") },
    { key: `${label}.C4_SINGLE_CHANGE`, value: field(md, "C4_SINGLE_CHANGE") },
  ];
}

function main(): void {
  const lockMd = read(FILES.lock);
  const nextMd = read(FILES.next);
  const queueMd = read(FILES.queue);
  let stopMd: string | null = null;
  try {
    stopMd = read(FILES.stop);
  } catch {
    stopMd = null;
  }

  const lockAudit = normalizeAudit(field(lockMd, "AUDIT_STATUS"));
  const lockStop = normalizeStop(field(lockMd, "STOP_CONDITION"));
  const lockFeature = normalizeOneFeature(field(lockMd, "ONE_FEATURE"));

  const checks: { name: string; ok: boolean; detail: string }[] = [];

  // Lock itself must be the YES/complete branch
  checks.push({
    name: "lock.AUDIT_STATUS_complete",
    ok: lockAudit === "complete",
    detail: `got ${lockAudit}`,
  });
  checks.push({
    name: "lock.STOP_CONDITION_YES",
    ok: lockStop === "YES",
    detail: `got ${lockStop} (raw=${field(lockMd, "STOP_CONDITION")})`,
  });
  checks.push({
    name: "lock.ONE_FEATURE_contradiction_type",
    ok: lockFeature.includes("contradiction_type") || lockFeature.includes("contradiction"),
    detail: `got ${lockFeature}`,
  });

  for (const [label, md] of [
    ["next", nextMd],
    ["queue", queueMd],
    ...(stopMd ? [["stop", stopMd] as const] : []),
  ] as const) {
    const a = normalizeAudit(field(md, "AUDIT_STATUS"));
    const s = normalizeStop(field(md, "STOP_CONDITION"));
    const f = normalizeOneFeature(field(md, "ONE_FEATURE"));

    if (field(md, "AUDIT_STATUS") != null) {
      checks.push({
        name: `${label}.AUDIT_matches_lock`,
        ok: a === lockAudit,
        detail: `${a} vs lock ${lockAudit}`,
      });
    }
    if (field(md, "STOP_CONDITION") != null) {
      checks.push({
        name: `${label}.STOP_matches_lock`,
        ok: s === lockStop,
        detail: `${s} vs lock ${lockStop}`,
      });
    }
    if (field(md, "ONE_FEATURE") != null) {
      checks.push({
        name: `${label}.ONE_FEATURE_matches_lock`,
        ok: f === lockFeature || f.includes("contradiction"),
        detail: `${f} vs lock ${lockFeature}`,
      });
    }

    // Drift anti-pattern: next says incomplete while lock complete
    if (label === "next" && a === "incomplete" && lockAudit === "complete") {
      checks.push({
        name: "next.AUDIT_not_stale_incomplete",
        ok: false,
        detail: "next AUDIT_STATUS incomplete while feature-gap lock is complete",
      });
    }
  }

  // Selective unlock / c4 sanity across lock + next
  const sel = (field(lockMd, "SELECTIVE_UNLOCK") ?? "").toUpperCase();
  const c4 = (field(lockMd, "C4_SINGLE_CHANGE") ?? "").toUpperCase();
  checks.push({
    name: "lock.SELECTIVE_UNLOCK_PARKED",
    ok: sel.includes("PARKED"),
    detail: sel || "(missing)",
  });
  checks.push({
    name: "lock.C4_NOT_DEFINED",
    ok: c4.includes("NOT_DEFINED"),
    detail: c4 || "(missing)",
  });

  console.log("=== KAREN SoT check ===");
  console.log(`LOCK: ${FILES.lock}`);
  console.log(
    `  AUDIT=${lockAudit} STOP=${lockStop} ONE_FEATURE=${lockFeature}`
  );
  console.log("");

  let failed = 0;
  for (const c of checks) {
    const mark = c.ok ? "PASS" : "FAIL";
    if (!c.ok) failed++;
    console.log(`${mark}  ${c.name}  (${c.detail})`);
  }

  console.log("");
  if (failed > 0) {
    console.log(`SOT_CHECK: FAIL (${failed} checks)`);
    console.log("Fields snapshot:");
    for (const f of [
      ...collect("lock", lockMd),
      ...collect("next", nextMd),
      ...collect("queue", queueMd),
    ]) {
      console.log(`  ${f.key}=${f.value ?? "(null)"}`);
    }
    process.exit(1);
  }
  console.log("SOT_CHECK: PASS");
}

main();
