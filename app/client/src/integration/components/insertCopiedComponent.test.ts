/** @jest-environment node */

import type { AppsmithWidgetDsl } from "../document";
import {
  ComponentInsertionError,
  insertCopiedComponent,
} from "./insertCopiedComponent";

function widget(
  widgetId: string,
  widgetName: string,
  parentId?: string,
): AppsmithWidgetDsl {
  return {
    widgetId,
    widgetName,
    type: "CONTAINER_WIDGET",
    version: 1,
    topRow: 0,
    bottomRow: 10,
    leftColumn: 0,
    rightColumn: 10,
    ...(parentId ? { parentId } : {}),
  };
}

function sourceTree(): AppsmithWidgetDsl {
  return {
    ...widget("group", "Group", "previous-parent"),
    value: 4,
    onClick: "{{Group.value + Metric.value}}",
    dynamicTriggerPathList: [{ key: "onClick" }],
    template: {
      Metric: {
        widgetId: "metric",
        widgetName: "Metric",
        text: "{{Metric.value}}",
      },
    },
    dynamicBindingPathList: [{ key: "template.Metric.text" }],
    tabsObj: { first: { widgetId: "metric" } },
    children: [
      {
        ...widget("metric", "Metric", "group"),
        value: 8,
        text: '{{"Metric.value" + Metric.value + Group.value}}',
        staticText: "Metric.value",
        dynamicBindingPathList: [{ key: "text" }],
      },
    ],
  };
}

function targetTree(): AppsmithWidgetDsl {
  return {
    ...widget("main", "Main"),
    type: "CANVAS_WIDGET",
    children: [
      widget("group", "Group", "main"),
      widget("metric", "Metric", "main"),
      widget("group-copy", "GroupCopy", "main"),
    ],
  };
}

describe("insertCopiedComponent", () => {
  it("copies a subtree with unique IDs, names, parents and internal references", () => {
    const source = sourceTree();
    const target = targetTree();
    const sourceBefore = JSON.stringify(source);
    const targetBefore = JSON.stringify(target);
    const result = insertCopiedComponent(source, target, {
      targetParentId: "main",
    });

    expect(result.widgetIdMap).toEqual({
      group: "group-copy1",
      metric: "metric-copy",
    });
    expect(result.widgetNameMap).toEqual({
      Group: "GroupCopy1",
      Metric: "MetricCopy",
    });
    expect(result.copiedSubtree.widgetId).toBe("group-copy1");
    expect(result.copiedSubtree.widgetName).toBe("GroupCopy1");
    expect(result.copiedSubtree.parentId).toBe("main");
    expect(result.copiedSubtree.children?.[0].parentId).toBe("group-copy1");
    expect(result.copiedSubtree.children?.[0].widgetId).toBe("metric-copy");
    expect(result.copiedSubtree.children?.[0].widgetName).toBe("MetricCopy");
    expect(result.copiedSubtree.onClick).toBe(
      "{{GroupCopy1.value + MetricCopy.value}}",
    );
    expect(result.copiedSubtree.children?.[0].text).toBe(
      '{{"Metric.value" + MetricCopy.value + GroupCopy1.value}}',
    );
    expect(result.copiedSubtree.children?.[0].staticText).toBe("Metric.value");
    expect(result.copiedSubtree.template).toEqual({
      MetricCopy: {
        widgetId: "metric-copy",
        widgetName: "MetricCopy",
        text: "{{MetricCopy.value}}",
      },
    });
    expect(result.copiedSubtree.dynamicBindingPathList).toEqual([
      { key: "template.MetricCopy.text" },
    ]);
    expect(result.copiedSubtree.tabsObj).toEqual({
      first: { widgetId: "metric-copy" },
    });
    expect(result.unresolvedDynamicPaths).toEqual([]);
    expect(result.targetTree.children?.at(-1)).toBe(result.copiedSubtree);
    expect(JSON.stringify(source)).toBe(sourceBefore);
    expect(JSON.stringify(target)).toBe(targetBefore);
  });

  it("uses the next suffix when the copied subtree is inserted again", () => {
    const first = insertCopiedComponent(sourceTree(), targetTree(), {
      targetParentId: "main",
    });
    const second = insertCopiedComponent(sourceTree(), first.targetTree, {
      targetParentId: "main",
    });

    expect(second.widgetIdMap.group).toBe("group-copy2");
    expect(second.widgetIdMap.metric).toBe("metric-copy1");
    expect(second.widgetNameMap.Group).toBe("GroupCopy2");
    expect(second.widgetNameMap.Metric).toBe("MetricCopy1");
  });

  it("preserves source names that are free in the target", () => {
    const result = insertCopiedComponent(sourceTree(), widget("main", "Main"), {
      targetParentId: "main",
      reservedNames: ["Metric"],
    });

    expect(result.widgetNameMap.Group).toBe("Group");
    expect(result.widgetNameMap.Metric).toBe("MetricCopy");
  });

  it("reports expressions that need a JS parser for safe rewriting", () => {
    const source = sourceTree();

    source.onClick = "{{/Metric.value/.test(Group.value)}}";
    const result = insertCopiedComponent(source, targetTree(), {
      targetParentId: "main",
    });

    expect(result.copiedSubtree.onClick).toBe(source.onClick);
    expect(result.unresolvedDynamicPaths).toEqual(["group-copy1:onClick"]);
  });

  it("rejects a missing parent or malformed source hierarchy", () => {
    expect(() =>
      insertCopiedComponent(sourceTree(), targetTree(), {
        targetParentId: "missing",
      }),
    ).toThrow(ComponentInsertionError);

    const source = sourceTree();

    source.children![0].parentId = "not-group";
    expect(() =>
      insertCopiedComponent(source, targetTree(), { targetParentId: "main" }),
    ).toThrow(ComponentInsertionError);
  });
});
