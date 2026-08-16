/**
 * Cloudflare R2 config loader (stubs + env). Never logs secret values.
 * EDGE_CLAIM: NONE — infra only.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { loadKarenEnv } from "../karen-env";
import { resolveRepoRoot, resolveUnderRepo } from "../karen-paths";

export type R2Prefixes = {
  raw: string;
  normalized: string;
  experimentsDev: string;
  experimentsVal: string;
  experimentsHoldoutSealed: string;
  checkpoints: string;
  meta: string;
};

export type R2Config = {
  provider: string;
  bucket: string;
  accountId: string;
  endpoint: string;
  region: string;
  prefixes: R2Prefixes;
};

export type R2CredentialsStatus = {
  configured: boolean;
  missing: string[];
  endpoint: string | null;
  bucket: string | null;
  /** True when account/endpoint/bucket placeholders still present. */
  placeholdersRemain: boolean;
};

const PLACEHOLDER_RE = /YOUR_|changeme|REPLACE/i;

export function loadR2ExampleConfig(repoRoot?: string): R2Config {
  const root = repoRoot ?? resolveRepoRoot();
  const path = join(root, "config", "cloud", "r2.example.json");
  const raw = JSON.parse(readFileSync(path, "utf8")) as R2Config;
  return raw;
}

export function loadR2Config(repoRoot?: string): R2Config {
  loadKarenEnv({ startDir: repoRoot });
  const root = repoRoot ?? resolveRepoRoot();
  const override =
    process.env.KAREN_R2_CONFIG?.trim() ||
    join(root, "config", "cloud", "r2.local.json");
  const path = resolveUnderRepo(override, root);
  const base = loadR2ExampleConfig(root);
  if (!existsSync(path)) return applyEnvOverrides(base);
  const local = JSON.parse(readFileSync(path, "utf8")) as Partial<R2Config>;
  return applyEnvOverrides({
    ...base,
    ...local,
    prefixes: { ...base.prefixes, ...(local.prefixes ?? {}) },
  });
}

function envOrUndefined(raw: string | undefined): string | undefined {
  const v = raw?.trim();
  if (!v || PLACEHOLDER_RE.test(v)) return undefined;
  return v;
}

function applyEnvOverrides(cfg: R2Config): R2Config {
  const accountId = envOrUndefined(process.env.KAREN_R2_ACCOUNT_ID) || cfg.accountId;
  const bucket = envOrUndefined(process.env.KAREN_R2_BUCKET) || cfg.bucket;
  const endpoint =
    envOrUndefined(process.env.KAREN_R2_ENDPOINT) ||
    (accountId && !PLACEHOLDER_RE.test(accountId)
      ? `https://${accountId}.r2.cloudflarestorage.com`
      : cfg.endpoint);
  const region = envOrUndefined(process.env.KAREN_R2_REGION) || cfg.region || "auto";
  return { ...cfg, accountId, bucket, endpoint, region };
}

export function r2CredentialsStatus(cfg?: R2Config): R2CredentialsStatus {
  loadKarenEnv();
  const config = cfg ?? loadR2Config();
  const missing: string[] = [];
  const access = envOrUndefined(process.env.KAREN_R2_ACCESS_KEY_ID);
  const secret = envOrUndefined(process.env.KAREN_R2_SECRET_ACCESS_KEY);
  if (!access) missing.push("KAREN_R2_ACCESS_KEY_ID");
  if (!secret) missing.push("KAREN_R2_SECRET_ACCESS_KEY");
  if (!config.bucket || PLACEHOLDER_RE.test(config.bucket)) {
    missing.push("KAREN_R2_BUCKET");
  }
  if (!config.accountId || PLACEHOLDER_RE.test(config.accountId)) {
    missing.push("KAREN_R2_ACCOUNT_ID");
  }
  if (!config.endpoint || PLACEHOLDER_RE.test(config.endpoint)) {
    missing.push("KAREN_R2_ENDPOINT");
  }
  const placeholdersRemain =
    PLACEHOLDER_RE.test(config.accountId) ||
    PLACEHOLDER_RE.test(config.endpoint) ||
    PLACEHOLDER_RE.test(config.bucket);
  return {
    configured: missing.length === 0 && !placeholdersRemain,
    missing,
    endpoint: placeholdersRemain ? null : config.endpoint,
    bucket: placeholdersRemain ? null : config.bucket,
    placeholdersRemain,
  };
}

export function adamR2Checklist(): string[] {
  return [
    "Cloudflare dashboard → R2 → Create bucket `karen-nq-history` (private)",
    "R2 → Manage R2 API Tokens → Create token with Object Read & Write on that bucket",
    "Copy Account ID + Access Key ID + Secret Access Key into 1Password/Doppler or gitignored env",
    "Set KAREN_R2_ACCOUNT_ID, KAREN_R2_BUCKET, KAREN_R2_ENDPOINT, KAREN_R2_ACCESS_KEY_ID, KAREN_R2_SECRET_ACCESS_KEY",
    "Optional: copy config/cloud/r2.example.json → r2.local.json and fill accountId/endpoint (gitignored)",
    "Install AWS CLI v2 OR rclone; configure S3-compatible endpoint (see config/cloud/rclone.conf.example)",
    "Never commit secrets; never put keys in R2 object bodies or DV reports",
  ];
}
