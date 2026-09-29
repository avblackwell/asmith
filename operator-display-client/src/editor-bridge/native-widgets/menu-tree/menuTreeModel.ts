import type { AppsmithWidgetDsl } from "../../../document";

export const MENU_TREE_WIDGET_TYPES = [
  "MENU_BUTTON_WIDGET", "SINGLE_SELECT_TREE_WIDGET", "MULTI_SELECT_TREE_WIDGET",
] as const;
export type MenuTreeWidgetType = typeof MENU_TREE_WIDGET_TYPES[number];

export function isMenuTreeWidget(type: string): type is MenuTreeWidgetType {
  return (MENU_TREE_WIDGET_TYPES as readonly string[]).includes(type);
}

const TREE_OPTIONS = [
  { label: "Blue", value: "BLUE", children: [
    { label: "Dark Blue", value: "DARK BLUE" },
    { label: "Light Blue", value: "LIGHT BLUE" },
  ] },
  { label: "Green", value: "GREEN" },
  { label: "Red", value: "RED" },
];

/** Appsmith Fixed getDefaults, except editor-generated geometry and widgetId. */
export const MENU_TREE_DEFAULTS: Record<MenuTreeWidgetType, Record<string, unknown>> = {
  MENU_BUTTON_WIDGET: {
    label: "Open Menu", menuVariant: "PRIMARY", placement: "CENTER",
    isCompact: false, isDisabled: false, isVisible: true, animateLoading: true,
    menuItemsSource: "STATIC", menuItems: {
      menuItem1: { label: "First Menu Item", id: "menuItem1", widgetId: "",
        isVisible: true, isDisabled: false, index: 0 },
      menuItem2: { label: "Second Menu Item", id: "menuItem2", widgetId: "",
        isVisible: true, isDisabled: false, index: 1 },
      menuItem3: { label: "Third Menu Item", id: "menuItem3", widgetId: "",
        isVisible: true, isDisabled: false, index: 2 },
    },
    widgetName: "MenuButton", version: 1,
  },
  SINGLE_SELECT_TREE_WIDGET: {
    animateLoading: true, options: TREE_OPTIONS, widgetName: "TreeSelect",
    defaultOptionValue: "BLUE", version: 1, isVisible: true,
    isRequired: false, isDisabled: false, allowClear: false, expandAll: false,
    placeholderText: "Select option", labelText: "Label",
    labelPosition: "Top", labelAlignment: "LEFT", labelWidth: 5,
    labelTextSize: "0.875rem", responsiveBehavior: "fill",
  },
  MULTI_SELECT_TREE_WIDGET: {
    mode: "SHOW_ALL", animateLoading: true, options: TREE_OPTIONS,
    widgetName: "MultiTreeSelect", defaultOptionValue: ["GREEN"], version: 1,
    isVisible: true, isRequired: false, isDisabled: false, allowClear: false,
    expandAll: false, placeholderText: "Select option(s)", labelText: "Label",
    labelPosition: "Top", labelAlignment: "LEFT", labelWidth: 5,
    labelTextSize: "0.875rem", responsiveBehavior: "fill",
  },
};

export const MENU_TREE_DIMENSIONS: Record<MenuTreeWidgetType, { rows: number; columns: number }> = {
  MENU_BUTTON_WIDGET: { rows: 4, columns: 16 },
  SINGLE_SELECT_TREE_WIDGET: { rows: 7, columns: 20 },
  MULTI_SELECT_TREE_WIDGET: { rows: 7, columns: 20 },
};

export const MENU_TREE_DEFAULT_PROPERTY_MAP: Partial<Record<MenuTreeWidgetType, Record<string, string>>> = {
  SINGLE_SELECT_TREE_WIDGET: {
    selectedOption: "defaultOptionValue", selectedLabel: "defaultOptionValue",
  },
  MULTI_SELECT_TREE_WIDGET: {
    selectedOptionValueArr: "defaultOptionValue", selectedLabel: "defaultOptionValue",
  },
};

export interface MenuItem {
  id: string;
  index: number;
  label: string;
  isVisible: boolean;
  isDisabled: boolean;
  onClick?: string;
  iconName?: string;
  iconAlign?: string;
  iconColor?: string;
  backgroundColor?: string;
  textColor?: string;
  currentItem?: Record<string, unknown>;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function array(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : undefined;
    } catch { return undefined; }
  }
  return undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function dynamicValue(value: unknown, index: number): unknown {
  return Array.isArray(value) ? value[index] : value ?? null;
}

/** Port of MenuButtonWidget.getVisibleItems: strict visibility and stable index ordering. */
export function visibleMenuItems(widget: AppsmithWidgetDsl): MenuItem[] {
  if (widget.menuItemsSource === "DYNAMIC") {
    const source = array(widget.sourceData);
    const config = record(record(widget.configureMenuItems)?.config);
    if (!source?.length || !config) return [];
    return source.map((raw, index) => {
      const item = record(raw) ?? {};
      const get = (name: string) => dynamicValue(config[name], index);
      return {
        id: String(index), index, label: text(get("label")) ?? "",
        isVisible: get("isVisible") === true,
        isDisabled: get("isDisabled") === true,
        onClick: text(config.onClick),
        iconName: text(get("iconName")), iconAlign: text(get("iconAlign")),
        iconColor: text(get("iconColor")), textColor: text(get("textColor")),
        backgroundColor: text(get("backgroundColor")), currentItem: item,
      };
    }).filter((item) => item.isVisible);
  }
  const items = record(widget.menuItems);
  if (!items) return [];
  return Object.entries(items).map(([key, raw]) => {
    const item = record(raw) ?? {};
    return {
      id: text(item.id) ?? key,
      index: typeof item.index === "number" ? item.index : 0,
      label: text(item.label) ?? "",
      isVisible: item.isVisible === true,
      isDisabled: item.isDisabled === true,
      onClick: text(item.onClick), iconName: text(item.iconName),
      iconAlign: text(item.iconAlign), iconColor: text(item.iconColor),
      backgroundColor: text(item.backgroundColor), textColor: text(item.textColor),
    };
  }).filter((item) => item.isVisible).sort((a, b) => a.index - b.index);
}

export interface TreeOption {
  label: string;
  value: string | number;
  disabled?: boolean;
  children?: TreeOption[];
}

function treeOption(value: unknown): TreeOption | undefined {
  const row = record(value);
  if (!row || (typeof row.value !== "string" && typeof row.value !== "number")) return;
  return {
    label: text(row.label) ?? "", value: row.value,
    disabled: row.disabled === true,
    children: Array.isArray(row.children)
      ? row.children.map(treeOption).filter((item): item is TreeOption => !!item) : undefined,
  };
}

/** Appsmith's tree view accepts only array options; string JSON is parsed for local authoring. */
export function treeOptions(widget: AppsmithWidgetDsl): TreeOption[] {
  return (array(widget.options) ?? []).map(treeOption).filter((item): item is TreeOption => !!item);
}

export function flattenTreeOptions(options: TreeOption[]): TreeOption[] {
  return options.flatMap((option) => [option, ...flattenTreeOptions(option.children ?? [])]);
}

export interface TreeSelection {
  value: string | number | "" | (string | number)[];
  label: string | string[];
  isValid: boolean;
  flattenedOptions: TreeOption[];
}

/** Port of Single/MultiSelectTreeWidget/derived.js over local meta/default properties. */
export function selectedTree(widget: AppsmithWidgetDsl,
  meta: Record<string, unknown> = {}): TreeSelection {
  const flattenedOptions = flattenTreeOptions(treeOptions(widget));
  const multi = widget.type === "MULTI_SELECT_TREE_WIDGET";
  if (multi) {
    const input = meta.selectedOptionValueArr === undefined
      ? widget.defaultOptionValue : meta.selectedOptionValueArr;
    const authoredValues = Array.isArray(input) ? input : [];
    const values = authoredValues.filter((value): value is string | number =>
      (typeof value === "string" || typeof value === "number") &&
      flattenedOptions.some((option) => option.value === value));
    return {
      value: values, label: values.map((value) =>
        flattenedOptions.find((option) => option.value === value)?.label).filter((label): label is string => label !== undefined),
      isValid: widget.isRequired !== true || values.length > 0, flattenedOptions,
    };
  }
  const input = meta.selectedOption === undefined ? widget.defaultOptionValue : meta.selectedOption;
  const option = flattenedOptions.find((entry) => entry.value === input);
  const value = option?.value ?? "";
  return {
    value, label: option?.label ?? "", isValid: widget.isRequired !== true || value !== "",
    flattenedOptions,
  };
}
