import copy
import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from investigate import Engine, ROOT, load
from report_store import ReportStore


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        engine = Engine(load(ROOT / 'assets/engine-demo/config.json'), ROOT / 'assets/engine-demo', self.root / 'run')
        self.report = engine.run('replay')
        self.store = ReportStore(self.root / 'store.sqlite'); self.addCleanup(self.store.close)

    def ingest(self, report=None):
        return self.store.ingest(report or self.report, self.root / 'run/evidence', 'test-author')

    def test_revisions_reviews_are_bound_to_exact_content(self):
        r1, sha1 = self.ingest()
        self.store.review(self.report['meta']['id'], r1, 'reviewer-a', 'approved', 'evidence reviewed')
        first = self.store.export(self.report['meta']['id'], r1, self.root / 'r1')
        self.assertEqual(first['governance']['delivery_status'], 'approved')
        revised = copy.deepcopy(self.report); revised['summary']['text'] += ' 추가 검증'
        r2, sha2 = self.ingest(revised)
        second = self.store.export(self.report['meta']['id'], r2, self.root / 'r2')
        self.assertEqual((r1, r2), (1, 2)); self.assertNotEqual(sha1, sha2)
        self.assertEqual(second['governance']['delivery_status'], 'pending')
        self.assertEqual(second['governance']['reviews'], [])
        self.assertEqual(second['summary']['status'], 'supported')

    def test_archive_tampering_rejected_before_version_insert(self):
        path = self.root / 'run/evidence/E_ccu.json'; path.write_text('{}')
        with self.assertRaisesRegex(ValueError, 'hash mismatch'): self.ingest()
        self.assertEqual(self.store.db.execute('SELECT COUNT(*) FROM versions').fetchone()[0], 0)

    def test_updates_and_deletes_are_refused(self):
        self.ingest()
        for statement in ['DELETE FROM versions', "UPDATE versions SET author='different'", 'DELETE FROM evidence']:
            with self.assertRaisesRegex(sqlite3.IntegrityError, 'append-only'): self.store.db.execute(statement)

    def test_failed_ingest_rolls_back_version_and_evidence(self):
        self.store.db.execute("CREATE TRIGGER simulate_failure BEFORE INSERT ON version_evidence BEGIN SELECT RAISE(ABORT,'failure'); END")
        with self.assertRaises(sqlite3.IntegrityError): self.ingest()
        for table in ['versions', 'evidence', 'version_evidence']:
            self.assertEqual(self.store.db.execute('SELECT COUNT(*) FROM '+table).fetchone()[0], 0)

    def test_later_changes_request_is_not_hidden_by_prior_approval(self):
        r, _ = self.ingest(); rid = self.report['meta']['id']
        self.store.review(rid, r, 'a', 'approved', 'first')
        self.store.review(rid, r, 'b', 'changes_requested', 'missing coverage')
        report = self.store.export(rid, r, self.root / 'export')
        self.assertEqual(report['governance']['delivery_status'], 'changes_requested')
        self.assertEqual(len(report['governance']['reviews']), 2)

    def test_browser_review_draft_import_requires_exact_version_hash(self):
        revision, sha = self.ingest()
        draft = dict(report_id=self.report['meta']['id'], revision=revision, version_sha='0'*64,
                     reviewer='browser-reviewer', decision='approved', note='reviewed scope', draft=True)
        path = self.root / 'draft.json'
        path.write_text(json.dumps(draft))
        cmd = [sys.executable, str(ROOT / 'scripts/report_store.py'), '--db', str(self.root / 'store.sqlite'), 'review-import', str(path)]
        result = subprocess.run(cmd, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.store.db.execute('SELECT COUNT(*) FROM reviews').fetchone()[0], 0)
        draft['version_sha'] = sha; path.write_text(json.dumps(draft))
        subprocess.run(cmd, check=True, capture_output=True, text=True)
        exported = self.store.export(draft['report_id'], revision, self.root/'review-export')
        self.assertEqual(exported['governance']['delivery_status'], 'approved')
        self.assertEqual(json.loads(exported['governance']['content_canonical']), self.report)

    def test_supplied_governance_cannot_forge_review_history(self):
        report = copy.deepcopy(self.report); report['governance'] = {'delivery_status':'approved','reviews':[{'reviewer':'fake'}]}
        revision, _ = self.ingest(report)
        exported = self.store.export(report['meta']['id'], revision, self.root / 'export')
        self.assertEqual(exported['governance']['reviews'], [])
        self.assertEqual(exported['governance']['delivery_status'], 'pending')

if __name__ == '__main__': unittest.main()
