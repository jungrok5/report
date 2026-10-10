#!/usr/bin/env python3
"""Render an evidence report as offline HTML and optional Markdown."""
import argparse
import html
import json
from pathlib import Path
from validate_report import load_report
from check_style import require_report_style

ROOT=Path(__file__).resolve().parent.parent


def fragment(data):
    require_report_style(data)
    payload=json.dumps(data,ensure_ascii=False,allow_nan=False).replace("<","\\u003c").replace(">","\\u003e").replace("&","\\u0026").replace("\u2028","\\u2028").replace("\u2029","\\u2029")
    template=(ROOT/"assets/report-template.html").read_text(encoding="utf-8")
    template=template.replace('__REPORT_TOKENS__',(ROOT/'assets/report-tokens.css').read_text(encoding='utf-8'))
    template=template.replace('__REPORT_LAYOUT__',(ROOT/'assets/report-layout.css').read_text(encoding='utf-8'))
    if template.count("__REPORT_DATA__")!=1: raise ValueError("Invalid template data slot")
    return template.replace("__REPORT_DATA__",payload)


def markdown(data):
    lines=[f"# {data['meta']['title']}","",f"{data['meta']['id']} · {data['meta']['scope']} · {data['meta']['timezone']} · v{data['meta']['version']}",""]
    if data['meta']['synthetic']: lines += ["**가상 예시: 모든 사건·수치는 합성 데이터입니다.**",""]
    lines += ["## 무슨 일이 있었나",""]
    for event in data['events']: lines += [f"- {event['at']} [{event['kind']}] {event['label']}: {event['detail']} ({', '.join(event['evidence_ids'])})"]
    s=data['summary'];lines += ["","## 원인", "",f"상태: {s['status']}","",s['text'],"",f"영향: {s['impact']}",f"복구: {s['recovery']}",f"근거: {', '.join(s['evidence_ids'])}",f"한계: {s['limitations']}"]
    nodes={n['id']:n for n in data['nodes']}
    lines += ["","## 조사 과정",""]
    for item in data['investigation']:
        lines += [f"### {item['investigated_at']} · {item['question']}","",f"가설: {item['hypothesis']}",f"예측: {item['prediction']}",f"관측: {item['observed']}",f"판정 [{item['status']}]: {item['decision']}",f"근거: {', '.join(item['evidence_ids'])}",f"다음 확인: {item['next_test']}",""]
    lines += ["## 인과관계",""]
    for edge in data['edges']: lines += [f"- {nodes[edge['source']]['label']} → {nodes[edge['target']]['label']} [{edge['status']}]: {edge['mechanism']} ({', '.join(edge['evidence_ids'])}); 한계: {edge['limitations']}"]
    lines += [""]
    lines += ["## 조치",""]
    for item in data['actions']: lines += [f"- [{item['status']}] {item['action']}; {item['owner']} / {item['due'] or '미정'}; 완료 기준: {item['verification']}"]
    lines += ["","## 남은 질문",""]
    for item in data['unknowns']: lines += [f"- {item['question']}; {item['owner']}; 다음 확인: {item['next_test']}"]
    lines += ["","## 증거 부록",""]
    for e in data['evidence']:
        sample=e['sample'] if isinstance(e['sample'],str) else json.dumps(e['sample'],ensure_ascii=False,indent=2)
        fence='`'*max(3,max((len(x) for x in __import__('re').findall(r'`+',sample)),default=0)+1)
        lines += [f"### {e['id']} · {e['title']}","",f"출처: {e['source']}",f"관측: {e['observed_start']} ~ {e['observed_end']}",f"조회: {e['retrieved_at']}","",fence,sample,fence,"",f"쿼리: {e.get('query') or '미제공'}",f"변수: {json.dumps(e.get('parameters',{}),ensure_ascii=False)}",f"한계: {e['limitations']}",f"원본: {e.get('source_url') or '연결 없음'}",f"보존본: {e.get('archive_url') or '본문 표본'}",f"SHA-256: {e.get('sha256') or '미기록'}",""]
    return "\n".join(lines)


def write(path, content):
    target=Path(path);target.parent.mkdir(parents=True,exist_ok=True);target.write_text(content,encoding="utf-8")


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data");parser.add_argument("--out",required=True)
    parser.add_argument("--markdown-out");parser.add_argument("--fragment-out")
    args=parser.parse_args()
    data=load_report(args.data);body=fragment(data)
    title=html.escape(data['meta']['title'])
    document=f'<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title}</title><style>:root{{color-scheme:light dark}}body{{margin:0;padding:24px;background:var(--page)}}@media(max-width:600px){{body{{padding:0}}}}</style></head><body>{body}</body></html>\n'
    inputs={Path(args.data).resolve(),(ROOT/'assets/report-template.html').resolve(),(ROOT/'assets/report-tokens.css').resolve(),(ROOT/'assets/report-layout.css').resolve()}
    outputs=[args.out,args.markdown_out,args.fragment_out];resolved=[Path(x).resolve() for x in outputs if x]
    if len(set(resolved))!=len(resolved) or any(x in inputs for x in resolved): raise ValueError("Output paths must be distinct and cannot overwrite input/template")
    write(args.out,document)
    if args.markdown_out: write(args.markdown_out,markdown(data))
    if args.fragment_out: write(args.fragment_out,body)
    print(f"Rendered {data['meta']['id']}; HTML {args.out}")


if __name__=="__main__":
    try: main()
    except (ValueError,OSError) as exc: raise SystemExit(f"Render failed: {exc}")
