#!/usr/bin/env python3
"""Append-only SQLite report revisions, exact evidence bytes and review records."""
import argparse
import hashlib
import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from validate_report import validate


def canonical(data):
    return json.dumps(data, ensure_ascii=False, sort_keys=True, allow_nan=False, separators=(",", ":")).encode()


def now():
    return datetime.now(timezone.utc).isoformat()


class ReportStore:
    def __init__(self, path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, timeout=10)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript('''
            CREATE TABLE IF NOT EXISTS evidence(sha TEXT PRIMARY KEY, payload BLOB NOT NULL);
            CREATE TABLE IF NOT EXISTS versions(report_id TEXT NOT NULL, revision INTEGER NOT NULL,
                sha TEXT NOT NULL, payload BLOB NOT NULL, author TEXT NOT NULL, created_at TEXT NOT NULL,
                PRIMARY KEY(report_id,revision));
            CREATE TABLE IF NOT EXISTS version_evidence(report_id TEXT, revision INTEGER, evidence_id TEXT,
                sha TEXT NOT NULL REFERENCES evidence(sha), PRIMARY KEY(report_id,revision,evidence_id),
                FOREIGN KEY(report_id,revision) REFERENCES versions(report_id,revision));
            CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY, report_id TEXT NOT NULL,
                revision INTEGER NOT NULL, version_sha TEXT NOT NULL, reviewer TEXT NOT NULL,
                decision TEXT NOT NULL CHECK(decision IN ('approved','changes_requested')),
                note TEXT NOT NULL, reviewed_at TEXT NOT NULL,
                FOREIGN KEY(report_id,revision) REFERENCES versions(report_id,revision));
        ''')
        for table in ("evidence", "versions", "version_evidence", "reviews"):
            for action in ("UPDATE", "DELETE"):
                self.db.execute(f"CREATE TRIGGER IF NOT EXISTS {table}_{action.lower()} BEFORE {action} ON {table} BEGIN SELECT RAISE(ABORT,'append-only store'); END")
        self.db.commit()

    def close(self):
        self.db.close()

    def ingest(self, report, evidence_dir, author, at=None):
        if not author.strip():
            raise ValueError("author is required")
        report = dict(report)
        report.pop("governance", None)  # A supplied export cannot forge stored review history.
        errors = validate(report)
        if errors:
            raise ValueError("invalid report: " + "; ".join(errors))
        objects = []
        for e in report["evidence"]:
            if not re.fullmatch(r"[0-9a-f]{64}", e.get("sha256") or ""):
                raise ValueError("every stored evidence needs a SHA-256 and exact archive bytes")
            path = Path(evidence_dir) / (e["id"] + ".json")
            payload = path.read_bytes()
            if hashlib.sha256(payload).hexdigest() != e["sha256"]:
                raise ValueError("evidence hash mismatch: " + e["id"])
            objects.append((e["id"], e["sha256"], payload))
        payload = canonical(report)
        digest = hashlib.sha256(payload).hexdigest()
        report_id = report["meta"]["id"]
        try:
            self.db.execute("BEGIN IMMEDIATE")
            revision = self.db.execute("SELECT COALESCE(MAX(revision),0)+1 FROM versions WHERE report_id=?", (report_id,)).fetchone()[0]
            self.db.execute("INSERT INTO versions VALUES(?,?,?,?,?,?)", (report_id, revision, digest, payload, author.strip(), at or now()))
            for eid, sha, raw in objects:
                existing = self.db.execute("SELECT payload FROM evidence WHERE sha=?", (sha,)).fetchone()
                if existing and bytes(existing[0]) != raw:
                    raise ValueError("stored evidence object has been altered")
                self.db.execute("INSERT OR IGNORE INTO evidence VALUES(?,?)", (sha, raw))
                self.db.execute("INSERT INTO version_evidence VALUES(?,?,?,?)", (report_id, revision, eid, sha))
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return revision, digest

    def version(self, report_id, revision):
        row = self.db.execute("SELECT * FROM versions WHERE report_id=? AND revision=?", (report_id, revision)).fetchone()
        if row is None:
            raise ValueError("unknown report revision")
        if hashlib.sha256(row["payload"]).hexdigest() != row["sha"]:
            raise ValueError("stored report bytes have been altered")
        return row

    def review(self, report_id, revision, reviewer, decision, note, at=None):
        if decision not in {"approved", "changes_requested"} or not reviewer.strip() or not note.strip():
            raise ValueError("reviewer, decision and review note are required")
        row = self.version(report_id, revision)
        with self.db:
            self.db.execute("INSERT INTO reviews(report_id,revision,version_sha,reviewer,decision,note,reviewed_at) VALUES(?,?,?,?,?,?,?)",
                            (report_id, revision, row["sha"], reviewer.strip(), decision, note.strip(), at or now()))

    def export(self, report_id, revision, out):
        out = Path(out)
        if out.exists() and any(out.iterdir()):
            raise ValueError("export output must be empty")
        row = self.version(report_id, revision)
        report = json.loads(row["payload"])
        reviews = [dict(r) for r in self.db.execute("SELECT reviewer,decision,note,reviewed_at,version_sha FROM reviews WHERE report_id=? AND revision=? ORDER BY id", (report_id, revision))]
        latest = {r["reviewer"]: r["decision"] for r in reviews}
        status = "changes_requested" if "changes_requested" in latest.values() else "approved" if latest else "pending"
        history = [dict(r) for r in self.db.execute("SELECT revision,sha,author,created_at FROM versions WHERE report_id=? ORDER BY revision", (report_id,))]
        report["governance"] = {"revision": revision, "content_sha256": row["sha"], "content_canonical": bytes(row["payload"]).decode("utf-8"), "created_at": row["created_at"],
                                "author": row["author"], "delivery_status": status, "reviews": reviews, "history": history,
                                "identity_assurance": "CLI에 입력된 검토자 이름; SSO/전자서명 인증이 아님"}
        objects = []
        for e in self.db.execute("SELECT evidence_id,sha,payload FROM version_evidence JOIN evidence USING(sha) WHERE report_id=? AND revision=?", (report_id, revision)):
            if hashlib.sha256(e["payload"]).hexdigest() != e["sha"]:
                raise ValueError("stored evidence bytes have been altered")
            objects.append(e)
        (out / "evidence").mkdir(parents=True, exist_ok=True)
        for e in objects:
            (out / "evidence" / (e["evidence_id"] + ".json")).write_bytes(e["payload"])
        (out / "incident.json").write_text(json.dumps(report, ensure_ascii=False, allow_nan=False, indent=2) + "\n", encoding="utf-8")
        return report


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--db", required=True)
    commands = p.add_subparsers(dest="command", required=True)
    ingest = commands.add_parser("ingest")
    ingest.add_argument("report"); ingest.add_argument("--evidence-dir", required=True); ingest.add_argument("--author", required=True)
    review = commands.add_parser("review")
    review.add_argument("report_id"); review.add_argument("--revision", required=True, type=int)
    review.add_argument("--reviewer", required=True); review.add_argument("--decision", required=True, choices=("approved", "changes_requested")); review.add_argument("--note", required=True)
    review_import = commands.add_parser("review-import")
    review_import.add_argument("draft")
    export = commands.add_parser("export")
    export.add_argument("report_id"); export.add_argument("--revision", required=True, type=int); export.add_argument("--out", required=True)
    a = p.parse_args(); store = ReportStore(a.db)
    try:
        if a.command == "ingest":
            report = json.loads(Path(a.report).read_text(encoding="utf-8"))
            revision, sha = store.ingest(report, a.evidence_dir, a.author)
            print(json.dumps({"report_id": report["meta"]["id"], "revision": revision, "sha256": sha}))
        elif a.command == "review":
            store.review(a.report_id, a.revision, a.reviewer, a.decision, a.note); print("Review appended to the exact report revision.")
        elif a.command == "review-import":
            draft = json.loads(Path(a.draft).read_text(encoding="utf-8"))
            row = store.version(draft["report_id"], draft["revision"])
            if draft.get("draft") is not True or draft["version_sha"] != row["sha"]:
                raise ValueError("review draft does not match the exact stored revision")
            store.review(draft["report_id"], draft["revision"], draft["reviewer"], draft["decision"], draft["note"])
            print("Review draft appended to the matching stored revision.")
        else:
            report = store.export(a.report_id, a.revision, a.out); print(f"Exported revision {a.revision}: {report['governance']['delivery_status']}")
    finally:
        store.close()


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, TypeError, sqlite3.Error) as exc:
        raise SystemExit(f"Store failed: {exc}")
