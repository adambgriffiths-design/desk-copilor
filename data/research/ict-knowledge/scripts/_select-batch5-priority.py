#!/usr/bin/env python3
"""Select Batch 5 priority official ICT titles — dealing range / FVG / liquidity."""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path("data/research/ict-knowledge")
inv = json.loads((ROOT / "sources/inventory.json").read_text(encoding="utf8"))
rows = inv["videos"]

known = {
    "6DuByzKLDsc",
    "2K1IcVvq9z8",
    "uwFJ0t7SAOU",
    "eft9_3ekDCY",
    "-DMKLrUJvfg",
    "Zm9Q0NDRxoY",
    "s-iqN0h2Fgg",
    "pM8oWrcIJqU",
    "uIvlS330qrA",
    "Sf_uYZBWTrA",
    "V5crdCw0AsY",
    "UPKUqW_eaas",
    "tbEzAhdv_Ak",
    "ORbtHOUzAIM",
    "CGbSpa_9Z9Y",
    "Z0VYZoaTIKE",
    "ib9sa6ldwA4",
}
done = set(known)
for r in rows:
    if r.get("transcript_status") in ("AVAILABLE", "CAPTION_MISSING", "PARTIAL"):
        done.add(r["video_id"])


def classify(title: str) -> list[str]:
    t = (title or "").lower()
    tags: list[str] = []
    if re.search(r"dealing\s*range", t):
        tags.append("dealing_range")
    if re.search(r"first\s*presented|fpfvg|first presented fair", t):
        tags.append("fpfvg")
    if re.search(r"inverted\s*fair|ifvg|inversion\s*(of\s*)?(fair\s*)?value", t):
        tags.append("ifvg")
    if re.search(r"fair\s*value\s*gap|\bfvg\b", t) and "fpfvg" not in tags:
        tags.append("fvg")
    if re.search(r"\b(buy\s*side|sell\s*side|bsl|ssl)\b", t):
        tags.append("liquidity_sides")
    if re.search(
        r"liquidity\s*(pool|raid|sweep|run|grab)|sweep(ing)?\s*(liquidity|high|low)|stop\s*(hunt|run)",
        t,
    ):
        tags.append("liquidity_sweep")
    if re.search(r"\bliquidity\b", t) and not any(
        x.startswith("liquidity") for x in tags
    ):
        tags.append("liquidity")
    if re.search(
        r"topical\s*study.*(liquidity|buyside|sellside|fair value|fvg|dealing)", t
    ):
        tags.append("topical")
    return tags


def score(r: dict, tags: list[str]) -> int:
    s = 0
    t = (r.get("title") or "").lower()
    weights = {
        "dealing_range": 90,
        "fpfvg": 95,
        "ifvg": 88,
        "fvg": 70,
        "liquidity_sides": 85,
        "liquidity_sweep": 82,
        "liquidity": 60,
        "topical": 50,
    }
    for tag in tags:
        s += weights.get(tag, 40)
    if re.search(
        r"explained|model|lecture|core content|mentorship|gems|topical study", t
    ):
        s += 15
    if "streams" in (r.get("channel_tabs") or []):
        s += 5
    dur = r.get("duration_sec") or 0
    if 600 <= dur <= 10800:
        s += 10
    if re.search(r"bitcoin|twitter|euro\b|cable|gbp|aud", t):
        s -= 10
    if re.search(r"live execution|tape reading", t):
        s -= 5
    if dur and dur < 180:
        s -= 20
    return s


cands = []
for r in rows:
    if r["video_id"] in done:
        continue
    if r.get("transcript_status") == "AVAILABLE":
        continue
    tags = classify(r["title"])
    if not tags:
        continue
    cands.append(
        {
            "video_id": r["video_id"],
            "title": r["title"],
            "url": r["url"],
            "duration_sec": r["duration_sec"],
            "channel_tabs": r["channel_tabs"],
            "transcript_status": r["transcript_status"],
            "tags": tags,
            "score": score(r, tags),
        }
    )

cands.sort(key=lambda x: -x["score"])
batch: list[dict] = []
seen: set[str] = set()


def take(pred, n: int) -> None:
    got = 0
    for e in cands:
        if got >= n or len(batch) >= 14:
            break
        if e["video_id"] in seen:
            continue
        if not pred(e):
            continue
        seen.add(e["video_id"])
        batch.append(e)
        got += 1


take(lambda e: "dealing_range" in e["tags"], 3)
take(lambda e: "fpfvg" in e["tags"] or "ifvg" in e["tags"], 4)
take(lambda e: "fvg" in e["tags"], 3)
take(lambda e: any(t.startswith("liquidity") for t in e["tags"]), 5)
for e in cands:
    if len(batch) >= 12:
        break
    if e["video_id"] in seen:
        continue
    seen.add(e["video_id"])
    batch.append(e)

bc = Counter()
for e in cands:
    for t in e["tags"]:
        bc[t] += 1

out = {
    "selected_at": "2026-08-15",
    "batch_name": "batch5_dr_fvg_liquidity",
    "total_keyword_hits": len(cands),
    "bucket_counts": dict(bc),
    "batch_size": len(batch),
    "batch": batch,
    "all_hits_top40": cands[:40],
}
dest = ROOT / "sources/_priority-batch5.json"
dest.write_text(json.dumps(out, indent=2), encoding="utf8")

print(f"CANDIDATES {len(cands)}")
print(f"BUCKETS {dict(bc)}")
print("---TOP 30---")
for e in cands[:30]:
    tags = ",".join(e["tags"])
    title = e["title"][:90]
    print(f"{e['score']:3d} {e['video_id']} [{tags}] {title} ({e.get('duration_sec')})")
print("---BATCH---")
for e in batch:
    tags = ",".join(e["tags"])
    title = e["title"][:90]
    print(f"{e['score']:3d} {e['video_id']} [{tags}] {title} ({e.get('duration_sec')})")
print(f"Wrote {dest}")
