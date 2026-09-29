const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const esbuild = require("esbuild");

async function load(entry) {
  const built = await esbuild.build({
    entryPoints: [path.join(__dirname, entry)],
    bundle: true,
    format: "cjs",
    platform: "node",
    write: false,
  });
  const module = { exports: {} };

  new Function("module", "exports", built.outputFiles[0].text)(module, module.exports);

  return module.exports;
}

const modules = Promise.all([
  load("marketplace.ts"),
  load("publishedDashboard.ts"),
  load("../document/exampleDashboardDocument.ts"),
]);

function item(id, type) {
  return { id, name: `${type} ${id}`, typeId: type === "dashboard" ? 1 : 3, type };
}

function download(url, metadata) {
  return new Response(JSON.stringify({ downloadUrl: url, metadata }), {
    headers: { "Content-Type": "application/json" },
  });
}

test("published bytes use Java's POST download then GET URL contract", async () => {
  const [{ MarketplaceClient }] = await modules;
  const requests = [];
  const client = new MarketplaceClient({
    fetcher: async (url, init) => {
      requests.push({ url, init });

      return requests.length === 1
        ? download("asset/item-7.json", item(7, "dashboard"))
        : new Response("{\"assetKind\":\"dashboard\"}");
    },
  });
  const controller = new AbortController();
  const result = await client.downloadItem(7, controller.signal);

  assert.equal(result.metadata.id, 7);
  assert.equal(await result.content.text(), '{"assetKind":"dashboard"}');
  assert.equal(requests[0].url, "/operator_display/marketplace/items/7/download");
  assert.equal(requests[0].init.method, "POST");
  assert.equal(requests[1].url, "http://localhost/operator_display/asset/item-7.json");
  assert.equal(requests[1].init.method, undefined);
  assert.ok(requests.every(({ init }) =>
    init.credentials === "same-origin" && init.signal === controller.signal,
  ));
});

test("Java development asset URL uses the local Vite proxy while external storage stays intact", async () => {
  const [{ MarketplaceClient }] = await modules;
  const previousWindow = globalThis.window;

  globalThis.window = { location: { href: "http://127.0.0.1:3004/view?itemId=7" } };

  try {
    for (const [pageUrl, downloadUrl, expected] of [
      [
        "http://127.0.0.1:3004/view?itemId=7",
        "http://localhost:8080/operator_display/asset/item-7.json?token=local",
        "http://127.0.0.1:3004/operator_display/asset/item-7.json?token=local",
      ],
      [
        "http://127.0.0.1:3004/view?itemId=7",
        "https://storage.example.test/presigned/item-7.json?token=remote",
        "https://storage.example.test/presigned/item-7.json?token=remote",
      ],
      [
        "https://display.example.test/view?itemId=7",
        "http://localhost:8080/operator_display/asset/item-7.json",
        "http://localhost:8080/operator_display/asset/item-7.json",
      ],
    ]) {
      globalThis.window.location.href = pageUrl;
      const requests = [];
      const client = new MarketplaceClient({
        fetcher: async (url, init) => {
          requests.push({ url, init });

          return requests.length === 1
            ? download(downloadUrl, item(7, "dashboard"))
            : new Response("{}", { status: 200 });
        },
      });

      await client.downloadItem(7);
      assert.equal(requests[1].url, expected);
      assert.equal(requests[1].init.credentials, "same-origin");
    }
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("download rejects malformed metadata, unsafe URLs, and byte-fetch errors", async () => {
  const [{ MarketplaceClient, MarketplaceHttpError, MarketplaceResponseError }] = await modules;
  const wrongItem = new MarketplaceClient({ fetcher: async () =>
    download("/asset/item-7.json", item(8, "dashboard")) });
  const unsafeUrl = new MarketplaceClient({ fetcher: async () =>
    download("javascript:alert(1)", item(7, "dashboard")) });
  let calls = 0;
  const missingBytes = new MarketplaceClient({ fetcher: async () => {
    calls++;

    return calls === 1
      ? download("https://storage.example.test/item-7.json", item(7, "dashboard"))
      : new Response("Missing file", { status: 404 });
  } });

  await assert.rejects(wrongItem.downloadItem(7), MarketplaceResponseError);
  await assert.rejects(unsafeUrl.downloadItem(7), MarketplaceResponseError);
  await assert.rejects(missingBytes.downloadItem(7), (error) =>
    error instanceof MarketplaceHttpError && error.status === 404,
  );
  assert.equal(calls, 2);
});

test("an authorization failure on Java download stops before the byte URL request", async () => {
  const [{ MarketplaceClient, MarketplaceHttpError }] = await modules;
  const requests = [];
  const client = new MarketplaceClient({
    fetcher: async (url) => {
      requests.push(url);

      return new Response("You do not have permission to view this item.", {
        status: 403,
      });
    },
  });

  await assert.rejects(client.downloadItem(7), (error) =>
    error instanceof MarketplaceHttpError && error.status === 403,
  );
  assert.deepEqual(requests, ["/operator_display/marketplace/items/7/download"]);
});

test("repository validates dashboard type and content and leaves local drafts out", async () => {
  const [, { PublishedDashboardRepository, MarketplaceItemTypeError, MarketplaceContentError },
    { exampleDashboardDocument }] = await modules;
  const document = structuredClone(exampleDashboardDocument);
  const source = {
    downloadItem: async (id) => ({
      content: new Blob([JSON.stringify(document)]),
      metadata: item(id, "dashboard"),
      downloadUrl: "/asset/dashboard.json",
    }),
  };
  const repository = new PublishedDashboardRepository(source);
  const loaded = await repository.load(7);

  assert.deepEqual(loaded.document, document);
  assert.equal(loaded.metadata.id, 7);

  await assert.rejects(
    new PublishedDashboardRepository({
      downloadItem: async () => ({
        content: new Blob([JSON.stringify(document)]),
        metadata: item(7, "component"),
        downloadUrl: "/asset/component.json",
      }),
    }).load(7),
    MarketplaceItemTypeError,
  );
  await assert.rejects(
    new PublishedDashboardRepository({
      downloadItem: async () => ({
        content: new Blob(["not JSON"]),
        metadata: item(7, "dashboard"),
        downloadUrl: "/asset/bad.json",
      }),
    }).load(7),
    MarketplaceContentError,
  );
});

test("marketplace theme is resolved from current bytes into the display copy", async () => {
  const [, { PublishedDashboardRepository, MarketplaceItemTypeError,
    downloadReferencedThemeAsset },
    { exampleDashboardDocument }] = await modules;
  const document = structuredClone(exampleDashboardDocument);
  const inline = document.theme;

  document.theme = { kind: "marketplace", itemId: "43", revision: "snapshot-1" };
  const asset = {
    assetKind: "theme",
    schemaVersion: 1,
    name: "Dark test theme",
    properties: inline.properties,
  };
  const requested = [];
  const repository = new PublishedDashboardRepository({
    downloadItem: async (id) => {
      requested.push(id);

      return {
        content: new Blob([JSON.stringify(id === 7 ? document : asset)]),
        metadata: item(id, id === 7 ? "dashboard" : "theme"),
        downloadUrl: `/asset/${id}.json`,
      };
    },
  });
  const result = await repository.load(7);

  assert.deepEqual(requested, [7, 43]);
  assert.equal(result.document.theme.kind, "inline");
  assert.equal(result.document.theme.name, "Dark test theme");
  assert.equal(document.theme.kind, "marketplace");

  const assetOnly = await downloadReferencedThemeAsset(document.theme, {
    downloadItem: async (id) => ({
      content: new Blob([JSON.stringify(asset)]),
      metadata: item(id, "theme"),
      downloadUrl: `/asset/${id}.json`,
    }),
  });
  assert.deepEqual(assetOnly, asset,
    "the editor may preview the same asset without changing its saved reference");
  assert.equal(document.theme.kind, "marketplace");
  await assert.rejects(downloadReferencedThemeAsset({
    kind: "marketplace", itemId: "unsafe", revision: "1",
  }, { downloadItem: async () => { throw new Error("must not download"); } }),
  /positive safe integer/);

  await assert.rejects(
    new PublishedDashboardRepository({
      downloadItem: async (id) => ({
        content: new Blob([JSON.stringify(id === 7 ? document : asset)]),
        metadata: item(id, "dashboard"),
        downloadUrl: `/asset/${id}.json`,
      }),
    }).load(7),
    MarketplaceItemTypeError,
  );
});

test("an invalid marketplace theme package is rejected before rendering", async () => {
  const [, { PublishedDashboardRepository }, { exampleDashboardDocument }] = await modules;
  const document = structuredClone(exampleDashboardDocument);

  document.theme = { kind: "marketplace", itemId: "43", revision: "snapshot-1" };

  await assert.rejects(
    new PublishedDashboardRepository({
      downloadItem: async (id) => ({
        content: new Blob([JSON.stringify(id === 7 ? document : {
          assetKind: "theme",
          schemaVersion: 2,
          name: "Unsupported",
          properties: {},
        })]),
        metadata: item(id, id === 7 ? "dashboard" : "theme"),
        downloadUrl: `/asset/${id}.json`,
      }),
    }).load(7),
    { name: "ThemeAssetValidationError" },
  );
});
