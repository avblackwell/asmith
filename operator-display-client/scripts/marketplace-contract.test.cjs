const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(
  path.resolve(__dirname, "../src/api/marketplace.ts"),
).href;

async function clientModule() {
  return import(moduleUrl);
}

function page(data) {
  return {
    data,
    meta: {
      cursor: 0,
      previousCursor: null,
      nextCursor: null,
      pageSize: 12,
      currentPage: 1,
      totalPages: 1,
      totalItems: data.length,
    },
  };
}

test("Java client sends the group_id filter and search using the existing paginator contract", async () => {
  const { MarketplaceClient } = await clientModule();
  const requests = [];
  const fetcher = async (url, init) => {
    requests.push({ url, init });

    return new Response(
      JSON.stringify(page([{ id: 17, name: "Pump", typeId: 1, type: "dashboard" }])),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  const client = new MarketplaceClient({ fetcher });
  const result = await client.listItems({
    limit: 12,
    search: "pump",
    filters: [{ field: "group_id", value: "7" }],
  });

  assert.equal(result.data[0].name, "Pump");
  assert.equal(
    requests[0].url,
    "/operator_display/marketplace/items?limit=12&search=pump&filter=group_id&filterValue=7",
  );
  assert.equal(requests[0].init.credentials, "same-origin");
});

test("Java client loads session and group pages from the correct routes", async () => {
  const { MarketplaceClient } = await clientModule();
  const requests = [];
  const fetcher = async (url) => {
    requests.push(url);
    const payload = url.endsWith("/system/userInfo")
      ? { id: 4, username: "alex", isSystemAdmin: false, groupMemberships: [] }
      : page([{ id: 7, name: "Operators" }]);

    return new Response(JSON.stringify(payload), { status: 200 });
  };
  const client = new MarketplaceClient({ fetcher });

  assert.equal((await client.getCurrentUser()).username, "alex");
  assert.equal((await client.listGroups({ limit: 100 })).data[0].name, "Operators");
  assert.deepEqual(requests, [
    "/operator_display/system/userInfo",
    "/operator_display/marketplace/groups?limit=100",
  ]);
});

test("Java client rejects malformed and unauthorized responses", async () => {
  const { MarketplaceClient, MarketplaceHttpError, MarketplaceResponseError } =
    await clientModule();
  const invalid = new MarketplaceClient({
    fetcher: async () => new Response(JSON.stringify({ data: [], meta: {} })),
  });
  const denied = new MarketplaceClient({
    fetcher: async () => new Response("No session", { status: 401 }),
  });

  await assert.rejects(invalid.listGroups(), MarketplaceResponseError);
  await assert.rejects(denied.getCurrentUser(), MarketplaceHttpError);
});

test("Java client retrieves one item and rejects invalid IDs", async () => {
  const { MarketplaceClient } = await clientModule();
  const requests = [];
  const client = new MarketplaceClient({
    fetcher: async (url, init) => {
      requests.push({ url, init });

      return new Response(JSON.stringify({
        id: 7,
        name: "Engine overview",
        typeId: 1,
        type: "dashboard",
        previewImages: [],
      }));
    },
  });

  assert.equal((await client.getItem(7)).name, "Engine overview");
  assert.equal(requests[0].url, "/operator_display/marketplace/items/7");
  assert.equal(requests[0].init.credentials, "same-origin");
  await assert.rejects(client.getItem(0), TypeError);
  await assert.rejects(client.getItem(Number.MAX_SAFE_INTEGER + 1), TypeError);
  assert.equal(requests.length, 1);
});
