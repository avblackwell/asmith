/* Run from operator-display-client: node src/cyflex/contract.test.cjs */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

async function loadPackage(entry) {
  const build = await esbuild.build({
    entryPoints: [entry], bundle: true, format: "cjs", platform: "node",
    write: false, logLevel: "silent",
  });
  const loaded = { exports: {} };
  new Function("module", "exports", "require", build.outputFiles[0].text)(
    loaded, loaded.exports, require,
  );
  return loaded.exports;
}

async function proxyAndResolution() {
  const { CyflexProxyClient } = await loadPackage(path.join(__dirname, "CyflexProxyClient.ts"));
  const { listSelectedCellVariables, resolveSelectedCellVariables } = await loadPackage(
    path.join(__dirname, "resolution/index.ts"),
  );
  const { CyflexProxyControlTransport } = await loadPackage(
    path.join(__dirname, "transports/CyflexProxyControlTransport.ts"),
  );
  const { exampleDashboardDocument } = await loadPackage(
    path.resolve(__dirname, "../document/index.ts"),
  );
  const calls = [];
  const cell = { id: 7, name: "Cell 7", site: null, state: null };
  const metadata = '{"variables":[{"id":18446744073709551615,"label":"ENGINE_SPEED"}]}';
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/system/testcells?limit=24")) {
      return Response.json({
        data: [cell],
        meta: { cursor: 0, previousCursor: null, nextCursor: null,
          pageSize: 24, currentPage: 1, totalPages: 1, totalItems: 1 },
      });
    }
    if (url.endsWith("/system/testcells/7")) return Response.json(cell);
    if (url.endsWith("/remote/tc/7/cyflex/variables")) return new Response(metadata);
    if (url.endsWith("/remote/tc/7/cyflex")) {
      return Response.json({ stream_subject: "global.streaming.cell7" });
    }
    if (url.endsWith("/remote/tc/7/cyflex/streaming")) return Response.json({});
    throw new Error(`Unexpected request ${url}`);
  };
  const client = new CyflexProxyClient({ fetcher });
  const listed = await client.listTestCells({ limit: 24 });
  assert.equal(listed.data[0].id, 7);
  const discovered = await listSelectedCellVariables(client, 7);
  assert.deepEqual(discovered.variables, [{
    id: "18446744073709551615", label: "ENGINE_SPEED",
  }]);
  const resolved = await resolveSelectedCellVariables(client, 7, exampleDashboardDocument);
  assert.equal(resolved.subject, "global.streaming.cell7");
  assert.deepEqual(resolved.resolvedVariables, [{
    key: "engineSpeed", id: "18446744073709551615", label: "ENGINE_SPEED",
  }]);
  assert(calls.every(({ url, init }) =>
    url.startsWith("/operator_display/") && init.credentials === "same-origin"));
  const proxyGets = calls.filter(({ url }) => url.includes("/remote/tc/"));
  assert.deepEqual(proxyGets.map(({ url, init }) => [
    url, init.headers.get("Accept"), init.headers.has("Authorization"),
  ]), [
    ["/operator_display/remote/tc/7/cyflex/variables",
      "variables/json_all+output+v1", false],
    ["/operator_display/remote/tc/7/cyflex",
      "cyflex/json_info+output+v1", false],
    ["/operator_display/remote/tc/7/cyflex/variables",
      "variables/json_all+output+v1", false],
  ]);
  const control = new CyflexProxyControlTransport(client, 7);
  const controlResponse = await control.postStreaming({
    contentType: "streaming/json_config+input+v1",
    accept: "streaming/json_config+output+v1",
    body: '{"uuid":"viewer-1"}', signal: new AbortController().signal,
  });
  assert.equal(controlResponse.status, 200);
  const post = calls.at(-1);
  assert.equal(post.url, "/operator_display/remote/tc/7/cyflex/streaming");
  assert.equal(post.init.credentials, "same-origin");
  assert.equal(post.init.method, "POST");
  assert.equal(post.init.headers.get("Content-Type"), "streaming/json_config+input+v1");
  assert.equal(post.init.headers.get("Accept"), "streaming/json_config+output+v1");
  assert.equal(post.init.headers.has("Authorization"), false);
  assert.equal(post.init.body, '{"uuid":"viewer-1"}');
  const denied = new CyflexProxyClient({
    fetcher: async () => new Response("Forbidden", { status: 403 }),
  });
  await assert.rejects(
    denied.listTestCells(),
    (error) => error.name === "CyflexProxyHttpError" && error.status === 403,
  );
}

async function runLifecycle() {
  const { CyflexRunSession } = await loadPackage(path.join(__dirname, "session/index.ts"));
  const { exampleDashboardDocument } = await loadPackage(
    path.resolve(__dirname, "../document/index.ts"),
  );
  const requests = [];
  const subjects = [];
  let unsubscribed = 0;
  let tick;
  let cleared = 0;
  const priorInterval = global.setInterval;
  const priorClear = global.clearInterval;
  global.setInterval = (fn) => { tick = fn; return 42; };
  global.clearInterval = () => { cleared++; };
  try {
    const session = new CyflexRunSession({
      control: { postStreaming: async (request) => {
        requests.push(request);
        return { status: 200, body: "{}" };
      } },
      subscriptions: { subscribe: async (subject) => {
        subjects.push(subject);
        return { unsubscribe: () => { unsubscribed++; } };
      } },
      onFrame: () => {},
      createUuid: () => "viewer-1",
    });
    await session.start({
      document: exampleDashboardDocument,
      cellId: "7",
      subject: "global.streaming.cell7",
      resolvedVariables: [{
        key: "engineSpeed", id: "18446744073709551615", label: "ENGINE_SPEED",
      }],
    });
    assert.equal(session.status, "running");
    assert.deepEqual(subjects, ["global.streaming.cell7"]);
    assert.equal(requests[0].contentType, "streaming/json_config+input+v1");
    assert.equal(requests[0].accept, "streaming/json_config+output+v1");
    assert.deepEqual(JSON.parse(requests[0].body), {
      uuid: "viewer-1",
      variables: [{ label: "ENGINE_SPEED" }],
      watchers: [{ label: "ENGINE_SPEED", watchers: [
        { count: 1, limit_count: 0, buffer_count: 1, unit_code: 16 },
      ] }],
    });
    tick();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(requests[1].contentType, "streaming/json_alive+input+v1");
    assert.deepEqual(JSON.parse(requests[1].body), { uuid: "viewer-1" });
    await session.stop();
    assert.equal(session.status, "idle");
    assert.equal(unsubscribed, 1);
    assert.equal(cleared, 1);
    tick();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(requests.length, 2, "stopped runs send no more control traffic");
  } finally {
    global.setInterval = priorInterval;
    global.clearInterval = priorClear;
  }
}

async function binaryDecoder() {
  const { decodeCyflexV2Frame } = await loadPackage(
    path.join(__dirname, "decoder/index.ts"),
  );
  const frame = fs.readFileSync(path.join(
    __dirname, "decoder/fixtures/variables-v2-sample.bin",
  ));
  const decoded = decodeCyflexV2Frame(new Uint8Array(frame));
  assert.equal(decoded.goTime, "-9007199254740993");
  assert.equal(decoded.variables[0].id, "18446744073709551615");
  assert.equal(decoded.variables[0].unitCode, -17);
  assert.deepEqual(decoded.variables[0].chunks[0], {
    timestamp: 1234.25, value: { kind: "rvalue", value: 12.5 },
  });
}

async function directNatsSubscription() {
  const { NatsWebSocketSubscriptionTransport } = await loadPackage(
    path.join(__dirname, "transports/NatsWebSocketSubscriptionTransport.ts"),
  );
  let connectedWith;
  let subscribedTo;
  let callback;
  let closedResolve;
  let subscriptionClosedResolve;
  let unsubscribeCount = 0;
  let closeCount = 0;
  const closed = new Promise((resolve) => { closedResolve = resolve; });
  const subscriptionClosed = new Promise((resolve) => {
    subscriptionClosedResolve = resolve;
  });
  const transport = new NatsWebSocketSubscriptionTransport({
    connection: { servers: "wss://broker.example.test/nats", token: "scoped-token" },
    connect: async (options) => {
      connectedWith = options;
      return {
        subscribe: (subject, options) => {
          subscribedTo = subject;
          callback = options.callback;
          return { closed: subscriptionClosed, unsubscribe: () => {
            unsubscribeCount++;
            subscriptionClosedResolve();
          } };
        },
        status: async function* () { await closed; },
        closed: () => closed,
        flush: async () => {},
        close: async () => { closeCount++; closedResolve(); },
      };
    },
  });
  const frames = [];
  const active = await transport.subscribe("global.streaming.cell7", {
    onFrame: (frame) => frames.push(frame),
    onDisconnect: () => {},
    onReconnect: () => {},
  });
  assert.equal(connectedWith.servers, "wss://broker.example.test/nats");
  assert.equal(connectedWith.token, "scoped-token");
  assert.equal(subscribedTo, "global.streaming.cell7");
  const bytes = new Uint8Array([1, 2, 3]);
  callback(null, { data: bytes });
  assert.strictEqual(frames[0], bytes, "NATS binary payload remains unmodified");
  await active.unsubscribe();
  assert.equal(unsubscribeCount, 1);
  assert.equal(closeCount, 1);
  callback(null, { data: new Uint8Array([4]) });
  assert.equal(frames.length, 1, "stopped subscription ignores late frames");
}

async function main() {
  await proxyAndResolution();
  await runLifecycle();
  await binaryDecoder();
  await directNatsSubscription();
  console.log("Cyflex proxy, Run lifecycle, and V2 decoding contracts passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
