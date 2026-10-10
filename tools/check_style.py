"""Check authored content. Source evidence and token definitions are excluded."""
import subprocess
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
SKILL = ROOT/'skills/investigate-game-incident'
paths = [ROOT/'README.md', SKILL/'assets/report-template.html', SKILL/'assets/example-restart.json']
paths += sorted((ROOT/'web/src').glob('*.jsx'))
paths += [ROOT/'web/src/style.css', ROOT/'docs/report.md']
paths += sorted((ROOT/'docs/cases').glob('*/incident.json'))
raise SystemExit(subprocess.call([sys.executable, str(SKILL/'scripts/check_style.py'), *map(str, paths)], cwd=ROOT))
