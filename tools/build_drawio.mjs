// Prepare the real Next AI Draw.io package, validated XML and native editor.
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { diagramLayout, drawioXml } from "../web/src/drawio-model.mjs";

const version = "0.4.1", cache = resolve(".cache/next-ai-drawio-" + version);
const pkg = process.env.DRAWIO_PACKAGE_DIR || resolve(cache, "node_modules/@next-ai-drawio/mcp-server");
if (!existsSync(resolve(pkg, "dist/new-diagram.js"))) {
  if (process.env.DRAWIO_PACKAGE_DIR) throw Error("DRAWIO_PACKAGE_DIR is missing the Next AI Draw.io package");
  mkdirSync(cache, { recursive: true });
  execFileSync("npm", ["install", "--prefix", cache, "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", `@next-ai-drawio/mcp-server@${version}`], { stdio: "inherit" });
}
if (JSON.parse(readFileSync(resolve(pkg, "package.json"))).version !== version)
  throw Error("Unexpected Next AI Draw.io package version");
const { installDomPolyfill } = await import(pathToFileURL(resolve(pkg, "dist/dom.js")));
const { prepareNewDiagram } = await import(pathToFileURL(resolve(pkg, "dist/new-diagram.js")));
installDomPolyfill();
const tokens = readFileSync("skills/investigate-game-incident/assets/report-tokens.css", "utf8");
const palette = Object.fromEntries(["paper", "border", "ink", "green", "muted"].map(key =>
  [key, tokens.match(new RegExp(`--${key}:\\s*([^;]+);`))[1]]));
const catalog = JSON.parse(readFileSync("docs/cases/catalog.json"));
const cases = Array.isArray(catalog) ? catalog : catalog.cases;
mkdirSync("site-dist/diagrams", { recursive: true });
for (const entry of cases) {
  const slug = entry.slug || entry.id;
  const report = JSON.parse(readFileSync(`docs/cases/${slug}/incident.json`));
  const result = prepareNewDiagram(drawioXml(report, diagramLayout(report), palette));
  if (!result.ok) throw Error(`${slug}: ${result.error}`);
  // The normalized XML must retain the report's IDs and evidence associations.
  const doc = new DOMParser().parseFromString(result.xml, "text/xml");
  const cells = [...doc.querySelectorAll("mxCell[reportId]")];
  if (cells.length !== report.nodes.length + report.edges.length) throw Error("Diagram records were lost");
  for (const item of [...report.nodes, ...report.edges]) {
    const cell = cells.find(c => c.getAttribute("reportId") === item.id);
    if (!cell || cell.getAttribute("reportStatus") !== item.status ||
      cell.getAttribute("evidenceIds") !== JSON.stringify(item.evidence_ids)) throw Error("Diagram evidence or status drift: " + item.id);
  }
  writeFileSync(`site-dist/diagrams/${slug}.drawio`, result.xml);
  console.log(`Validated ${slug} with Next AI Draw.io ${version}`);
}
cpSync(resolve(pkg, "dist/drawio"), "site-dist/drawio", { recursive: true });
cpSync("third-party/NEXT-AI-DRAWIO-LICENSE", "site-dist/NEXT-AI-DRAWIO-LICENSE");
cpSync("third-party/EXPLAIN-VISUALLY-LICENSE", "site-dist/EXPLAIN-VISUALLY-LICENSE");
writeFileSync("site-dist/diagrams/manifest.json", JSON.stringify({ tool: "@next-ai-drawio/mcp-server", version,
  files: cases.map(entry => (entry.slug || entry.id) + ".drawio") }, null, 2));
