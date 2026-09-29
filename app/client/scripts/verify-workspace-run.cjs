/* Browser check for a workspace Run with controlled Cyflex HTTP and NATS data. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
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

function frameForExampleDashboard() {
  const frame = Buffer.from(
    readFileSync(
      join(
        __dirname,
        "../src/integration/cyflex/decoder/fixtures/variables-v2-sample.bin",
      ),
    ),
  );
  const root = frame.readUInt32LE(0);
  const vector = indirect(frame, fieldPosition(frame, root, 8));
  const variable = indirect(frame, vector + 4);

  // The compiler-built fixture uses -17; the example dashboard binds unit 16.
  frame.writeInt32LE(16, fieldPosition(frame, variable, 8));

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
      sourcefile: "workspace-run-verification-entry.ts",
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

async function main() {
  const document = await loadDocument();
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  const payload = frameForExampleDashboard();
  const controlBodies = [];
  const unknownRequests = [];
  const appsmithRequests = [];
  const pageErrors = [];
  const socketMessages = [];
  const websocketUrls = [];
  let routeConnections = 0;
  let socketClosed = false;
  let socketCloseCount = 0;
  let subscribedSubject;

  try {
    const page = await browser.newPage();
    const cell = {
      id: 6,
      name: "Engine test cell",
      site: { oid: 3, name: "TEST" },
      state: null,
    };
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
    const replyJson = (route, body) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

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
      routeConnections += 1;
      let pending = "";
      let sid;
      let published = false;

      socket.onClose(() => {
        socketClosed = true;
        socketCloseCount += 1;
      });
      socket.onMessage((message) => {
        pending += typeof message === "string" ? message : message.toString();
        const lines = pending.split("\r\n");

        pending = lines.pop() || "";

        for (const line of lines) {
          socketMessages.push(line);
          if (line.startsWith("SUB ")) {
            const parts = line.split(" ");

            subscribedSubject = parts[1];
            sid = parts[parts.length - 1];
          } else if (line === "PING") {
            socket.send(Buffer.from("PONG\r\n"));

            if (sid && !published) {
              published = true;
              const header = Buffer.from(
                `MSG ${subject} ${sid} ${payload.length}\r\n`,
              );

              socket.send(
                Buffer.concat([header, payload, Buffer.from("\r\n")]),
              );
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

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("websocket", (socket) => websocketUrls.push(socket.url()));
    page.on("request", (request) => {
      if (appsmithPath.test(new URL(request.url()).pathname)) {
        appsmithRequests.push(request.url());
      }
    });
    await page.route("**/operator_display/**", (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;

      if (path === "/operator_display/system/userInfo") {
        return replyJson(route, {
          id: 11,
          username: "operator@example.com",
          isSystemAdmin: false,
          groupMemberships: [],
        });
      }
      if (path === "/operator_display/marketplace/items/7/download") {
        return replyJson(route, {
          downloadUrl: "/operator_display/mock-content/7",
          metadata: item,
        });
      }
      if (path === "/operator_display/mock-content/7") {
        // Reuse the checked-in example document used by the editor smoke test.
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(document),
        });
      }
      if (path === "/operator_display/system/testcells") {
        return replyJson(route, pageOf([cell]));
      }
      if (path === "/operator_display/system/testcells/6") {
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
        request.method() === "POST"
      ) {
        controlBodies.push({
          contentType: request.headers()["content-type"],
          body: JSON.parse(request.postData()),
        });

        return replyJson(route, {});
      }
      unknownRequests.push(`${request.method()} ${path}`);

      return route.fulfill({ status: 500, body: "Unexpected request" });
    });

    await page.goto(`${baseUrl}/workspace?itemId=7`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("textbox", { name: "Title text" }).waitFor({
      timeout: 90_000,
    });
    await page.getByTestId("t--workbench-nav-tools").click();
    await page.getByRole("button", { name: "Open Run controls" }).click();
    await page.getByLabel("Test cell").selectOption("6");
    await page.getByRole("button", { name: "Start Run" }).click();
    try {
      await page.getByText("-1 rpm").waitFor({ timeout: 10_000 });
    } catch (error) {
      process.stderr.write(
        `${JSON.stringify({
          runPanel: await page.locator(".dashboard-run").innerText(),
          controls: controlBodies,
          socketMessages,
          websocketUrls,
          routeConnections,
          pageErrors,
          unknownRequests,
        })}\n`,
      );
      throw error;
    }

    assert.equal(subscribedSubject, subject);
    assert.equal(controlBodies.length, 1);
    assert.equal(
      controlBodies[0].contentType,
      "streaming/json_config+input+v1",
    );
    assert.equal(controlBodies[0].body.variables[0].label, "ENGINE_SPEED");

    await page.getByTestId("t--standalone-save").click();
    await page.getByRole("button", { name: "Stop Run" }).click();
    await page.getByText("— rpm").waitFor();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText("— rpm").waitFor({ timeout: 90_000 });
    await page.getByTestId("t--workbench-nav-tools").click();

    assert.equal(socketClosed, true);
    assert.equal(await page.locator(".dashboard-run").count(), 1);

    // Changing a binding invalidates the currently running projector. The
    // editor remounts RunPanel, which must stop the old lease and clear values.
    await page.getByRole("button", { name: "Open Run controls" }).click();
    await page.getByLabel("Test cell").selectOption("6");
    await page.getByRole("button", { name: "Start Run" }).click();
    await page.getByText("-1 rpm").waitFor({ timeout: 10_000 });
    assert.equal(controlBodies.length, 2);
    assert.equal(routeConnections, 2);
    const socketClosuresBeforeEdit = socketCloseCount;

    await page.getByTestId("t--canvas-artboard").getByText("-1 rpm").click();
    await page.waitForFunction(() => {
      const selected = document.querySelector(
        '[data-testid="t--binding-selected-widget-id"]',
      );

      return selected?.textContent?.trim() === "engine-speed-value";
    });
    await page.getByTestId("t--workbench-live-data-tab").click();
    await page.getByTestId("t--binding-template").fill("{value} RPM");
    await page.getByTestId("t--binding-save").click();
    await page
      .getByTestId("t--canvas-artboard")
      .getByText("— rpm")
      .waitFor({ timeout: 10_000 });
    await page.getByRole("button", { name: "Open Run controls" }).waitFor();
    assert.equal(await page.locator(".dashboard-run").count(), 1);
    assert.equal(
      await page.getByRole("button", { name: "Stop Run" }).count(),
      0,
    );
    const closureDeadline = Date.now() + 5_000;

    while (
      socketCloseCount <= socketClosuresBeforeEdit &&
      Date.now() < closureDeadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.ok(
      socketCloseCount > socketClosuresBeforeEdit,
      "Binding edit left a NATS socket open",
    );
    assert.equal(controlBodies.length, 2, "Binding edit started another Run");

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(appsmithRequests, []);
    assert.deepEqual(unknownRequests, []);
    process.stdout.write("Workspace Run mock-browser flow passed\n");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
