import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  validateReport,
  sampleAt,
  safeUrl,
  verifyGovernance,
} from "../web/src/model.mjs";
const cases = ["restart", "db-lock", "client-retry"].map((s) =>
  JSON.parse(
    fs.readFileSync(
      new URL("../docs/cases/" + s + "/incident.json", import.meta.url),
    ),
  ),
);
test("three cases keep independent cause and delivery statuses", () => {
  cases.forEach(validateReport);
  assert.equal(cases[1].summary.status, "verified");
  assert.equal(cases[0].governance.delivery_status, "pending");
  assert.equal(cases[1].governance.delivery_status, "approved");
});
test("original null sample stays missing rather than interpolated", () => {
  const m = cases[0].metrics[2],
    p = m.points.find((p) => p[1] === null);
  assert.equal(sampleAt(m, Date.parse(p[0]))[1], null);
});
test("import rejects unknown evidence, unsafe URLs and causal cycles", () => {
  let c = structuredClone(cases[0]);
  c.summary.evidence_ids = ["fake"];
  assert.throws(() => validateReport(c));
  c = structuredClone(cases[0]);
  c.evidence[0].archive_url = "javascript:alert(1)";
  assert.throws(() => validateReport(c));
  c = structuredClone(cases[1]);
  c.edges.push({ ...c.edges[0], id: "cycle", source: "N3", target: "N1" });
  assert.throws(() => validateReport(c));
});
test("source URLs do not carry authentication", () => {
  for (const u of [
    "https://name:pw@example.com/",
    "https://example.com/?token=abc",
    "javascript:alert(1)",
  ])
    assert.equal(safeUrl(u), null);
});

test("reviewed content cannot be silently changed while keeping prior review", async () => {
  for (const c of cases) await verifyGovernance(c);
  const changed = structuredClone(cases[1]);
  changed.summary.text += " 임의 변경";
  await assert.rejects(verifyGovernance(changed), /새 버전/);
  const mismatched = structuredClone(cases[1]);
  mismatched.governance.reviews[0].version_sha = "0".repeat(64);
  await assert.rejects(verifyGovernance(mismatched), /해시/);
});

test("manual imports cannot exclude without successful complete evidence", () => {
  const c = structuredClone(cases[1]);
  c.investigation[0].evidence_ids = [];
  assert.throws(() => validateReport(c), /근거 참조/);
  const id = cases[1].investigation[0].evidence_ids[0];
  c.investigation[0].evidence_ids = [id];
  const e = c.evidence.find((e) => e.id === id);
  e.incomplete = true;
  assert.throws(() => validateReport(c), /불완전/);
  e.incomplete = false;
  e.quality = { excerpt_truncated: true };
  assert.throws(() => validateReport(c), /불완전/);
  e.quality = {};
  e.collection_status = "failed";
  assert.throws(() => validateReport(c), /조회 실패/);
});
test("review metadata requires a current history row and valid review time", () => {
  const c = structuredClone(cases[1]);
  c.governance.history = [];
  assert.throws(() => validateReport(c));
  c.governance.history = structuredClone(cases[1].governance.history);
  c.governance.reviews[0].reviewed_at = "not-a-timestamp";
  assert.throws(() => validateReport(c));
});
