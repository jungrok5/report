import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { diagramLayout, drawioXml, edgePath } from "./drawio-model.mjs";
import { viewport } from "./drawio-viewport.mjs";
import { download, statuses } from "./model.mjs";
import "./drawio.css";

export default function CauseGraph({ report, onSelect, selection }) {
  const layout = useMemo(() => diagramLayout(report), [report]);
  const marker = useId().replace(/:/g, "") + "-arrow";
  const stage = useRef(null), svg = useRef(null), controls = useRef(null);
  const frame = useRef(null), dialog = useRef(null), edited = useRef("");
  const drag = useRef(null);
  const [scale, setScale] = useState(100), [editing, setEditing] = useState(false);
  const index = selection?.type === "node" ? layout.order.indexOf(selection.id) : -1;
  useEffect(() => {
    controls.current = viewport(stage.current, svg.current, setScale, layout.width);
    return () => controls.current?.destroy();
  }, [report]);
  useEffect(() => {
    if (index < 0) return;
    const node = layout.nodes.find(n => n.id === selection.id);
    const factor = svg.current.getBoundingClientRect().width / layout.width;
    const canvas = stage.current;
    if (canvas.scrollWidth <= canvas.clientWidth && canvas.scrollHeight <= canvas.clientHeight) return;
    canvas.scrollTo({ left: Math.max(0, (node.x + node.width / 2) * factor - canvas.clientWidth / 2),
      top: Math.max(0, (node.y + node.height / 2) * factor - canvas.clientHeight / 2),
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [selection, layout]);
  useEffect(() => {
    function receive(event) {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return;
      let message;
      try { message = typeof event.data === "string" ? JSON.parse(event.data) : event.data; } catch { return; }
      if (message?.event === "init") frame.current.contentWindow.postMessage(
        JSON.stringify({ action: "load", xml: edited.current, autosave: 1 }), location.origin);
      if (["autosave", "save"].includes(message?.event) && typeof message.xml === "string" && message.xml.length <= 5_000_000)
        edited.current = message.xml;
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  useEffect(() => { if (editing) dialog.current?.showModal(); }, [editing]);
  function originalXml() {
    const css = getComputedStyle(document.documentElement);
    const palette = Object.fromEntries(["paper", "border", "ink", "green", "muted"].map(key => [key, css.getPropertyValue("--" + key).trim()]));
    return drawioXml(report, layout, palette);
  }
  const filename = report.meta.id.replace(/[^a-z0-9_-]/gi, "_") || "report";
  function choose(type, id) { onSelect({ type, id }); }
  function keyChoose(event, type, id) {
    if (["Enter", " "].includes(event.key)) { event.preventDefault(); choose(type, id); }
  }
  function stopDrag(event) {
    if (drag.current && event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
  }
  return <>
    <div className="drawio-toolbar no-print">
      <div className="drawio-controls">
        <button aria-label="원인 흐름도 축소" onClick={() => controls.current?.decrease()}>−</button>
        <button aria-label="원인 흐름도 확대" onClick={() => controls.current?.increase()}>+</button>
        <span className="drawio-scale" role="status" aria-live="polite">{scale}%</span>
        <button onClick={() => controls.current?.fit()}>전체보기</button>
      </div>
      <div className="drawio-controls">
        <button onClick={() => { edited.current = originalXml(); setEditing(true); }}>그림 편집</button>
        <button onClick={() => download(filename + ".drawio", originalXml(), "application/xml")}>.drawio 저장</button>
      </div>
    </div>
    <div ref={stage} className="drawio-stage" data-drawio="true"
      onPointerDown={event => {
        if (event.pointerType !== "mouse" || event.button !== 0 || event.target.closest("[data-node], [data-edge]")) return;
        drag.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        if (!drag.current) return;
        event.currentTarget.scrollLeft = drag.current.left + drag.current.x - event.clientX;
        event.currentTarget.scrollTop = drag.current.top + drag.current.y - event.clientY;
      }} onPointerUp={stopDrag} onPointerCancel={stopDrag}>
      <svg ref={svg} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${layout.width} ${layout.height}`}
        width={layout.width} height={layout.height} role="group" aria-labelledby={marker + "-title"}>
        <title id={marker + "-title"}>{report.meta.title} · 원인과 영향의 관계</title>
        <defs><marker id={marker} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M0,0 L8,4 L0,8 Z" className="drawio-arrow" />
        </marker></defs>
        {layout.edges.map(edge => {
          const at = edge.points[Math.floor(edge.points.length / 2)];
          const selected = selection?.type === "edge" && selection.id === edge.id;
          return <g key={edge.id} className={`drawio-edge ${edge.status} ${selected ? "active" : ""}`}
            data-edge={edge.id} role="button" tabIndex={0} aria-label={`${edge.label || edge.id} · ${statuses[edge.status]}`}
            aria-pressed={selected} onClick={() => choose("edge", edge.id)} onKeyDown={event => keyChoose(event, "edge", edge.id)}>
            <title>{edge.mechanism}</title>
            <path className="drawio-edge-hit" d={edgePath(edge.points)} />
            <path className="drawio-edge-line" d={edgePath(edge.points)} markerEnd={`url(#${marker})`} />
            <text x={at.x + 10} y={at.y - 10} className="drawio-edge-label">{statuses[edge.status]}</text>
          </g>;
        })}
        {layout.nodes.map(node => {
          const selected = selection?.type === "node" && selection.id === node.id;
          return <g key={node.id} className={`drawio-node ${node.status} ${selected ? "active" : ""}`}
            data-node={node.id} role="button" tabIndex={0} aria-label={`${node.label} · ${statuses[node.status]}`}
            aria-pressed={selected} onClick={() => choose("node", node.id)} onKeyDown={event => keyChoose(event, "node", node.id)}>
            <title>{node.statement}</title>
            <rect x={node.x} y={node.y} width={node.width} height={node.height} rx="6" />
            <text x={node.x + 16} y={node.y + 25} className="drawio-node-status">{node.role} · {statuses[node.status]}</text>
            <text x={node.x + 16} y={node.y + 49} className="drawio-node-label">
              {node.lines.map((line, i) => <tspan key={i} x={node.x + 16} dy={i ? 22 : 0}>{line}</tspan>)}
            </text>
          </g>;
        })}
      </svg>
    </div>
    <div className="drawio-steps no-print">
      <span>{index >= 0 ? `노드 ${index + 1} / ${layout.order.length}` : "연결의 근거 선택"}</span>
      <button disabled={index <= 0} onClick={() => choose("node", layout.order[index - 1])}>이전 노드</button>
      <button disabled={index >= layout.order.length - 1} onClick={() => choose("node", layout.order[index + 1])}>다음 노드</button>
    </div>
    <p className="small">노드와 연결선을 선택하면 설명과 근거가 표시됩니다. 실선은 검증됨, 점선은 유력·미확인입니다.</p>
    <details className="drawio-lists no-print"><summary>모든 노드와 연결 선택</summary>
      <div className="pickers">{layout.order.map(id => {
        const node = report.nodes.find(n => n.id === id);
        return <button key={id} onClick={() => choose("node", id)} aria-pressed={selection?.id === id}>{node.label} · {statuses[node.status]}</button>;
      })}</div>
      <div className="pickers">{report.edges.map(edge => <button key={edge.id} onClick={() => choose("edge", edge.id)}>
        {report.nodes.find(n => n.id === edge.source)?.label} → {report.nodes.find(n => n.id === edge.target)?.label} · {statuses[edge.status]}
      </button>)}</div>
    </details>
    <details className="drawio-source no-print"><summary>그림 도구와 원본</summary>
      <p className="small">Next AI Draw.io의 XML 검증 모듈과 포함된 draw.io 편집기를 사용합니다. 첫 화면의 SVG와 근거 연결은 보고서의 데이터에서 생성합니다. 전체 AI 채팅 앱을 배포한 것은 아닙니다.</p>
      <a href={`${import.meta.env.BASE_URL}NEXT-AI-DRAWIO-LICENSE`} target="_blank" rel="noopener">Apache-2.0 라이선스</a>
    </details>
    {editing && <dialog ref={dialog} className="drawio-dialog no-print" onClose={() => setEditing(false)}>
      <div className="drawio-dialog-bar"><span>그림 편집 · 변경은 보고서 JSON에 반영되지 않습니다.</span>
        <button onClick={() => download(filename + "-edited.drawio", edited.current, "application/xml")}>수정본 저장</button>
        <button onClick={() => dialog.current.close()}>닫기</button>
      </div>
      <iframe ref={frame} title="Draw.io 그림 편집기"
        src={`${import.meta.env.BASE_URL}drawio/index.html?embed=1&proto=json&ui=min&noSaveBtn=1&noExitBtn=1&offline=1&lang=ko`}
        sandbox="allow-scripts allow-same-origin allow-downloads" />
    </dialog>}
  </>;
}
