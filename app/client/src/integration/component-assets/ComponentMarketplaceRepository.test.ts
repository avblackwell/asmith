/** @jest-environment node */

import { exampleDashboardDocument } from "../document";
import type { MarketplaceClient, MarketplaceItem } from "../marketplace";
import {
  ComponentMarketplaceRepository,
  MarketplaceComponentTypeError,
} from "./ComponentMarketplaceRepository";
import {
  createComponentFromDashboard,
  serializeComponentPackage,
} from "./componentPackage";
import {
  ComponentInstallationError,
  installDownloadedComponent,
} from "./installComponent";

const componentItem: MarketplaceItem = {
  id: 17,
  name: "Published card",
  description: "Published description",
  typeId: 1,
  type: "component",
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

const component = createComponentFromDashboard(
  exampleDashboardDocument,
  "engine-speed-card",
  { componentId: "engine-speed-card", name: "Engine speed card" },
);

describe("ComponentMarketplaceRepository", () => {
  const listItems = jest.fn();
  const downloadItem = jest.fn();
  const createItem = jest.fn();
  const getItem = jest.fn();
  const updateItem = jest.fn();
  const marketplace = {
    listItems,
    downloadItem,
    createItem,
    getItem,
    updateItem,
  } as unknown as MarketplaceClient;
  const repository = new ComponentMarketplaceRepository(marketplace);

  beforeEach(() => {
    listItems.mockReset();
    downloadItem.mockReset();
    createItem.mockReset();
    getItem.mockReset();
    updateItem.mockReset();
  });

  it("browses with the backend's exact component type filter", async () => {
    listItems.mockResolvedValue({ data: [componentItem], meta: {} });

    await repository.browseComponents({
      search: "engine",
      filters: [
        { field: "type", value: "dashboard" },
        { field: "tag", value: "controls" },
      ],
    });

    expect(listItems).toHaveBeenCalledWith(
      {
        search: "engine",
        filters: [
          { field: "tag", value: "controls" },
          { field: "type", value: "component" },
        ],
      },
      undefined,
    );
  });

  it("downloads, validates, and installs a pinned copy without changing the input", async () => {
    downloadItem.mockResolvedValue({
      metadata: componentItem,
      content: new Blob([serializeComponentPackage(component)]),
    });
    const before = JSON.stringify(exampleDashboardDocument);
    const result = await repository.installComponent(
      17,
      exampleDashboardDocument,
    );
    const copy = result.copiedSubtree;

    expect(result.metadata).toEqual(componentItem);
    expect(result.contentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(copy.widgetId).not.toBe("engine-speed-card");
    expect(copy.topRow).toBeGreaterThan(86);
    expect(result.document.variables.map((variable) => variable.key)).toEqual([
      "engineSpeed",
      "engineSpeedCopy1",
    ]);
    expect(result.document.bindings.at(-1)).toMatchObject({
      id: "engine-speed-value-bindingCopy1",
      variableKey: "engineSpeedCopy1",
      target: { widgetId: result.widgetIdMap["engine-speed-value"] },
    });
    expect(result.document.componentDependencies.at(-1)).toMatchObject({
      revision: result.contentSha256,
      rootWidgetId: copy.widgetId,
      source: {
        kind: "marketplace",
        itemId: "17",
        contentSha256: result.contentSha256,
      },
    });
    expect(JSON.stringify(exampleDashboardDocument)).toBe(before);
    expect(downloadItem).toHaveBeenCalledWith(17, undefined);
  });

  it("installs a second copy with distinct variable, binding, and dependency keys", async () => {
    downloadItem.mockResolvedValue({
      metadata: componentItem,
      content: new Blob([serializeComponentPackage(component)]),
    });
    const first = await repository.installComponent(
      17,
      exampleDashboardDocument,
    );
    const second = await repository.installComponent(17, first.document);

    expect(second.document.variables.at(-1)?.key).toBe("engineSpeedCopy2");
    expect(second.document.bindings.at(-1)?.id).toBe(
      "engine-speed-value-bindingCopy2",
    );
    expect(
      new Set(second.document.componentDependencies.map((entry) => entry.key))
        .size,
    ).toBe(second.document.componentDependencies.length);
    expect(second.copiedSubtree.topRow).toBeGreaterThan(
      first.copiedSubtree.bottomRow,
    );
  });

  it("migrates a version 89 component before installing into a version 94 canvas", async () => {
    const target = JSON.parse(JSON.stringify(exampleDashboardDocument));

    target.layout.dsl.version = 94;
    target.compatibility.widgetDslVersion = 94;
    const result = await installDownloadedComponent(
      {
        component,
        metadata: componentItem,
        contentSha256: "a".repeat(64),
      },
      target,
    );

    expect(result.document.compatibility.widgetDslVersion).toBe(94);
    expect(result.document.layout.dsl.version).toBe(94);
    expect(result.document.bindings.at(-1)?.target.widgetId).toBe(
      result.widgetIdMap["engine-speed-value"],
    );
    expect(component.compatibility.widgetDslVersion).toBe(89);
    expect(result.contentSha256).toBe("a".repeat(64));
  });

  it("rejects a migration when it removes a declared binding target", async () => {
    const target = JSON.parse(JSON.stringify(exampleDashboardDocument));
    const older = JSON.parse(JSON.stringify(component));

    target.layout.dsl.version = 94;
    target.compatibility.widgetDslVersion = 94;
    older.compatibility.widgetDslVersion = 92;
    older.subtree.children[0].children.push({
      widgetId: "chat-question",
      widgetName: "ChatQuestion",
      type: "WDS_AI_CHAT_WIDGET",
      version: 1,
      parentId: "engine-speed-card-canvas",
      topRow: 15,
      bottomRow: 20,
      leftColumn: 1,
      rightColumn: 25,
      chatQuery: "Question {value}",
      dynamicBindingPathList: [],
    });
    older.bindings.push({
      ...older.bindings[0],
      id: "chat-question-binding",
      target: { widgetId: "chat-question", propertyPath: "chatQuery" },
    });

    await expect(
      installDownloadedComponent(
        {
          component: older,
          metadata: componentItem,
          contentSha256: "a".repeat(64),
        },
        target,
      ),
    ).rejects.toThrow("Migrated component failed validation");
  });

  it("rejects other item types and future widget DSL versions", async () => {
    downloadItem.mockResolvedValue({
      metadata: { ...componentItem, type: "theme" },
      content: new Blob([serializeComponentPackage(component)]),
    });
    await expect(repository.downloadComponent(17)).rejects.toThrow(
      MarketplaceComponentTypeError,
    );

    await expect(
      installDownloadedComponent(
        {
          component: {
            ...component,
            compatibility: { ...component.compatibility, widgetDslVersion: 90 },
          },
          metadata: componentItem,
          contentSha256: "a".repeat(64),
        },
        exampleDashboardDocument,
      ),
    ).rejects.toThrow(ComponentInstallationError);
  });

  it("creates a new item with a required thumbnail and explicit type", async () => {
    createItem.mockResolvedValue(componentItem);
    const thumbnail = new Blob(["image"], { type: "image/png" });

    await expect(
      repository.publishNewComponent({
        component,
        description: "Shared engine card",
        thumbnail,
      }),
    ).resolves.toBe(componentItem);
    const created = createItem.mock.calls[0][0];

    expect(created).toMatchObject({
      name: "Engine speed card",
      description: "Shared engine card",
      type: "component",
      thumbnail,
    });
    expect(JSON.parse(await created.content.text())).toEqual(component);
  });

  it("replaces only an existing component and retains omitted metadata", async () => {
    getItem.mockResolvedValue(componentItem);

    await repository.replacePublishedComponent(17, { component });
    const [id, update] = updateItem.mock.calls[0];

    expect(id).toBe(17);
    expect(update).toMatchObject({
      name: componentItem.name,
      description: componentItem.description,
      typeId: componentItem.typeId,
    });
    expect(JSON.parse(await update.content.text())).toEqual(component);
    getItem.mockResolvedValue({ ...componentItem, type: "dashboard" });
    await expect(
      repository.replacePublishedComponent(17, { component }),
    ).rejects.toThrow(MarketplaceComponentTypeError);
    expect(updateItem).toHaveBeenCalledTimes(1);
  });
});
