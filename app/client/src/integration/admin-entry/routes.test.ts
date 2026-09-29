/** @jest-environment node */

import { adminRouteFromPath } from "./routes";

describe("admin route selection", () => {
  it.each([
    ["/admin", { kind: "overview" }],
    ["/admin/groups", { kind: "groups", view: "list" }],
    ["/admin/groups/new", { kind: "groups", view: "new" }],
    ["/admin/groups/5", { kind: "groups", view: "detail", id: 5 }],
    ["/admin/groups/5/members", { kind: "groups", view: "members", id: 5 }],
    ["/admin/users/12", { kind: "users", id: 12 }],
    ["/admin/tags", { kind: "tags" }],
    ["/admin/access", { kind: "access" }],
    ["/operations/sites/2", { kind: "sites", id: 2 }],
    ["/operations/testcells/7", { kind: "testcells", id: 7 }],
    [
      "/admin/universal-variables/Engine%20Temp",
      { kind: "universal-variables", id: "Engine Temp" },
    ],
  ])("selects %s", (path, route) => {
    expect(adminRouteFromPath(path as string)).toEqual(route);
  });

  it.each([
    "/admin/groups/0",
    "/admin/users/-1",
    "/admin/groups/1/extra",
    "/operations/sites/not-a-number",
    "/admin/universal-variables/%2Fetc",
    "/admin/universal-variables/%ZZ",
    "/admin/unknown",
  ])("rejects invalid path %s", (path) => {
    expect(() => adminRouteFromPath(path)).toThrow(TypeError);
  });
});
