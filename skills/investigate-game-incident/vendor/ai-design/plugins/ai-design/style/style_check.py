#!/usr/bin/env python3
"""ai-design style check: flags the AI tone in prose and the AI look in UI code. Deterministic, stdlib only.

  style_check.py FILE...            report findings (exit 1 if any `error`, 0 otherwise)
  style_check.py --hook             PostToolUse hook mode: read the hook JSON on stdin, check the edited file,
                                    and hand findings back to the agent as context (never blocks the edit)
  style_check.py --list-rules       print the rule table

Rules live next to this file in rules.toml. A repository can add or override rules in `.style/rules.toml`
(same format; a rule with an existing id replaces it, `severity = "off"` disables it).

Prose rules run on human-readable text only: Markdown outside code, HTML text outside <script>/<style>/<pre>/<code>.
Markup rules run on raw HTML/CSS/JSX/TSX/Vue/Svelte source.
Skip a line with `style-ignore` anywhere on it (e.g. `<!-- style-ignore -->`), or a block between
`style-ignore-start` and `style-ignore-end` — for quoting bad examples on purpose.
"""
from __future__ import annotations

import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:  # Python < 3.11
    tomllib = None

HERE = Path(__file__).resolve().parent
PROSE_EXT = {".md", ".mdx", ".markdown", ".txt", ".html", ".htm"}
MARKUP_EXT = {".html", ".htm", ".css", ".scss", ".jsx", ".tsx", ".vue", ".svelte", ".astro"}
HANGUL = re.compile(r"[가-힣]")


@dataclass
class Rule:
    id: str
    kind: str          # prose | markup
    lang: str          # ko | en | any
    severity: str      # error | warning | off
    pattern: re.Pattern
    message: str
    suggest: str = ""
    max_per_file: int = 0  # >0: only report when the pattern occurs more than this many times in the file


def load_rules() -> list[Rule]:
    if tomllib is None:
        print("style_check: Python 3.11+ is needed to read rules.toml", file=sys.stderr)
        return []
    raw: dict[str, dict] = {}
    sources = [HERE / "rules.toml"]
    root = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    sources.append(Path(root) / ".style" / "rules.toml")
    for src in sources:
        if src.is_file():
            for r in tomllib.loads(src.read_text(encoding="utf-8")).get("rule", []):
                raw[r["id"]] = {**raw.get(r["id"], {}), **r}
    rules = []
    for r in raw.values():
        if r.get("severity", "warning") == "off":
            continue
        flags = re.IGNORECASE if r.get("ignore_case", r.get("lang") == "en") else 0
        rules.append(Rule(id=r["id"], kind=r.get("kind", "prose"), lang=r.get("lang", "any"),
                          severity=r.get("severity", "warning"), pattern=re.compile(r["pattern"], flags),
                          message=r["message"], suggest=r.get("suggest", ""), max_per_file=int(r.get("max_per_file", 0))))
    return rules


def _blank(m: re.Match) -> str:
    """Replace a match with spaces/newlines so line and column numbers stay put."""
    return re.sub(r"[^\n]", " ", m.group(0))


def prose_of(path: Path, text: str) -> str:
    ext = path.suffix.lower()
    if ext in (".html", ".htm"):
        text = re.sub(r"<(script|style|pre|code)\b.*?</\1>", _blank, text, flags=re.S | re.I)
        text = re.sub(r"<!--.*?-->", _blank, text, flags=re.S)
        text = re.sub(r"<[^>]+>", _blank, text)
        text = re.sub(r"&[a-z]+;|&#\d+;", _blank, text)
        return text
    text = re.sub(r"\A---\n.*?\n---\n", _blank, text, flags=re.S)           # front matter
    text = re.sub(r"^(```|~~~).*?^\1[^\n]*$", _blank, text, flags=re.S | re.M)  # fenced code
    text = re.sub(r"`[^`\n]+`", _blank, text)                                 # inline code
    text = re.sub(r"<!--.*?-->", _blank, text, flags=re.S)
    text = re.sub(r"https?://\S+", _blank, text)
    text = re.sub(r"\]\([^)]*\)", _blank, text)                               # link targets
    return text


def ignored_lines(text: str) -> set[int]:
    out, inside = set(), False
    for n, line in enumerate(text.splitlines(), 1):
        if "style-ignore-start" in line:
            inside = True
        if inside or "style-ignore" in line:
            out.add(n)
        if "style-ignore-end" in line:
            inside = False
    return out


def check_file(path: Path, rules: list[Rule]) -> list[dict]:
    ext = path.suffix.lower()
    if ext not in PROSE_EXT | MARKUP_EXT or not path.is_file():
        return []
    try:
        text = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return []
    skip = ignored_lines(text)
    if "style-ignore-file" in text[:500]:
        return []
    views = {"markup": text if ext in MARKUP_EXT else None, "prose": prose_of(path, text) if ext in PROSE_EXT else None}
    has_ko = bool(HANGUL.search(views["prose"] or ""))
    findings = []
    for rule in rules:
        if rule.kind == "register":
            findings += register_mix(path, views["prose"], rule, skip) if has_ko else []
            continue
        body = views.get(rule.kind)
        if body is None or (rule.lang == "ko" and not has_ko):
            continue
        hits, seen_lines, total = [], set(), 0
        has_hit = "hit" in rule.pattern.groupindex  # a (?P<hit>…) group narrows what is reported
        for m in rule.pattern.finditer(body):
            start = m.start("hit") if has_hit and m.group("hit") is not None else m.start()
            line = body.count("\n", 0, start) + 1
            if line in skip:
                continue
            total += 1  # max_per_file counts every occurrence outside style-ignore lines
            if line in seen_lines:  # but each rule is reported once per line
                continue
            seen_lines.add(line)
            col = start - (body.rfind("\n", 0, start) + 1) + 1
            text = m.group("hit") if has_hit and m.group("hit") is not None else m.group(0)
            hits.append({"file": str(path), "line": line, "col": col, "rule": rule.id, "severity": rule.severity,
                         "match": text.strip()[:60], "message": rule.message, "suggest": rule.suggest})
        if rule.max_per_file and total <= rule.max_per_file:
            continue
        if rule.max_per_file:
            hits = hits[:1]
            hits[0]["message"] += f" ({total}회, 기준 {rule.max_per_file}회)"
        findings += hits
    return sorted(findings, key=lambda f: (f["file"], f["line"], f["col"]))


FORMAL = re.compile(r"(니다|니까)[.?!]")
POLITE = re.compile(r"[가-힣](?<!니)요[.?!]")
PLAIN = re.compile(r"[가-힣](?<!니)다[.!]")
REGISTERS = {"합니다체": FORMAL, "해요체": POLITE, "한다체": PLAIN}


def register_mix(path: Path, prose: str | None, rule: Rule, skip: set[int]) -> list[dict]:
    """Flag a file that mixes speech levels (합니다체 / 해요체 / 한다체) in running sentences.

    Table cells and list items written as noun phrases (개조식) have no sentence ending and are not counted.
    A level counts as mixed in when it has 3+ endings and at least 10% of all endings.
    """
    if not prose:
        return []
    lines = prose.splitlines()
    hits = {k: [(n, m) for n, l in enumerate(lines, 1) if n not in skip for m in rx.finditer(l)] for k, rx in REGISTERS.items()}
    total = sum(map(len, hits.values()))
    used = sorted(((k, v) for k, v in hits.items() if len(v) >= 3 and len(v) >= 0.1 * total), key=lambda kv: len(kv[1]))
    if len(used) < 2:
        return []
    kind, occ = used[0]
    n, m = occ[0]
    counts = ", ".join(f"{k} {len(v)}곳" for k, v in hits.items() if v)
    return [{"file": str(path), "line": n, "col": m.start() + 1, "rule": rule.id, "severity": rule.severity,
             "match": m.group(0), "suggest": rule.suggest,
             "message": f"{rule.message} ({counts}; 소수인 {kind}의 첫 위치)"}]


def fmt(f: dict) -> str:
    s = f"{f['file']}:{f['line']}:{f['col']} {f['severity']} [{f['rule']}] \"{f['match']}\" — {f['message']}"
    return s + (f" → {f['suggest']}" if f["suggest"] else "")


def hook_mode(rules: list[Rule]) -> int:
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        return 0
    path = (payload.get("tool_input") or {}).get("file_path") or ""
    if not path:
        return 0
    findings = check_file(Path(path), rules)
    if not findings:
        return 0
    shown = findings[:15]
    lines = [fmt(f) for f in shown] + ([f"… and {len(findings) - len(shown)} more"] if len(findings) > len(shown) else [])
    context = ("ai-design style check (github.com/jungrok5/ai-design, docs/standard.md) found AI-tone/AI-look patterns in the file you "
               "just edited. Fix the ones that are real in this context (keep facts, names and code unchanged); leave "
               "deliberate quotes with a `style-ignore` marker.\n" + "\n".join(lines))
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": context}}, ensure_ascii=False))
    return 0


def main(argv: list[str]) -> int:
    rules = load_rules()
    if argv[:1] == ["--hook"]:
        return hook_mode(rules)
    if argv[:1] == ["--list-rules"]:
        for r in sorted(rules, key=lambda r: (r.kind, r.lang, r.id)):
            print(f"{r.severity:7} {r.kind:6} {r.lang:3} {r.id:28} {r.message}")
        return 0
    if not argv:
        print(__doc__)
        return 2
    findings = []
    for a in argv:
        findings += check_file(Path(a), rules)
    for f in findings:
        print(fmt(f))
    errors = sum(f["severity"] == "error" for f in findings)
    warnings = len(findings) - errors
    print(f"style: {errors} error(s), {warnings} warning(s) in {len(argv)} file(s)", file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
