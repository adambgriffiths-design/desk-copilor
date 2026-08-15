/**
 * Structure snapshot answer regressions — IFVG / FHDR / CISD / PD array / NDOG routing surface.
 * Run: npm run test:structure-snapshot
 */
import { buildMarketSnapshotAnswer } from "../lib/market-snapshot";
import { buildStructureFacts } from "../lib/structure";
import { baseCtx } from "../lib/replay-fixtures";
import type { Bar } from "../lib/types";
import { classifyDeskRoute } from "../lib/desk-route-intent";
import { classifyAnalysisDepth } from "../lib/analysis-depth";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

let passed = 0;
function check(name: string, cond: boolean) {
  if (!cond) throw new Error(name);
  passed++;
  console.log(`  ✓ ${name}`);
}

// --- IFVG from m1InvertedFvgs ---
{
  const ctx = baseCtx({
    structureFacts: {
      ...baseCtx().structureFacts,
      m1InvertedFvgs: [
        {
          timeframe: "1m",
          type: "bullish",
          top: 25100,
          bottom: 25090,
          formedAt: "10:12",
          startTime: 1_700_000_000,
          inverted: true,
        },
      ],
      fhdr: null,
    },
  });
  const snap = buildMarketSnapshotAnswer(ctx, "structure", "Where is the IFVG?");
  check("IFVG answers from inverted FVG", /inverse fair value gap|IFVG/i.test(snap.spoken));
  check("IFVG includes prices", /25090/.test(snap.spoken) && /25100/.test(snap.spoken));
}

// --- PD array ---
{
  const ctx = baseCtx();
  const snap = buildMarketSnapshotAnswer(ctx, "structure", "Where is the PD array?");
  check("PD array lists levels", /PD array levels:/i.test(snap.spoken));
  check("PD array includes PDH/PDL/PDC labels", /previous day/i.test(snap.spoken));
}

// --- CISD honest miss ---
{
  const snap = buildMarketSnapshotAnswer(baseCtx(), "structure", "Where is CISD?");
  check("CISD honest miss", /not computed|CISD/i.test(snap.spoken));
  check("CISD not empty casual", snap.spoken.length > 20);
}

// --- FHDR from structureFacts (bars in 9:30–10:30 ET) ---
{
  // 2026-08-12 NY morning: 13:30Z = 09:30 ET (EDT)
  const asOf = new Date("2026-08-12T15:00:00.000Z"); // 11:00 ET — FHDR locked
  const bars: Bar[] = [];
  for (let i = 0; i < 60; i++) {
    const t = new Date(Date.UTC(2026, 7, 12, 13, 30 + i, 0)); // 09:30–10:29 ET
    const p = 29900 + i * 0.25;
    bars.push({ time: t, open: p, high: p + 2, low: p - 1, close: p + 0.5 });
  }
  // bump extremes so FHDR high/low are distinctive
  bars[10]!.high = 29980;
  bars[20]!.low = 29850;
  const facts = buildStructureFacts(bars, [], asOf, "ny_am");
  check("FHDR computed from 9:30–10:30 bars", facts.fhdr != null);
  check("FHDR locked after 10:30", facts.fhdr!.locked === true);
  check("FHDR high captured", facts.fhdr!.high >= 29980);
  check("FHDR low captured", facts.fhdr!.low <= 29850);

  const ctx = baseCtx({ structureFacts: { ...baseCtx().structureFacts, ...facts } });
  const snap = buildMarketSnapshotAnswer(ctx, "structure", "Where is the FHDR?");
  check("FHDR snapshot answers range", /First hour dealing range/i.test(snap.spoken));
  check("FHDR snapshot includes prices", /29980|29850/.test(snap.spoken));
}

// --- Routing still snapshot FAST_FACT ---
{
  for (const phrase of [
    "Where is the IFVG?",
    "Where is the FHDR?",
    "Where is CISD?",
    "Where is the PD array?",
    "Where is the last NDOG?",
    "Where is the OTE?",
    "Where is the BPR?",
    "Where is the SMT divergence?",
    "Where is the AMD phase?",
    "Where is the equilibrium?",
    "Where is the weekly open?",
    "Where is the kill zone?",
    "Where is the asian range?",
    "Where is the midnight open?",
    "Where is the imbalance?",
    "Where is premium?",
    "Where is the opening range?",
    "Where is the gap fill?",
    "Where is the unfilled gap?",
    "Where is the range high?",
    "Where is the previous week high?",
    "Where is turtle soup?",
    "Where is the daily high?",
    "Where is the current day high?",
    "Where is the NY open?",
    "Where is the macro window?",
    "Where is the inversion?",
    "Where is PDC?",
    "Where is the efficiency?",
    "Where is the fair value?",
    "Where is the swing high?",
    "Where is DOL?",
    "Where is the inducement?",
    "Where is the stop run?",
    "Where is the mean threshold?",
    "Where is the Fibonacci?",
    "Where is POC?",
    "Where is value area high?",
    "Where is the old high?",
  ]) {
    const route = classifyDeskRoute({ text: phrase });
    const depth = classifyAnalysisDepth({ text: phrase });
    check(`${phrase} → snapshot`, route.route === "snapshot");
    check(`${phrase} → FAST_FACT`, depth === "FAST_FACT");
  }
}

// --- OTE / BPR / SMT honest miss copy ---
{
  const ote = buildMarketSnapshotAnswer(baseCtx(), "structure", "Where is the OTE?");
  check("OTE honest miss", /Optimal trade entry|OTE/i.test(ote.spoken));
  const bpr = buildMarketSnapshotAnswer(baseCtx(), "structure", "Where is the BPR?");
  check("BPR honest miss", /Breaker|BPR/i.test(bpr.spoken));
  const smt = buildMarketSnapshotAnswer(baseCtx(), "structure", "Where is the SMT divergence?");
  check("SMT honest miss", /SMT/i.test(smt.spoken));
}

// --- AMD / equilibrium / weekly open / kill zone answers ---
{
  const amd = buildMarketSnapshotAnswer(baseCtx(), "structure", "Where is the AMD phase?");
  check("AMD phase answer", /phase hint|accumulation manipulation distribution/i.test(amd.spoken));
  const eq = buildMarketSnapshotAnswer(baseCtx(), "level", "Where is the equilibrium?");
  check("equilibrium answer", /equilibrium/i.test(eq.spoken));
  const weekly = buildMarketSnapshotAnswer(baseCtx(), "level", "Where is the weekly open?");
  check("weekly open answer", /weekly open|new week opening gap/i.test(weekly.spoken));
  const kz = buildMarketSnapshotAnswer(baseCtx(), "structure", "Where is the kill zone?");
  check("kill zone answer", /kill zone/i.test(kz.spoken));
}


// --- asian range / midnight / imbalance / premium / OR / gap-fill ---
{
  const asia = buildMarketSnapshotAnswer(baseCtx(), "level", "Where is the asian range?");
  check("asian range answer", /Asia range high|Asia range low/i.test(asia.spoken));
  const mid = buildMarketSnapshotAnswer(baseCtx(), "structure", "Where is the midnight open?");
  check("midnight open honest miss", /Midnight open|true day open/i.test(mid.spoken));
  const imb = buildMarketSnapshotAnswer(baseCtx(), "structure", "Where is the imbalance?");
  check("imbalance honest miss", /[Ii]mbalance/i.test(imb.spoken));
  const prem = buildMarketSnapshotAnswer(baseCtx(), "structure", "Where is premium?");
  check("premium answer", /premium|discount|current day/i.test(prem.spoken));
  const orng = buildMarketSnapshotAnswer(baseCtx(), "structure", "Where is the opening range?");
  check("opening range honest miss", /Opening range/i.test(orng.spoken));
  const gap = buildMarketSnapshotAnswer(baseCtx(), "structure", "Where is the gap fill?");
  check("gap fill honest miss", /Gap-fill|fair value gap/i.test(gap.spoken));
}


// --- wave3: unfilled gap / range high / week high / turtle soup ---
{
  const ug = buildMarketSnapshotAnswer(baseCtx(), "structure", "Where is the unfilled gap?");
  check("unfilled gap answer", /unfilled|fair value gap/i.test(ug.spoken));
  const rh = buildMarketSnapshotAnswer(baseCtx(), "level", "Where is the range high?");
  check("range high answer", /range high/i.test(rh.spoken));
  const wh = buildMarketSnapshotAnswer(baseCtx(), "level", "Where is the previous week high?");
  check("week high honest miss", /Previous week|weekly high/i.test(wh.spoken));
  const ts = buildMarketSnapshotAnswer(baseCtx(), "structure", "Where is turtle soup?");
  check("turtle soup honest miss", /Turtle soup/i.test(ts.spoken));
}


// --- wave4: daily high / NY open / macro / inversion / PDC ---
{
  const dh = buildMarketSnapshotAnswer(baseCtx(), "level", "Where is the daily high?");
  check("daily high answer", /Current day high/i.test(dh.spoken));
  const cdh = buildMarketSnapshotAnswer(baseCtx(), "level", "Where is the current day high?");
  check("current day high answer", /Current day high/i.test(cdh.spoken));
  const ny = buildMarketSnapshotAnswer(baseCtx(), "level", "Where is the NY open?");
  check("NY open honest miss", /New York|session open|opening range/i.test(ny.spoken));
  const mac = buildMarketSnapshotAnswer(baseCtx(), "structure", "Where is the macro window?");
  check("macro window answer", /session|Macro/i.test(mac.spoken));
  const inv = buildMarketSnapshotAnswer(baseCtx(), "structure", "Where is the inversion?");
  check("inversion answer", /inversion|IFVG|fair value gap/i.test(inv.spoken));
  const pdc = buildMarketSnapshotAnswer(baseCtx(), "level", "Where is PDC?");
  check("PDC answer", /Previous day close|previous day close/i.test(pdc.spoken));
}


// --- wave5: efficiency / fair value / swing / DOL / inducement / stop-run / old high ---
{
  const eff = buildMarketSnapshotAnswer(baseCtx(), "structure", "Where is the efficiency?");
  check("efficiency answer", /inefficiency|fair value gap|efficiency/i.test(eff.spoken));
  const fv = buildMarketSnapshotAnswer(baseCtx(), "structure", "Where is the fair value?");
  check("fair value answer", /fair value|inefficiency/i.test(fv.spoken));
  const sh = buildMarketSnapshotAnswer(baseCtx(), "level", "Where is the swing high?");
  check("swing high answer", /swing|old high|Current day high/i.test(sh.spoken));
  const dol = buildMarketSnapshotAnswer(baseCtx(), "structure", "Where is DOL?");
  check("DOL answer", /Draw on liquidity|DOL/i.test(dol.spoken));
  const ind = buildMarketSnapshotAnswer(baseCtx(), "structure", "Where is the inducement?");
  check("inducement honest miss", /Inducement/i.test(ind.spoken));
  const sr = buildMarketSnapshotAnswer(baseCtx(), "structure", "Where is the stop run?");
  check("stop run honest miss", /Stop-run|liquidity/i.test(sr.spoken));
  const oh = buildMarketSnapshotAnswer(baseCtx(), "level", "Where is the old high?");
  check("old high answer", /old high|Current day high/i.test(oh.spoken));
}


// --- wave6: mean threshold / fib / POC / VAH ---
{
  const mt = buildMarketSnapshotAnswer(baseCtx(), "structure", "Where is the mean threshold?");
  check("mean threshold answer", /Mean threshold|consequent encroachment|equilibrium/i.test(mt.spoken));
  const fib = buildMarketSnapshotAnswer(baseCtx(), "structure", "Where is the Fibonacci?");
  check("fibonacci honest miss", /Fibonacci|OTE/i.test(fib.spoken));
  const poc = buildMarketSnapshotAnswer(baseCtx(), "level", "Where is POC?");
  check("POC honest miss", /POC|Value area|volume profile/i.test(poc.spoken));
  const vah = buildMarketSnapshotAnswer(baseCtx(), "level", "Where is value area high?");
  check("VAH honest miss", /Value area|POC|volume profile/i.test(vah.spoken));
}

console.log(`\ntest-structure-snapshot: ok (${passed} checks)`);
