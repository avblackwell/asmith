import { parseDashboardDocument } from "./validation";
import type { DashboardDocument } from "./types";

/** A fresh authoring canvas with no sample Cyflex variables or bindings. */
export function createBlankDashboardDocument(
  documentId: string,
  name = "Untitled dashboard",
): DashboardDocument {
  return parseDashboardDocument({
    assetKind: "dashboard",
    schemaVersion: 1,
    documentId,
    name,
    compatibility: {
      renderer: "appsmith",
      layoutSystem: "FIXED",
      widgetDslVersion: 89,
    },
    layout: {
      dsl: {
        widgetId: "0",
        widgetName: "MainContainer",
        type: "CANVAS_WIDGET",
        version: 89,
        topRow: 0,
        bottomRow: 120,
        leftColumn: 0,
        rightColumn: 1242,
        snapColumns: 64,
        parentRowSpace: 1,
        parentColumnSpace: 1,
        minHeight: 1200,
        canExtend: true,
        detachFromLayout: true,
        backgroundColor: "none",
        dynamicBindingPathList: [],
        children: [
          {
            widgetId: "dashboard-title",
            widgetName: "DashboardTitle",
            type: "TEXT_WIDGET",
            version: 1,
            parentId: "0",
            topRow: 2,
            bottomRow: 7,
            leftColumn: 2,
            rightColumn: 62,
            parentRowSpace: 10,
            parentColumnSpace: 19.4,
            text: name,
            fontSize: "1.5rem",
            fontStyle: "BOLD",
            textAlign: "LEFT",
            textColor: "#17212b",
            isVisible: true,
            dynamicBindingPathList: [],
          },
        ],
      },
    },
    variables: [],
    bindings: [],
    theme: {
      kind: "inline",
      name: "Operations light",
      properties: {
        colors: { primaryColor: "#126e9a", backgroundColor: "#f4f8fa" },
        borderRadius: { appBorderRadius: "0.375rem" },
        boxShadow: { appBoxShadow: "none" },
        fontFamily: { appFont: "Inter" },
      },
    },
    componentDependencies: [],
  });
}
