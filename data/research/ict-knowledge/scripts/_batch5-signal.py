#!/usr/bin/env python3
"""Print key Batch5 citation snippets for catalogue drafting."""
from __future__ import annotations

import json
from pathlib import Path

IDS = [
    "FgacYSN9QEo",
    "uC4-1SYXJFg",
    "POUT0pVs4U0",
    "qC0LogyIk2I",
    "YuefjnUKQdM",
    "22XkhpJR5eA",
    "Gnw54f9v6SA",
    "vqtA1S9JH34",
    "HTQgH11W37o",
    "O69iFqP1j7o",
    "tbEzAhdv_Ak",
]
WANT = {
    "FgacYSN9QEo": ["fair value gap", "liquidity void", "fill"],
    "uC4-1SYXJFg": [
        "first presented",
        "9:30",
        "9:31",
        "one minute",
        "opening range",
    ],
    "POUT0pVs4U0": ["first presented", "fair value gap", "liquidity"],
    "qC0LogyIk2I": ["equilibrium", "discount", "fib", "fifty"],
    "YuefjnUKQdM": ["equilibrium", "premium", "fifty", "fib"],
    "22XkhpJR5eA": ["liquidity run", "buy side", "sell side", "equal low"],
    "Gnw54f9v6SA": ["liquidity pool", "equal high", "relative equal", "old high"],
    "vqtA1S9JH34": ["open float", "liquidity pool", "sell side"],
    "HTQgH11W37o": ["liquidity void", "imbalance", "gap", "fill"],
    "O69iFqP1j7o": ["low resistance", "liquidity run", "liquidity"],
    "tbEzAhdv_Ak": [
        "fair value gap",
        "opening range gap",
        "consequent encroachment",
        "buy side",
    ],
}

out_lines = []
for vid in IDS:
    p = Path(f"data/research/ict-knowledge/sources/_extract-{vid}.json")
    d = json.loads(p.read_text(encoding="utf8"))
    out_lines.append("=" * 80)
    out_lines.append(f"{vid} cues {d['cues']}")
    for pat in WANT[vid]:
        hits = d["searches"].get(pat, [])
        out_lines.append(f"--- {pat} ({len(hits)}) ---")
        for h in hits[:5]:
            sn = h["snippet"].replace("\n", " ")[:500]
            out_lines.append(f"  [{h['t']}] {sn}")
            out_lines.append("")

text = "\n".join(out_lines)
Path("data/research/ict-knowledge/sources/_batch5-signal.md").write_text(
    text, encoding="utf8"
)
print(text[:12000])
print("\n... wrote sources/_batch5-signal.md total chars", len(text))
