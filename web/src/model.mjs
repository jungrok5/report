export const statuses = {
  observed: "관측됨",
  verified: "검증됨",
  supported: "유력",
  unknown: "미확인",
  excluded: "해당 범위 배제",
};
export const delivery = {
  pending: "검토 대기",
  approved: "검토 완료",
  changes_requested: "수정 요청",
};
export const colors = [1, 2, 3, 4, 5].map((i) => `var(--series-${i})`);
export function safeUrl(value) {
  try {
    const u = new URL(value);
    if (
      !["https:", "http:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      [...u.searchParams.keys()].some((k) =>
        /^(token|access_token|password|api_key|apikey|authorization)$/i.test(k),
      )
    )
      return null;
    return u.href;
  } catch {
    return null;
  }
}
export function time(value, zone) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}
export function sampleAt(metric, at) {
  let best = null;
  for (const point of metric.points) {
    const distance = Math.abs(Date.parse(point[0]) - at);
    if (!best || distance < best.distance) best = { point, distance };
  }
  return best && best.distance <= metric.interval_seconds * 1000
    ? best.point
    : null;
}
export function valuesText(metric, at) {
  const p = sampleAt(metric, at);
  return p && p[1] !== null
    ? `${Number(p[1]).toLocaleString("ko-KR", { maximumFractionDigits: 3 })} ${metric.unit}`
    : "관측 없음";
}
export function validateReport(r) {
  const fail = (m) => {
      throw Error(m);
    },
    lists = [
      "metrics",
      "events",
      "evidence",
      "nodes",
      "edges",
      "investigation",
      "actions",
      "unknowns",
    ];
  if (
    !r ||
    !r.meta ||
    !r.window ||
    !r.summary ||
    lists.some((k) => !Array.isArray(r[k]))
  )
    fail("필수 보고서 구조가 없습니다.");
  if (typeof r.meta.synthetic !== "boolean")
    fail("synthetic 표시가 필요합니다.");
  const strings = (x, keys) => {
    for (const k of keys)
      if (typeof x[k] !== "string") fail("텍스트 필드 오류: " + k);
  };
  strings(r.meta, ["id", "title", "timezone", "version", "scope"]);
  strings(r.summary, ["text", "impact", "recovery", "limitations"]);
  for (const n of r.nodes)
    strings(n, [
      "id",
      "label",
      "role",
      "statement",
      "rationale",
      "limitations",
    ]);
  for (const e of r.edges)
    strings(e, ["id", "source", "target", "label", "mechanism", "limitations"]);
  for (const e of r.events) strings(e, ["id", "label", "kind", "detail"]);
  for (const i of r.investigation)
    strings(i, [
      "id",
      "question",
      "hypothesis",
      "prediction",
      "observed",
      "decision",
      "next_test",
    ]);
  for (const m of r.metrics) strings(m, ["id", "label", "unit", "aggregation"]);
  for (const a of r.actions)
    strings(a, ["id", "action", "owner", "status", "verification"]);
  for (const u of r.unknowns) strings(u, ["question", "owner", "next_test"]);
  try {
    new Intl.DateTimeFormat("ko", { timeZone: r.meta.timezone });
  } catch {
    fail("시간대를 확인하세요.");
  }
  const ts = (v) =>
    typeof v === "string" &&
    /(Z|[+-]\d{2}:\d{2})$/.test(v) &&
    Number.isFinite(Date.parse(v));
  if (
    !ts(r.window.start) ||
    !ts(r.window.end) ||
    !ts(r.window.baseline_end) ||
    Date.parse(r.window.start) >= Date.parse(r.window.end)
  )
    fail("절대 시간 범위를 확인하세요.");
  const start = Date.parse(r.window.start),
    end = Date.parse(r.window.end);
  if (
    Date.parse(r.window.baseline_end) < start ||
    Date.parse(r.window.baseline_end) > end
  )
    fail("기준 구간이 범위 밖입니다.");
  const ids = {};
  for (const key of lists.slice(0, -1)) {
    ids[key] = new Set();
    for (const item of r[key]) {
      if (!item || !/^[-\w]+$/.test(item.id) || ids[key].has(item.id))
        fail("중복/잘못된 ID: " + key);
      ids[key].add(item.id);
    }
  }
  const refs = (x, strong = false) => {
    if (
      !Array.isArray(x.evidence_ids) ||
      x.evidence_ids.some((id) => !ids.evidence.has(id)) ||
      (strong && !x.evidence_ids.length)
    )
      fail("근거 참조를 확인하세요.");
  };
  for (const key of ["summary", "nodes", "edges", "investigation"]) {
    const items = key === "summary" ? [r.summary] : r[key];
    for (const x of items) {
      if (!Object.hasOwn(statuses, x.status)) fail("증거 상태가 잘못됐습니다.");
      refs(
        x,
        ["observed", "verified", "supported", "excluded"].includes(x.status),
      );
      for (const id of x.evidence_ids) {
        const e = r.evidence.find((e) => e.id === id);
        if (
          ["observed", "verified", "supported", "excluded"].includes(
            x.status,
          ) &&
          e.collection_status === "failed"
        )
          fail("조회 실패 근거로 관측·원인·배제를 판단할 수 없습니다.");
        if (
          x.status === "excluded" &&
          (e.incomplete === true ||
            e.quality?.incomplete === true ||
            e.quality?.excerpt_truncated === true)
        )
          fail("불완전하거나 잘린 근거로 후보를 배제할 수 없습니다.");
      }
    }
  }
  for (const e of r.evidence) {
    if (
      !ts(e.observed_start) ||
      !ts(e.observed_end) ||
      !ts(e.retrieved_at) ||
      Date.parse(e.observed_start) > Date.parse(e.observed_end) ||
      Date.parse(e.observed_end) > Date.parse(e.retrieved_at)
    )
      fail("근거 시간을 확인하세요.");
    for (const u of [e.source_url, e.archive_url])
      if (u && !safeUrl(u)) fail("허용하지 않는 근거 URL입니다.");
  }
  for (const m of r.metrics) {
    refs(m, true);
    if (
      !Array.isArray(m.points) ||
      m.points.length < 2 ||
      !Number.isFinite(m.interval_seconds) ||
      m.interval_seconds <= 0
    )
      fail("지표 표본 형식 오류");
    let last = -Infinity;
    for (const [t, v] of m.points) {
      const n = Date.parse(t);
      if (
        !ts(t) ||
        n <= last ||
        n < start ||
        n > end ||
        (v !== null && (typeof v !== "number" || !Number.isFinite(v)))
      )
        fail("지표 시각·수치 오류");
      last = n;
    }
  }
  let last = -Infinity;
  for (const e of r.events) {
    refs(e, true);
    const n = Date.parse(e.at);
    if (
      !ts(e.at) ||
      n < last ||
      n < start ||
      n > end ||
      !["observation", "alert", "intervention", "recovery", "change"].includes(
        e.kind,
      )
    )
      fail("사건 시간·종류 오류");
    last = n;
  }
  const graph = new Map(r.nodes.map((n) => [n.id, []]));
  for (const e of r.edges) {
    if (!graph.has(e.source) || !graph.has(e.target))
      fail("원인 연결 대상 오류");
    graph.get(e.source).push(e.target);
  }
  const active = new Set(),
    visited = new Set();
  function visit(n) {
    if (active.has(n)) fail("순환 연결은 시간 단계로 나누세요.");
    if (visited.has(n)) return;
    active.add(n);
    for (const v of graph.get(n)) visit(v);
    active.delete(n);
    visited.add(n);
  }
  for (const n of graph.keys()) visit(n);
  if (
    r.summary.status === "verified" &&
    !r.nodes.some(
      (n) =>
        n.status === "verified" &&
        ["직접 원인", "direct cause"].includes(n.role),
    )
  )
    fail("검증된 직접 원인 노드가 필요합니다.");
  if (r.governance) {
    const g = r.governance;
    if (
      !Number.isInteger(g.revision) ||
      g.revision < 1 ||
      !/^([a-f0-9]{64})$/.test(g.content_sha256) ||
      !Object.hasOwn(delivery, g.delivery_status) ||
      !Array.isArray(g.reviews) ||
      !Array.isArray(g.history)
    )
      fail("검토·버전 구조 오류");
    strings(g, ["author", "created_at", "identity_assurance"]);
    if (!ts(g.created_at)) fail("검토 버전 생성 시각 오류");
    for (const review of g.reviews) {
      strings(review, [
        "reviewer",
        "decision",
        "note",
        "reviewed_at",
        "version_sha",
      ]);
      if (!["approved", "changes_requested"].includes(review.decision))
        fail("검토 상태 오류");
      if (
        !ts(review.reviewed_at) ||
        Date.parse(review.reviewed_at) < Date.parse(g.created_at)
      )
        fail("검토 시각 오류");
    }
    const revisions = new Set();
    for (const h of g.history) {
      strings(h, ["sha", "author", "created_at"]);
      if (
        !Number.isInteger(h.revision) ||
        h.revision < 1 ||
        revisions.has(h.revision) ||
        !ts(h.created_at) ||
        !/^[a-f0-9]{64}$/.test(h.sha)
      )
        fail("버전 이력 오류");
      revisions.add(h.revision);
    }
    if (
      !g.history.some(
        (h) =>
          h.revision === g.revision &&
          h.sha === g.content_sha256 &&
          h.author === g.author &&
          h.created_at === g.created_at,
      )
    )
      fail("현재 버전과 이력이 일치하지 않습니다.");
  }
  return r;
}
export function download(name, data, type = "application/json") {
  const blob = new Blob(
    [typeof data === "string" ? data : JSON.stringify(data, null, 2)],
    { type },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const ordered = (v) =>
  Array.isArray(v)
    ? v.map(ordered)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, ordered(v[k])]),
        )
      : v;
export async function verifyGovernance(report) {
  validateReport(report);
  const g = report.governance;
  if (!g) return report;
  if (typeof g.content_canonical !== "string")
    throw Error(
      "검토 기록에 연결된 고정 보고서 내용이 없습니다. 저장소에서 다시 export하세요.",
    );
  const raw = JSON.parse(g.content_canonical),
    content = { ...report };
  delete content.governance;
  if (JSON.stringify(ordered(raw)) !== JSON.stringify(ordered(content)))
    throw Error(
      "보고서 내용이 검토 버전과 다릅니다. 수정본은 새 버전으로 저장하세요.",
    );
  const digest = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(g.content_canonical),
      ),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (
    digest !== g.content_sha256 ||
    g.reviews.some((r) => r.version_sha !== digest)
  )
    throw Error("검토·내용 해시가 해당 보고서 버전과 일치하지 않습니다.");
  const latest = Object.fromEntries(
    g.reviews.map((r) => [r.reviewer, r.decision]),
  );
  const expected = Object.values(latest).includes("changes_requested")
    ? "changes_requested"
    : Object.keys(latest).length
      ? "approved"
      : "pending";
  if (expected !== g.delivery_status)
    throw Error("검토 상태가 기록과 일치하지 않습니다.");
  return report;
}
