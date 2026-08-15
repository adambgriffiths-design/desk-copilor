"""Batch 4 — extract precise cue spans for OR clock citations (zero downloads)."""
import json
import re
from pathlib import Path

ROOT = Path("data/research/ict-knowledge")


def parse_vtt(path: Path):
    text = path.read_text(encoding="utf-8", errors="replace")
    cues = []
    for b in re.split(r"\n\n+", text):
        ts = None
        body = []
        for l in b.splitlines():
            l = l.strip()
            m = re.match(
                r"(\d{2}:\d{2}:\d{2}\.\d+)\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d+)", l
            )
            if m:
                ts = (m.group(1), m.group(2))
            elif l and not l.startswith("WEBVTT") and not l.isdigit() and "-->" not in l:
                body.append(re.sub(r"<[^>]+>", "", l))
        if ts and body:
            cues.append({"start": ts[0], "end": ts[1], "text": " ".join(body)})
    return cues


def to_sec(t: str) -> float:
    h, m, s = t.split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)


def window(cues, start_sec, end_sec):
    parts = []
    first = last = None
    for c in cues:
        s = to_sec(c["start"])
        if s < start_sec - 0.5:
            continue
        if s > end_sec + 0.5:
            break
        if first is None:
            first = c
        last = c
        parts.append(c["text"])
    return {
        "cue_start": first["start"] if first else None,
        "cue_end": last["end"] if last else None,
        "timestamp_sec": to_sec(first["start"]) if first else None,
        "text": " ".join(parts),
    }


targets = {
    "ORbtHOUzAIM": [
        ("vol_930_1000", 154, 185),
        ("or_1h_930_1030", 187, 230),
        ("or_hod_lod", 202, 235),
        ("central_time_note", 222, 245),
    ],
    "CGbSpa_9Z9Y": [
        ("true_day_820_1500", 70, 100),
        ("vol_800_930", 200, 220),
        ("or_1h_800_900", 212, 250),
        ("or_hod_lod", 226, 260),
    ],
    "Z0VYZoaTIKE": [
        ("topic_midnight_or", 10, 35),
        ("ny_or_30m_only", 585, 640),
        ("midnight_same_algo", 615, 640),
        ("three_refs", 1035, 1160),
        ("midnight_30m_1230", 1515, 1550),
        ("fpfvg_inside", 1705, 1760),
        ("ce_of_midnight", 2755, 2790),
        ("frame_midnight_1230", 2910, 2970),
    ],
}

out = {}
for vid, spans in targets.items():
    cues = parse_vtt(Path(f"data/ict-transcripts/raw/{vid}.en.vtt"))
    out[vid] = {name: window(cues, a, b) for name, a, b in spans}

path = ROOT / "sources/_batch4-or-precise-windows.json"
path.write_text(json.dumps(out, indent=2), encoding="utf-8")
print(f"wrote {path}")
for vid, items in out.items():
    print(f"\n## {vid}")
    for k, v in items.items():
        print(f"\n### {k} [{v['cue_start']} -> {v['cue_end']}]")
        print(v["text"][:600])
