const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
let server, browser, origin;
before(async () => {
  server = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      const file = path.resolve(
        root,
        "." + (pathname === "/" ? "/index.html" : pathname),
      );
      if (
        !file.startsWith(root + path.sep) ||
        file.includes(`${path.sep}.git${path.sep}`)
      ) {
        res.writeHead(403).end();
        return;
      }
      const types = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".png": "image/png",
      };
      res.setHeader(
        "Content-Type",
        types[path.extname(file)] || "application/octet-stream",
      );
      res.end(await fs.readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
  });
});
after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});
async function open(t, url = origin) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.goto(url);
  await ready(page);
  return page;
}
async function ready(page) {
  await page.waitForFunction(() => window.sessions && !sessions.busy);
}
async function edit(page, code) {
  await page.evaluate((code) => {
    codeEditor.cm.setValue(code);
  }, code);
}

test("English interface, offline entry, split and collapsible console", async (t) => {
  const page = await open(t, pathToFileURL(path.join(root, "index.html")).href);
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  assert.equal(await page.title(), "Sketchroom — p5.js Studio");
  assert(!/\p{Script=Han}/u.test(await page.locator("body").innerText()));
  assert.equal(
    await page
      .locator(".eyebrow,header p,footer,.editor-footer,.preview-panel .hint")
      .count(),
    0,
  );
  await page.frameLocator("iframe").locator("canvas").waitFor();
  const height = (await page.locator("#workspace").boundingBox()).height;
  await page.locator("#console-toggle").click();
  assert(
    (await page.locator("#workspace").boundingBox()).height >= height + 95,
  );
  await page.evaluate(() => {
    for (let i = 0; i < 65; i++) appendMessage("message " + i);
  });
  assert.equal(await page.locator("#message-count").textContent(), "50 / 50");
  const text = await page.locator("#messages").textContent();
  assert(!text.includes("message 14\n"));
  assert(text.includes("message 64"));
  await page.reload();
  await ready(page);
  assert(await page.locator("#messages").isHidden());
  for (const width of [1120, 760, 390]) {
    await page.setViewportSize({ width, height: 900 });
    if (!(await page.locator("#sessions-menu").isHidden()))
      await page.locator("#sessions-close").click();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
});

test("bracket pairing, indentation, diagnostics and p5 globals", async (t) => {
  const page = await open(t);
  await page.locator("#live").uncheck();
  await page.evaluate(() => {
    codeEditor.setValue("");
    codeEditor.focus();
  });
  await page.keyboard.type("function draw() {");
  assert((await page.evaluate(() => codeEditor.getValue())).endsWith("{}"));
  await page.keyboard.press("Enter");
  assert(
    (await page.evaluate(() => codeEditor.getValue())).includes("{\n  \n}"),
  );
  await edit(
    page,
    "function setup(){createCanvas(560,360)}\nfunction draw(){circle(mouseX,mouseY,30)}",
  );
  await page.evaluate(() => codeEditor.cm.performLint());
  assert.equal(
    await page
      .locator(".CodeMirror-lint-mark-error,.CodeMirror-lint-mark-warning")
      .count(),
    0,
  );
  await edit(page, "function draw(){ missingName(); }");
  await page.evaluate(() => codeEditor.cm.performLint());
  assert((await page.locator(".CodeMirror-lint-mark-warning").count()) > 0);
  await edit(page, "function setup(){ let = ; }");
  await page.evaluate(() => codeEditor.cm.performLint());
  assert((await page.locator(".CodeMirror-lint-mark-error").count()) > 0);
});

test("independent sessions, refresh and explicit reset confirmation", async (t) => {
  const page = await open(t);
  const first = await page.evaluate(() => sessions.activeId);
  const code = "function setup(){createCanvas(240,180)}";
  await edit(page, code);
  await page.reload();
  await ready(page);
  assert.equal(await page.evaluate(() => codeEditor.getValue()), code);
  await page.locator("#session-new").click();
  await ready(page);
  await edit(page, "// second session");
  await page.evaluate((id) => sessions.activate(id), first);
  assert.equal(await page.evaluate(() => codeEditor.getValue()), code);
  await page.locator("#blank-template").click();
  assert(
    (await page.locator("#dialog-message").textContent()).includes(
      "cannot be undone",
    ),
  );
  await page.locator("#dialog-no").click();
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => codeEditor.getValue()), code);
  await page.locator("#blank-template").click();
  await page.locator("#dialog-yes").click();
  await page.waitForFunction(() =>
    codeEditor.getValue().includes("background(255)"),
  );
  await page.locator("#session-search").fill("does not exist");
  assert.equal(
    await page.locator(".session-empty").textContent(),
    "No matching sessions",
  );
});

test("native file handles persist, save correctly and recover from missing files", async (t) => {
  const page = await open(t);
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle("art.js", { create: true });
    const stream = await handle.createWritable();
    await stream.write("function setup(){createCanvas(200,100)}");
    await stream.close();
    await importFiles([await handle.getFile()], Promise.resolve(handle));
  });
  await edit(page, "function setup(){createCanvas(300,200)}");
  await page.locator("#save-local").click();
  await page.waitForFunction(() =>
    document.getElementById("save").textContent.endsWith(" · Saved"),
  );
  await page.reload();
  await ready(page);
  assert.equal(await page.evaluate(() => fileBinding.handle.name), "art.js");
  assert(
    (await page.evaluate(() => codeEditor.getValue())).includes("300,200"),
  );
  await page.evaluate(
    async () =>
      await (await navigator.storage.getDirectory()).removeEntry("art.js"),
  );
  await page.reload();
  await ready(page);
  await page.locator("#session-dialog").waitFor();
  assert.equal(
    await page.locator("#dialog-title").textContent(),
    "File not found",
  );
  assert(
    (await page.evaluate(() => codeEditor.getValue())).includes(
      "background(255)",
    ),
  );
});
