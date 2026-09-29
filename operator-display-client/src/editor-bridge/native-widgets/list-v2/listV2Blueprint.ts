import type { AppsmithWidgetDsl } from "../../../document";

const APPSMITH_DEFAULT_IMAGE = "https://assets.appsmith.com/widgets/default.png";

export interface ListV2ChildIds {
  mainCanvas: string;
  itemContainer: string;
  itemCanvas: string;
  image: string;
  heading: string;
  body: string;
}

export interface ListV2BlueprintOptions {
  widgetId: string;
  widgetName: string;
  parentId: string;
  topRow: number;
  bottomRow: number;
  leftColumn: number;
  rightColumn: number;
  parentColumnSpace: number;
  parentRowSpace: number;
  /** The caller allocates IDs and names in the document's uniqueness scope. */
  childIds: ListV2ChildIds;
  childNames: ListV2ChildIds;
  /** The source resolves this through getAssetUrl; CE returns the URL unchanged. */
  defaultImageUrl?: string;
}

function requirePositive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number`);
  }
  return value;
}

function requireUnique(values: string[], name: string): void {
  if (values.some((value) => !value.trim()) || new Set(values).size !== values.length) {
    throw new Error(`${name} must be nonempty and unique within the List subtree`);
  }
}

/**
 * Materializes ListWidgetV2/widget/defaultProps.ts's Fixed blueprint. Appsmith
 * creates the six descendants through WidgetFactory, then MODIFY_PROPS writes
 * mainCanvasId, mainContainerId, and primaryKeys. This pure builder performs
 * those links in one local document transaction with caller-allocated names.
 */
export function createListV2Blueprint(options: ListV2BlueprintOptions): AppsmithWidgetDsl {
  const {
    widgetId, widgetName, parentId, topRow, bottomRow, leftColumn, rightColumn,
    parentColumnSpace, parentRowSpace, childIds, childNames,
  } = options;
  if (!/^[A-Za-z_$][\w$]*$/.test(widgetName)) {
    throw new Error("List widgetName must be a JavaScript identifier for primaryKeys");
  }
  requireUnique([widgetId, ...Object.values(childIds)], "widget IDs");
  requireUnique([widgetName, ...Object.values(childNames)], "widget names");
  const componentWidth = requirePositive((rightColumn - leftColumn) * parentColumnSpace, "List width");
  const componentHeight = requirePositive((bottomRow - topRow) * parentRowSpace, "List height");
  const imageUrl = options.defaultImageUrl ?? APPSMITH_DEFAULT_IMAGE;
  const binding = (key: string) => [{ key }];

  const image: AppsmithWidgetDsl = {
    widgetId: childIds.image,
    widgetName: childNames.image,
    type: "IMAGE_WIDGET",
    version: 1,
    parentId: childIds.itemCanvas,
    topRow: 0,
    bottomRow: 8,
    leftColumn: 0,
    rightColumn: 16,
    defaultImage: imageUrl,
    imageShape: "RECTANGLE",
    maxZoomLevel: 1,
    image: "{{currentItem.img}}",
    boxShadow: "none",
    objectFit: "cover",
    dynamicBindingPathList: binding("image"),
    dynamicTriggerPathList: [],
    isVisible: true,
  };
  const heading: AppsmithWidgetDsl = {
    widgetId: childIds.heading,
    widgetName: childNames.heading,
    type: "TEXT_WIDGET",
    version: 1,
    parentId: childIds.itemCanvas,
    topRow: 0,
    bottomRow: 4,
    leftColumn: 16,
    rightColumn: 28,
    text: "{{currentItem.name}}",
    textStyle: "HEADING",
    textAlign: "LEFT",
    boxShadow: "none",
    dynamicHeight: "FIXED",
    dynamicBindingPathList: binding("text"),
    dynamicTriggerPathList: [],
    isVisible: true,
  };
  const body: AppsmithWidgetDsl = {
    widgetId: childIds.body,
    widgetName: childNames.body,
    type: "TEXT_WIDGET",
    version: 1,
    parentId: childIds.itemCanvas,
    topRow: 4,
    bottomRow: 8,
    leftColumn: 16,
    rightColumn: 24,
    text: "{{currentItem.id}}",
    textStyle: "BODY",
    textAlign: "LEFT",
    boxShadow: "none",
    dynamicHeight: "FIXED",
    dynamicBindingPathList: binding("text"),
    dynamicTriggerPathList: [],
    isVisible: true,
  };
  const itemCanvas: AppsmithWidgetDsl = {
    widgetId: childIds.itemCanvas,
    widgetName: childNames.itemCanvas,
    type: "CANVAS_WIDGET",
    version: 1,
    parentId: childIds.itemContainer,
    topRow: 0,
    bottomRow: 12,
    leftColumn: 0,
    rightColumn: 64,
    containerStyle: "none",
    canExtend: false,
    detachFromLayout: true,
    useAutoLayout: false,
    isVisible: true,
    children: [image, heading, body],
  };
  const itemContainer: AppsmithWidgetDsl = {
    widgetId: childIds.itemContainer,
    widgetName: childNames.itemContainer,
    type: "CONTAINER_WIDGET",
    version: 1,
    parentId: childIds.mainCanvas,
    topRow: 0,
    bottomRow: 12,
    leftColumn: 0,
    rightColumn: 64,
    backgroundColor: "white",
    containerStyle: "card",
    dragDisabled: true,
    isDeletable: false,
    isListItemContainer: true,
    disallowCopy: true,
    noContainerOffset: true,
    positioning: "fixed",
    disabledWidgetFeatures: ["dynamicHeight"],
    shouldScrollContents: false,
    dynamicHeight: "FIXED",
    isVisible: true,
    children: [itemCanvas],
  };
  const mainCanvas: AppsmithWidgetDsl = {
    widgetId: childIds.mainCanvas,
    widgetName: childNames.mainCanvas,
    type: "CANVAS_WIDGET",
    version: 1,
    parentId: widgetId,
    topRow: 0,
    bottomRow: componentHeight,
    leftColumn: 0,
    rightColumn: componentWidth,
    parentColumnSpace: 1,
    parentRowSpace: 1,
    minHeight: componentHeight,
    containerStyle: "none",
    canExtend: false,
    detachFromLayout: true,
    dropDisabled: true,
    openParentPropertyPane: true,
    noPad: true,
    isVisible: true,
    children: [itemContainer],
  };

  return {
    widgetId,
    widgetName,
    type: "LIST_WIDGET_V2",
    // Appsmith's List defaultProps omits version. The local document requires
    // a positive version, and all three template widget types use version 1.
    version: 1,
    parentId,
    topRow,
    bottomRow,
    leftColumn,
    rightColumn,
    parentColumnSpace,
    parentRowSpace,
    backgroundColor: "transparent",
    itemBackgroundColor: "#FFFFFF",
    requiresFlatWidgetChildren: true,
    hasMetaWidgets: true,
    animateLoading: true,
    gridType: "vertical",
    responsiveBehavior: "fill",
    flexVerticalAlignment: "start",
    dynamicHeight: "FIXED",
    dynamicBindingPathList: [
      { key: "currentItemsView" }, { key: "selectedItemView" },
      { key: "triggeredItemView" }, { key: "primaryKeys" },
    ],
    currentItemsView: "{{[]}}",
    selectedItemView: "{{{}}}",
    triggeredItemView: "{{{}}}",
    itemSpacing: 8,
    templateHeight: 160,
    listData: ["Blue", "Green", "Red"].map((name, index) => ({
      id: String(index + 1).padStart(3, "0"), name, img: imageUrl,
    })),
    pageSize: 3,
    primaryKeys: `{{${widgetName}.listData.map((currentItem, currentIndex) => currentItem["id"] )}}`,
    mainCanvasId: childIds.mainCanvas,
    mainContainerId: childIds.itemContainer,
    isVisible: true,
    children: [mainCanvas],
  };
}
