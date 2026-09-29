/** @jest-environment node */

import { MarketplaceClient, MarketplaceHttpError } from "./MarketplaceClient";

const item = {
  id: 7,
  name: "Example dashboard",
  description: "Sample",
  typeId: 2,
  type: "dashboard",
  tags: [],
  publisherId: 4,
  publisherUsername: "editor@example.com",
  createdAt: 1000,
  updatedAt: 1000,
  publishedAt: null,
  downloadCount: 0,
  rating: null,
  ratingCount: 0,
  thumbnailUrl: "",
  previewImages: [],
};

const testCell = {
  id: 6,
  name: "BRAVO-TC-01",
  site: { oid: 2, name: "Site Bravo" },
  state: {
    lastSeen: 0,
    generation: 0,
    go_time: 0,
    rebuild_count: 0,
    state: null,
  },
};

function jsonResponse(value: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(value),
  } as unknown as Response;
}

describe("MarketplaceClient backend contract", () => {
  const fetchMock = jest.fn();
  const client = new MarketplaceClient({
    fetcher: fetchMock as unknown as typeof fetch,
  });

  beforeEach(() => fetchMock.mockReset());

  it("loads raw session user data with same-origin cookies", async () => {
    const user = {
      id: 4,
      username: "editor@example.com",
      isSystemAdmin: false,
      groupMemberships: [],
    };

    fetchMock.mockResolvedValue(jsonResponse(user));

    await expect(client.getCurrentUser()).resolves.toEqual(user);
    expect(fetchMock).toHaveBeenCalledWith(
      "/operator_display/system/userInfo",
      { credentials: "same-origin", signal: undefined },
    );
  });

  it("uses the backend page wrapper and paired query parameters", async () => {
    const page = {
      data: [item],
      meta: {
        cursor: 0,
        previousCursor: null,
        nextCursor: null,
        pageSize: 20,
        currentPage: 1,
        totalPages: 1,
        totalItems: 1,
        sorts: {},
        filters: {},
      },
    };

    fetchMock.mockResolvedValue(jsonResponse(page));

    await expect(
      client.listItems({
        cursor: 20,
        search: "pump",
        sorts: [{ field: "name", descending: true }],
        filters: [{ field: "type", value: "dashboard" }],
      }),
    ).resolves.toEqual(page);

    const url = fetchMock.mock.calls[0][0] as string;
    const query = new URL(url, "http://localhost").searchParams;

    expect(query.get("cursor")).toBe("20");
    expect(query.get("search")).toBe("pump");
    expect(query.getAll("sort")).toEqual(["name"]);
    expect(query.getAll("sortValue")).toEqual(["true"]);
    expect(query.getAll("filter")).toEqual(["type"]);
    expect(query.getAll("filterValue")).toEqual(["dashboard"]);
  });

  it("creates with JSON itemInfo and required binary parts", async () => {
    fetchMock.mockResolvedValue(jsonResponse(item));
    const content = new Blob(["{}"], { type: "application/json" });
    const thumbnail = new Blob(["image"], { type: "image/png" });

    await expect(
      client.createItem({
        name: "Example dashboard",
        description: "Sample",
        type: "dashboard",
        content,
        thumbnail,
      }),
    ).resolves.toEqual(item);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe("/operator_display/marketplace/items");
    expect(init.method).toBe("POST");
    expect(init.headers).toBeUndefined();
    const body = init.body as FormData;

    expect(JSON.parse(await (body.get("itemInfo") as Blob).text())).toEqual({
      name: "Example dashboard",
      description: "Sample",
      type: "dashboard",
    });
    expect((body.get("itemInfo") as Blob).type).toBe("application/json");
    expect(body.get("content")).toBeTruthy();
    expect(body.get("thumbnail")).toBeTruthy();
  });

  it("updates using typeId and no thumbnail part", async () => {
    fetchMock.mockResolvedValue({ ok: true } as Response);
    await client.updateItem(7, {
      name: "Revised",
      description: "Revision",
      typeId: 2,
      content: new Blob(["{}"]),
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe("/operator_display/marketplace/items/7");
    expect(init.method).toBe("PUT");
    const body = init.body as FormData;

    expect(JSON.parse(await (body.get("itemInfo") as Blob).text())).toEqual({
      name: "Revised",
      description: "Revision",
      typeId: 2,
    });
    expect(body.get("content")).toBeTruthy();
    expect(body.get("thumbnail")).toBeNull();
  });

  it("sends media, preview-index order, and tag changes to registered item routes", async () => {
    fetchMock.mockResolvedValue({ ok: true } as Response);
    const image = new Blob(["image"], { type: "image/png" });

    await client.updateThumbnail(7, image);
    await client.addPreview(7, image);
    await client.reorderPreviews(7, [1, 0]);
    await client.deletePreview(7, 0);
    await client.assignTag(7, 3);
    await client.removeTag(7, 3);

    const requests = fetchMock.mock.calls as Array<[string, RequestInit]>;

    expect(requests.map(([url, init]) => [init.method, url])).toEqual([
      ["PUT", "/operator_display/marketplace/items/7/thumbnail"],
      ["POST", "/operator_display/marketplace/items/7/previews"],
      ["PUT", "/operator_display/marketplace/items/7/previews"],
      ["DELETE", "/operator_display/marketplace/items/7/previews/0"],
      ["POST", "/operator_display/marketplace/items/7/tags/3"],
      ["DELETE", "/operator_display/marketplace/items/7/tags/3"],
    ]);
    expect((requests[0][1].body as FormData).get("thumbnail")).toBeTruthy();
    expect((requests[1][1].body as FormData).get("preview")).toBeTruthy();
    expect(requests[2][1].body).toBe('{"order":[1,0]}');
    expect(requests[2][1].headers).toEqual({
      "Content-Type": "application/json",
    });
  });

  it("rejects preview IDs passed as indices before sending", async () => {
    await expect(client.reorderPreviews(7, [2, 2])).rejects.toThrow(
      "unique nonnegative indices",
    );
    await expect(client.reorderPreviews(7, [-1, 0])).rejects.toThrow(
      "unique nonnegative indices",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts for a download URL, then fetches opaque content", async () => {
    const content = new Blob(["asset bytes"]);

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          downloadUrl: "https://storage.example/item-7.json",
          metadata: item,
        }),
      )
      .mockResolvedValueOnce({
        ok: true,
        blob: jest.fn().mockResolvedValue(content),
      } as unknown as Response);

    await expect(client.downloadItem(7)).resolves.toEqual({
      downloadUrl: "https://storage.example/item-7.json",
      metadata: item,
      content,
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/operator_display/marketplace/items/7/download",
    );
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://storage.example/item-7.json",
    );
    expect(fetchMock.mock.calls[1][1].credentials).toBe("same-origin");
  });

  it("exposes plain text service errors and status", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: jest.fn().mockResolvedValue("You do not have permission"),
    } as unknown as Response);

    await expect(client.getItem(7)).rejects.toEqual(
      new MarketplaceHttpError(
        403,
        "/operator_display/marketplace/items/7",
        "You do not have permission",
      ),
    );
  });

  it("discovers authorized test cells through the Java page wrapper", async () => {
    const page = {
      data: [testCell],
      meta: {
        cursor: 0,
        previousCursor: null,
        nextCursor: null,
        pageSize: 20,
        currentPage: 1,
        totalPages: 1,
        totalItems: 1,
        sorts: {},
        filters: { visible_to_user: ["4"] },
      },
    };

    fetchMock
      .mockResolvedValueOnce(jsonResponse(page))
      .mockResolvedValueOnce(jsonResponse(testCell));

    await expect(client.listTestCells({ search: "BRAVO" })).resolves.toEqual(
      page,
    );
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/operator_display/system/testcells?search=BRAVO",
    );
    await expect(client.getTestCell(6)).resolves.toEqual(testCell);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/operator_display/system/testcells/6",
    );
  });

  it("sends a proxied GET with Accept and repeated query parameters", async () => {
    const response = jsonResponse({ value: 1 });

    fetchMock.mockResolvedValue(response);
    await expect(
      client.proxyTestCellRequest(6, {
        method: "GET",
        path: "/cyflex/variables",
        accept: "variables/json+output+v1",
        query: [
          ["id", "100"],
          ["id", "200"],
        ],
      }),
    ).resolves.toBe(response);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe(
      "/operator_display/remote/tc/6/cyflex/variables?id=100&id=200",
    );
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("same-origin");
    expect((init.headers as Headers).get("Accept")).toBe(
      "variables/json+output+v1",
    );
    expect(init.body).toBeUndefined();
  });

  it("sends a proxied POST with its exact vendor content type", async () => {
    const response = jsonResponse({ status: "accepted" });
    const body = JSON.stringify({ uuid: "run-1", variables: [] });

    fetchMock.mockResolvedValue(response);
    await client.proxyTestCellRequest(6, {
      method: "POST",
      path: "cyflex/streaming",
      contentType: "streaming/json_config+input+v1",
      body,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe("/operator_display/remote/tc/6/cyflex/streaming");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(body);
    expect((init.headers as Headers).get("Content-Type")).toBe(
      "streaming/json_config+input+v1",
    );
  });

  it("rejects ambiguous proxy paths and the query key dropped by Java", async () => {
    await expect(
      client.proxyTestCellRequest(6, { method: "GET", path: "../cyflex" }),
    ).rejects.toThrow(TypeError);
    await expect(
      client.proxyTestCellRequest(6, {
        method: "GET",
        path: "cyflex",
        query: [["url", "elsewhere"]],
      }),
    ).rejects.toThrow(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
