import type { AppsmithWidgetDsl } from "../../../document";

export interface EvaluatedFormChild {
  widgetName?: string;
  originalWidgetName?: string;
  value?: unknown;
  isDirty?: boolean;
  children?: EvaluatedFormChild[];
}

/** FormWidget.getFormData reads direct children of its nested canvas. */
export function formDataFromChildren(children: readonly EvaluatedFormChild[]): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const child of children) {
    if (child.value !== null && child.value !== undefined) {
      const name = child.originalWidgetName || child.widgetName;
      if (name) data[name] = child.value;
    }
  }
  return data;
}

/** FormWidget.checkFormValueChanges follows each nested widget's first child. */
export function formHasChanges(children: readonly EvaluatedFormChild[]): boolean {
  if (children.some((child) => child.isDirty)) return true;
  return children.some((child) => child.children?.length &&
    formHasChanges(child.children[0]?.children || []));
}

export interface CardItem {
  id: string;
  index: number;
  label: string;
  isDisabled: boolean;
  iconName?: string;
  iconAlign?: "left" | "right";
  iconColor?: string;
  buttonVariant?: "PRIMARY" | "SECONDARY" | "TERTIARY";
  buttonColor?: string;
  textColor?: string;
  backgroundColor?: string;
}

function items(value: unknown): CardItem[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, raw]) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const item = raw as Record<string, unknown>;
    if (item.isVisible !== true) return [];
    return [{
      id: typeof item.id === "string" ? item.id : key,
      index: typeof item.index === "number" && Number.isFinite(item.index) ? item.index : 0,
      label: typeof item.label === "string" ? item.label : "",
      isDisabled: item.isDisabled === true,
      iconName: typeof item.iconName === "string" ? item.iconName : undefined,
      iconAlign: item.iconAlign === "right" ? "right" as const : "left" as const,
      iconColor: typeof item.iconColor === "string" ? item.iconColor : undefined,
      buttonVariant: (item.buttonVariant === "SECONDARY" || item.buttonVariant === "TERTIARY"
        ? item.buttonVariant : "PRIMARY") as CardItem["buttonVariant"],
      buttonColor: typeof item.buttonColor === "string" ? item.buttonColor : undefined,
      textColor: typeof item.textColor === "string" ? item.textColor : undefined,
      backgroundColor: typeof item.backgroundColor === "string" ? item.backgroundColor : undefined,
    }];
  }).sort((a, b) => a.index - b.index);
}

function unresolved(value: unknown): boolean {
  return typeof value === "string" && value.includes("{{");
}

/** CardWidget/chromeHeight.ts, shared with its render and auto-height paths. */
export function cardChromeHeightInPx(widget: Record<string, unknown>): number {
  const expanded = !widget.expandCollapseEnabled ||
    (widget.isExpanded ?? widget.defaultExpanded) !== false;
  let height = widget.showHeader === false ? 0 : 50;
  const footer = widget.footerActions;
  const hasFooterAction = footer && typeof footer === "object" && !Array.isArray(footer) &&
    Object.values(footer).some((entry) => entry && typeof entry === "object" &&
      (entry as Record<string, unknown>).isVisible === true ||
      entry && typeof entry === "object" &&
      unresolved((entry as Record<string, unknown>).isVisible));
  if (widget.showFooter !== false && expanded && hasFooterAction) height += 48;
  if ((widget.mediaPosition === "TOP" || unresolved(widget.mediaPosition)) && widget.mediaImage) {
    height += Math.max(0, Number(widget.mediaHeight) || 140);
  }
  height += 2 * Math.max(0, Number(widget.borderWidth) || 0);
  return Math.max(0, height);
}

export interface CardViewModel {
  expanded: boolean;
  selected: boolean;
  mediaPosition: "TOP" | "LEFT" | "NONE";
  hasMedia: boolean;
  menuItems: CardItem[];
  footerActions: CardItem[];
  chromeHeightPx: number;
}

export function cardViewModel(widget: AppsmithWidgetDsl): CardViewModel {
  const mediaPosition = widget.mediaPosition === "TOP" || widget.mediaPosition === "LEFT"
    ? widget.mediaPosition : "NONE";
  return {
    expanded: Boolean(widget.expandCollapseEnabled)
      ? (widget.isExpanded ?? widget.defaultExpanded) !== false : true,
    selected: (widget.isSelected ?? widget.defaultSelected) === true,
    mediaPosition,
    hasMedia: mediaPosition !== "NONE" && Boolean(widget.mediaImage),
    menuItems: widget.showMenu === false ? [] : items(widget.menuItems),
    footerActions: items(widget.footerActions),
    chromeHeightPx: cardChromeHeightInPx(widget),
  };
}
