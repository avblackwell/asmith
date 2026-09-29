import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Alignment, Button, Classes, Icon, InputGroup, Menu, MenuItem } from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";
import { Popover2 } from "@blueprintjs/popover2";
import TreeSelect from "rc-tree-select";
import type { DefaultValueType } from "rc-tree-select/lib/interface";
import type { CheckedStrategy } from "rc-tree-select/lib/utils/strategyUtil";
import type { TreeNodeProps } from "rc-tree-select/lib/TreeNode";
import type { AppsmithWidgetDsl } from "../../../document";
import {
  selectedTree, treeOptions, visibleMenuItems,
  type MenuItem as AuthoredMenuItem,
} from "./menuTreeModel";
import "@blueprintjs/core/lib/css/blueprint.css";
import "@blueprintjs/popover2/lib/css/blueprint-popover2.css";
import "./rc-tree-select.less";
import "./menuTree.css";

export interface NativeMenuTreeViewProps {
  widget: AppsmithWidgetDsl;
  width?: number;
  height?: number;
  themePrimaryColor?: string;
  themeBorderRadius?: string;
  editor?: boolean;
  meta?: Record<string, unknown>;
  onMetaChange?: (properties: Record<string, unknown>) => void;
  /** Integration seam for the product's action runner; Appsmith action strings stay authored. */
  onAction?: (action: string, context?: Record<string, unknown>) => void;
}

function string(value: unknown, fallback = ""): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function authoredColor(value: unknown, fallback: string): string {
  const color = string(value);
  return color && !color.includes("{{") ? color : fallback;
}

function widgetColors(props: NativeMenuTreeViewProps): CSSProperties {
  const widget = props.widget;
  return {
    "--od-menu-tree-accent": authoredColor(widget.accentColor ?? widget.menuColor,
      props.themePrimaryColor || "#03b365"),
    "--od-menu-tree-radius": authoredColor(widget.borderRadius,
      props.themeBorderRadius || "0px"),
    "--od-menu-tree-shadow": authoredColor(widget.boxShadow, "none"),
  } as CSSProperties;
}

function menuItemIcon(item: AuthoredMenuItem, side: "left" | "right") {
  const isRight = item.iconAlign === Alignment.RIGHT || item.iconAlign === "right";
  if (!item.iconName || (side === "right") !== isRight) return null;
  return <Icon color={item.iconColor} icon={item.iconName as IconName} />;
}

/** MenuButtonWidget/component and widget/getVisibleItems with Blueprint Popover2. */
function MenuButtonView(props: NativeMenuTreeViewProps) {
  const { widget, editor = false } = props;
  const items = visibleMenuItems(widget);
  const disabled = widget.isDisabled === true || widget.isLoading === true || editor;
  const variant = string(widget.menuVariant, "PRIMARY");
  const buttonColor = authoredColor(widget.menuColor, props.themePrimaryColor || "#03b365");
  const label = string(widget.label, "Open Menu");
  const iconName = string(widget.iconName);
  const rightIcon = widget.iconAlign === "right" || widget.iconAlign === Alignment.RIGHT;
  const invoke = (item: AuthoredMenuItem, displayedIndex: number) => {
    if (!item.onClick || !props.onAction) return;
    props.onAction(item.onClick, widget.menuItemsSource === "DYNAMIC"
      ? { currentItem: item.currentItem ?? {}, currentIndex: displayedIndex } : undefined);
  };
  const menu = <Menu className="od-menu-button__menu">
    {items.map((item, index) => <MenuItem
      className={`od-menu-button__item${widget.isCompact ? " od-menu-button__item--compact" : ""}`}
      disabled={item.isDisabled || (!!item.onClick && !props.onAction)}
      icon={menuItemIcon(item, "left")}
      key={item.id}
      labelElement={menuItemIcon(item, "right")}
      onClick={() => invoke(item, index)}
      style={{ backgroundColor: item.backgroundColor || undefined,
        color: item.textColor || undefined }}
      text={item.label}
    />)}
  </Menu>;
  const colorStyle: CSSProperties = variant === "PRIMARY"
    ? { backgroundColor: buttonColor, color: "#fff" }
    : variant === "SECONDARY"
      ? { backgroundColor: "transparent", color: buttonColor, borderColor: buttonColor }
      : { backgroundColor: "transparent", color: buttonColor, borderColor: "transparent" };
  return <div className="od-menu-button" data-testid={`native-menu-button-${widget.widgetId}`}
    style={widgetColors(props)}>
    <Popover2
      className="menu-button-popover-target"
      content={menu}
      disabled={disabled}
      fill
      minimal
      placement="bottom-end"
      popoverClassName="menu-button-popover od-menu-button__popover"
    >
      <Button className="od-menu-button__target" disabled={disabled} fill
        icon={!rightIcon && iconName ? iconName as IconName : undefined}
        rightIcon={rightIcon && iconName ? iconName as IconName : undefined}
        style={{ ...colorStyle,
          borderRadius: string(widget.borderRadius, props.themeBorderRadius || "0px"),
          boxShadow: string(widget.boxShadow, "none"),
          justifyContent: widget.placement === "START" ? "flex-start"
            : widget.placement === "BETWEEN" ? "space-between" : "center" }}
        text={label}
      />
    </Popover2>
  </div>;
}

function switcherIcon(treeNode: TreeNodeProps) {
  if (treeNode.isLeaf) return <i className="od-tree-select__leaf-spacer" />;
  return <i className={`od-tree-select__switcher${treeNode.expanded ? " od-tree-select__switcher--expanded" : ""}`}>
    <svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16">
      <path d="M12 5c-.28 0-.53.11-.71.29L8 8.59l-3.29-3.3a1.003 1.003 0 00-1.42 1.42l4 4c.18.18.43.29.71.29s.53-.11.71-.29l4-4A1.003 1.003 0 0012 5z" fillRule="evenodd" />
    </svg>
  </i>;
}

function treeLabel(widget: AppsmithWidgetDsl): ReactNode {
  const label = string(widget.labelText);
  if (!label) return null;
  const emphasis = string(widget.labelStyle);
  return <div className="od-tree-select__label-container">
    <label className="od-tree-select__label" style={{
      color: string(widget.labelTextColor) || undefined,
      fontSize: string(widget.labelTextSize, "0.875rem"),
      fontWeight: emphasis.includes("BOLD") ? 700 : undefined,
      fontStyle: emphasis.includes("ITALIC") ? "italic" : undefined,
      textAlign: widget.labelAlignment === "RIGHT" ? "right" : "left",
    }} title={string(widget.labelTooltip)}>
      {label}{widget.isRequired === true && <span className="od-tree-select__required"> *</span>}
    </label>
  </div>;
}

/** Direct rc-tree-select composition following Appsmith's two tree components. */
function TreeView(props: NativeMenuTreeViewProps & { multi: boolean }) {
  const { widget, multi, editor = false, meta = {} } = props;
  const selected = selectedTree(widget, meta);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const filterInput = useRef<HTMLInputElement>(null);
  const treeRef = useRef<{ blur?: () => void }>(null);
  const disabled = widget.isDisabled === true || editor;
  const invalid = widget.isRequired === true && meta.isDirty === true && !selected.isValid;
  const options = useMemo(() => treeOptions(widget), [widget.options]);

  // Appsmith remounts rc-tree-select when expandAll changes because its
  // treeDefaultExpandAll prop is intentionally uncontrolled after mount.
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => filterInput.current?.focus(), 500);
    return () => window.clearTimeout(timer);
  }, [open]);

  const openDropdown = useCallback((nextOpen: boolean) => {
    if (editor) return;
    setOpen(nextOpen);
    if (!nextOpen) { setFilter(""); treeRef.current?.blur?.(); }
    const action = nextOpen ? widget.onDropdownOpen : widget.onDropdownClose;
    if (typeof action === "string" && action && props.onAction) props.onAction(action);
  }, [editor, widget.onDropdownOpen, widget.onDropdownClose, props.onAction]);

  const onChange = (value: DefaultValueType, labels?: ReactNode[]) => {
    if (multi) {
      const values = Array.isArray(value) ? value : [];
      props.onMetaChange?.({ selectedOptionValueArr: values,
        selectedLabel: labels ?? [], isDirty: true });
    } else {
      const nextValue = typeof value === "string" || typeof value === "number" ? value : "";
      if (selected.value === nextValue) return;
      props.onMetaChange?.({ selectedOption: nextValue,
        selectedLabel: labels?.[0] ?? "", isDirty: true });
      setFilter("");
    }
    if (typeof widget.onOptionChange === "string" && widget.onOptionChange && props.onAction)
      props.onAction(widget.onOptionChange);
  };
  const dropdownRender = (menu: React.ReactElement) => <>
    <div className="od-tree-select__backdrop" onClick={() => openDropdown(false)} />
    <InputGroup inputRef={filterInput} leftIcon="search" onChange={(event) => {
      event.stopPropagation(); setFilter(event.currentTarget.value);
    }} onKeyDown={(event) => { if (event.key === "Backspace") event.stopPropagation(); }}
      placeholder="Filter..." rightElement={filter
        ? <Button icon="cross" minimal onClick={() => setFilter("")} /> : undefined}
      small type="text" value={filter} />
    <div className={widget.isLoading === true ? Classes.SKELETON : ""}>{menu}</div>
  </>;
  const columns = Number(widget.rightColumn) - Number(widget.leftColumn);
  const labelColumns = Number(widget.labelWidth ?? 5);
  const labelWidth = columns > 0 ? `${Math.min(70, labelColumns / columns * 100)}%` : "33%";
  const dropDownWidth = Math.max(props.width ?? 0, 0.1875 * (props.width ?? 960));
  return <div className="od-tree-select" data-label-position={string(widget.labelPosition, "Top").toLowerCase()}
    data-invalid={String(invalid)} data-testid={multi ? "multitreeselect-container" : "treeselect-container"}
    style={{ ...widgetColors(props), "--od-tree-label-width": labelWidth } as CSSProperties}>
    {treeLabel(widget)}
    <div className="od-tree-select__input-container">
      <TreeSelect
        allowClear={widget.allowClear === true}
        animation="slide-up"
        choiceTransitionName="rc-tree-select-selection__choice-zoom"
        className="rc-tree-select"
        clearIcon={<Icon icon="cross" />}
        disabled={disabled}
        dropdownClassName={`tree-select-dropdown ${multi ? "tree-multiselect-dropdown" : "single-tree-select-dropdown"}`}
        dropdownRender={dropdownRender}
        dropdownStyle={{ zIndex: 210, minWidth: dropDownWidth }}
        filterTreeNode
        getPopupContainer={() => document.querySelector<HTMLElement>(".canvas") ?? document.body}
        inputIcon={<Icon icon="chevron-down" />}
        key={String(widget.expandAll === true)}
        listItemHeight={38}
        loading={widget.isLoading === true}
        maxTagCount="responsive"
        maxTagPlaceholder={(values) => `+${values.length} more`}
        multiple={multi}
        notFoundContent={<div className="od-tree-select__empty">No Results Found</div>}
        onChange={onChange}
        onClear={() => onChange(multi ? [] : "", [])}
        onDropdownVisibleChange={(next) => openDropdown(next)}
        open={open}
        placeholder={string(widget.placeholderText, multi ? "Select option(s)" : "Select option")}
        ref={treeRef as React.RefObject<never>}
        removeIcon={<Icon icon="cross" />}
        searchValue={filter}
        showArrow
        showCheckedStrategy={(string(widget.mode, "SHOW_ALL") as CheckedStrategy)}
        showSearch={false}
        style={{ width: "100%" }}
        switcherIcon={switcherIcon}
        transitionName="rc-tree-select-dropdown-slide-up"
        treeCheckable={multi ? <span className="rc-tree-select-tree-checkbox-inner" /> : undefined}
        treeData={options}
        treeDefaultExpandAll={widget.expandAll === true}
        treeIcon
        treeNodeFilterProp="label"
        value={selected.value === "" ? undefined : selected.value}
      />
    </div>
  </div>;
}

export function NativeMenuTreeView(props: NativeMenuTreeViewProps): React.ReactElement | null {
  switch (props.widget.type) {
    case "MENU_BUTTON_WIDGET": return <MenuButtonView {...props} />;
    case "SINGLE_SELECT_TREE_WIDGET": return <TreeView {...props} multi={false} />;
    case "MULTI_SELECT_TREE_WIDGET": return <TreeView {...props} multi />;
    default: return null;
  }
}
