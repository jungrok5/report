import copy
import json
import unittest
from pathlib import Path
from check_style import check_report, require_report_style
from render_report import fragment

ROOT = Path(__file__).resolve().parent.parent

class ReportStyleTest(unittest.TestCase):
    def setUp(self):
        self.report = json.loads((ROOT/'assets/example-restart.json').read_text())

    def test_rejects_unsupported_marketing_in_report_prose(self):
        self.report['summary']['text'] = '혁신적인 장애 분석으로 원인을 완벽하게 해결합니다.'
        with self.assertRaisesRegex(ValueError, 'ai-design style errors'):
            fragment(self.report)

    def test_leaves_original_evidence_samples_queries_urls_and_values_untouched(self):
        e = self.report['evidence'][0]
        e['sample'] = '혁신적인 분석을 통해 알아서 처리해요. p99=2800ms'
        e['query'] = 'sum(metric{label="혁신적인"})'
        e['source_url'] = 'https://example.com/혁신적인?from=1&to=2'
        before = copy.deepcopy(self.report)
        findings = check_report(self.report)
        self.assertFalse([f for f in findings if f['severity'] == 'error'])
        require_report_style(self.report)
        self.assertEqual(self.report, before)

    def test_portable_report_embeds_tokens_without_external_stylesheets(self):
        body = fragment(self.report)
        self.assertNotIn('__REPORT_TOKENS__', body)
        self.assertIn('--font-sans:', body)
        self.assertNotIn('<link rel="stylesheet"', body)
        self.assertNotIn('border-left:4px solid', body)

if __name__ == '__main__':
    unittest.main()
