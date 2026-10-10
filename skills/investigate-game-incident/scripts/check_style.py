#!/usr/bin/env python3
"""Check report prose and UI with pinned ai-design rules; never rewrite evidence."""
import argparse
import importlib.util
import json
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('incident_ai_design', ROOT/'vendor/ai-design/plugins/ai-design/style/style_check.py')
style = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = style
spec.loader.exec_module(style)
FIELDS = {
    'meta': ('title', 'scope'),
    'summary': ('text', 'impact', 'recovery', 'limitations'),
    'metrics': ('label', 'description'),
    'events': ('label', 'detail'),
    'nodes': ('label', 'statement', 'rationale', 'limitations'),
    'edges': ('label', 'mechanism', 'limitations'),
    'investigation': ('question', 'hypothesis', 'prediction', 'observed', 'decision', 'next_test'),
    'actions': ('action', 'verification'),
    'unknowns': ('question', 'next_test'),
    'evidence': ('title', 'limitations'),
}

def report_prose(data):
    lines = []
    for group, keys in FIELDS.items():
        items = data.get(group, [])
        if isinstance(items, dict):
            items = [items]
        for i, item in enumerate(items):
            for key in keys:
                if isinstance(item.get(key), str):
                    lines.extend([f'## {group}[{i}].{key}', item[key], ''])
    return '\n'.join(lines)

def check_report(data, label='incident.json'):
    if style.tomllib is None:
        raise RuntimeError('ai-design style checks require Python 3.11+')
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp)/'report-prose.md'
        path.write_text(report_prose(data), encoding='utf-8')
        findings = style.check_file(path, style.load_rules())
        for finding in findings:
            finding['file'] = str(label)+' (report prose)'
        return findings

def require_report_style(data, label='incident.json'):
    findings = check_report(data, label)
    errors = [f for f in findings if f['severity'] == 'error']
    if errors:
        raise ValueError('ai-design style errors:\n'+'\n'.join(style.fmt(f) for f in errors))
    return findings

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('files', nargs='+')
    args = parser.parse_args()
    if style.tomllib is None:
        parser.error('Python 3.11+ is required')
    findings = []
    rules = style.load_rules()
    for name in args.files:
        path = Path(name)
        if not path.is_file():
            parser.error(f'file not found: {name}')
        if path.suffix == '.json':
            findings.extend(check_report(json.loads(path.read_text(encoding='utf-8')), name))
        else:
            findings.extend(style.check_file(path, rules))
    for finding in findings:
        print(style.fmt(finding))
    errors = sum(f['severity'] == 'error' for f in findings)
    print(f'ai-design: {errors} errors, {len(findings)-errors} warnings; {len(args.files)} files')
    return bool(errors)

if __name__ == '__main__':
    sys.exit(main())
