import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import type { ReactTestInstance, ReactTestRenderer } from "react-test-renderer";
import { MarketplaceHttpError } from "../marketplace";
import type {
  MarketplaceGroup,
  MarketplaceItem,
  MarketplacePage as Page,
  MarketplaceTag,
  MarketplaceUser,
} from "../marketplace";
import { MarketplacePage } from "./MarketplacePage";
import type { MarketplacePageClient } from "./MarketplacePage";

jest.mock("@appsmith/ads", () => {
  const ReactMock = jest.requireActual("react");

  return {
    Button: ({ children, isDisabled, ...props }: Record<string, unknown>) =>
      ReactMock.createElement(
        "button",
        { ...props, disabled: isDisabled },
        children,
      ),
    SearchInput: ({ onChange, value, ...props }: Record<string, unknown>) =>
      ReactMock.createElement("input", {
        ...props,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
          (onChange as (value: string) => void)(event.target.value),
        value,
      }),
    Tag: ({ children }: Record<string, unknown>) =>
      ReactMock.createElement("span", null, children),
    Text: ({ children, renderAs }: Record<string, unknown>) =>
      ReactMock.createElement(renderAs || "span", null, children),
  };
});

const user: MarketplaceUser = {
  id: 11,
  username: "operator@example.com",
  isSystemAdmin: false,
  groupMemberships: [],
};

const group: MarketplaceGroup = {
  id: 5,
  name: "Public",
  description: null,
  creationSource: "LOCAL",
  externalGroupId: null,
  creatorId: null,
  creatorName: null,
  memberCount: 2,
  createdAt: 0,
  updatedAt: null,
  admins: [],
};

const tag: MarketplaceTag = {
  id: 9,
  name: "Operations",
  color: null,
  icon: null,
};

const item: MarketplaceItem = {
  id: 7,
  name: "Engine overview",
  description: "Engine metrics",
  typeId: 1,
  type: "dashboard",
  tags: [tag],
  publisherId: 3,
  publisherUsername: "publisher",
  createdAt: 0,
  updatedAt: 0,
  publishedAt: null,
  downloadCount: 2,
  rating: null,
  ratingCount: 0,
  thumbnailUrl: "",
  previewImages: [],
};

function page<T>(data: T[], nextCursor: number | null = null): Page<T> {
  return {
    data,
    meta: {
      cursor: 0,
      previousCursor: null,
      nextCursor,
      pageSize: 12,
      currentPage: 1,
      totalPages: nextCursor === null ? 1 : 2,
      totalItems: data.length,
      sorts: null,
      filters: null,
    },
  };
}

function makeClient() {
  const client = {
    getCurrentUser: jest.fn().mockResolvedValue(user),
    listGroups: jest.fn().mockResolvedValue(page([group])),
    listItemTags: jest.fn().mockResolvedValue(page([tag])),
    listItems: jest.fn().mockResolvedValue(page([item])),
    getItem: jest.fn().mockResolvedValue(item),
  };

  return client;
}

function button(renderer: ReactTestRenderer, label: string): ReactTestInstance {
  // react-test-renderer's findAllByType is synchronous.
  // eslint-disable-next-line testing-library/await-async-queries
  const buttons = renderer.root.findAllByType("button");
  const found = buttons.find((node) =>
    JSON.stringify(node.props.children).includes(label),
  );

  if (!found) throw new Error(`Missing button ${label}`);

  return found;
}

async function render(
  client: MarketplacePageClient,
  itemId: number | null = null,
) {
  let renderer!: ReactTestRenderer;

  await act(async () => {
    renderer = TestRenderer.create(
      <MarketplacePage itemId={itemId} marketplace={client} />,
    );
  });

  return renderer;
}

describe("MarketplacePage", () => {
  beforeEach(() => {
    const location = { pathname: "/marketplace", search: "" };

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location,
        history: {
          replaceState: (_state: unknown, _title: string, url: string) => {
            const next = new URL(url, "http://localhost");

            location.pathname = next.pathname;
            location.search = next.search;
          },
        },
      },
    });
  });

  it("loads groups and queries group items without combining type or tag", async () => {
    const client = makeClient();
    const renderer = await render(client);

    expect(client.listGroups).toHaveBeenCalledWith(
      { limit: 100 },
      expect.any(AbortSignal),
    );
    await act(async () => {
      button(renderer, "Public").props.onClick();
    });

    expect(client.listItems).toHaveBeenLastCalledWith(
      {
        cursor: undefined,
        limit: 12,
        search: undefined,
        filters: [{ field: "group_id", value: "5" }],
      },
      expect.any(AbortSignal),
    );
    expect(window.location.pathname + window.location.search).toBe(
      "/marketplace?groupId=5",
    );
    expect(JSON.stringify(renderer.toJSON())).toContain(
      "/marketplace/items/7?groupId=5",
    );

    await act(async () => {
      button(renderer, "Components").props.onClick();
    });

    expect(client.listItems).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: [{ field: "type", value: "component" }],
      }),
      expect.any(AbortSignal),
    );
    expect(window.location.pathname + window.location.search).toBe(
      "/marketplace?type=component",
    );
  });

  it("keeps catalog usable when group loading fails", async () => {
    const client = makeClient();

    client.listGroups.mockRejectedValue(new Error("groups offline"));
    const renderer = await render(client);
    const markup = JSON.stringify(renderer.toJSON());

    expect(markup).toContain("groups offline");
    expect(markup).toContain("Engine overview");
  });

  it("shows the server decision when item detail is forbidden", async () => {
    const client = makeClient();

    client.getItem.mockRejectedValue(
      new MarketplaceHttpError(403, "/marketplace/items/7", "forbidden"),
    );
    const renderer = await render(client, 7);

    expect(JSON.stringify(renderer.toJSON())).toContain(
      "You do not have access to this marketplace item.",
    );
    expect(client.getItem).toHaveBeenCalledWith(7, expect.any(AbortSignal));
  });
});
