"""Verify the public synthetic investigation page matches a fresh replay."""
import json
import itertools
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILL = ROOT / "skills/investigate-game-incident"
with tempfile.TemporaryDirectory() as temporary:
    out = Path(temporary) / "demo"
    subprocess.run(["python3", str(SKILL / "scripts/investigate.py"), str(SKILL / "assets/engine-demo/config.json"),
                    "--planner", "replay", "--out", str(out)], check=True)
    assert json.loads((out / "incident.json").read_text())["meta"]["synthetic"] is True
    for generated, checked in [("report.html", "docs/investigation.html"),
                               ("report.md", "docs/investigation.md"),
                               ("report.html", "examples/investigation.html"),
                               ("report.md", "examples/investigation.md"),
                               ("incident.json", "examples/investigation.json"),
                               ("state.json", "examples/investigation-state.json")]:
        actual = (out / generated).read_bytes()
        expected = (ROOT / checked).read_bytes()
        if actual != expected:
            offset = next((i for i, (a, b) in enumerate(itertools.zip_longest(actual, expected)) if a != b), 0)
            print("Drift:", checked, "offset:", offset, "lengths:", len(actual), len(expected))
            print("Actual:", repr(actual[max(0, offset - 80):offset + 350]))
            print("Expected:", repr(expected[max(0, offset - 80):offset + 350]))
        assert actual == expected, "Generated drift: " + checked
    expected = {p.name for p in (out / "evidence").glob("*.json")}
    assert expected == {p.name for p in (ROOT / "docs/evidence").glob("*.json")}, "Evidence file set differs"
    for name in expected:
        assert (out / "evidence" / name).read_bytes() == (ROOT / "docs/evidence" / name).read_bytes(), "Evidence drift: " + name
print("PASS: deterministic replay, public report and masked evidence.")
