const fs = require("fs"),
  path = require("path");
const { chromium } = require("playwright");
(async () => {
  const opts = { headless: true };
  if (process.env.INCIDENT_CHROMIUM_PATH) {
    opts.executablePath = process.env.INCIDENT_CHROMIUM_PATH;
    opts.args = [
      "--no-sandbox",
      "--no-zygote",
      "--single-process",
      "--disable-dev-shm-usage",
    ];
  }
  const browser = await chromium.launch(opts),
    page = await browser.newPage({ hasTouch: true }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const url =
    process.env.INCIDENT_APP_URL || "https://jungrok5.github.io/report/";
  if (!process.env.INCIDENT_APP_URL) {
    await page.route("https://jungrok5.github.io/report/**", async (route) => {
      const request = new URL(route.request().url());
      let relative = decodeURIComponent(
        request.pathname.slice("/report/".length),
      );
      if (!relative) relative = "index.html";
      const root = path.resolve(__dirname, "../site-dist");
      const target = path.resolve(root, relative);
      if (!target.startsWith(root + path.sep)) {
        await route.abort();
        return;
      }
      try {
        const ext = path.extname(target),
          type =
            {
              ".html": "text/html",
              ".js": "text/javascript",
              ".css": "text/css",
              ".json": "application/json",
            }[ext] || "application/octet-stream";
        await route.fulfill({
          status: 200,
          contentType: type,
          body: fs.readFileSync(target),
        });
      } catch {
        await route.fulfill({ status: 404, body: "missing local fixture" });
      }
    });
  }
  await page.goto(url);
  await page.locator("h1").waitFor();
  if (process.env.INCIDENT_TEST_FONT) {
    const font = fs
      .readFileSync(process.env.INCIDENT_TEST_FONT)
      .toString("base64");
    await page.addStyleTag({
      content:
        "@font-face{font-family:TestKR;src:url(data:font/woff;base64," +
        font +
        ")}body,button,input,select,textarea,.timeline text{font-family:TestKR,system-ui!important}",
    });
    await page.evaluate(() => document.fonts.ready);
  }
  for (const width of [1100, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const slug of ["restart", "db-lock", "client-retry"]) {
      await page.getByLabel("예시 보고서 선택").selectOption(slug);
      await page
        .locator("h1")
        .filter({
          hasText:
            slug === "restart"
              ? "자동 조사"
              : slug === "db-lock"
                ? "정산"
                : "클라이언트",
        })
        .waitFor();
      await page.waitForFunction(
        () => document.querySelectorAll(".react-flow__node").length >= 4,
      );
      if ((await page.locator("[data-series]").count()) !== 3)
        throw Error("shared chart series");
      const tab = page.getByRole("tab", { name: "인과관계", exact: true });
      await tab.click();
      await page.locator(".react-flow__node").first().click();
      const edgeButton = page.locator("[data-edge]").first();
      await edgeButton.click();
      if (
        !(await page.locator("#panel-cause aside").innerText()).includes(
          "근거를 직접 확인",
        )
      )
        throw Error("edge evidence");
      const hits = await page.locator(".react-flow__node").count();
      if (hits < 4) throw Error("React Flow nodes missing");
      await page.getByRole("tab", { name: "조사 과정", exact: true }).click();
      await page.locator("[data-step]").last().click();
      if (
        !(await page.locator("#panel-investigation").innerText()).includes(
          "다음 확인",
        )
      )
        throw Error("investigation");
      await page.getByRole("tab", { name: "근거 전체", exact: true }).click();
      const details = page.locator("#panel-evidence details");
      await details.locator("summary").click();
      await page
        .getByRole("button", { name: "보존본 해시 확인", exact: true })
        .filter({ visible: true })
        .click();
      await page.getByRole("status").filter({ hasText: "해시 일치" }).waitFor();
      await page.getByRole("tab", { name: "검토 · 버전", exact: true }).click();
      const review = await page.locator("#panel-review").innerText();
      if (slug === "db-lock" && !review.includes("가상 검토자"))
        throw Error("synthetic reviewer");
      if (slug === "restart" && !review.includes("revision 2"))
        throw Error("version history");
      await tab.click();
      await page.getByLabel("모든 지표의 시각 탐색").evaluate((el) => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        ).set;
        setter.call(el, "480");
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });
      // React range interaction is also exercised with the native keyboard path.
      await page.getByLabel("모든 지표의 시각 탐색").focus();
      await page.keyboard.press("ArrowRight");
      await page.locator('[role="tooltip"]').waitFor();
      if (
        !(await page.locator('[role="tooltip"]').innerText()).includes(
          "표본 시각",
        )
      )
        throw Error("hover descriptions");
      await page.keyboard.press("Escape");
      if (width === 320) {
        const chart = await page.locator('svg.timeline').boundingBox();
        await page.touchscreen.tap(chart.x + chart.width / 2, chart.y + 120);
        await page.locator('[role="tooltip"]').waitFor();
        await page.keyboard.press('Escape');
      }
      const bounds = await page.evaluate(() => ({
        w: innerWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      if (bounds.scroll > bounds.w + 1)
        throw Error(
          "overflow " + slug + " " + width + ": " + JSON.stringify(bounds),
        );
      if (process.env.INCIDENT_SCREENSHOT_DIR) {
        await page.screenshot({
          path: path.join(
            process.env.INCIDENT_SCREENSHOT_DIR,
            `react-${slug}-${width}.png`,
          ),
          fullPage: true,
        });
      }
      console.log("PASS " + slug + " width=" + width);
    }
  }
  // Import uses the same schema, does not upload data, and must not be replaced by the default example.
  const data = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../docs/cases/client-retry/incident.json"),
    ),
  );
  data.meta.id = "INC-LOCAL-IMPORT";
  data.meta.title = "내 로컬 보고서";
  delete data.governance;
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "incident.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(data)),
    });
  await page
    .getByRole("heading", { name: "내 로컬 보고서", exact: true })
    .waitFor();
  await page.waitForTimeout(100);
  if (!(await page.locator("h1").innerText()).includes("내 로컬"))
    throw Error("local import replaced");
  const bad = structuredClone(data);
  bad.summary.evidence_ids = ["fake"];
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(bad)),
    });
  await page.getByRole("alert").waitFor();
  const versioned = fs.readFileSync(
    path.join(__dirname, "../docs/cases/client-retry/incident.json"),
  );
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "stored.json",
      mimeType: "application/json",
      buffer: versioned,
    });
  await page
    .getByRole("heading", {
      name: "클라이언트 재시도 변경 이후 로그인 지연",
      exact: true,
    })
    .waitFor();
  await page.getByRole("tab", { name: "검토 · 버전", exact: true }).click();
  await page
    .locator("#panel-review summary")
    .filter({ hasText: "검토 의견" })
    .click();
  await page.getByLabel("검토자", { exact: true }).fill("검토 예시");
  await page
    .getByLabel("근거 확인·남은 질문")
    .fill("대조 실험 자료 확인이 필요합니다.");
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "검토 초안 다운로드", exact: true })
    .click();
  const d = await downloaded;
  if (!d.suggestedFilename().endsWith("review-draft.json"))
    throw Error("review draft");
  await page.emulateMedia({ media: "print" });
  if (!(await page.locator(".print-evidence").isVisible()))
    throw Error("print evidence");
  if (errors.length) throw Error(errors.join(";"));
  await browser.close();
  console.log(
    "PASS React Flow, three cases, timeline, archived hashes, review/version, local import and print",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
