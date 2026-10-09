"""Require deterministic synthetic fixtures and exact archived bytes."""
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory() as temp:
    out = Path(temp) / 'cases'
    subprocess.run(['python3', str(ROOT / 'tools/build_cases.py'), str(out)], check=True)
    expected = ROOT / 'docs/cases'
    names = lambda folder: {p.relative_to(folder) for p in folder.rglob('*') if p.is_file()}
    assert names(out) == names(expected), 'case archive set differs'
    for name in names(out):
        assert (out/name).read_bytes() == (expected/name).read_bytes(), 'case drift: '+str(name)
    for entry in json.loads((out/'catalog.json').read_text()):
        report = json.loads((out/entry['path']).read_text())
        assert report['meta']['synthetic'] is True
        g = report['governance']
        assert hashlib.sha256(g['content_canonical'].encode()).hexdigest() == g['content_sha256']
        for e in report['evidence']:
            assert hashlib.sha256((out/entry['slug']/'evidence'/f'{e["id"]}.json').read_bytes()).hexdigest() == e['sha256']
print('PASS: three synthetic cases, fixed version bytes and archived evidence.')
