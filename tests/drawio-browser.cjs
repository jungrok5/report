const fs = require("fs"), path = require("path"), assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { diagramLayout } = require("../web/src/drawio-model.mjs");
const root = path.resolve(__dirname, "../site-dist"), out = path.resolve(__dirname, "../test-results/drawio");
(async () => {
  const options = { headless: true };
  if (process.env.INCIDENT_CHROMIUM_PATH) {
    options.executablePath = process.env.INCIDENT_CHROMIUM_PATH;
    options.args = ["--no-sandbox", "--no-zygote", "--single-process", "--disable-dev-shm-usage"];
  }
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(options), page = await browser.newPage({ acceptDownloads: true });
  const errors = [], external = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== "https://jungrok5.github.io") { external.push(url.origin); return route.abort(); }
    const relative = decodeURIComponent(url.pathname.replace(/^\/report\//, "")) || "index.html";
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: "not found" });
    const type = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" }[path.extname(file)] || "application/octet-stream";
    await route.fulfill({ body: fs.readFileSync(file), contentType: type });
  });
  await page.goto("https://jungrok5.github.io/report/");
  await page.locator("h1").waitFor();
  for (const slug of ["restart", "db-lock", "client-retry"]) {
    const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../docs/cases", slug, "incident.json")));
    await page.getByLabel("예시 보고서 선택").selectOption(slug);
    await page.locator("h1").filter({ hasText: fixture.meta.title }).waitFor();
    await page.getByRole("tab", { name: "인과관계", exact: true }).click();
    await page.locator(".drawio-node").first().waitFor();
    const layout = diagramLayout(fixture);
    assert.equal(await page.locator(".drawio-stage svg").getAttribute("viewBox"), `0 0 ${layout.width} ${layout.height}`, "Built viewer does not match source layout");
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: ".drawio 저장", exact: true }).click();
    const file = await pending, xml = fs.readFileSync(await file.path(), "utf8");
    const records = await page.evaluate(markup => {
      const doc = new DOMParser().parseFromString(markup, "application/xml");
      if (doc.querySelector("parsererror")) throw Error("Malformed Draw.io XML");
      return [...doc.querySelectorAll("mxCell[reportId]")].map(cell => ({
        id: cell.getAttribute("reportId"), status: cell.getAttribute("reportStatus"),
        evidence: JSON.parse(cell.getAttribute("evidenceIds")),
      }));
    }, xml);
    assert.deepEqual(records, [...fixture.nodes, ...fixture.edges].map(item => ({ id: item.id, status: item.status, evidence: item.evidence_ids })));
    assert.equal(await page.locator(".drawio-node").count(), fixture.nodes.length);
    assert.equal(await page.locator(".drawio-edge").count(), fixture.edges.length);
    for (const scheme of ["light", "dark"]) for (const width of [375, 1440]) {
      await page.emulateMedia({ colorScheme: scheme });
      const toggle = page.getByRole("button", {name:"어두운 화면",exact:true});
      if (await toggle.getAttribute("aria-pressed") !== String(scheme === "dark")) await toggle.click();
      await page.setViewportSize({ width, height: 1100 });
      await page.getByRole("button", { name: "전체보기", exact: true }).click();
      await page.locator("#panel-cause").screenshot({ path: path.join(out, `${slug}-${scheme}-${width}.png`) });
    }
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.getByRole("button", { name: "그림 편집", exact: true }).click();
    const editor = page.frameLocator('iframe[title="Draw.io 그림 편집기"]');
    await editor.locator(".geDiagramContainer svg").waitFor({ timeout: 30000 });
    const text = (await editor.locator(".geDiagramContainer").innerText()).replace(/\s/g, "");
    for (const node of fixture.nodes) assert.ok(text.includes(node.label.replace(/\s/g, "")), "Native editor omitted " + node.id);
    await page.getByRole("button", { name: "닫기", exact: true }).click();
    await page.locator("dialog").waitFor({ state: "detached" });
    assert.equal(await page.locator("dialog").count(), 0);
    console.log(`PASS ${slug}: original IDs/status/evidence in XML, native editor, light/dark previews`);
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(external, [], "Diagram viewer/editor made unexpected external requests");
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
