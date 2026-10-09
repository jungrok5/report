"""End-to-end and failure-boundary checks using local fake APIs, never production."""
import copy
import hashlib
import json
import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from investigate import Engine, ROOT, clean, load, request_json
from validate_report import validate

DEMO = ROOT / "assets/engine-demo"


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.config = load(DEMO / "config.json")
        self.out = Path(self.temp.name) / "output"

    def engine(self):
        return Engine(self.config, DEMO, self.out)

    def test_replay_end_to_end_hashes_and_candidate_limits(self):
        engine = self.engine()
        report = engine.run("replay")
        self.assertEqual(validate(report), [])
        self.assertEqual(len(engine.done), 6)
        self.assertEqual(len(report["investigation"]), 3)
        self.assertEqual(report["summary"]["status"], "supported")
        self.assertTrue(report["meta"]["synthetic"])
        self.assertFalse(any(x["status"] == "verified" for x in report["nodes"] + report["edges"]))
        self.assertTrue(any(v is None for _, v in report["metrics"][2]["points"]))
        self.assertEqual(max(v for _, v in report["metrics"][1]["points"] if v is not None), 1850)
        for evidence in report["evidence"]:
            payload = (self.out / "evidence" / (evidence["id"] + ".json")).read_bytes()
            self.assertEqual(evidence["sha256"], hashlib.sha256(payload).hexdigest())
            self.assertIsNone(evidence["source_url"])
        self.assertIn("미실행", (self.out / "report.md").read_text())

    def test_unknown_query_ids_rejected_before_any_collection(self):
        engine = self.engine()
        with self.assertRaisesRegex(ValueError, "catalog"):
            engine.collect(["ccu", "invented-query"])
        self.assertEqual(engine.done, set())

    def test_existing_output_is_never_overwritten(self):
        self.engine().run()
        with self.assertRaisesRegex(ValueError, "empty"):
            self.engine()

    def test_partial_failure_preserves_report_and_is_not_absence(self):
        self.config["queries"][0]["file"] = "missing.json"
        engine = self.engine()
        report = engine.run()
        self.assertEqual(len(engine.failures), 1)
        self.assertEqual(report["summary"]["status"], "unknown")
        self.assertNotIn("M_ccu", {m["id"] for m in report["metrics"]})
        self.assertIn("조회 또는 해석 실패", report["evidence"][0]["limitations"])
        self.assertTrue(report["unknowns"])
        self.assertTrue((self.out / "report.html").exists())

    def test_multiseries_not_silently_summed_or_averaged(self):
        engine = self.engine()
        raw = load(DEMO / "latency.json")
        raw["data"]["result"].append(copy.deepcopy(raw["data"]["result"][0]))
        with self.assertRaisesRegex(ValueError, "exactly one"):
            engine.prometheus(raw, self.config["queries"][2], "E_latency")

    def test_empty_samples_all_null_and_infinite_values_null(self):
        engine = self.engine()
        q = self.config["queries"][0]
        raw = load(DEMO / "ccu.json")
        raw["data"]["result"][0]["values"] = []
        metrics, limits = engine.prometheus(raw, q, "E_ccu")
        self.assertTrue(all(v is None for _, v in metrics[0]["points"]))
        self.assertTrue(any(x.startswith("부분") for x in limits))
        raw = load(DEMO / "ccu.json")
        raw["data"]["result"][0]["values"][0][1] = "NaN"
        metrics, _ = engine.prometheus(raw, q, "E_ccu")
        self.assertIsNone(metrics[0]["points"][0][1])

    def test_planner_cannot_cite_future_failed_or_fabricated_evidence(self):
        engine = self.engine()
        engine.collect(self.config["bootstrap"])
        plan = copy.deepcopy(self.config["replay_plans"][1])
        with self.assertRaisesRegex(ValueError, "existing successful"):
            engine.accept(plan)
        plan = copy.deepcopy(self.config["replay_plans"][0])
        plan["status"] = "verified"
        with self.assertRaisesRegex(ValueError, "status"):
            engine.accept(plan)

    def test_failed_planner_preserves_last_accepted_draft(self):
        self.config["replay_plans"][1]["query_ids"] = ["made-up-sql"]
        engine = self.engine()
        report = engine.run("replay")
        self.assertEqual(engine.stop, "planner_failed")
        self.assertEqual(len(report["investigation"]), 1)
        self.assertEqual(report["summary"]["status"], "unknown")
        self.assertTrue((self.out / "state.json").exists())

    def test_log_cap_prevents_negative_exclusion(self):
        self.config["budget"]["log_limit"] = 9
        engine = self.engine()
        engine.collect(["timeline"])
        self.assertTrue(engine.evidence[0]["incomplete"])
        plan = copy.deepcopy(self.config["replay_plans"][0])
        plan["status"] = "excluded"
        plan["evidence_ids"] = ["E_timeline"]
        plan["summary"]["evidence_ids"] = []
        with self.assertRaisesRegex(ValueError, "incomplete"):
            engine.accept(plan)

    def test_budget_is_checked_before_collection(self):
        self.config["budget"]["max_queries"] = 2
        engine = self.engine()
        with self.assertRaisesRegex(ValueError, "budget"):
            engine.collect(self.config["bootstrap"])
        self.assertFalse(engine.done)
        self.config["budget"]["max_window_seconds"] = 60
        self.out = Path(self.temp.name) / "other"
        with self.assertRaisesRegex(ValueError, "window"):
            self.engine()

    def test_no_replay_for_real_data(self):
        self.config["meta"]["synthetic"] = False
        engine = self.engine()
        with self.assertRaisesRegex(ValueError, "synthetic"):
            engine.run("replay")
        self.assertFalse(engine.done)

    def test_redaction_of_structured_embedded_and_plain_logs(self):
        payload = {"password": "p", "line": '{"token":"t","email":"u@example.com","msg":"Bearer my-key"}',
                   "text": "token=abc accountId=123 auth-value"}
        result = clean(payload, ["auth-value"], [r"accountId=\d+"])
        encoded = json.dumps(result)
        self.assertNotIn("my-key", encoded)
        self.assertNotIn("u@example.com", encoded)
        self.assertNotIn("abc", encoded)
        self.assertNotIn("auth-value", encoded)
        self.assertEqual(result["password"], "[REDACTED]")

    def test_invalid_budget_step_and_future_window(self):
        for value in (0, -1, True, float("nan")):
            cfg = copy.deepcopy(self.config)
            cfg["queries"][0]["step"] = value
            with self.assertRaises(ValueError):
                Engine(cfg, DEMO, self.out)
        self.config["window"]["end"] = "2099-01-01T00:00:00+09:00"
        with self.assertRaisesRegex(ValueError, "now"):
            self.engine()

    def server(self, handler):
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        return "http://127.0.0.1:" + str(server.server_port)

    def test_live_http_prometheus_loki_and_holmes_contract(self):
        requests = []
        plans = copy.deepcopy(self.config["replay_plans"])
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass
            def respond(self, value):
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(value).encode())
            def do_GET(self):
                requests.append(("GET", self.path, self.headers.get("Authorization")))
                params = parse_qs(urlsplit(self.path).query)
                if self.path.startswith("/api/v1/query_range"):
                    qid = next(q["id"] for q in self_config["queries"] if q.get("query") == params["query"][0])
                    self.respond(load(DEMO / (qid + ".json")))
                else:
                    self.respond(load(DEMO / "events.json"))
            def do_POST(self):
                request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                requests.append(("POST", self.path, request))
                self.respond({"analysis": json.dumps(plans.pop(0)), "tool_calls": [], "follow_up_actions": []})
        base = self.server(Handler)
        self.config["meta"]["synthetic"] = False
        self.config["sources"].update(prom={"kind": "prometheus", "base_url": base, "bearer_env": "INCIDENT_TEST_TOKEN"},
                                      logs={"kind": "loki", "base_url": base})
        for q in self.config["queries"][:4]:
            q["source"] = "prom" if q["format"] == "prometheus" else "logs"
        self.config["holmes"] = {"base_url": base, "server_tools_disabled": True, "model": "test-model"}
        self_config = self.config
        with patch.dict(os.environ, {"INCIDENT_TEST_TOKEN": "mock-credential-123"}):
            engine = self.engine()
            report = engine.run("holmes")
        self.assertEqual(engine.failures, [])
        self.assertEqual(len([r for r in requests if r[0] == "GET"]), 4)
        posts = [r for r in requests if r[0] == "POST"]
        self.assertEqual(len(posts), 3)
        for method, path, body in posts:
            self.assertEqual(path, "/api/chat")
            self.assertFalse(body["stream"])
            self.assertTrue(body["enable_tool_approval"])
            self.assertTrue(body["response_format"]["json_schema"]["strict"])
            self.assertEqual(body["model"], "test-model")
        self.assertIn("start=", requests[0][1])
        self.assertIn("end=", requests[0][1])
        self.assertEqual(requests[0][2], "Bearer mock-credential-123")
        self.assertTrue(all(urlsplit(e["source_url"]).path.endswith("query_range") for e in report["evidence"] if e["source_url"]))
        self.assertNotIn("mock-credential-123", "".join(p.read_text() for p in self.out.rglob("*.json")))

    def test_redirect_and_response_size_are_bounded(self):
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass
            def do_GET(self):
                if self.path == "/redirect":
                    self.send_response(302)
                    self.send_header("Location", "/ok")
                    self.end_headers()
                else:
                    self.send_response(200)
                    self.end_headers()
                    self.wfile.write(b'"' + b'x' * 1024 + b'"')
        base = self.server(Handler)
        with self.assertRaisesRegex(ValueError, "redirect"):
            request_json(base + "/redirect", {}, 1, 2000)
        with self.assertRaisesRegex(ValueError, "byte budget"):
            request_json(base + "/ok", {}, 1, 50)

    def test_holmes_is_not_called_without_isolated_server_configuration(self):
        self.config["holmes"] = {"base_url": "http://127.0.0.1:1", "server_tools_disabled": False}
        engine = self.engine()
        report = engine.run("holmes")
        self.assertEqual(engine.stop, "planner_failed")
        self.assertIn("isolated", engine.failures[0]["error"])
        self.assertEqual(report["summary"]["status"], "unknown")

    def test_unstructured_logs_not_given_invented_occurrence_time(self):
        engine = self.engine()
        raw = load(DEMO / "events.json")
        item = raw["data"]["result"][0]["values"][0]
        item[1] = '{"label":"down","kind":"alert","detail":"no event timestamp"}'
        events, limits = engine.loki(raw, self.config["queries"][3], "E_timeline")
        self.assertEqual(len(events), 8)
        self.assertTrue(any(x.startswith("부분") for x in limits))


if __name__ == "__main__":
    unittest.main()
