import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  useNodesState,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";
import Timeline from "./Timeline.jsx";
import {
  delivery,
  download,
  safeUrl,
  statuses,
  time,
  validateReport,
  verifyGovernance,
} from "./model.mjs";
import "./style.css";
const base = import.meta.env.BASE_URL;
function Badge({ status }) {
  return (
    <span className={"badge " + status}>
      {statuses[status] || delivery[status] || status}
    </span>
  );
}
function Evidence({ report, ids }) {
  const [selected, setSelected] = useState(ids[0]),
    [result, setResult] = useState(""),
    [busy, setBusy] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    setSelected(ids[0]);
    setResult("");
    setBusy(false);
    generation.current++;
  }, [ids.join("|"), report.meta.id]);
  const evidence = report.evidence.find((e) => e.id === selected);
  async function verify() {
    const token = ++generation.current;
    setBusy(true);
    setResult("");
    try {
      if (!evidence.archive_url || !evidence.sha256)
        throw Error("보존본 URL과 해시가 필요합니다.");
      const url = safeUrl(evidence.archive_url);
      if (!url) throw Error("URL을 확인하세요.");
      const target = new URL(url);
      if (target.origin !== location.origin)
        throw Error(
          "외부 보존본은 해당 시스템에서 파일을 내려받아 해시를 확인하세요.",
        );
      const response = await fetch(url);
      if (!response.ok) throw Error("보존본 조회 실패");
      const data = await response.arrayBuffer();
      const sha = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      if (generation.current === token)
        setResult(
          sha === evidence.sha256
            ? "해시 일치 · 마스킹 보존본의 바이트가 같습니다."
            : "해시 불일치 · 보존본을 확인해야 합니다.",
        );
    } catch (e) {
      if (generation.current === token) setResult(e.message);
    } finally {
      if (generation.current === token) setBusy(false);
    }
  }
  return (
    <div className="evidence">
      <h3>근거를 직접 확인</h3>
      <div className="pickers">
        {ids.map((id) => (
          <button
            key={id}
            aria-pressed={id === selected}
            onClick={() => {
              generation.current++;
              setBusy(false);
              setResult("");
              setSelected(id);
            }}
          >
            {id} · {report.evidence.find((e) => e.id === id)?.title}
          </button>
        ))}
      </div>
      {evidence ? (
        <>
          <h3>
            {evidence.id} · {evidence.title}
          </h3>
          <p className="small">
            {evidence.source} · 관측 {evidence.observed_start}–
            {evidence.observed_end} · 조회 {evidence.retrieved_at}
          </p>
          <pre>
            {typeof evidence.sample === "string"
              ? evidence.sample
              : JSON.stringify(evidence.sample, null, 2)}
          </pre>
          <details>
            <summary>쿼리 · 변수 · 원본 조회</summary>
            <pre>{evidence.query || "쿼리 미제공"}</pre>
            <pre>{JSON.stringify(evidence.parameters || {}, null, 2)}</pre>
            <div className="sources">
              {[
                ["원본에서 재조회", evidence.source_url],
                ["당시 보존본", evidence.archive_url],
              ].map(([label, url]) =>
                safeUrl(url) ? (
                  <a
                    key={label}
                    href={safeUrl(url)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {label}
                  </a>
                ) : (
                  <span key={label}>{label}: 연결 없음</span>
                ),
              )}
            </div>
            <p className="small hash">SHA-256: {evidence.sha256 || "미기록"}</p>
            {evidence.archive_url && evidence.sha256 && (
              <button onClick={verify} disabled={busy}>
                보존본 해시 확인
              </button>
            )}
            <p role="status" className="small">
              {result}
            </p>
          </details>
          <p className="small">해석 한계: {evidence.limitations}</p>
        </>
      ) : (
        <p className="small">연결된 근거가 없습니다. 추가 검증이 필요합니다.</p>
      )}
    </div>
  );
}
function CauseNode({ data, selected }) {
  return (
    <div className={"causenode " + (selected ? "active" : "")}>
      <Handle type="target" position={Position.Top} />
      <span className="small">
        {data.role} · {statuses[data.status]}
      </span>
      <strong>{data.label}</strong>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
const nodeTypes = { cause: CauseNode };
function layout(report) {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: "TB",
    nodesep: 24,
    ranksep: 72,
    marginx: 20,
    marginy: 20,
  });
  report.nodes.forEach((n) => graph.setNode(n.id, { width: 215, height: 110 }));
  report.edges.forEach((e) => graph.setEdge(e.source, e.target));
  dagre.layout(graph);
  return report.nodes.map((n) => {
    const p = graph.node(n.id);
    return {
      id: n.id,
      type: "cause",
      position: { x: p.x - 107.5, y: p.y - 55 },
      data: n,
      ariaLabel: n.label,
      selectable: true,
    };
  });
}
function CauseGraph({ report, onSelect, selection }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(layout(report));
  const flow = useRef(null);
  const edges = useMemo(
    () =>
      report.edges.map((e) => ({
        ...e,
        type: "smoothstep",
        label: statuses[e.status],
        style: {
          stroke: e.status === "verified" ? "#44816a" : "#7e8fa7",
          strokeWidth: 1.7,
          strokeDasharray: e.status === "verified" ? undefined : "5 4",
        },
        markerEnd: { type: MarkerType.ArrowClosed },
        interactionWidth: 28,
        ariaLabel: e.label,
        selectable: true,
      })),
    [report],
  );
  useEffect(() => {
    setNodes(layout(report));
    setTimeout(
      () => flow.current?.fitView({ padding: 0.18, minZoom: 0.2, maxZoom: 1 }),
      50,
    );
  }, [report]);
  function choose(type, id) {
    onSelect({ type, id });
    setNodes((ns) =>
      ns.map((n) => ({ ...n, selected: type === "node" && n.id === id })),
    );
  }
  return (
    <>
      <div className="graph" data-react-flow="true">
        <ReactFlow
          nodes={nodes}
          edges={edges.map((e) => ({
            ...e,
            selected: selection?.type === "edge" && selection.id === e.id,
          }))}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={(_, n) => choose("node", n.id)}
          onEdgeClick={(_, e) => choose("edge", e.id)}
          onInit={(instance) => (flow.current = instance)}
          nodesDraggable
          nodesConnectable={false}
          edgesReconnectable={false}
          deleteKeyCode={null}
          fitView
          fitViewOptions={{ padding: 0.18, minZoom: 0.2, maxZoom: 1 }}
          minZoom={0.15}
          maxZoom={1.8}
          preventScrolling={false}
          zoomOnScroll={false}
          panOnDrag={true}
        >
          <Background gap={24} color="#d8dee8" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <div className="graphlists">
        <details>
          <summary>노드 목록 · 키보드로 선택</summary>
          <div className="pickers">
            {report.nodes.map((n) => (
              <button
                key={n.id}
                onClick={() => choose("node", n.id)}
                data-node={n.id}
              >
                {n.label} · {statuses[n.status]}
              </button>
            ))}
          </div>
        </details>
        <div className="pickers">
          {report.edges.map((e) => (
            <button
              key={e.id}
              data-edge={e.id}
              aria-pressed={selection?.type === "edge" && selection.id === e.id}
              onClick={() => choose("edge", e.id)}
            >
              {report.nodes.find((n) => n.id === e.source)?.label} →{" "}
              {report.nodes.find((n) => n.id === e.target)?.label} ·{" "}
              {statuses[e.status]}
            </button>
          ))}
        </div>
      </div>
      <p className="small">
        확대·이동: 화면 탐색 · 노드/연결 선택: 근거 확인. 실선은 검증, 점선은
        유력·미확인입니다. 노드 이동은 화면 배치만 바꿉니다.
      </p>
    </>
  );
}
function Governance({ report }) {
  const g = report.governance,
    [reviewer, setReviewer] = useState(""),
    [decision, setDecision] = useState("changes_requested"),
    [note, setNote] = useState(""),
    [error, setError] = useState("");
  function draft(e) {
    e.preventDefault();
    if (!g) {
      setError("저장소에 등록한 버전의 보고서를 사용하세요.");
      return;
    }
    if (!reviewer.trim() || !note.trim()) {
      setError("검토자와 의견을 입력하세요.");
      return;
    }
    download(`${report.meta.id}-r${g.revision}-review-draft.json`, {
      report_id: report.meta.id,
      revision: g.revision,
      version_sha: g.content_sha256,
      reviewer: reviewer.trim(),
      decision,
      note: note.trim(),
      draft: true,
    });
    setError(
      "검토 초안을 다운로드했습니다. 공유 기록 반영은 저장소 CLI에서 수행합니다.",
    );
  }
  return (
    <section className="section">
      <h2>검토와 보고서 버전</h2>
      {g ? (
        <>
          <p>
            <Badge status={g.delivery_status} /> 보고서 revision {g.revision} ·
            작성자 {g.author} · {g.created_at}
          </p>
          <p className="small hash">
            내용 SHA-256: {g.content_sha256} · 이 해시는 검토 메타데이터를
            붙이기 전의 고정 보고서 내용입니다.
          </p>
          <p className="small">
            검토 완료와 원인 검증됨은 별개의 상태입니다. {g.identity_assurance}
          </p>
          {g.reviews.length ? (
            g.reviews.map((r, i) => (
              <div key={i} className="reviewrecord">
                <strong>
                  {r.reviewer} · {delivery[r.decision]}
                </strong>
                <p>{r.note}</p>
                <span className="small">
                  {r.reviewed_at} · revision {g.revision}
                </span>
              </div>
            ))
          ) : (
            <p className="small">이 버전에 기록된 검토자는 아직 없습니다.</p>
          )}
          <details>
            <summary>버전 이력 ({g.history.length})</summary>
            {g.history.map((h) => (
              <p key={h.revision} className="small hash">
                revision {h.revision} · {h.author} · {h.created_at}
                <br />
                {h.sha}
              </p>
            ))}
          </details>
        </>
      ) : (
        <p>저장소에 등록한 버전·검토 이력이 없습니다.</p>
      )}
      <details className="no-print">
        <summary>검토 의견 초안 작성</summary>
        <p className="small">
          이 공개 페이지는 공유 저장소에 쓰지 않습니다. 의견은 다운로드 후 해당
          버전의 저장소에 등록합니다. 검토자 이름은 입력 기록이며 신원 인증이
          아닙니다.
        </p>
        <form onSubmit={draft}>
          <label>
            검토자
            <input
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
              maxLength={100}
              required
            />
          </label>
          <label>
            검토 결과
            <select
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
            >
              <option value="changes_requested">수정 요청</option>
              <option value="approved">검토 완료</option>
            </select>
          </label>
          <label>
            근거 확인·남은 질문
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={5000}
              required
            />
          </label>
          <button>검토 초안 다운로드</button>
        </form>
        <p role="status">{error}</p>
      </details>
    </section>
  );
}
function Report({ report }) {
  const first =
    report.nodes.find((n) =>
      ["직접 원인", "원인 후보", "direct cause"].includes(n.role),
    ) || report.nodes[0];
  const [tab, setTab] = useState("cause"),
    [selection, setSelection] = useState(
      first ? { type: "node", id: first.id } : null,
    ),
    [stepId, setStepId] = useState(report.investigation[0]?.id),
    [extraIds, setExtraIds] = useState(null);
  const detailRef = useRef(null);
  const item =
    selection?.type === "edge"
      ? report.edges.find((e) => e.id === selection.id)
      : report.nodes.find((n) => n.id === selection?.id);
  const step = report.investigation.find((i) => i.id === stepId);
  function focusEvidence(ids) {
    setExtraIds(ids);
    setTab("evidence");
    setTimeout(
      () =>
        detailRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      30,
    );
  }
  const tabs = [
    ["cause", "인과관계"],
    ["investigation", "조사 과정"],
    ["evidence", "근거 전체"],
    ["actions", "조치 · 남은 질문"],
    ["review", "검토 · 버전"],
  ];
  return (
    <>
      <div className="meta">
        {report.meta.id} · {report.meta.scope} · {report.meta.timezone} · v
        {report.meta.version}
        {report.governance && ` · revision ${report.governance.revision}`}
      </div>
      <h1>{report.meta.title}</h1>
      {report.meta.synthetic && (
        <p className="synthetic">
          가상 사례 · 사건·수치·실험·검토는 예시이며 실제 운영 분석이 아닙니다.
        </p>
      )}
      <Timeline report={report} onEvidence={focusEvidence} />
      <section className="section conclusion">
        <Badge status={report.summary.status} />
        <p className="conclusiontext">{report.summary.text}</p>
        <div className="summaryfooter">
          <span>영향: {report.summary.impact}</span>
          <span>복구: {report.summary.recovery}</span>
        </div>
        <p className="small">
          근거: {report.summary.evidence_ids.join(", ")} · 한계:{" "}
          {report.summary.limitations}
        </p>
        <button
          className="textbutton"
          onClick={() => focusEvidence(report.summary.evidence_ids)}
        >
          결론의 근거 확인 →
        </button>
      </section>
      <nav className="tabs" role="tablist" aria-label="분석 보기">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            id={"tab-" + id}
            aria-controls={"panel-" + id}
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
                e.preventDefault();
                const index = tabs.findIndex((t) => t[0] === id);
                const next =
                  tabs[
                    (index + (e.key === "ArrowRight" ? 1 : 4)) % tabs.length
                  ][0];
                setTab(next);
                document.getElementById("tab-" + next)?.focus();
              }
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <section
        id="panel-cause"
        className="panel"
        role="tabpanel"
        aria-labelledby="tab-cause"
        hidden={tab !== "cause"}
      >
        <div className="layout">
          <div>
            <h2>원인과 영향의 연결</h2>
            <CauseGraph
              report={report}
              selection={selection}
              onSelect={setSelection}
            />
          </div>
          <aside className="detail" aria-live="polite">
            {item ? (
              <>
                <Badge status={item.status} />
                <h2>
                  {selection.type === "edge"
                    ? `${report.nodes.find((n) => n.id === item.source)?.label} → ${report.nodes.find((n) => n.id === item.target)?.label}`
                    : item.label}
                </h2>
                <p>{item.statement || item.mechanism}</p>
                {item.rationale && (
                  <p className="reason">판단 근거: {item.rationale}</p>
                )}
                <Evidence report={report} ids={item.evidence_ids} />
                <p className="small">한계: {item.limitations}</p>
              </>
            ) : (
              <p>원인 후보가 없습니다. 수집 자료와 조사 기록을 확인하세요.</p>
            )}
          </aside>
        </div>
      </section>
      <section
        id="panel-investigation"
        className="panel"
        role="tabpanel"
        aria-labelledby="tab-investigation"
        hidden={tab !== "investigation"}
      >
        <div className="layout">
          <div>
            <h2>가설을 어떻게 좁혔나</h2>
            <p className="small">
              아래는 조사 시각입니다. 사건 발생 시각과 구분합니다.
            </p>
            {report.investigation.map((i) => (
              <button
                className="step"
                key={i.id}
                data-step={i.id}
                aria-pressed={stepId === i.id}
                onClick={() => setStepId(i.id)}
              >
                <span className="small">{i.investigated_at} 조사</span>{" "}
                <Badge status={i.status} />
                <strong>{i.question}</strong>
                <span className="small">{i.decision}</span>
              </button>
            ))}
          </div>
          <aside className="detail">
            {step ? (
              <>
                <Badge status={step.status} />
                <h2>{step.question}</h2>
                {[
                  ["가설", step.hypothesis],
                  ["예측", step.prediction],
                  ["관측", step.observed],
                  ["판정", step.decision],
                  ["다음 확인", step.next_test],
                ].map(([key, v]) => (
                  <React.Fragment key={key}>
                    <h3>{key}</h3>
                    <p>{v}</p>
                  </React.Fragment>
                ))}
                <Evidence report={report} ids={step.evidence_ids} />
              </>
            ) : (
              <p>조사 기록이 없습니다.</p>
            )}
          </aside>
        </div>
      </section>
      <section
        id="panel-evidence"
        className="panel"
        ref={detailRef}
        role="tabpanel"
        aria-labelledby="tab-evidence"
        hidden={tab !== "evidence"}
      >
        <div className="detail">
          <h2>조회와 근거 보존본</h2>
          <p className="small">
            원본 쿼리·절대 시간·표본·한계와 마스킹 보존본을 함께 확인합니다.
            해시는 보존본의 무결성을 확인하며 원인 진위를 증명하지 않습니다.
          </p>
          <Evidence
            report={report}
            ids={extraIds || report.evidence.map((e) => e.id)}
          />
          {extraIds && (
            <button onClick={() => setExtraIds(null)}>모든 근거 보기</button>
          )}
        </div>
      </section>
      <section
        id="panel-actions"
        className="panel"
        role="tabpanel"
        aria-labelledby="tab-actions"
        hidden={tab !== "actions"}
      >
        <div className="section">
          <h2>복구와 재발 방지</h2>
          {report.actions.map((a) => (
            <div className="action" key={a.id}>
              <strong>{a.action}</strong>
              <p className="small">
                {a.owner} · {a.due || "기한 미정"} · {a.status}
              </p>
              <p>{a.verification}</p>
            </div>
          ))}
          <h2>아직 확인하지 못한 것</h2>
          {report.unknowns.map((u, i) => (
            <div className="action" key={i}>
              <strong>{u.question}</strong>
              <p>
                {u.owner} · 다음 확인: {u.next_test}
              </p>
            </div>
          ))}
        </div>
      </section>
      <section
        id="panel-review"
        className="panel"
        role="tabpanel"
        aria-labelledby="tab-review"
        hidden={tab !== "review"}
      >
        <Governance report={report} />
      </section>
      <div className="print-evidence">
        <h2>증거 부록</h2>
        {report.evidence.map((e) => (
          <div key={e.id}>
            <h3>
              {e.id} · {e.title}
            </h3>
            <pre>
              {typeof e.sample === "string"
                ? e.sample
                : JSON.stringify(e.sample, null, 2)}
            </pre>
            <p>쿼리: {e.query || "미제공"}</p>
            <p className="hash">
              보존본: {e.archive_url || "미제공"} · SHA-256:{" "}
              {e.sha256 || "미기록"}
            </p>
            <p>{e.limitations}</p>
          </div>
        ))}
      </div>
    </>
  );
}
function App() {
  const [catalog, setCatalog] = useState([]),
    [slug, setSlug] = useState(
      new URLSearchParams(location.search).get("case") || "restart",
    ),
    [report, setReport] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const sequence = useRef(0),
    input = useRef(null);
  useEffect(() => {
    fetch(base + "cases/catalog.json")
      .then((r) => {
        if (!r.ok) throw Error("사례 목록 조회 실패");
        return r.json();
      })
      .then(setCatalog)
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);
  useEffect(() => {
    if (!catalog.length || slug === "imported") return;
    const entry = catalog.find((c) => c.slug === slug) || catalog[0];
    const token = ++sequence.current;
    setLoading(true);
    setError("");
    fetch(base + "cases/" + entry.path)
      .then((r) => {
        if (!r.ok) throw Error("보고서 조회 실패");
        return r.json();
      })
      .then(verifyGovernance)
      .then((r) => {
        if (sequence.current === token) {
          setReport(r);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (sequence.current === token) {
          setError(e.message);
          setLoading(false);
        }
      });
  }, [slug, catalog]);
  async function importFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5_000_000) {
      setError("보고서 JSON은 5MB 이하로 넣어주세요.");
      return;
    }
    const token = ++sequence.current;
    try {
      const data = await verifyGovernance(JSON.parse(await file.text()));
      if (sequence.current === token) {
        setReport(data);
        setLoading(false);
        setError("");
        setSlug("imported");
      }
    } catch (err) {
      if (sequence.current === token) setError(err.message);
    }
  }
  function choose(s) {
    setSlug(s);
    history.replaceState(
      null,
      "",
      location.pathname + "?case=" + encodeURIComponent(s),
    );
  }
  return (
    <div className="report">
      <header className="chrome">
        <strong>Incident Evidence Review</strong>
        <span className="small">React Flow · 근거 기반 보고서</span>
      </header>
      <div className="body">
        <div className="toolbar no-print">
          <label>
            예시 보고서
            <select
              aria-label="예시 보고서 선택"
              value={slug}
              onChange={(e) => choose(e.target.value)}
            >
              {catalog.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label}
                </option>
              ))}
              {slug === "imported" && (
                <option value="imported">불러온 보고서</option>
              )}
            </select>
          </label>
          <div className="buttons">
            <button onClick={() => input.current.click()}>
              보고서 JSON 열기
            </button>
            <input
              ref={input}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={importFile}
            />
            <button
              onClick={() =>
                report && download(`${report.meta.id}.json`, report)
              }
              disabled={!report}
            >
              JSON 다운로드
            </button>
            <button onClick={() => window.print()} disabled={!report}>
              인쇄 · PDF
            </button>
          </div>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <p role="status">보고서를 불러오는 중입니다.</p>
        ) : report ? (
          <Report
            key={
              report.meta.id +
              ":" +
              (report.governance?.content_sha256 || report.meta.version)
            }
            report={report}
          />
        ) : (
          <p>보고서 JSON을 열어주세요.</p>
        )}
        <footer className="small">
          현상 → 결론 → 원인 연결 → 조사 → 근거 · 공개 페이지는 예시를 보여주며
          운영 시스템을 자동 조회하지 않습니다.{" "}
          <a href="https://github.com/jungrok5/report">사용 방법·소스</a>
        </footer>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
