/** Probe local Desk Copilot API — run: npm run health */
const ports = [3000, 3001, 3002];

async function probe(base) {
  const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) });
  if (!health.ok) return null;
  return { base, health: true };
}

let lastErr;
for (const port of ports) {
  for (const host of ["127.0.0.1", "localhost"]) {
    const base = `http://${host}:${port}`;
    try {
      const r = await probe(base);
      if (r?.health) {
        console.log(`OK ${base}`);
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
