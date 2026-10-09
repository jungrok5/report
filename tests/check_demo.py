"""Verify the public synthetic investigation page matches a fresh replay."""
import json
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
        assert (out / generated).read_bytes() == (ROOT / checked).read_bytes(), "Generated drift: " + checked
    expected = {p.name for p in (out / "evidence").glob("*.json")}
    assert expected == {p.name for p in (ROOT / "docs/evidence").glob("*.json")}, "Evidence file set differs"
    for name in expected:
        assert (out / "evidence" / name).read_bytes() == (ROOT / "docs/evidence" / name).read_bytes(), "Evidence drift: " + name
print("PASS: deterministic replay, public report and masked evidence.")
