"""Behavior checks for evidence integrity and safe offline output."""
import copy
import json
import tempfile
import unittest
from pathlib import Path
from render_report import ROOT, fragment, markdown
from validate_report import load_report, validate


class ReportTests(unittest.TestCase):
    def setUp(self):
        self.data=json.loads((ROOT/'assets/example-restart.json').read_text(encoding='utf-8'))
    def test_example_is_valid_and_keeps_missing_latency(self):
        self.assertEqual(validate(self.data),[])
        self.assertIn(None,[x[1] for x in self.data['metrics'][2]['points']])
    def test_unbacked_verified_claim_is_rejected(self):
        self.data['edges'][0]['evidence_ids']=[]
        self.assertTrue(any('requires at least one' in e for e in validate(self.data)))
    def test_exclusion_requires_complete_successful_evidence(self):
        step=self.data['investigation'][0]
        step.update(status='excluded',evidence_ids=[])
        self.assertTrue(any('requires at least one' in e for e in validate(self.data)))
        evidence=self.data['evidence'][0]
        step['evidence_ids']=[evidence['id']]
        evidence['incomplete']=True
        self.assertTrue(any('cannot exclude' in e for e in validate(self.data)))
        evidence['incomplete']=False
        evidence['quality']={'excerpt_truncated':True}
        self.assertTrue(any('cannot exclude' in e for e in validate(self.data)))
        evidence['quality']={}
        evidence['collection_status']='failed'
        self.assertTrue(any('failed collection' in e for e in validate(self.data)))
    def test_verified_summary_needs_direct_cause_in_either_language(self):
        self.data['nodes'][0]['role']='direct cause'
        self.assertEqual(validate(self.data),[])
        self.data['nodes'][0]['role']='contributing factor'
        self.assertTrue(any('verified conclusion' in e for e in validate(self.data)))
    def test_unknown_evidence_and_cycle_are_rejected(self):
        self.data['events'][0]['evidence_ids']=['missing']
        cycle=copy.deepcopy(self.data['edges'][0]);cycle.update(id='cycle',source='N3',target='N1');self.data['edges'].append(cycle)
        errors=validate(self.data)
        self.assertTrue(any('unknown evidence' in e for e in errors))
        self.assertTrue(any('acyclic' in e for e in errors))
    def test_timezone_and_metric_order_are_required(self):
        self.data['events'][0]['at']='2026-10-08T21:02:00'
        self.data['metrics'][0]['points'][1]=self.data['metrics'][0]['points'][0]
        errors=validate(self.data)
        self.assertTrue(any('timezone-aware' in e for e in errors))
        self.assertTrue(any('strictly time ordered' in e for e in errors))
    def test_external_links_cannot_execute_or_contain_credentials(self):
        for url in ['javascript:alert(1)','https://name:secret@example.com/','https://example.com/?access_token=secret']:
            data=copy.deepcopy(self.data);data['evidence'][0]['source_url']=url
            self.assertTrue(any('HTTP(S) URL' in e for e in validate(data)))
            data=copy.deepcopy(self.data);data['meta']['related_reports']=[{'label':'link','url':url}]
            self.assertTrue(any('HTTP(S) URL' in e for e in validate(data)))
    def test_embedded_json_cannot_close_script(self):
        payload='</script><img src=x onerror=alert(1)>'
        self.data['evidence'][0]['sample']=payload
        rendered=fragment(self.data)
        self.assertNotIn(payload,rendered)
        self.assertIn('\\u003c/script\\u003e',rendered)
    def test_nonfinite_json_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'bad.json';path.write_text('{"value": NaN}')
            with self.assertRaisesRegex(ValueError,'Non-finite'):load_report(path)
    def test_markdown_keeps_unknowns_and_source_limits(self):
        result=markdown(self.data)
        self.assertIn('종료 사유별 기여율',result)
        self.assertIn('회복 지연',result)
        self.assertIn('원본: 연결 없음',result)
        self.assertIn('가상 예시',result)


if __name__=='__main__':unittest.main()
