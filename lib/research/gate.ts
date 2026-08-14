/**
 * Dev-only gate for internal research HTTP routes.
 * Production deployments must NOT expose ungated research APIs.
 */
export function isResearchApiEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.RESEARCH_API_ENABLED === "1" ||
    process.env.RESEARCH_DEV_API === "1"
  );
}

export function researchApiForbiddenResponse(): Response {
  return new Response(
    JSON.stringify({ error: "Research API disabled — use CLI (npm run research:backtest)" }),
    { status: 403, headers: { "Content-Type": "application/json" } }
  );
}
