export type AdminRoute =
  | { kind: "overview" }
  | { kind: "groups"; view: "list" | "new" | "detail" | "members"; id?: number }
  | { kind: "users"; id?: number }
  | { kind: "tags" }
  | { kind: "sites"; id?: number }
  | { kind: "testcells"; id?: number }
  | { kind: "universal-variables"; id?: string }
  | { kind: "access" };

function positiveId(raw: string, label: string): number {
  if (!/^[1-9]\d*$/.test(raw))
    throw new TypeError(`${label} must be a positive integer`);

  const id = Number(raw);

  if (!Number.isSafeInteger(id)) throw new TypeError(`${label} is too large`);

  return id;
}

export function adminRouteFromPath(pathname: string): AdminRoute {
  const path = pathname.replace(/\/$/, "") || "/";

  if (path === "/admin") return { kind: "overview" };

  if (path === "/admin/groups") return { kind: "groups", view: "list" };

  if (path === "/admin/groups/new") return { kind: "groups", view: "new" };

  if (path === "/admin/users") return { kind: "users" };

  if (path === "/admin/tags") return { kind: "tags" };

  if (path === "/admin/access") return { kind: "access" };

  if (path === "/admin/universal-variables")
    return { kind: "universal-variables" };

  if (path === "/operations/sites") return { kind: "sites" };

  if (path === "/operations/testcells") return { kind: "testcells" };

  let match = /^\/admin\/groups\/([^/]+)(?:\/(members))?$/.exec(path);

  if (match) {
    return {
      kind: "groups",
      view: match[2] === "members" ? "members" : "detail",
      id: positiveId(match[1], "Group ID"),
    };
  }

  match = /^\/admin\/users\/([^/]+)$/.exec(path);

  if (match) return { kind: "users", id: positiveId(match[1], "User ID") };

  match = /^\/operations\/sites\/([^/]+)$/.exec(path);

  if (match) return { kind: "sites", id: positiveId(match[1], "Site OID") };

  match = /^\/operations\/testcells\/([^/]+)$/.exec(path);

  if (match)
    return {
      kind: "testcells",
      id: positiveId(match[1], "Test-cell software ID"),
    };

  match = /^\/admin\/universal-variables\/([^/]+)$/.exec(path);

  if (match) {
    let id: string;

    try {
      id = decodeURIComponent(match[1]);
    } catch {
      throw new TypeError("Universal variable name is malformed");
    }

    if (!id || id === "." || id === ".." || /[\/?#]/.test(id)) {
      throw new TypeError("Universal variable name is invalid");
    }

    return { kind: "universal-variables", id };
  }

  throw new TypeError("Administration route is not supported");
}
