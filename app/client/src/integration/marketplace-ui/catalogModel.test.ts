import {
  catalogHref,
  detailHref,
  facetFromSearch,
  itemQuery,
} from "./catalogModel";

describe("marketplace catalog filters", () => {
  it("uses exactly one Java filter for each facet", () => {
    expect(itemQuery({ kind: "group", id: 5 }, " motor ", 8)).toEqual({
      cursor: 8,
      limit: 12,
      search: " motor ",
      filters: [{ field: "group_id", value: "5" }],
    });
    expect(itemQuery({ kind: "type", value: "dashboard" }, "")).toEqual({
      cursor: undefined,
      limit: 12,
      search: undefined,
      filters: [{ field: "type", value: "dashboard" }],
    });
    expect(itemQuery({ kind: "tag", id: 9 }, "").filters).toEqual([
      { field: "tags", value: "9" },
    ]);
  });

  it("preserves a selected facet in detail and return links", () => {
    const facet = facetFromSearch("?groupId=5");

    expect(facet).toEqual({ kind: "group", id: 5 });
    expect(catalogHref(facet)).toBe("/marketplace?groupId=5");
    expect(detailHref(11, facet)).toBe("/marketplace/items/11?groupId=5");
    expect(facetFromSearch("?groupId=-1&type=theme")).toEqual({
      kind: "type",
      value: "theme",
    });
  });
});
