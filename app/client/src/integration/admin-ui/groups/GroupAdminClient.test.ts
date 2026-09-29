/** @jest-environment node */

import { MarketplaceHttpError } from "../../marketplace";
import { GroupAdminClient } from "./GroupAdminClient";

const group = {
  id: 5,
  name: "Operators",
  description: "Site operators",
  creationSource: "user",
  externalGroupId: null,
  creatorId: 1,
  creatorName: "admin",
  memberCount: 2,
  createdAt: 1,
  updatedAt: null,
  admins: [{ id: 1, username: "admin" }],
};

const member = {
  user: { id: 14, username: "operator" },
  roleId: 2,
  role: "member",
  addedBy: { id: 1, username: "admin" },
};

function response(value: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(value),
  } as unknown as Response;
}

function page(data: unknown[]) {
  return {
    data,
    meta: {
      cursor: 0,
      previousCursor: null,
      nextCursor: null,
      pageSize: 20,
      currentPage: 1,
      totalPages: 1,
      totalItems: data.length,
      sorts: null,
      filters: null,
    },
  };
}

describe("GroupAdminClient Java routes", () => {
  const fetchMock = jest.fn();
  const client = new GroupAdminClient({ fetcher: fetchMock as typeof fetch });

  beforeEach(() => fetchMock.mockReset());

  it("searches and sorts the managed group list on the server", async () => {
    fetchMock.mockResolvedValue(response(page([group])));

    await expect(
      client.listGroups({
        search: "ops",
        cursor: 20,
        limit: 20,
        sort: { field: "member_count", descending: true },
      }),
    ).resolves.toEqual(page([group]));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const query = new URL(url, "http://localhost").searchParams;

    expect(url).toContain("/operator_display/system/groups?");
    expect(query.get("search")).toBe("ops");
    expect(query.get("cursor")).toBe("20");
    expect(query.get("sort")).toBe("member_count");
    expect(query.get("sortValue")).toBe("true");
    expect(query.has("filter")).toBe(false);
    expect(init.credentials).toBe("same-origin");
  });

  it("creates an Entra-linked record without calling the placeholder checker", async () => {
    fetchMock.mockResolvedValue(response({ groupId: 7 }));

    await expect(
      client.createGroup({
        name: "Cloud operators",
        description: "",
        externalGroupId: "some-entra-object-id",
      }),
    ).resolves.toBe(7);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe("/operator_display/system/groups");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({
      name: "Cloud operators",
      description: "",
      externalGroupId: "some-entra-object-id",
    });
  });

  it("uses internal user IDs for member add, role update, and removal", async () => {
    fetchMock.mockResolvedValue(response(page([member])));
    await expect(
      client.listMembers(5, { search: "operator" }),
    ).resolves.toEqual(page([member]));
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/operator_display/system/groups/5/members?search=operator",
    );

    fetchMock.mockResolvedValue({ ok: true, status: 204 } as Response);
    await client.addMember(5, 14, "ADMIN");
    await client.updateMemberRole(5, 14, "MEMBER");
    await client.removeMember(5, 14);

    expect(
      fetchMock.mock.calls.slice(1).map(([url, init]) => [url, init.method]),
    ).toEqual([
      ["/operator_display/system/groups/5/members", "POST"],
      ["/operator_display/system/groups/5/members/14", "PUT"],
      ["/operator_display/system/groups/5/members/14", "DELETE"],
    ]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      userId: 14,
      role: "ADMIN",
    });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      role: "MEMBER",
    });
  });

  it("surfaces backend authorization failures", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: jest.fn().mockResolvedValue("Forbidden"),
    } as unknown as Response);

    await expect(client.getGroup(5)).rejects.toBeInstanceOf(
      MarketplaceHttpError,
    );
  });
});
