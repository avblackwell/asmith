import { OperationsClient, OperationsHttpError } from "./OperationsClient";

const pageMeta = {
  cursor: 0,
  previousCursor: null,
  nextCursor: null,
  pageSize: 20,
  currentPage: 1,
  totalPages: 1,
  totalItems: 1,
  sorts: null,
  filters: null,
};

function jsonResponse(value: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(value),
  } as unknown as Response;
}

describe("OperationsClient Java contract", () => {
  const fetchMock = jest.fn();
  const client = new OperationsClient({
    fetcher: fetchMock as unknown as typeof fetch,
  });

  beforeEach(() => fetchMock.mockReset());

  it("loads site and test-cell pages with server search and sorting, without caller filters", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [{ oid: 4, name: "West" }], meta: pageMeta }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: 17,
            name: "TC 17",
            site: { oid: 4, name: "West" },
            state: { state: "running", lastSeen: 1730000000000 },
          },
        ],
        meta: pageMeta,
      }),
    );

    await expect(
      client.listSites({
        search: "West",
        cursor: 0,
        limit: 20,
        sort: { field: "name", descending: false },
      }),
    ).resolves.toMatchObject({ data: [{ oid: 4 }] });
    await expect(
      client.listTestCells({
        search: "TC",
        sort: { field: "cell", descending: true },
      }),
    ).resolves.toMatchObject({ data: [{ id: 17 }] });

    const siteUrl = new URL(fetchMock.mock.calls[0][0], "http://localhost");

    expect(siteUrl.pathname).toBe("/operator_display/system/sites");
    expect(siteUrl.searchParams.get("search")).toBe("West");
    expect(siteUrl.searchParams.get("sort")).toBe("name");
    expect(siteUrl.searchParams.get("sortValue")).toBe("false");
    expect(siteUrl.searchParams.has("filter")).toBe(false);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      credentials: "same-origin",
    });
    const cellsUrl = new URL(fetchMock.mock.calls[1][0], "http://localhost");

    expect(cellsUrl.pathname).toBe("/operator_display/system/testcells");
    expect(cellsUrl.searchParams.get("sort")).toBe("cell");
    expect(cellsUrl.searchParams.has("filter")).toBe(false);
  });

  it("uses site OID and test-cell software ID in detail paths", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ oid: 4, name: "West" }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 17,
        name: "TC 17",
        site: { oid: 4, name: "West" },
        state: null,
      }),
    );
    await client.getSite(4);
    await client.getTestCell(17);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/operator_display/system/sites/4",
      "/operator_display/system/testcells/17",
    ]);
  });

  it("loads the variable catalog and available status names from their distinct routes", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        universalVariables: [
          {
            name: "speed",
            description: null,
            unit: "rpm",
            status: "active",
            source: "system",
          },
        ],
        units: [{ name: "rpm", unitGroup: "rotation", source: "system" }],
        unitGroups: [{ name: "rotation", source: "system" }],
      }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ statuses: ["active", "inactive"] }),
    );
    expect(
      (await client.getUniversalVariableCatalog()).universalVariables[0].name,
    ).toBe("speed");
    await expect(client.getUniversalVariableStatuses()).resolves.toEqual([
      "active",
      "inactive",
    ]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/operator_display/system/universal-variable-catalog",
      "/operator_display/system/universal-variable-statuses",
    ]);
  });

  it("sends only the existing create and status payloads", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204 } as Response);
    await client.createUniversalVariable({
      name: "speed",
      description: "Shaft speed",
      unit: "rpm",
    });
    await client.updateUniversalVariableStatus("speed", "inactive");
    const [createUrl, createInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    const [statusUrl, statusInit] = fetchMock.mock.calls[1] as [
      string,
      RequestInit,
    ];

    expect(createUrl).toBe("/operator_display/system/universal-variable");
    expect(createInit.method).toBe("POST");
    expect(JSON.parse(createInit.body as string)).toEqual({
      name: "speed",
      description: "Shaft speed",
      unit: "rpm",
    });
    expect(statusUrl).toBe(
      "/operator_display/system/universal-variable/speed/status",
    );
    expect(statusInit.method).toBe("PUT");
    expect(JSON.parse(statusInit.body as string)).toEqual({
      status: "inactive",
    });
  });

  it("keeps permission failures distinct and rejects unsupported sort keys", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 } as Response);
    await expect(client.getSite(4)).rejects.toBeInstanceOf(OperationsHttpError);
    await expect(
      client.listSites({ sort: { field: "user_groups", descending: false } }),
    ).rejects.toThrow("Unsupported sort field");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
