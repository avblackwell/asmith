import type { AppsmithWidgetDsl } from "../../../document";
import {
  DEFAULT_GRID_COLUMNS,
  DEFAULT_GRID_ROW_HEIGHT,
  MAX_HEIGHT_IN_ROWS,
  MIN_CANVAS_HEIGHT_IN_ROWS,
} from "../../appsmith-fixed-autoheight/autoHeightRules";

interface FixedBounds {
  widgetId: string;
  widgetName: string;
  parentId: string;
  topRow: number;
  bottomRow: number;
  leftColumn: number;
  rightColumn: number;
  parentColumnSpace: number;
  parentRowSpace: number;
}

export interface FormChildIds {
  canvas: string;
  title: string;
  submit: string;
  reset: string;
}

export interface CardChildIds {
  canvas: string;
  bodyHint: string;
}

export interface FormBlueprintOptions extends FixedBounds {
  childIds: FormChildIds;
  childNames: FormChildIds;
}

export interface CardBlueprintOptions extends FixedBounds {
  childIds: CardChildIds;
  childNames: CardChildIds;
}

function validateBounds(options: FixedBounds): void {
  if (!Number.isFinite(options.parentColumnSpace) || options.parentColumnSpace <= 0 ||
    !Number.isFinite(options.parentRowSpace) || options.parentRowSpace <= 0 ||
    options.bottomRow <= options.topRow || options.rightColumn <= options.leftColumn) {
    throw new Error("Fixed widget bounds and parent grid spaces must be positive");
  }
}

function validateNamesAndIds(options: FixedBounds, ids: object,
  names: object): void {
  for (const [label, values] of [
    ["widget IDs", [options.widgetId, ...Object.values(ids)]],
    ["widget names", [options.widgetName, ...Object.values(names)]],
  ] as const) {
    if (values.some((value) => !value.trim()) || new Set(values).size !== values.length) {
      throw new Error(`${label} must be nonempty and unique within the widget subtree`);
    }
  }
}

function canvas(options: FixedBounds, id: string, name: string,
  heightRows: number, children: AppsmithWidgetDsl[]): AppsmithWidgetDsl {
  return {
    widgetId: id,
    widgetName: name,
    type: "CANVAS_WIDGET",
    version: 1,
    parentId: options.widgetId,
    topRow: 0,
    bottomRow: heightRows,
    leftColumn: 0,
    rightColumn: DEFAULT_GRID_COLUMNS,
    parentColumnSpace: 1,
    parentRowSpace: 1,
    minHeight: Math.max(0, heightRows * DEFAULT_GRID_ROW_HEIGHT),
    containerStyle: "none",
    canExtend: false,
    detachFromLayout: true,
    dynamicBindingPathList: [],
    dynamicTriggerPathList: [],
    isVisible: true,
    children,
  };
}

/** Fixed branch of FormWidget.getDefaults().blueprint. */
export function createFormWidgetBlueprint(options: FormBlueprintOptions): AppsmithWidgetDsl {
  validateBounds(options);
  validateNamesAndIds(options, options.childIds, options.childNames);
  const heightRows = options.bottomRow - options.topRow;
  const childCanvas = canvas(options, options.childIds.canvas, options.childNames.canvas,
    heightRows, [
      {
        widgetId: options.childIds.title,
        widgetName: options.childNames.title,
        type: "TEXT_WIDGET",
        version: 1,
        parentId: options.childIds.canvas,
        topRow: 1,
        bottomRow: 5,
        leftColumn: 1.5,
        rightColumn: 25.5,
        text: "Form",
        fontSize: "1.25rem",
        isVisible: true,
        dynamicBindingPathList: [],
        dynamicTriggerPathList: [],
      },
      {
        widgetId: options.childIds.submit,
        widgetName: options.childNames.submit,
        type: "BUTTON_WIDGET",
        version: 1,
        parentId: options.childIds.canvas,
        topRow: 33,
        bottomRow: 37,
        leftColumn: 46,
        rightColumn: 62,
        text: "Submit",
        buttonVariant: "PRIMARY",
        disabledWhenInvalid: true,
        resetFormOnClick: true,
        recaptchaType: "V3",
        isVisible: true,
        dynamicBindingPathList: [],
        dynamicTriggerPathList: [],
      },
      {
        widgetId: options.childIds.reset,
        widgetName: options.childNames.reset,
        type: "BUTTON_WIDGET",
        version: 1,
        parentId: options.childIds.canvas,
        topRow: 33,
        bottomRow: 37,
        leftColumn: 30,
        rightColumn: 46,
        text: "Reset",
        buttonVariant: "SECONDARY",
        disabledWhenInvalid: false,
        resetFormOnClick: true,
        recaptchaType: "V3",
        isVisible: true,
        dynamicBindingPathList: [],
        dynamicTriggerPathList: [],
      },
    ]);

  return {
    widgetId: options.widgetId,
    widgetName: options.widgetName,
    type: "FORM_WIDGET",
    version: 1,
    parentId: options.parentId,
    topRow: options.topRow,
    bottomRow: options.bottomRow,
    leftColumn: options.leftColumn,
    rightColumn: options.rightColumn,
    parentColumnSpace: options.parentColumnSpace,
    parentRowSpace: options.parentRowSpace,
    backgroundColor: "#FFFFFF",
    borderColor: "#E0DEDE",
    borderWidth: "1",
    borderRadius: "{{appsmith.theme.borderRadius.appBorderRadius}}",
    boxShadow: "{{appsmith.theme.boxShadow.appBoxShadow}}",
    animateLoading: true,
    positioning: "fixed",
    responsiveBehavior: "fill",
    flexVerticalAlignment: "stretch",
    dynamicHeight: "AUTO_HEIGHT",
    minDynamicHeight: MIN_CANVAS_HEIGHT_IN_ROWS,
    maxDynamicHeight: MAX_HEIGHT_IN_ROWS,
    shouldScrollContents: true,
    isVisible: true,
    dynamicBindingPathList: [{ key: "borderRadius" }, { key: "boxShadow" }],
    dynamicTriggerPathList: [],
    children: [childCanvas],
  };
}

/** Fixed branch of CardWidget.getDefaults().blueprint and its theme operation. */
export function createCardWidgetBlueprint(options: CardBlueprintOptions): AppsmithWidgetDsl {
  validateBounds(options);
  validateNamesAndIds(options, options.childIds, options.childNames);
  const heightRows = options.bottomRow - options.topRow;
  // CardWidget.getCanvasHeightOffset reserves 50px header + 48px footer + 2px border.
  const bodyRows = Math.max(1, heightRows - 10);
  const childCanvas = canvas(options, options.childIds.canvas, options.childNames.canvas,
    bodyRows, [{
      widgetId: options.childIds.bodyHint,
      widgetName: options.childNames.bodyHint,
      type: "TEXT_WIDGET",
      version: 1,
      parentId: options.childIds.canvas,
      topRow: 1,
      bottomRow: 5,
      leftColumn: 1,
      rightColumn: 37,
      text: "Add widgets to design the card body",
      fontSize: "0.875rem",
      textColor: "#999999",
      isVisible: true,
      dynamicBindingPathList: [],
      dynamicTriggerPathList: [],
    }]);

  return {
    widgetId: options.widgetId,
    widgetName: options.widgetName,
    type: "CARD_WIDGET",
    version: 1,
    parentId: options.parentId,
    topRow: options.topRow,
    bottomRow: options.bottomRow,
    leftColumn: options.leftColumn,
    rightColumn: options.rightColumn,
    parentColumnSpace: options.parentColumnSpace,
    parentRowSpace: options.parentRowSpace,
    animateLoading: true,
    backgroundColor: "#FFFFFF",
    borderColor: "#E0DEDE",
    borderWidth: "1",
    borderRadius: "{{appsmith.theme.borderRadius.appBorderRadius}}",
    boxShadow: "{{appsmith.theme.boxShadow.appBoxShadow}}",
    selectedAccentColor: "{{appsmith.theme.colors.primaryColor}}",
    cardData: {},
    mediaPosition: "NONE",
    mediaHeight: 140,
    mediaObjectFit: "cover",
    showHeader: true,
    showMenu: true,
    title: "Card title",
    subtitle: "Card subtitle",
    menuItems: {
      menuItem1: { label: "First menu item", id: "menuItem1", widgetId: "",
        isVisible: true, isDisabled: false, index: 0 },
      menuItem2: { label: "Second menu item", id: "menuItem2", widgetId: "",
        isVisible: true, isDisabled: false, index: 1 },
    },
    showFooter: true,
    footerActions: {
      footerAction1: { label: "Action 1", id: "footerAction1", widgetId: "",
        buttonVariant: "SECONDARY", buttonColor: "{{appsmith.theme.colors.primaryColor}}",
        isVisible: true, isDisabled: false, index: 0 },
      footerAction2: { label: "Action 2", id: "footerAction2", widgetId: "",
        buttonVariant: "PRIMARY", buttonColor: "{{appsmith.theme.colors.primaryColor}}",
        isVisible: true, isDisabled: false, index: 1 },
    },
    isClickable: false,
    isDisabled: false,
    selectionEnabled: false,
    defaultSelected: false,
    expandCollapseEnabled: false,
    defaultExpanded: true,
    showHeaderDivider: true,
    showFooterDivider: true,
    hoverElevation: false,
    minDynamicHeight: MIN_CANVAS_HEIGHT_IN_ROWS + 5,
    maxDynamicHeight: MAX_HEIGHT_IN_ROWS,
    dynamicHeight: "AUTO_HEIGHT",
    shouldScrollContents: true,
    positioning: "fixed",
    responsiveBehavior: "fill",
    flexVerticalAlignment: "stretch",
    isVisible: true,
    dynamicBindingPathList: [
      { key: "borderRadius" }, { key: "boxShadow" },
      { key: "selectedAccentColor" },
      { key: "footerActions.footerAction1.buttonColor" },
      { key: "footerActions.footerAction2.buttonColor" },
    ],
    dynamicTriggerPathList: [],
    children: [childCanvas],
  };
}
