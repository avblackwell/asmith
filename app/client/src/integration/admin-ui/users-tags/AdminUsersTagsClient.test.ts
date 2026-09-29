import { AdminUsersTagsClient } from "./AdminUsersTagsClient";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("AdminUsersTagsClient", () => {
  test("uses internal user routes, server pagination, and same-origin credentials", async () => {
    const fetcher = jest.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 12,
            username: "operator",
            isSystemAdmin: false,
            groupMemberships: [],
          },
        ],
        meta: {
          cursor: 20,
          previousCursor: 0,
          nextCursor: null,
          pageSize: 20,
          currentPage: 2,
          totalPages: 2,
          totalItems: 21,
          sorts: { username: true },
          filters: null,
        },
      }),
    );
    const client = new AdminUsersTagsClient({ fetcher });

    const page = await client.listUsers({
      cursor: 20,
      limit: 20,
      search: "operator",
      sorts: [{ field: "username", descending: true }],
    });

    expect(page.data[0].id).toBe(12);
    expect(fetcher).toHaveBeenCalledWith(
      "/operator_display/system/users?cursor=20&limit=20&search=operator&sort=username&sortValue=true",
      { credentials: "same-origin", signal: undefined },
    );
  });

  test("does not report a created user without a positive numeric ID", async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValue(new Response("", { status: 200 }));
    const client = new AdminUsersTagsClient({ fetcher });

    await expect(client.addUser("operator")).rejects.toThrow("created user ID");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      username: "operator",
    });
  });

  test("uses split system and marketplace tag mutation routes", async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ exists: false }))
      .mockResolvedValueOnce(jsonResponse({ id: 7 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new AdminUsersTagsClient({ fetcher });

    expect(await client.checkTagName(" Engines ")).toBe(false);
    expect(await client.createTag({ name: " Engines ", color: "blue" })).toBe(
      7,
    );
    await client.updateTag(7, { color: "red" });
    await client.deleteTag(7);

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "/operator_display/system/checkItemTagName",
      "/operator_display/system/item-tags",
      "/operator_display/marketplace/item-tags/7",
      "/operator_display/marketplace/item-tags/7",
    ]);
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ color: "red" });
    expect(fetcher.mock.calls[3][1].method).toBe("DELETE");
  });
});
