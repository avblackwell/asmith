/* Run with: node scripts/editor-bridge.contract.test.cjs */
const assert = require("node:assert/strict");
const path = require("node:path");
const { createRequire } = require("node:module");

const clientRoot = path.resolve(__dirname, "../../app/client");
const fromClient = createRequire(path.join(clientRoot, "package.json"));
const esbuild = fromClient("esbuild");

async function loadPackage(entry) {
  const build = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: "cjs",
    platform: "node",
    write: false,
  });
  const loaded = { exports: {} };

  new Function("module", "exports", build.outputFiles[0].text)(
    loaded,
    loaded.exports,
  );

  return loaded.exports;
}

async function main() {
  const bridgePackage = await loadPackage(
    path.join(__dirname, "../src/editor-bridge/EditorBridge.ts"),
  );
  const documentPackage = await loadPackage(
    path.join(__dirname, "../src/document/index.ts"),
  );

  const originalFetch = async (input) => ({ ok: true, url: String(input) });
  class MockXmlHttpRequest {
    open() {}
  }
  class MockWebSocket {}
  class MockEventSource {}

  global.Request = class Request {
    constructor(url) {
      this.url = url;
    }
  };
  global.window = {
    location: { href: "http://example.test/dashboard" },
    fetch: originalFetch,
    WebSocket: MockWebSocket,
    EventSource: MockEventSource,
  };
  global.XMLHttpRequest = MockXmlHttpRequest;
  Object.defineProperty(global, "navigator", {
    configurable: true,
    value: { sendBeacon: () => true },
  });

  let loaderSawGuard = false;
  let disposed = false;
  let nativeNotify;
  const document = documentPackage.createBlankDashboardDocument(
    "00000000-0000-4000-8000-000000000001",
  );
  const options = {
    async loadRuntime() {
      await assert.rejects(window.fetch("/api/v1/users/me"), /disabled/);
      assert.equal((await window.fetch("/operator_display/system/userInfo")).ok, true);
      assert.throws(
        () => new XMLHttpRequest().open("GET", "/api/v1/applications"),
        /disabled/,
      );
      assert.throws(() => new window.WebSocket("/rts"), /disabled/);
      assert.throws(() => new window.EventSource("/v1/events"), /disabled/);
      assert.throws(() => navigator.sendBeacon("/api/v1/telemetry"), /disabled/);
      loaderSawGuard = true;

      return {
        async mount() {
          return {
            async replaceDocument() {},
            async snapshot() {
              return document;
            },
            subscribe(listener) {
              nativeNotify = listener;
              return () => {};
            },
            async dispose() {
              disposed = true;
            },
          };
        },
      };
    },
  };
  const request = {
    document,
    identity: { deploymentId: "deployment", accountId: "11" },
    itemId: null,
    mode: "edit",
  };
  await assert.rejects(
    bridgePackage.mountEditorBridge(
      {},
      { ...request, document: { assetKind: "dashboard" } },
      options,
    ),
    /documentId|schemaVersion|name/,
  );
  const bridge = await bridgePackage.mountEditorBridge({}, request, options);

  assert.equal(loaderSawGuard, true);
  assert.equal(bridge.blockedAppsmithRequests(), 5);
  assert.deepEqual(await bridge.snapshot(), document);
  let observed;
  const unsubscribe = bridge.subscribe((next) => {
    observed = next;
  });
  nativeNotify(document);
  assert.deepEqual(observed, document);
  assert.throws(() => nativeNotify({ assetKind: "dashboard" }), /schemaVersion/);
  unsubscribe();
  await assert.rejects(
    bridgePackage.mountEditorBridge({}, request, options),
    /already mounted/,
  );
  await bridge.dispose();
  assert.equal(disposed, true);
  assert.equal(window.fetch, originalFetch);
  assert.equal(window.WebSocket, MockWebSocket);
  assert.equal(window.EventSource, MockEventSource);
  await assert.rejects(bridge.snapshot(), /disposed/);

  process.stdout.write("Editor bridge lifecycle and request guard passed\n");
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
