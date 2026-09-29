import type { MarketplaceQuery } from "../marketplace";

/** The Java paginator ORs filters, so only one server facet may be active. */
export type CatalogFacet =
  | { kind: "all" }
  | { kind: "type"; value: "dashboard" | "component" | "theme" }
  | { kind: "group"; id: number }
  | { kind: "tag"; id: number };

function positiveId(value: string | null): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;

  const id = Number(value);

  return Number.isSafeInteger(id) ? id : null;
}

export function facetFromSearch(search: string): CatalogFacet {
  const params = new URLSearchParams(search);
  const groupId = positiveId(params.get("groupId"));

  if (groupId !== null) return { kind: "group", id: groupId };

  const tagId = positiveId(params.get("tagId"));

  if (tagId !== null) return { kind: "tag", id: tagId };

  const type = params.get("type");

  if (type === "dashboard" || type === "component" || type === "theme") {
    return { kind: "type", value: type };
  }

  return { kind: "all" };
}

export function catalogHref(facet: CatalogFacet): string {
  switch (facet.kind) {
    case "group":
      return `/marketplace?groupId=${facet.id}`;
    case "tag":
      return `/marketplace?tagId=${facet.id}`;
    case "type":
      return `/marketplace?type=${facet.value}`;
    default:
      return "/marketplace";
  }
}

export function detailHref(id: number, facet: CatalogFacet): string {
  const query = catalogHref(facet).split("?")[1];

  return `/marketplace/items/${id}${query ? `?${query}` : ""}`;
}

export function itemQuery(
  facet: CatalogFacet,
  search: string,
  cursor?: number,
): MarketplaceQuery {
  const filters: MarketplaceQuery["filters"] =
    facet.kind === "type"
      ? [{ field: "type", value: facet.value }]
      : facet.kind === "group"
        ? [{ field: "group_id", value: String(facet.id) }]
        : facet.kind === "tag"
          ? [{ field: "tags", value: String(facet.id) }]
          : undefined;

  return {
    cursor,
    limit: 12,
    search: search || undefined,
    filters,
  };
}
