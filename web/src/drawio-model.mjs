import dagre from "@dagrejs/dagre";
import { statuses } from "./model.mjs";

export function labelLines(label, limit = 18) {
  const lines = [];
  for (const paragraph of label.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && Array.from(line + " " + word).length > limit) {
        lines.push(line); line = "";
      }
      if (line) { line += " " + word; continue; }
      const letters = Array.from(word);
      while (letters.length > limit) lines.push(letters.splice(0, limit).join(""));
      line = letters.join("");
    }
    lines.push(line);
  }
  return lines;
}

export function diagramLayout(report) {
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({ rankdir: "TB", nodesep: 36, ranksep: 48, marginx: 28, marginy: 28 });
  graph.setDefaultEdgeLabel(() => ({}));
  report.nodes.forEach(n => graph.setNode(n.id, {
    width: 248, height: Math.max(96, 54 + labelLines(n.label).length * 22),
  }));
  report.edges.forEach(e => graph.setEdge(e.source, e.target, {}, e.id));
  dagre.layout(graph);
  const width = Math.max(304, graph.graph().width || 0);
  const height = Math.max(120, graph.graph().height || 0);
  const offset = (width - (graph.graph().width || 0)) / 2;
  const nodes = report.nodes.map(n => {
    const p = graph.node(n.id);
    return { ...n, x: p.x - p.width / 2 + offset, y: p.y - p.height / 2,
      width: p.width, height: p.height, lines: labelLines(n.label) };
  });
  const edges = report.edges.map(e => ({ ...e,
    points: graph.edge({ v: e.source, w: e.target, name: e.id }).points.map(p => ({ x: p.x + offset, y: p.y })),
  }));
  return { nodes, edges, width, height,
    order: [...nodes].sort((a, b) => a.y - b.y || a.x - b.x).map(n => n.id) };
}

export function edgePath(points) {
  return points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
}

const xml = value => String(value).replace(/[&<>"'\n\r\t]/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
    "\n": "&#xa;", "\r": "&#xd;", "\t": "&#x9;" })[char]);

export function drawioXml(report, layout, palette) {
  const ids = new Map(report.nodes.map((n, i) => [n.id, `n${i}`]));
  const nodeCells = layout.nodes.map(n => {
    const value = `${n.role} · ${statuses[n.status]}\n${n.lines.join("\n")}`;
    const style = `rounded=1;whiteSpace=wrap;html=0;fontSize=16;fillColor=${palette.paper};strokeColor=${palette.border};fontColor=${palette.ink};`;
    return `<mxCell id="${ids.get(n.id)}" reportId="${xml(n.id)}" reportStatus="${xml(n.status)}" evidenceIds="${xml(JSON.stringify(n.evidence_ids))}" value="${xml(value)}" style="${style}" vertex="1" parent="1"><mxGeometry x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" as="geometry"/></mxCell>`;
  });
  const edgeCells = layout.edges.map((e, i) => {
    const start = e.points[0], end = e.points.at(-1);
    const source = layout.nodes.find(n => n.id === e.source), target = layout.nodes.find(n => n.id === e.target);
    const style = `edgeStyle=orthogonalEdgeStyle;html=0;endArrow=block;strokeColor=${e.status === "verified" ? palette.green : palette.muted};dashed=${e.status === "verified" ? 0 : 1};exitX=${(start.x - source.x) / source.width};exitY=${(start.y - source.y) / source.height};entryX=${(end.x - target.x) / target.width};entryY=${(end.y - target.y) / target.height};`;
    const points = e.points.slice(1, -1).map(p => `<mxPoint x="${p.x}" y="${p.y}"/>`).join("");
    return `<mxCell id="e${i}" reportId="${xml(e.id)}" reportStatus="${xml(e.status)}" evidenceIds="${xml(JSON.stringify(e.evidence_ids))}" value="${xml(statuses[e.status])}" style="${style}" edge="1" parent="1" source="${ids.get(e.source)}" target="${ids.get(e.target)}"><mxGeometry relative="1" as="geometry"><Array as="points">${points}</Array></mxGeometry></mxCell>`;
  });
  return `<mxfile host="app.diagrams.net"><diagram name="${xml(report.meta.title)}"><mxGraphModel pageWidth="${layout.width}" pageHeight="${layout.height}"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${nodeCells.join("")}${edgeCells.join("")}</root></mxGraphModel></diagram></mxfile>`;
}
