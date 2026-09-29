import React, { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { AppsmithWidgetDsl } from "../../../document";
import {
  groupOptions, selectedChoice, sourceOptions,
  type ChoiceMeta, type ChoiceOption,
} from "./choiceModel";
import "./choiceControls.css";

export interface NativeChoiceWidgetViewProps {
  widget: AppsmithWidgetDsl;
  meta?: ChoiceMeta;
  themePrimaryColor?: string;
  themeBorderRadius?: string;
  editor?: boolean;
  onMetaChange?: (properties: Record<string, unknown>) => void;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function labelStyles(widget: AppsmithWidgetDsl): CSSProperties {
  const emphasis = text(widget.labelStyle);
  return {
    color: text(widget.labelTextColor) || undefined,
    fontSize: text(widget.labelTextSize, "0.875rem"),
    fontWeight: emphasis.includes("BOLD") ? 700 : undefined,
    fontStyle: emphasis.includes("ITALIC") ? "italic" : undefined,
    textAlign: widget.labelAlignment === "RIGHT" ? "right" : "left",
  };
}

function choiceStyles(widget: AppsmithWidgetDsl, props: NativeChoiceWidgetViewProps): CSSProperties {
  const authoredAccent = text(widget.accentColor);
  const authoredRadius = text(widget.borderRadius);
  return {
    "--od-choice-accent": authoredAccent && !authoredAccent.includes("{{")
      ? authoredAccent : props.themePrimaryColor || "#03b365",
    "--od-choice-radius": authoredRadius && !authoredRadius.includes("{{")
      ? authoredRadius : props.themeBorderRadius || "0px",
    "--od-choice-shadow": text(widget.boxShadow) && !text(widget.boxShadow).includes("{{")
      ? text(widget.boxShadow) : "none",
  } as CSSProperties;
}

function ChoiceLabel({ widget, required }: { widget: AppsmithWidgetDsl; required: boolean }) {
  const label = text(widget.labelText, "Label");
  if (!label) return null;
  return <div className="label-container od-choice__label-container">
    <label className="od-choice__label" style={labelStyles(widget)}
      title={text(widget.labelTooltip)}>{label}{required && <span className="od-choice__required"> *</span>}</label>
  </div>;
}

function ChoiceShell({ widget, props, children, testId }: {
  widget: AppsmithWidgetDsl;
  props: NativeChoiceWidgetViewProps;
  children: React.ReactNode;
  testId: string;
}) {
  const labelPosition = text(widget.labelPosition, "Top");
  const labelWidth = Number(widget.labelWidth ?? 5);
  const columns = Number(widget.rightColumn) - Number(widget.leftColumn);
  const sideLabelWidth = columns > 0 && labelWidth > 0 ? `${Math.min(70, labelWidth / columns * 100)}%` : "33%";
  return <div className="od-native-choice" data-label-position={labelPosition.toLowerCase()}
    data-testid={testId} dir={bool(widget.rtl) ? "rtl" : "ltr"}
    style={{ ...choiceStyles(widget, props), "--od-choice-label-width": sideLabelWidth } as CSSProperties}>
    <ChoiceLabel required={bool(widget.isRequired)} widget={widget} />
    {children}
  </div>;
}

function Chevron() {
  // Appsmith MultiSelectWidgetV2/component/index.styled.tsx inputIcon.
  return <svg aria-hidden="true" data-icon="chevron-down" height="16" viewBox="0 0 16 16" width="16">
    <path d="M12 5c-.28 0-.53.11-.71.29L8 8.59l-3.29-3.3a1.003 1.003 0 00-1.42 1.42l4 4c.18.18.43.29.71.29s.53-.11.71-.29l4-4A1.003 1.003 0 0012 5z" fillRule="evenodd" />
  </svg>;
}

function Checkmark() {
  return <svg aria-hidden="true" height="10" viewBox="0 0 12 10" width="12">
    <path d="m1 5 3 3 7-7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
  </svg>;
}

function useChoicePopup(anchor: React.RefObject<HTMLDivElement>, editor: boolean) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const popup = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const top = Math.min(rect.bottom + 5, Math.max(0, window.innerHeight - 310));
      setPosition({ position: "fixed", left: rect.left, top,
        width: Math.max(rect.width, 180), zIndex: 210 });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchor, open]);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!anchor.current?.contains(event.target as Node) &&
        !popup.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [anchor, open]);
  return { open, setOpen: (next: boolean) => setOpen(!editor && next), position, popup };
}

function SelectView({ multi, ...props }: NativeChoiceWidgetViewProps & { multi: boolean }): React.ReactElement {
  const { widget, meta = {}, editor = false } = props;
  const selected = selectedChoice(widget, meta);
  const options = sourceOptions(widget, multi) ?? [];
  const disabled = bool(widget.isDisabled) || editor;
  const [filter, setFilter] = useState(text(meta.filterText));
  const [activeIndex, setActiveIndex] = useState(0);
  const anchor = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const { open, setOpen, position, popup } = useChoicePopup(anchor, editor);
  const filtered = useMemo(() => bool(widget.serverSideFiltering) ? options :
    options.filter((option) => !filter ||
      option.label.toLowerCase().includes(filter.toLowerCase()) ||
      String(option.value).toLowerCase().includes(filter.toLowerCase())),
  [options, filter, widget.serverSideFiltering]);
  useEffect(() => {
    if (!open) return;
    setActiveIndex(Math.max(0, filtered.findIndex((option) =>
      multi ? selected.values.includes(option.value) : option.value === selected.value)));
    const id = window.setTimeout(() => search.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      if (filter !== text(meta.filterText)) props.onMetaChange?.({ filterText: filter });
    }, multi ? 1000 : 800);
    return () => window.clearTimeout(id);
  }, [filter, open]);
  const close = () => {
    setOpen(false);
    if (!bool(widget.serverSideFiltering)) {
      setFilter("");
      if (text(meta.filterText)) props.onMetaChange?.({ filterText: "" });
    }
  };
  const select = (option: ChoiceOption) => {
    if (multi) {
      const values = selected.values.includes(option.value)
        ? selected.values.filter((value) => value !== option.value)
        : [...selected.values, option.value];
      props.onMetaChange?.({ selectedOptions: values.map((value) => ({
        value, label: options.find((item) => item.value === value)?.label ?? String(value),
      })), isDirty: true });
    } else {
      props.onMetaChange?.({ value: option.value, label: option.label, isDirty: true });
      close();
    }
  };
  const selectedLabels = selected.labels;
  const invalid = bool(widget.isRequired) && meta.isDirty === true &&
    (multi ? selected.values.length === 0 : selected.value === "");
  const popupContent = open && !disabled ? createPortal(
    <div className={multi ? "od-choice-popover multi-select-dropdown rc-select-dropdown" : "od-choice-popover select-popover-wrapper"}
      data-testid={multi ? "multiselect-popover" : "select-popover"}
      dir={bool(widget.rtl) ? "rtl" : "ltr"} ref={popup}
      style={{ ...position, "--od-choice-accent": choiceStyles(widget, props)["--od-choice-accent" as keyof CSSProperties] } as CSSProperties}>
      {bool(widget.isFilterable, true) && <div className="bp3-input-group od-choice-popover__filter">
        <span className="bp3-icon bp3-icon-search" aria-hidden="true">⌕</span>
        <input aria-label="Filter options" className="bp3-input" onChange={(event) => {
          setFilter(event.currentTarget.value); setActiveIndex(0);
        }} onKeyDown={(event) => {
          if (event.key === "Escape") close();
          if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(filtered.length - 1, index + 1)); }
          if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)); }
          if (event.key === "Enter" && filtered[activeIndex]) { event.preventDefault(); select(filtered[activeIndex]); }
        }} placeholder="Filter..." ref={search} type="text" value={filter} />
        {filter && <button aria-label="Clear filter" className="bp3-button bp3-minimal" onClick={() => setFilter("")} type="button">×</button>}
      </div>}
      <div className="od-choice-popover__list" role="listbox" aria-multiselectable={multi || undefined}>
        {multi && bool(widget.allowSelectAll) && filtered.length > 0 && <button
          className="od-choice-popover__item od-choice-popover__select-all" onClick={() => {
            const allSelected = filtered.every((item) => selected.values.includes(item.value));
            const values = allSelected ? [] : [...new Set([...filtered.map((item) => item.value), ...selected.values])];
            props.onMetaChange?.({ selectedOptions: values.map((value) => ({ value,
              label: options.find((item) => item.value === value)?.label ?? String(value) })), isDirty: true });
          }} type="button"><span className="od-choice-popover__check">{filtered.every((item) => selected.values.includes(item.value)) && <Checkmark />}</span>Select all</button>}
        {filtered.length ? filtered.map((option, index) => {
          const checked = multi ? selected.values.includes(option.value) : selected.value === option.value;
          return <button aria-selected={checked} className={`od-choice-popover__item ${checked ? "is-selected" : ""} ${index === activeIndex ? "has-focus" : ""}`}
            key={`${String(option.value)}-${index}`} onClick={() => select(option)}
            onMouseEnter={() => setActiveIndex(index)} role="option" type="button">
            <span className="od-choice-popover__item-text">{option.label}</span>
            {multi && <span className="od-choice-popover__check">{checked && <Checkmark />}</span>}
          </button>;
        }) : <div className="od-choice-popover__empty">No Results Found</div>}
      </div>
    </div>, document.body) : null;
  return <ChoiceShell props={props} testId={multi ? "multiselect-container" : "select-container"} widget={widget}>
    <div className={multi ? "rc-select rc-select-multiple rc-select-show-arrow od-choice__select" : "bp3-control-group bp3-fill od-choice__select"}
      data-invalid={invalid} ref={anchor}>
      {multi ? <div aria-disabled={disabled} aria-expanded={open} className="rc-select-selector" role="combobox"
        onClick={() => !disabled && setOpen(!open)} tabIndex={disabled ? -1 : 0}>
        <span className="rc-select-selection-overflow">
          {selectedLabels.map((label, index) => <span className="rc-select-selection-item" key={`${String(selected.values[index])}-${index}`}>
            <span className="rc-select-selection-item-content">{label}</span>
            {!disabled && <button aria-label={`Remove ${label}`} className="rc-select-selection-item-remove"
              onClick={(event) => { event.stopPropagation(); select({ label, value: selected.values[index] }); }} type="button">×</button>}
          </span>)}
          {!selectedLabels.length && <span className="rc-select-selection-placeholder">{text(widget.placeholderText, "Select option(s)")}</span>}
        </span><span className="rc-select-arrow"><Chevron /></span>
      </div> : <button aria-expanded={open} className="bp3-button select-button" disabled={disabled}
        onClick={() => setOpen(!open)} type="button">
        <span className="bp3-button-text" title={selected.label}>{selected.label || text(widget.placeholderText, "Select option")}</span>
        <span className="od-choice__button-icons">
          {selected.value !== "" && !bool(widget.isRequired) && <span aria-label="Clear selection" className="od-choice__clear" data-testid="selectbutton.btn.cancel" onClick={(event) => {
            event.stopPropagation(); props.onMetaChange?.({ value: "", label: "", isDirty: true });
          }}>×</span>}
          <Chevron />
        </span>
      </button>}
    </div>
    {popupContent}
  </ChoiceShell>;
}

function GroupView({ switches, ...props }: NativeChoiceWidgetViewProps & { switches: boolean }): React.ReactElement {
  const { widget, meta = {}, editor = false } = props;
  const options = groupOptions(widget.options) ?? [];
  const selected = selectedChoice(widget, meta).values;
  const disabled = bool(widget.isDisabled) || editor;
  const inline = bool(widget.isInline, true);
  const alignRight = switches && widget.alignment === "RIGHT";
  const property = switches ? "selectedValuesArray" : "selectedValues";
  const invalid = bool(widget.isRequired) && meta.isDirty === true && selected.length === 0;
  const change = (value: ChoiceOption["value"], checked: boolean) => {
    const next = checked ? [...selected, value] : selected.filter((item) => item !== value);
    props.onMetaChange?.({ [property]: next, isDirty: true });
  };
  const option = (item: ChoiceOption, index: number) => <label
    className={`bp3-control ${switches ? "bp3-switch" : "bp3-checkbox"} ${inline ? "bp3-inline" : ""} ${alignRight ? "bp3-align-right" : ""} ${disabled ? "bp3-disabled" : ""}`}
    key={`${String(item.value)}-${index}`}>
    <input checked={selected.includes(item.value)} disabled={disabled} onChange={(event) => change(item.value, event.currentTarget.checked)}
      role={switches ? "switch" : undefined} type="checkbox" value={String(item.value)} />
    <span className="bp3-control-indicator" />
    <span className="od-choice__option-label" style={labelStyles(widget)}>{item.label}</span>
  </label>;
  const selectedAll = options.length > 0 && options.every((item) => selected.includes(item.value));
  return <ChoiceShell props={props} testId={switches ? "switchgroup-container" : "checkboxgroup-container"} widget={widget}>
    <div className="od-choice__group" data-align={alignRight ? "right" : "left"}
      data-inline={inline} data-invalid={invalid} data-testid={switches ? "switch-group-container" : "checkbox-group-container"}
      style={{ justifyContent: text(widget.optionAlignment) || undefined }}>
      {!switches && bool(widget.isSelectAll) && <label className={`bp3-control bp3-checkbox ${inline ? "bp3-inline" : ""} ${disabled ? "bp3-disabled" : ""}`}>
        <input checked={selectedAll} disabled={disabled} onChange={() => {
          props.onMetaChange?.({ selectedValues: selectedAll ? [] : options.map((item) => item.value), isDirty: true });
        }} ref={(input) => { if (input) input.indeterminate = !selectedAll && selected.length > 0; }} type="checkbox" />
        <span className="bp3-control-indicator" />
        <span className="od-choice__option-label" style={labelStyles(widget)}>Select all</span>
      </label>}
      {options.map(option)}
    </div>
  </ChoiceShell>;
}

export function NativeChoiceWidgetView(props: NativeChoiceWidgetViewProps): React.ReactElement {
  switch (props.widget.type) {
    case "SELECT_WIDGET": return <SelectView {...props} multi={false} />;
    case "MULTI_SELECT_WIDGET_V2": return <SelectView {...props} multi />;
    case "CHECKBOX_GROUP_WIDGET": return <GroupView {...props} switches={false} />;
    case "SWITCH_GROUP_WIDGET": return <GroupView {...props} switches />;
    default: return <div />;
  }
}
