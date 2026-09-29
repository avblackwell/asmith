/* eslint-disable testing-library/await-async-queries -- React test renderer queries are synchronous. */
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import type { ReactTestRenderer } from "react-test-renderer";
import type { MarketplaceItem, MarketplacePage } from "../marketplace";
import { MarketplaceAssetPanel } from "./MarketplaceAssetPanel";
import type { MarketplaceAssetPanelProps } from "./MarketplaceAssetPanel";

const component: MarketplaceItem = {
  id: 7,
  name: "Speed card",
  description: "",
  typeId: 2,
  type: "component",
  tags: [],
  publisherId: 3,
  publisherUsername: "publisher",
  createdAt: 0,
  updatedAt: 0,
  publishedAt: null,
  downloadCount: 0,
  rating: null,
  ratingCount: 0,
  thumbnailUrl: "",
  previewImages: [],
};
const theme = { ...component, id: 9, name: "Operations blue", type: "theme" };

function page(
  items: MarketplaceItem[],
  previousCursor: number | null = null,
  nextCursor: number | null = null,
): MarketplacePage<MarketplaceItem> {
  return {
    data: items,
    meta: {
      cursor: 0,
      previousCursor,
      nextCursor,
      pageSize: 12,
      currentPage: previousCursor === null ? 1 : 2,
      totalPages: nextCursor === null && previousCursor === null ? 1 : 2,
      totalItems: items.length,
      sorts: null,
      filters: null,
    },
  };
}

function makeProps(): MarketplaceAssetPanelProps {
  return {
    loadComponents: jest.fn().mockResolvedValue(page([component])),
    loadThemes: jest.fn().mockResolvedValue(page([theme])),
    listSourceGroups: jest
      .fn()
      .mockReturnValue([{ widgetId: "speed-card", name: "Speed card group" }]),
    installComponent: jest
      .fn()
      .mockResolvedValue("Component installed locally"),
    applyTheme: jest.fn().mockResolvedValue("Theme applied locally"),
    publishNewComponent: jest.fn().mockResolvedValue("Component uploaded"),
    replaceComponent: jest.fn().mockResolvedValue("Component replaced"),
    publishNewTheme: jest.fn().mockResolvedValue("Theme uploaded"),
    replaceTheme: jest.fn().mockResolvedValue("Theme replaced"),
  };
}

function button(renderer: ReactTestRenderer, testId: string) {
  return renderer.root.findByProps({ "data-testid": testId });
}

async function open(renderer: ReactTestRenderer): Promise<void> {
  await act(async () => {
    button(renderer, "t--asset-toggle").props.onClick();
  });
}

async function renderPanel(
  props: MarketplaceAssetPanelProps,
): Promise<ReactTestRenderer> {
  let renderer: ReactTestRenderer | undefined;

  await act(async () => {
    renderer = TestRenderer.create(<MarketplaceAssetPanel {...props} />);
  });

  if (!renderer) throw new Error("Panel did not render");

  return renderer;
}

describe("MarketplaceAssetPanel", () => {
  it("loads nothing until opened, then browses components with search and cursors", async () => {
    const props = makeProps();
    const loadComponents = props.loadComponents as jest.Mock;
    const renderer = await renderPanel(props);

    expect(loadComponents).not.toHaveBeenCalled();
    expect(props.loadThemes).not.toHaveBeenCalled();
    await open(renderer);
    expect(loadComponents).toHaveBeenCalledWith(
      { cursor: undefined, limit: 12, search: undefined },
      expect.any(AbortSignal),
    );
    expect(button(renderer, "t--asset-install-7")).toBeDefined();

    await act(async () => {
      renderer.root
        .findByProps({ id: "marketplace-asset-search" })
        .props.onChange({
          target: { value: "  speed  " },
        });
    });
    await act(async () => {
      renderer.root.findByType("form").props.onSubmit({
        preventDefault: jest.fn(),
      });
    });
    expect(loadComponents).toHaveBeenLastCalledWith(
      { cursor: undefined, limit: 12, search: "speed" },
      expect.any(AbortSignal),
    );

    loadComponents.mockResolvedValue(page([component], null, 20));
    await act(async () => {
      renderer.root.findByType("form").props.onSubmit({
        preventDefault: jest.fn(),
      });
    });
    const next = renderer.root
      .findAllByType("button")
      .find((entry) => entry.props.children === "Next");

    expect(next).toBeDefined();
    await act(async () => {
      next?.props.onClick();
    });
    expect(loadComponents).toHaveBeenLastCalledWith(
      { cursor: 20, limit: 12, search: "speed" },
      expect.any(AbortSignal),
    );
    expect(props.publishNewComponent).not.toHaveBeenCalled();
    expect(props.replaceComponent).not.toHaveBeenCalled();
  });

  it("installs locally and requires an explicit source widget group and thumbnail for component upload", async () => {
    const props = makeProps();
    const renderer = await renderPanel(props);

    await open(renderer);

    await act(async () => {
      button(renderer, "t--asset-install-7").props.onClick();
    });
    expect(props.installComponent).toHaveBeenCalledWith(7);
    expect(props.publishNewComponent).not.toHaveBeenCalled();
    expect(props.replaceComponent).not.toHaveBeenCalled();
    expect(button(renderer, "t--asset-replace-7").props.disabled).toBe(true);
    expect(button(renderer, "t--asset-publish-new").props.disabled).toBe(true);

    await act(async () => {
      renderer.root
        .findByProps({ "aria-label": "Dashboard source widget group" })
        .props.onChange({
          target: { value: "speed-card" },
        });
    });
    expect(button(renderer, "t--asset-replace-7").props.disabled).toBe(false);
    await act(async () => {
      button(renderer, "t--asset-replace-7").props.onClick();
    });
    expect(props.replaceComponent).toHaveBeenCalledWith(7, "speed-card");

    await act(async () => {
      renderer.root
        .findByProps({ "aria-label": "New asset description" })
        .props.onChange({
          target: { value: "Useful speed card" },
        });
      renderer.root
        .findByProps({ "aria-label": "New asset thumbnail" })
        .props.onChange({
          target: { files: [{ size: 3 }] },
        });
    });
    expect(button(renderer, "t--asset-publish-new").props.disabled).toBe(false);
    await act(async () => {
      button(renderer, "t--asset-publish-new").props.onClick();
    });
    expect(props.publishNewComponent).toHaveBeenCalledWith(
      "speed-card",
      "Useful speed card",
      expect.objectContaining({ size: 3 }),
    );
  });

  it("browses themes and keeps apply, replace, and new publication separate", async () => {
    const props = makeProps();
    const renderer = await renderPanel(props);

    await open(renderer);
    await act(async () => {
      button(renderer, "t--asset-tab-theme").props.onClick();
    });
    expect(props.loadThemes).toHaveBeenCalledWith(
      { cursor: undefined, limit: 12, search: undefined },
      expect.any(AbortSignal),
    );
    expect(button(renderer, "t--asset-apply-9")).toBeDefined();

    await act(async () => {
      button(renderer, "t--asset-apply-9").props.onClick();
    });
    expect(props.applyTheme).toHaveBeenCalledWith(9);
    expect(props.replaceTheme).not.toHaveBeenCalled();
    expect(props.publishNewTheme).not.toHaveBeenCalled();

    await act(async () => {
      button(renderer, "t--asset-replace-9").props.onClick();
    });
    expect(props.replaceTheme).toHaveBeenCalledWith(9);

    await act(async () => {
      renderer.root
        .findByProps({ "aria-label": "New asset thumbnail" })
        .props.onChange({
          target: { files: [{ size: 3 }] },
        });
    });
    await act(async () => {
      button(renderer, "t--asset-publish-new").props.onClick();
    });
    expect(props.publishNewTheme).toHaveBeenCalledWith(
      "",
      expect.objectContaining({ size: 3 }),
    );
  });

  it("shows request and action errors, and retries a failed list", async () => {
    const props = makeProps();
    const loadComponents = props.loadComponents as jest.Mock;

    loadComponents.mockRejectedValueOnce(new Error("network unavailable"));
    (props.installComponent as jest.Mock).mockRejectedValueOnce(
      new Error("invalid component"),
    );
    const renderer = await renderPanel(props);

    await open(renderer);
    expect(JSON.stringify(renderer.toJSON())).toContain("network unavailable");

    const retry = renderer.root
      .findAllByType("button")
      .find((entry) => entry.props.children === "Retry");

    await act(async () => {
      retry?.props.onClick();
    });
    expect(button(renderer, "t--asset-install-7")).toBeDefined();

    await act(async () => {
      button(renderer, "t--asset-install-7").props.onClick();
    });
    expect(JSON.stringify(renderer.toJSON())).toContain("invalid component");
  });
});
