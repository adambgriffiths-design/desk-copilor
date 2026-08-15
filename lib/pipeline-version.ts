/**
 * Pipeline versioning — attach to every pipeline output for audit/replay reproducibility.
 * Bump when schema or rule semantics change (not every code fix).
 */

export const PIPELINE_VERSION = "1.0.0";
export const SPEC_VERSION = "1.0.0";
export const SCHEMA_VERSION = "1.1.0";
export const JOURNAL_SCHEMA_VERSION = "1.0.0";

export type PipelineMeta = {
  pipeline_version: string;
  spec_version: string;
  schema_version: string;
  generated_at: string;
};

export function buildPipelineMeta(): PipelineMeta {
  return {
    pipeline_version: PIPELINE_VERSION,
    spec_version: SPEC_VERSION,
    schema_version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
  };
}

/** True when stored artifact version differs from current — replay may be stale. */
export function isVersionMismatch(stored: Partial<PipelineMeta>): boolean {
  if (!stored.pipeline_version) return true;
  return (
    stored.pipeline_version !== PIPELINE_VERSION ||
    stored.spec_version !== SPEC_VERSION ||
    stored.schema_version !== SCHEMA_VERSION
  );
}
