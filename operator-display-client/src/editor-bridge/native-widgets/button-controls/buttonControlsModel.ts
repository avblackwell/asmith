// Contracts from ButtonWidget, IconButtonWidget, and ButtonGroupWidget
// widget/index.tsx. These are plain data for the local property editor;
// the Appsmith action selector is intentionally not executed here.

export type ButtonControlKind = "BUTTON_WIDGET" | "ICON_BUTTON_WIDGET" | "BUTTON_GROUP_WIDGET";
export type ButtonVariant = "PRIMARY" | "SECONDARY" | "TERTIARY";
export interface ButtonControlWidget {
  widgetId: string;
  widgetName?: string;
  type: string;
  [property: string]: unknown;
}
export interface PropertyContract {
  propertyName: string;
  controlType: string;
  defaultValue?: unknown;
  options?: readonly string[];
}
export interface ButtonControlPropertyContract {
  content: readonly PropertyContract[];
  style: readonly PropertyContract[];
}

const variants = ["PRIMARY", "SECONDARY", "TERTIARY"] as const;

export const BUTTON_CONTROL_PROPERTY_CONTRACTS: Record<ButtonControlKind, ButtonControlPropertyContract> = {
  BUTTON_WIDGET: {
    content: [
      { propertyName: "text", controlType: "INPUT_TEXT" },
      { propertyName: "onClick", controlType: "ACTION_SELECTOR" },
      { propertyName: "tooltip", controlType: "INPUT_TEXT" },
      { propertyName: "isVisible", controlType: "SWITCH" },
      { propertyName: "isDisabled", controlType: "SWITCH" },
      { propertyName: "animateLoading", controlType: "SWITCH", defaultValue: true },
      { propertyName: "googleRecaptchaKey", controlType: "INPUT_TEXT" },
      { propertyName: "recaptchaType", controlType: "DROP_DOWN" },
      { propertyName: "disabledWhenInvalid", controlType: "SWITCH" },
      { propertyName: "resetFormOnClick", controlType: "SWITCH" },
    ],
    style: [
      { propertyName: "buttonVariant", controlType: "ICON_TABS", defaultValue: "PRIMARY", options: variants },
      { propertyName: "iconName", controlType: "ICON_SELECT" },
      { propertyName: "iconAlign", controlType: "ICON_TABS", defaultValue: "left", options: ["left", "right"] },
      { propertyName: "placement", controlType: "ICON_TABS", defaultValue: "CENTER", options: ["START", "BETWEEN", "CENTER"] },
      { propertyName: "labelTextColor", controlType: "COLOR_PICKER" },
      { propertyName: "labelTextSize", controlType: "DROP_DOWN", defaultValue: "0.875rem" },
      { propertyName: "labelStyle", controlType: "BUTTON_GROUP" },
      { propertyName: "buttonColor", controlType: "COLOR_PICKER" },
      { propertyName: "borderRadius", controlType: "BORDER_RADIUS_OPTIONS" },
      { propertyName: "boxShadow", controlType: "BOX_SHADOW_OPTIONS" },
    ],
  },
  ICON_BUTTON_WIDGET: {
    content: [
      { propertyName: "iconName", controlType: "ICON_SELECT", defaultValue: "plus" },
      { propertyName: "onClick", controlType: "ACTION_SELECTOR" },
      { propertyName: "tooltip", controlType: "INPUT_TEXT" },
      { propertyName: "isVisible", controlType: "SWITCH" },
      { propertyName: "isDisabled", controlType: "SWITCH" },
      { propertyName: "animateLoading", controlType: "SWITCH", defaultValue: true },
    ],
    style: [
      { propertyName: "buttonVariant", controlType: "ICON_TABS", defaultValue: "PRIMARY", options: variants },
      { propertyName: "buttonColor", controlType: "COLOR_PICKER" },
      { propertyName: "borderRadius", controlType: "BORDER_RADIUS_OPTIONS" },
      { propertyName: "boxShadow", controlType: "BOX_SHADOW_OPTIONS" },
    ],
  },
  BUTTON_GROUP_WIDGET: {
    content: [
      { propertyName: "groupButtons", controlType: "GROUP_BUTTONS" },
      { propertyName: "groupButtons.*.buttonType", controlType: "ICON_TABS", options: ["SIMPLE", "MENU"] },
      { propertyName: "groupButtons.*.label", controlType: "INPUT_TEXT" },
      { propertyName: "groupButtons.*.isVisible", controlType: "SWITCH" },
      { propertyName: "groupButtons.*.isDisabled", controlType: "SWITCH" },
      { propertyName: "groupButtons.*.disabledWhenInvalid", controlType: "SWITCH" },
      { propertyName: "groupButtons.*.onClick", controlType: "ACTION_SELECTOR" },
      { propertyName: "groupButtons.*.menuItems", controlType: "MENU_ITEMS" },
      { propertyName: "groupButtons.*.menuItems.*.label", controlType: "INPUT_TEXT" },
      { propertyName: "groupButtons.*.menuItems.*.isVisible", controlType: "SWITCH" },
      { propertyName: "groupButtons.*.menuItems.*.isDisabled", controlType: "SWITCH" },
      { propertyName: "groupButtons.*.menuItems.*.onClick", controlType: "ACTION_SELECTOR" },
      { propertyName: "groupButtons.*.menuItems.*.iconName", controlType: "ICON_SELECT" },
      { propertyName: "groupButtons.*.menuItems.*.iconAlign", controlType: "ICON_TABS" },
      { propertyName: "groupButtons.*.menuItems.*.backgroundColor", controlType: "COLOR_PICKER" },
      { propertyName: "groupButtons.*.menuItems.*.iconColor", controlType: "COLOR_PICKER" },
      { propertyName: "groupButtons.*.menuItems.*.textColor", controlType: "COLOR_PICKER" },
      { propertyName: "groupButtons.*.iconName", controlType: "ICON_SELECT" },
      { propertyName: "groupButtons.*.iconAlign", controlType: "ICON_TABS" },
      { propertyName: "groupButtons.*.placement", controlType: "DROP_DOWN" },
      { propertyName: "groupButtons.*.buttonColor", controlType: "COLOR_PICKER" },
      { propertyName: "isVisible", controlType: "SWITCH" },
      { propertyName: "isDisabled", controlType: "SWITCH" },
      { propertyName: "animateLoading", controlType: "SWITCH", defaultValue: true },
    ],
    style: [
      { propertyName: "buttonVariant", controlType: "ICON_TABS", defaultValue: "PRIMARY", options: variants },
      { propertyName: "orientation", controlType: "ICON_TABS", defaultValue: "horizontal", options: ["horizontal", "vertical"] },
      { propertyName: "borderRadius", controlType: "BORDER_RADIUS_OPTIONS" },
      { propertyName: "boxShadow", controlType: "BOX_SHADOW_OPTIONS" },
    ],
  },
};

export function getButtonControlDefaults(kind: ButtonControlKind): Record<string, unknown> {
  if (kind === "BUTTON_WIDGET") return {
    animateLoading: true, text: "Submit", buttonVariant: "PRIMARY", placement: "CENTER",
    rows: 4, columns: 16, widgetName: "Button", isDisabled: false, isVisible: true,
    isDefaultClickDisabled: true, disabledWhenInvalid: false, resetFormOnClick: false,
    recaptchaType: "V3", version: 1, responsiveBehavior: "hug", minWidth: 120,
  };
  if (kind === "ICON_BUTTON_WIDGET") return {
    iconName: "plus", buttonVariant: "PRIMARY", isDisabled: false, isVisible: true,
    rows: 4, columns: 4, widgetName: "IconButton", version: 1, animateLoading: true,
    responsiveBehavior: "hug", minWidth: 50,
  };
  return {
    rows: 4, columns: 24, widgetName: "ButtonGroup", orientation: "horizontal",
    buttonVariant: "PRIMARY", isVisible: true, version: 1, animateLoading: true,
    responsiveBehavior: "fill", minWidth: 450, groupButtons: {
      groupButton1: { label: "Favorite", iconName: "heart", id: "groupButton1", widgetId: "",
        buttonType: "SIMPLE", placement: "CENTER", isVisible: true, isDisabled: false,
        disabledWhenInvalid: false, index: 0, menuItems: {} },
      groupButton2: { label: "Add", iconName: "add", id: "groupButton2", widgetId: "",
        buttonType: "SIMPLE", placement: "CENTER", isVisible: true, isDisabled: false,
        disabledWhenInvalid: false, index: 1, menuItems: {} },
      groupButton3: { label: "More", iconName: "more", id: "groupButton3", widgetId: "",
        buttonType: "MENU", placement: "CENTER", isVisible: true, isDisabled: false,
        disabledWhenInvalid: false, index: 2, menuItems: {
          menuItem1: { label: "First Option", backgroundColor: "#FFFFFF", id: "menuItem1", widgetId: "",
            onClick: "", isVisible: true, isDisabled: false, disabledWhenInvalid: false, index: 0 },
          menuItem2: { label: "Second Option", backgroundColor: "#FFFFFF", id: "menuItem2", widgetId: "",
            onClick: "", isVisible: true, isDisabled: false, disabledWhenInvalid: false, index: 1 },
          menuItem3: { label: "Delete", iconName: "trash", iconColor: "#FFFFFF", iconAlign: "right",
            textColor: "#FFFFFF", backgroundColor: "#DD4B34", id: "menuItem3", widgetId: "",
            onClick: "", isVisible: true, isDisabled: false, disabledWhenInvalid: false, index: 2 },
        } },
    },
  };
}

export interface GroupButton {
  id: string;
  index: number;
  label: string;
  iconName?: string;
  iconAlign: "left" | "right";
  placement: "START" | "BETWEEN" | "CENTER";
  buttonType: "SIMPLE" | "MENU";
  buttonColor?: string;
  isDisabled: boolean;
  disabledWhenInvalid: boolean;
  onClick?: string;
  menuItems: Record<string, unknown>;
}

export function getVisibleGroupButtons(widget: ButtonControlWidget): GroupButton[] {
  const groupButtons = widget.groupButtons;
  if (!groupButtons || typeof groupButtons !== "object" || Array.isArray(groupButtons)) return [];
  // ButtonGroupWidget/component/index.tsx filters explicit true and sortBy(index).
  return Object.entries(groupButtons).map(([key, raw]): GroupButton | undefined => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const button = raw as Record<string, unknown>;
    if (button.isVisible !== true) return undefined;
    return {
      id: typeof button.id === "string" ? button.id : key,
      index: typeof button.index === "number" && Number.isFinite(button.index) ? button.index : 0,
      label: typeof button.label === "string" ? button.label : "",
      iconName: typeof button.iconName === "string" ? button.iconName : undefined,
      iconAlign: button.iconAlign === "right" ? "right" as const : "left" as const,
      placement: button.placement === "START" || button.placement === "BETWEEN" ? button.placement : "CENTER",
      buttonType: button.buttonType === "MENU" ? "MENU" as const : "SIMPLE" as const,
      buttonColor: typeof button.buttonColor === "string" ? button.buttonColor : undefined,
      isDisabled: button.isDisabled === true,
      disabledWhenInvalid: button.disabledWhenInvalid === true,
      onClick: typeof button.onClick === "string" ? button.onClick : undefined,
      menuItems: button.menuItems && typeof button.menuItems === "object" && !Array.isArray(button.menuItems)
        ? button.menuItems as Record<string, unknown> : {},
    };
  }).filter((button): button is GroupButton => button !== undefined).sort((a, b) => a.index - b.index);
}

export function safeButtonColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const color = value.trim();
  return /^#[\da-f]{3,8}$/i.test(color) || /^rgba?\([\d\s.,%]+\)$/i.test(color) ||
    /^hsla?\([\d\s.,%]+\)$/i.test(color) || /^[a-z]+$/i.test(color) ? color : fallback;
}

export function safeButtonRadius(value: unknown, fallback = "0px"): string {
  if (typeof value !== "string" && typeof value !== "number") return fallback;
  const radius = String(value).trim();
  return /^\d+(?:\.\d+)?(?:px|rem|em|%)?$/.test(radius) ? radius : fallback;
}

export function safeButtonShadow(value: unknown): string {
  return typeof value === "string" && /^(?:none|[\d\s.,%()a-z-]+)$/i.test(value) ? value : "none";
}

export function buttonVariant(value: unknown): ButtonVariant {
  return value === "SECONDARY" || value === "TERTIARY" ? value : "PRIMARY";
}

function isLightHex(color: string): boolean {
  const hex = color.replace("#", "");
  if (!/^[\da-f]{3}(?:[\da-f]{3})?$/i.test(hex)) return false;
  const digits = hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex;
  const rgb = [0, 2, 4].map((start) => parseInt(digits.slice(start, start + 2), 16) / 255);
  const linear = rgb.map((channel) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722 > .5;
}

export function buttonSurface(variant: ButtonVariant, color: string) {
  // WidgetUtils.ts getCustomBackgroundColor/getCustomBorderColor and
  // getComplementaryGrayscaleColor, using a local safe color first.
  return {
    background: variant === "PRIMARY" ? color : "transparent",
    foreground: variant === "PRIMARY" ? isLightHex(color) ? "#000" : "#fff" : color,
    border: variant === "SECONDARY" ? `1px solid ${color}` : "none",
  };
}
