import json
from pathlib import Path

OUT = Path("data/research/ict-knowledge/sources/_batch4-or-signal.md")
lines = []

for vid in ["ORbtHOUzAIM", "CGbSpa_9Z9Y", "Z0VYZoaTIKE"]:
    d = json.loads(
        Path(f"data/research/ict-knowledge/sources/_extract-{vid}-or-deep.json").read_text(
            encoding="utf-8"
        )
    )
    lines.append(f"\n======== {vid} ========\n")
    for h in d["hits"]:
        s = h["snippet"].lower()
        if not any(k in s for k in ["opening range", "midnight", "bond", "treasur"]):
            continue
        score = 0
        for k in [
            "opening range",
            "one hour",
            "30 minute",
            "midnight",
            "between",
            "ends at",
            "begins",
            "defined",
            "volume",
            "high or low",
            "true day",
            "8 20",
            "8:20",
        ]:
            if k in s:
                score += 1
        if score >= 2 or "midnight" in s:
            lines.append(f"--- {h['start']} ({h['sec']}s) score={score} ---\n")
            lines.append(h["snippet"][:480] + "\n\n")

OUT.write_text("".join(lines), encoding="utf-8")
print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
