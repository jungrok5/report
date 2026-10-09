#!/usr/bin/env python3
"""Validate report structure/references; this does not prove a root cause."""
import argparse
import json
import math
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qsl, urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

STATUSES = {"observed", "verified", "supported", "unknown", "excluded"}
KINDS = {"observation", "alert", "intervention", "recovery", "change"}


def validate(data):
    errors = []
    def fail(path, message): errors.append(f"{path}: {message}")
    def require(obj, fields, path):
        if not isinstance(obj, dict):
            fail(path, "expected object"); return False
        for field in fields:
            if field not in obj: fail(path, f"missing {field}")
        return True
    def timestamp(value, path):
        try:
            result = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if result.utcoffset() is None: raise ValueError("timezone missing")
            return result
        except (ValueError, TypeError, AttributeError):
            fail(path, "expected timezone-aware ISO 8601 timestamp"); return None
    if not require(data, ["meta", "window", "summary", "metrics", "events", "evidence", "nodes", "edges", "investigation", "actions", "unknowns"], "report"):
        return errors
    for key in ("meta", "window", "summary"):
        if not isinstance(data.get(key), dict): fail(key, "expected object")
    if errors: return errors
    require(data["meta"], ["id", "title", "timezone", "version", "synthetic", "scope"], "meta")
    if not isinstance(data["meta"].get("synthetic"), bool): fail("meta.synthetic", "expected boolean")
    try: ZoneInfo(data["meta"].get("timezone", ""))
    except (ZoneInfoNotFoundError, ValueError, TypeError): fail("meta.timezone", "unknown IANA timezone")
    require(data["window"], ["start", "end", "baseline_end"], "window")
    start=timestamp(data["window"].get("start"), "window.start")
    end=timestamp(data["window"].get("end"), "window.end")
    baseline=timestamp(data["window"].get("baseline_end"), "window.baseline_end")
    if start and end and start >= end: fail("window", "start must precede end")
    if start and end and baseline and not start <= baseline <= end: fail("window.baseline_end", "outside window")
    lists=("metrics", "events", "evidence", "nodes", "edges", "investigation", "actions", "unknowns")
    for key in lists:
        if not isinstance(data.get(key), list): fail(key, "expected array")
    if errors: return errors
    ids={}
    for key in lists[:-1]:
        ids[key]=set()
        for i,item in enumerate(data[key]):
            if not isinstance(item, dict): fail(f"{key}[{i}]", "expected object"); continue
            item_id=item.get("id")
            if not isinstance(item_id,str) or not re.fullmatch(r"[A-Za-z0-9_-]+",item_id): fail(f"{key}[{i}].id", "expected simple identifier"); continue
            if item_id in ids[key]: fail(key, f"duplicate ID {item_id}")
            ids[key].add(item_id)
    def refs(item, path, strong=False):
        value=item.get("evidence_ids")
        if not isinstance(value,list) or any(not isinstance(x,str) for x in value): fail(path, "evidence_ids must be an array of IDs"); return
        for ref in value:
            if ref not in ids["evidence"]: fail(path, f"unknown evidence {ref}")
        if strong and not value: fail(path, "requires at least one evidence ID")
    def status(item,path):
        if item.get("status") not in STATUSES: fail(path,"invalid status")
        refs(item,path,item.get("status") in {"verified","supported","observed"})
    summary=data["summary"]
    require(summary,["status","text","impact","recovery","evidence_ids","limitations"],"summary")
    if summary.get("status") not in {"verified","supported","unknown"}: fail("summary.status","invalid conclusion status")
    refs(summary,"summary",summary.get("status") != "unknown")
    for item in data["evidence"]:
        if not isinstance(item,dict): continue
        path=f"evidence.{item.get('id')}"
        require(item,["title","source","observed_start","observed_end","retrieved_at","sample","limitations"],path)
        a=timestamp(item.get("observed_start"),path+".observed_start")
        b=timestamp(item.get("observed_end"),path+".observed_end")
        c=timestamp(item.get("retrieved_at"),path+".retrieved_at")
        if a and b and a>b: fail(path,"observation start is after end")
        if b and c and c<b: fail(path,"retrieval precedes latest observation")
        for key in ("source_url","archive_url"):
            value=item.get(key)
            if value is not None:
                try:
                    parsed=urlsplit(value)
                    if parsed.scheme not in {"http","https"} or not parsed.hostname or parsed.username or parsed.password: raise ValueError()
                    if any(k.lower() in {"token","access_token","password","api_key","apikey","authorization"} for k,_ in parse_qsl(parsed.query)): raise ValueError()
                except (TypeError,ValueError,AttributeError): fail(path+"."+key,"expected HTTP(S) URL without credentials or secret query parameters")
        if item.get("sha256") is not None and not re.fullmatch(r"[0-9a-fA-F]{64}",str(item["sha256"])): fail(path+".sha256","invalid SHA-256")
    for item in data["metrics"]:
        if not isinstance(item,dict): continue
        path=f"metrics.{item.get('id')}"
        require(item,["label","unit","aggregation","interval_seconds","points","evidence_ids"],path); refs(item,path,True)
        if not isinstance(item.get("interval_seconds"),(int,float)) or isinstance(item.get("interval_seconds"),bool) or item.get("interval_seconds",0)<=0: fail(path,"invalid interval_seconds")
        points=item.get("points")
        if not isinstance(points,list) or len(points)<2: fail(path,"need at least two points"); continue
        previous=None
        for i,point in enumerate(points):
            if not isinstance(point,list) or len(point)!=2: fail(path,f"invalid point {i}"); continue
            at=timestamp(point[0],path+f".points[{i}]")
            if at and previous and at<=previous: fail(path,"points must be strictly time ordered")
            if at and start and end and not start<=at<=end: fail(path,"point outside window")
            if at: previous=at
            value=point[1]
            if value is not None and (isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value)): fail(path,"point value must be finite number or null")
    last=None
    for item in data["events"]:
        if not isinstance(item,dict): continue
        path=f"events.{item.get('id')}"
        require(item,["at","label","kind","detail","evidence_ids"],path); refs(item,path,True)
        at=timestamp(item.get("at"),path+".at")
        if at and last and at<last: fail(path,"events must be time ordered")
        if at: last=at
        if at and start and end and not start<=at<=end: fail(path,"event outside window")
        if item.get("kind") not in KINDS: fail(path,"invalid event kind")
    for item in data["nodes"]:
        if not isinstance(item,dict): continue
        path=f"nodes.{item.get('id')}"; require(item,["label","role","status","statement","rationale","evidence_ids","limitations"],path); status(item,path)
    graph={x:[] for x in ids["nodes"]}
    for item in data["edges"]:
        if not isinstance(item,dict): continue
        path=f"edges.{item.get('id')}"; require(item,["source","target","label","status","mechanism","evidence_ids","limitations"],path);status(item,path)
        a,b=item.get("source"),item.get("target")
        if a not in graph or b not in graph: fail(path,"unknown source/target node")
        else: graph[a].append(b)
    visited=set(); active=set()
    def visit(node):
        if node in active: return False
        if node in visited: return True
        active.add(node)
        for target in graph[node]:
            if not visit(target): return False
        active.remove(node);visited.add(node);return True
    if any(not visit(node) for node in graph): fail("edges","causal graph must be acyclic; separate feedback by time step")
    if summary.get("status")=="verified" and not any(n.get("status")=="verified" and n.get("role") in {"직접 원인", "direct cause"} for n in data["nodes"] if isinstance(n,dict)): fail("summary","verified conclusion requires a verified 직접 원인/direct cause node")
    for item in data["investigation"]:
        if not isinstance(item,dict): continue
        path=f"investigation.{item.get('id')}";require(item,["investigated_at","question","hypothesis","prediction","observed","decision","status","evidence_ids","next_test"],path);timestamp(item.get("investigated_at"),path);status(item,path)
    for item in data["actions"]:
        if not isinstance(item,dict): continue
        path=f"actions.{item.get('id')}";require(item,["action","owner","due","status","verification","evidence_ids"],path);refs(item,path)
        if item.get("due") is not None:
            try: datetime.strptime(item["due"],"%Y-%m-%d")
            except (ValueError,TypeError): fail(path,"due must be YYYY-MM-DD or null")
    for item in data["unknowns"]: require(item,["question","owner","next_test"],"unknowns")
    phases=data.get("phases",[])
    if not isinstance(phases,list): fail("phases","expected array")
    else:
        for item in phases:
            if not require(item,["start","end","label"],"phases"): continue
            a=timestamp(item.get("start"),"phases.start");b=timestamp(item.get("end"),"phases.end")
            if a and b and (a>b or (start and a<start) or (end and b>end)): fail("phases","invalid phase range")
    return errors


def load_report(path):
    def reject(value): raise ValueError(f"Non-finite JSON value: {value}")
    data=json.loads(Path(path).read_text(encoding="utf-8"),parse_constant=reject)
    errors=validate(data)
    if errors: raise ValueError("\n".join(errors))
    return data


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("data")
    args=parser.parse_args()
    try: load_report(args.data)
    except (ValueError,OSError) as exc: parser.exit(1,f"Validation failed:\n{exc}\n")
    print("PASS: format, timestamps, evidence references and causal DAG. Causal truth requires review.")
