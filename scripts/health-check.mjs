/** Probe local Desk Copilot API — run: npm run health */
const ports = [3001, 3000, 3002];

async function probe(base) {
  const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) });
  if (!health.ok) return null;
  const levels = await fetch(`${base}/api/levels`, { signal: AbortSignal.timeout(30000) });
  if (!levels.ok) return { base, health: true, levels: false };
  const data = await levels.json();
  return {
    base,
    health: true,
    levels: true,
    zones: data.zones?.length ?? 0,
    symbol: data.symbol,
  };
}

let lastErr;
for (const port of ports) {
  for (const host of ["127.0.0.1", "localhost"]) {
    const base = `http://${host}:${port}`;
    try {
      const r = await probe(base);
      if (r?.health && r.levels) {
        console.log(`OK ${base} — ${r.symbol}, ${r.zones} FVG zone(s)`);
        process.exit(0);
      }
    } catch (e) {
      lastErr = e;
    }
  }
}

console.error("Backend not ready — run: npm run dev");
if (lastErr) console.error(lastErr.message);
process.exit(1);
