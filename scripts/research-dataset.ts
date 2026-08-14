/**
 * Build internal research candle dataset from TickStream historical ticks.
 * Run: npm run research:dataset -- --symbol NQ --start ... --end ...
 *
 * NEVER prints API key.
 */
import { loadTickstreamApiKey } from "../lib/tickstream/quote";
import {
  loadDatasetFromTickstream,
  toBuildReport,
  writeDataset,
  writeFixtureBundle,
} from "../lib/research/dataset";

function parseArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

function usage(): never {
  console.error(
    "Usage: npm run research:dataset -- --symbol NQ --start <ISO|unix> --end <ISO|unix> [--fixture-id <alias>] [--no-write]"
  );
  process.exit(1);
}

async function main() {
  const symbol = parseArg("symbol");
  const start = parseArg("start");
  const end = parseArg("end");
  const fixtureId = parseArg("fixture-id");
  const shouldWrite = !process.argv.includes("--no-write");

  if (!symbol || !start || !end) usage();

  const apiKey = loadTickstreamApiKey();
  if (!apiKey) {
    console.error(JSON.stringify({ error: "TICKSTREAM_API_KEY not configured" }));
    process.exit(1);
  }

  const dataset = await loadDatasetFromTickstream({
    apiKey,
    symbol,
    start,
    end,
  });

  let datasetPath: string | undefined;
  let fixturePath: string | undefined;
  const report = toBuildReport(dataset);

  if (shouldWrite) {
    datasetPath = writeDataset(dataset);
    if (fixtureId) {
      fixturePath = writeFixtureBundle(dataset, fixtureId, report);
    }
  }

  console.log(
    JSON.stringify(
      {
        ...report,
        datasetPath,
        fixturePath,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
