/* Browser check for two independent read-only viewers and controlled Run data. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const esbuild = require("esbuild");
const { chromium } = require("@playwright/test");

const baseUrl = process.env.STANDALONE_URL || "http://127.0.0.1:3002";
const subject = "global.streaming.TEST.sitehash";
const brokerUrl = "ws://nats.example.test/nats";
const appsmithPath = /^\/(api|v1|rts|oauth2|login|logout|user)(?:\/|$)/;

function fieldPosition(bytes, table, slot) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vtable = table - view.getInt32(table, true);

  return table + view.getUint16(vtable + slot, true);
}

function indirect(bytes, position) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  return position + view.getUint32(position, true);
}

function frameForExampleDashboard(value = -0.5, timestamp = 1235.5) {
  const frame = Buffer.from(
    readFileSync(
      join(
        __dirname,
        "../src/integration/cyflex/decoder/fixtures/variables-v2-sample.bin",
      ),
    ),
  );
  const root = frame.readUInt32LE(0);
  const variables = indirect(frame, fieldPosition(frame, root, 8));
  const variable = indirect(frame, variables + 4);
  const chunks = indirect(frame, fieldPosition(frame, variable, 12));
  const secondChunk = indirect(frame, chunks + 8);
  const doubleValue = indirect(frame, fieldPosition(frame, secondChunk, 6));

  // The fixture's unit code is -17. The example dashboard binds unit 16.
  frame.writeInt32LE(16, fieldPosition(frame, variable, 8));
  frame.writeDoubleLE(value, doubleValue);
  frame.writeDoubleLE(timestamp, fieldPosition(frame, secondChunk, 8));

  return frame;
}

function pageOf(data) {
  return {
    data,
    meta: {
      cursor: 0,
      previousCursor: null,
      nextCursor: null,
      pageSize: 24,
      currentPage: 1,
      totalPages: 1,
      totalItems: data.length,
      sorts: null,
      filters: null,
    },
  };
}

async function loadDocument() {
  const bundle = await esbuild.build({
    stdin: {
      contents:
        'export { exampleDashboardDocument } from "./src/integration/document/exampleDashboardDocument";',
      resolveDir: process.cwd(),
      sourcefile: "workspace-viewer-verification-entry.ts",
      loader: "ts",
    },
    bundle: true,
    format: "cjs",
    platform: "node",
    write: false,
  });
  const localModule = { exports: {} };

  new Function("module", "exports", bundle.outputFiles[0].text)(
    localModule,
    localModule.exports,
  );

  return localModule.exports.exampleDashboardDocument;
}

async function readDraftRecords(page) {
  return page.evaluate(async () => {
    const databases = await indexedDB.databases();

    if (!databases.some(({ name }) => name === "operator-display-drafts")) {
      return [];
    }

    return new Promise((resolve, reject) => {
      const opened = indexedDB.open("operator-display-drafts", 1);

      opened.onerror = () => reject(opened.error);
      opened.onsuccess = () => {
        const db = opened.result;
        const transaction = db.transaction("drafts", "readonly");
        const requested = transaction.objectStore("drafts").getAll();

        requested.onerror = () => reject(requested.error);
        requested.onsuccess = () => {
          db.close();
          resolve(requested.result);
        };
      };
    });
  });
}

async function waitFor(predicate, message) {
  const deadline = Date.now() + 10_000;

  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  assert.ok(predicate(), message);
}

async function main() {
  const document = await loadDocument();
  const firstPayload = frameForExampleDashboard();
  const secondPayload = frameForExampleDashboard(37.5, 1236.5);
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome",
    headless: true,
  });

  try {
    const context = await browser.newContext();
    const firstPage = await context.newPage();
    const secondPage = await context.newPage();
    const item = {
      id: 7,
      name: "Engine overview",
      description: "Shared dashboard",
      typeId: 2,
      type: "dashboard",
      tags: [],
      publisherId: 11,
      publisherUsername: "publisher@example.com",
      createdAt: 0,
      updatedAt: 0,
      publishedAt: 0,
      downloadCount: 0,
      rating: null,
      ratingCount: 0,
      thumbnailUrl: "",
      previewImages: [],
    };
    const cell = {
      id: 6,
      name: "Engine test cell",
      site: { oid: 3, name: "TEST" },
      state: null,
    };
    const pageErrors = [];
    const consoleMessages = [];
    const appsmithRequests = [];
    const unknownRequests = [];
    const dashboardWrites = [];
    const controls = [];
    const sockets = new Map();
    const replyJson = (route, body) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    async function configurePage(page, name) {
      await page.addInitScript(
        ({ brokerUrl }) => {
          window.operatorDisplayRunEnvironment = {
            async connectionForCell() {
              return {
                natsConnection: { servers: brokerUrl },
                timestampToMs: (utime) => utime * 1000,
              };
            },
          };
        },
        { brokerUrl },
      );

      await page.routeWebSocket(brokerUrl, (socket) => {
        const state = {
          socket,
          sid: null,
          closed: false,
          sentInitial: false,
          subject: null,
          pending: "",
          send(payload) {
            assert.ok(this.sid, `${name} has no NATS subscription`);
            assert.equal(this.closed, false, `${name} NATS socket is closed`);
            socket.send(
              Buffer.concat([
                Buffer.from(`MSG ${subject} ${this.sid} ${payload.length}\r\n`),
                payload,
                Buffer.from("\r\n"),
              ]),
            );
          },
        };

        sockets.set(name, state);
        socket.onClose(() => {
          state.closed = true;
        });
        socket.onMessage((message) => {
          state.pending +=
            typeof message === "string" ? message : message.toString();
          const lines = state.pending.split("\r\n");

          state.pending = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("SUB ")) {
              const parts = line.split(" ");

              state.subject = parts[1];
              state.sid = parts[parts.length - 1];
            } else if (line === "PING") {
              socket.send(Buffer.from("PONG\r\n"));

              if (state.sid && !state.sentInitial) {
                state.sentInitial = true;
                state.send(firstPayload);
              }
            }
          }
        });
        socket.send(
          Buffer.from(
            'INFO {"server_id":"mock","server_name":"mock","version":"2.10.0","proto":1,"max_payload":1048576,"client_id":1,"go":"mock"}\r\n',
          ),
        );
      });

      page.on("pageerror", (error) =>
        pageErrors.push(`${name}: ${error.message}`),
      );
      page.on("console", (message) => {
        if (message.type() === "error" || message.type() === "warning") {
          consoleMessages.push(`${name}: ${message.type()}: ${message.text()}`);
        }
      });
      page.on("request", (request) => {
        if (appsmithPath.test(new URL(request.url()).pathname)) {
          appsmithRequests.push(`${name}: ${request.url()}`);
        }
      });
      await page.route("**/operator_display/**", (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        const method = request.method();

        if (
          /^\/operator_display\/marketplace\/items(?:\/\d+)?$/.test(path) &&
          (method === "POST" || method === "PUT")
        ) {
          dashboardWrites.push(`${name}: ${method} ${path}`);

          return route.fulfill({
            status: 500,
            body: "Unexpected dashboard write",
          });
        }
        if (path === "/operator_display/system/userInfo") {
          return replyJson(route, {
            id: 11,
            username: "operator@example.com",
            isSystemAdmin: false,
            groupMemberships: [],
          });
        }
        if (
          path === "/operator_display/marketplace/items/7" &&
          method === "GET"
        ) {
          return replyJson(route, item);
        }
        if (
          path === "/operator_display/marketplace/items/7/download" &&
          method === "POST"
        ) {
          return replyJson(route, {
            downloadUrl: "/operator_display/mock-content/7",
            metadata: item,
          });
        }
        if (path === "/operator_display/mock-content/7" && method === "GET") {
          return replyJson(route, document);
        }
        if (path === "/operator_display/system/testcells" && method === "GET") {
          return replyJson(route, pageOf([cell]));
        }
        if (
          path === "/operator_display/system/testcells/6" &&
          method === "GET"
        ) {
          return replyJson(route, cell);
        }
        if (path === "/operator_display/remote/tc/6/cyflex") {
          return replyJson(route, { stream_subject: subject });
        }
        if (path === "/operator_display/remote/tc/6/cyflex/variables") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: '{"variables":[{"id":18446744073709551615,"label":"ENGINE_SPEED"}]}',
          });
        }
        if (
          path === "/operator_display/remote/tc/6/cyflex/streaming" &&
          method === "POST"
        ) {
          controls.push({
            name,
            contentType: request.headers()["content-type"],
            body: JSON.parse(request.postData()),
          });

          return replyJson(route, {});
        }
        unknownRequests.push(`${name}: ${method} ${path}`);

        return route.fulfill({ status: 500, body: "Unexpected request" });
      });
    }

    await Promise.all([
      configurePage(firstPage, "first"),
      configurePage(secondPage, "second"),
    ]);
    await Promise.all([
      firstPage.goto(`${baseUrl}/view?itemId=7`, {
        waitUntil: "domcontentloaded",
      }),
      secondPage.goto(`${baseUrl}/view?itemId=7`, {
        waitUntil: "domcontentloaded",
      }),
    ]);
    for (const [index, page] of [firstPage, secondPage].entries()) {
      const name = index === 0 ? "first" : "second";

      await page.getByRole("button", { name: "Open Run controls" }).waitFor({
        timeout: 90_000,
      });
      assert.equal(await page.getByTestId("t--standalone-save").count(), 0);
      assert.equal(await page.getByTestId("t--publish-new").count(), 0);
      assert.equal(await page.getByTestId("t--publish-replace").count(), 0);
      assert.equal(
        await page.getByRole("textbox", { name: "Title text" }).count(),
        0,
      );
      await page.getByRole("button", { name: "Open Run controls" }).click();
      await page.getByLabel("Test cell").selectOption("6");
      await page.getByRole("button", { name: "Start Run" }).click();
      try {
        await page.getByText("-1 rpm").waitFor({ timeout: 15_000 });
      } catch (error) {
        const screenshotPath = join(tmpdir(), "workspace-viewer-debug.png");

        await page.screenshot({ path: screenshotPath, fullPage: true });
        process.stderr.write(
          `${JSON.stringify({
            name,
            viewer: await page.locator(".dashboard-viewer").innerText(),
            canvas: await page
              .locator(".dashboard-viewer__canvas")
              .evaluate((element) => ({
                html: element.outerHTML.slice(0, 8000),
                text: element.innerText,
                descendants: element.querySelectorAll("*").length,
                widgetNodes:
                  element.querySelectorAll("[data-widget-id]").length,
              })),
            redux: await page.evaluate(() => {
              const state = window.store?.getState();

              return {
                stateKeys: Object.keys(state || {}),
                entityKeys: Object.keys(state?.entities || {}),
                canvasWidgetIds: Object.keys(
                  state?.entities?.canvasWidgets || {},
                ),
                appMode: state?.entities?.app?.mode,
              };
            }),
            screenshotPath,
            controls,
            sockets: [...sockets].map(([label, state]) => ({
              label,
              sid: state.sid,
              subject: state.subject,
              closed: state.closed,
            })),
            pageErrors,
            consoleMessages,
            unknownRequests,
          })}\n`,
        );
        throw error;
      }
    }

    const registrations = controls.filter(
      ({ contentType }) => contentType === "streaming/json_config+input+v1",
    );

    assert.equal(registrations.length, 2);
    assert.deepEqual(registrations.map(({ name }) => name).sort(), [
      "first",
      "second",
    ]);
    assert.notEqual(registrations[0].body.uuid, registrations[1].body.uuid);
    assert.ok(
      registrations.every(
        ({ body }) => body.variables[0].label === "ENGINE_SPEED",
      ),
    );
    assert.equal(sockets.size, 2);
    assert.ok(
      [...sockets.values()].every((state) => state.subject === subject),
    );

    await firstPage.getByRole("button", { name: "Stop Run" }).click();
    await firstPage.getByText("— rpm").waitFor();
    await waitFor(
      () => sockets.get("first")?.closed,
      "first viewer socket stayed open",
    );
    assert.equal(sockets.get("second").closed, false);
    assert.ok(
      controls.every(
        ({ contentType }) =>
          contentType === "streaming/json_config+input+v1" ||
          contentType === "streaming/json_alive+input+v1",
      ),
      "Stop issued a shared publisher stop request",
    );
    sockets.get("second").send(secondPayload);
    try {
      await secondPage.getByText("38 rpm").waitFor({ timeout: 15_000 });
    } catch (error) {
      process.stderr.write(
        `${JSON.stringify({
          firstViewer: await firstPage.locator(".dashboard-viewer").innerText(),
          secondViewer: await secondPage
            .locator(".dashboard-viewer")
            .innerText(),
          pageErrors,
          unknownRequests,
        })}\n`,
      );
      throw error;
    }
    assert.equal(await firstPage.getByText("38 rpm").count(), 0);
    assert.equal((await readDraftRecords(firstPage)).length, 0);
    assert.equal((await readDraftRecords(secondPage)).length, 0);
    assert.deepEqual(dashboardWrites, []);
    assert.deepEqual(appsmithRequests, []);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(unknownRequests, []);
    process.stdout.write("Workspace two-viewer mock-browser flow passed\n");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
