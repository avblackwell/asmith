import React, { useEffect, useMemo, useState } from "react";
import { Button, Icon, Input, SearchInput, Tab, TabPanel, Tabs, TabsList, Text } from "@appsmith/ads";
import type { AppsmithWidgetDsl, DashboardDocument } from "../../document";
import type { JsonValue } from "../../document/types";
import type { DynamicHeight } from "../../editor-bridge/appsmith-fixed-autoheight";
import { DYNAMIC_HEIGHT_FEATURE_TYPES } from "../../editor-bridge/appsmith-fixed-autoheight/autoHeightRules";
import type { TabEditRequest } from "../../editor-bridge/editable-store";
import { MainContainerWidthToggles, type CanvasWidthPreset } from "../../editor-bridge/appsmith-fixed-width";
import { CyflexBindingControl } from "../../editor-bridge/binding-editor/CyflexBindingControl";
import type { WidgetBindingDraft } from "../../editor-bridge/binding-editor/model";
import { PropertyControlRenderer } from "../../editor-bridge/property-controls/PropertyControlRenderer";
import { ChartDataControl } from "../../editor-bridge/property-controls/chart-data";
import { getPropertySections, isSupportedPropertyWidget } from "../../editor-bridge/property-controls/config";
import { listV2TemplateOwner } from "../../editor-bridge/native-widgets/list-v2/listV2EditBoundary";
import type { PropertyTab } from "../../editor-bridge/property-controls/config";

interface PropertyPaneProps {
  widget: AppsmithWidgetDsl | null;
  document: DashboardDocument;
  root: AppsmithWidgetDsl;
  layoutSystem: string;
  canvasWidthPreset: CanvasWidthPreset;
  resolvedCanvasWidth: number;
  onCanvasWidthPresetChange: (preset: CanvasWidthPreset) => void;
  onPropertyChange: (widgetId: string, property: string, value: JsonValue) => void;
  onCustomWidgetEditSource?: (widgetId: string) => void;
  customWidgetSourceOpen?: boolean;
  onHeightModeChange: (widgetId: string, mode: DynamicHeight) => void;
  onHeightLimitsChange: (widgetId: string, limits: { minRows?: number; maxRows?: number }) => void;
  onMove: (widgetId: string, leftColumn: number, topRow: number) => void;
  onResize: (widgetId: string, width: number, height: number) => void;
  onDelete: (widgetId: string) => void;
  onTabEdit: (request: TabEditRequest) => void;
  modalOpen?: boolean;
  onModalOpenChange?: (widgetId: string, isOpen: boolean) => void;
  onSaveBinding: (draft: WidgetBindingDraft) => void;
  onRemoveBinding: (bindingId: string) => void;
  bindingDisabled?: boolean;
  bindingError?: string | null;
}

function PropertyInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit?: (value: string) => void;
}): React.ReactElement {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <Input
      isReadOnly={!onCommit}
      label={label}
      onBlur={() => {
        if (onCommit && draft !== value) onCommit(draft);
      }}
      onChange={onCommit ? setDraft : undefined}
      value={draft}
    />
  );
}

export function PropertyPane({
  widget,
  document,
  root,
  layoutSystem,
  canvasWidthPreset,
  resolvedCanvasWidth,
  onCanvasWidthPresetChange,
  onPropertyChange,
  onCustomWidgetEditSource,
  customWidgetSourceOpen = false,
  onHeightModeChange,
  onHeightLimitsChange,
  onMove,
  onResize,
  onDelete,
  onTabEdit,
  modalOpen,
  onModalOpenChange,
  onSaveBinding,
  onRemoveBinding,
  bindingDisabled = false,
  bindingError,
}: PropertyPaneProps): React.ReactElement {
  const [tab, setTab] = useState<PropertyTab>("content");
  const [propertySearch, setPropertySearch] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const selectedWidget = widget?.type === "CANVAS_WIDGET" ? null : widget;
  const listTemplateOwner = widget ? listV2TemplateOwner(root, widget.widgetId) : null;
  const hasHeightFeature = selectedWidget !== null &&
    DYNAMIC_HEIGHT_FEATURE_TYPES.has(selectedWidget.type);
  // Imported Appsmith documents without this feature field predate auto height.
  const heightMode = selectedWidget?.type === "MODAL_WIDGET" &&
    selectedWidget.dynamicHeight === "AUTO_HEIGHT_WITH_LIMITS"
    ? "AUTO_HEIGHT" : selectedWidget?.dynamicHeight === "AUTO_HEIGHT" ||
    selectedWidget?.dynamicHeight === "AUTO_HEIGHT_WITH_LIMITS"
    ? selectedWidget.dynamicHeight : "FIXED";
  const query = propertySearch.trim().toLowerCase();

  const bindingAt = (propertyPath: string) => document.bindings.find((binding) =>
    binding.target.widgetId === selectedWidget?.widgetId &&
    binding.target.propertyPath === propertyPath);

  const bindingControl = (propertyPath: string, kind: "latest" | "history") => {
    if (!selectedWidget) return null;
    return <CyflexBindingControl
      binding={bindingAt(propertyPath)}
      disabled={bindingDisabled}
      document={document}
      error={bindingError}
      kind={kind}
      onRemove={onRemoveBinding}
      onSave={onSaveBinding}
      target={{ widgetId: selectedWidget.widgetId, propertyPath }}
    />;
  };

  useEffect(() => {
    setPropertySearch("");
    setTab("content");
    setInputError(null);
    setCollapsed({});
  }, [selectedWidget?.widgetId]);

  const sections = useMemo(() => {
    if (!selectedWidget) return { content: [], style: [] };
    return {
      content: getPropertySections(selectedWidget.type, "content", selectedWidget),
      style: getPropertySections(selectedWidget.type, "style", selectedWidget),
    };
  }, [selectedWidget]);

  function commitPosition(property: string, label: string, value: string) {
    if (!selectedWidget) return;
    const number = value.trim() ? Number(value) : Number.NaN;
    const positive = property === "width" || property === "height";
    const modalDimension = selectedWidget.type === "MODAL_WIDGET" &&
      (property === "width" || property === "height");
    if (!Number.isSafeInteger(number) || number < (modalDimension ? 100 : positive ? 1 : 0)) {
      setInputError(`${label} must be a ${positive ? "positive" : "nonnegative"} whole number.`);
      return;
    }
    setInputError(null);
    if (modalDimension) {
      onPropertyChange(selectedWidget.widgetId, property, number);
      return;
    }
    switch (property) {
      case "topRow":
        onMove(selectedWidget.widgetId, selectedWidget.leftColumn, number);
        break;
      case "leftColumn":
        onMove(selectedWidget.widgetId, number, selectedWidget.topRow);
        break;
      case "width":
        onResize(selectedWidget.widgetId, number, selectedWidget.bottomRow - selectedWidget.topRow);
        break;
      case "height":
        onResize(selectedWidget.widgetId, selectedWidget.rightColumn - selectedWidget.leftColumn, number);
        break;
    }
  }

  function commitProperty(property: string, value: JsonValue) {
    if (!selectedWidget) return;
    if (hasHeightFeature && property === "dynamicHeight") {
      if (value === "FIXED" || value === "AUTO_HEIGHT" ||
        value === "AUTO_HEIGHT_WITH_LIMITS") {
        onHeightModeChange(selectedWidget.widgetId, value);
      }
      return;
    }
    if (hasHeightFeature && (property === "minDynamicHeight" ||
      property === "maxDynamicHeight")) {
      if (typeof value !== "number") return;
      const min = property === "minDynamicHeight"
        ? value : Number(selectedWidget.minDynamicHeight ?? 4);
      const max = property === "maxDynamicHeight"
        ? value : Number(selectedWidget.maxDynamicHeight ?? 9000);
      if (min >= max) {
        setInputError("Minimum height must be less than maximum height.");
        return;
      }
      setInputError(null);
      onHeightLimitsChange(selectedWidget.widgetId,
        property === "minDynamicHeight" ? { minRows: value } : { maxRows: value });
      return;
    }
    onPropertyChange(selectedWidget.widgetId, property, value);
  }

  const geometry = selectedWidget?.type === "MODAL_WIDGET" ? [
    { label: "Modal width (px)", property: "width", value: Number(selectedWidget.width ?? 456) },
    ...(heightMode === "FIXED" ? [
      { label: "Modal height (px)", property: "height", value: Number(selectedWidget.height ?? 240) },
    ] : []),
  ] : selectedWidget ? [
    { label: "Top row", property: "topRow", value: selectedWidget.topRow },
    { label: "Left column", property: "leftColumn", value: selectedWidget.leftColumn },
    { label: "Width", property: "width", value: selectedWidget.rightColumn - selectedWidget.leftColumn },
    ...(!hasHeightFeature || heightMode === "FIXED" ? [
      { label: "Height", property: "height", value: selectedWidget.bottomRow - selectedWidget.topRow },
    ] : []),
  ] : [];

  if (listTemplateOwner) {
    return <div className="od-workbench__property-pane">
      <div className="od-workbench__property-title">
        <Text kind="heading-s" renderAs="h2">{listTemplateOwner.widgetName} template</Text>
      </div>
      <p className="od-workbench__pane-note">
        The List template is locked until Appsmith meta widget editing is available.
        Select the List widget to edit its items, size, and style.
      </p>
    </div>;
  }

  return (
    <div className="od-workbench__property-pane">
      <div className="od-workbench__property-title">
        <Text kind="heading-s" renderAs="h2">{selectedWidget?.widgetName || "Properties"}</Text>
        {selectedWidget && <span className="od-workbench__property-type">{selectedWidget.type.replace("_WIDGET", "").toLowerCase()}</span>}
      </div>
      {selectedWidget ? (
        <>
          <div className="od-workbench__property-search">
            <SearchInput onChange={setPropertySearch} placeholder="Search properties" value={propertySearch} />
          </div>
          {inputError && <p className="od-workbench__property-error" role="alert">{inputError}</p>}
          <Tabs className="od-workbench__property-tabs" onValueChange={(value) => setTab(value as PropertyTab)} value={tab}>
            <TabsList>
              <Tab value="content">Content</Tab>
              <Tab value="style">Style</Tab>
            </TabsList>
            {(["content", "style"] as const).map((entry) => {
              const showName = entry === "content" && (!query || "widget name".includes(query));
              const showType = entry === "content" && (!query || "widget type".includes(query));
              const showCustomSource = entry === "content" &&
                selectedWidget.type === "CUSTOM_WIDGET" && !!onCustomWidgetEditSource &&
                (!query || "edit source".includes(query) || "go to source".includes(query));
              const visibleGeometry = entry === "style" ? geometry.filter((field) =>
                field.label.toLowerCase().includes(query)) : [];
              const visibleSections = sections[entry].map((section) => ({
                ...section,
                children: section.children.filter((control) =>
                  !query || section.sectionName.toLowerCase().includes(query) ||
                  control.label.toLowerCase().includes(query) ||
                  control.propertyName.toLowerCase().includes(query) ||
                  (((selectedWidget.type === "TEXT_WIDGET" && control.propertyName === "text") ||
                    (selectedWidget.type === "CHART_WIDGET" && control.propertyName === "chartData")) &&
                    ["live data", "connect data", "cyflex", "binding"].some((term) => term.includes(query)))),
              })).filter((section) => section.children.length > 0);
              const hasMatches = showName || showType || showCustomSource ||
                visibleGeometry.length > 0 || visibleSections.length > 0;

              return (
                <TabPanel key={entry} value={entry}>
                  <div className="od-workbench__property-fields">
                    {showCustomSource && <section className="od-workbench__property-section">
                      <Button
                        className="t--edit-custom-widget-source"
                        kind="secondary"
                        onClick={() => onCustomWidgetEditSource(selectedWidget.widgetId)}
                        size="md"
                        style={{ width: "100%" }}
                      >
                        {customWidgetSourceOpen ? "Go to source" : "Edit source"}
                        &nbsp;<Icon name="share-box-line" size="sm" />
                      </Button>
                    </section>}
                    {(showName || showType) && (
                      <section className="od-workbench__property-section">
                        <Text kind="heading-xs" renderAs="h3">General</Text>
                        {showName && <PropertyInput
                          label="Widget name"
                          onCommit={!isSupportedPropertyWidget(selectedWidget.type) ? undefined : (value) => {
                            if (!value.trim()) { setInputError("Widget name cannot be empty."); return; }
                            setInputError(null);
                            onPropertyChange(selectedWidget.widgetId, "widgetName", value);
                          }}
                          value={selectedWidget.widgetName}
                        />}
                        {showType && <PropertyInput label="Widget type" value={selectedWidget.type} />}
                      </section>
                    )}
                    {visibleGeometry.length > 0 && (
                      <section className="od-workbench__property-section">
                        <Text kind="heading-xs" renderAs="h3">Position</Text>
                        {visibleGeometry.map((field) => <PropertyInput
                          key={field.property}
                          label={field.label}
                          onCommit={(value) => commitPosition(field.property, field.label, value)}
                          value={String(field.value)}
                        />)}
                      </section>
                    )}
                    {visibleSections.map((section) => {
                      const sectionKey = `${entry}:${section.sectionName}`;
                      const isExpanded = query.length > 0 || !collapsed[sectionKey];
                      return (
                        <section className="od-workbench__property-section" key={sectionKey}>
                          <button
                            aria-expanded={isExpanded}
                            className="od-workbench__property-section-heading"
                            onClick={() => setCollapsed((state) => ({ ...state, [sectionKey]: !state[sectionKey] }))}
                            type="button"
                          >
                            <Icon name={isExpanded ? "arrow-down-s-line" : "arrow-right-s-line"} size="sm" />
                            <Text kind="heading-xs">{section.sectionName}</Text>
                          </button>
                          {isExpanded && section.children.map((control) => control.controlType === "CHART_DATA"
                            ? <div className="od-property-control" data-property-name={control.propertyName} key={control.propertyName}>
                                <Text kind="body-s">{control.label}</Text>
                                <ChartDataControl
                                  onChange={(value) => onPropertyChange(selectedWidget.widgetId, control.propertyName, value as JsonValue)}
                                  onError={setInputError}
                                  renderSeriesBinding={(seriesId) => bindingControl(`chartData.${seriesId}.data`, "history")}
                                  value={selectedWidget[control.propertyName]}
                                />
                                {control.helpText && <p className="od-property-control__help">{control.helpText}</p>}
                              </div>
                            : <React.Fragment key={control.propertyName}>
                                <PropertyControlRenderer
                                  control={control}
                                  onChange={(value) => commitProperty(control.propertyName, value)}
                                  onError={setInputError}
                                  onTabEdit={onTabEdit}
                                  value={control.propertyName === "dynamicHeight"
                                    ? heightMode : selectedWidget[control.propertyName]}
                                  widgetId={selectedWidget.widgetId}
                                />
                                {selectedWidget.type === "TEXT_WIDGET" && control.propertyName === "text" &&
                                  bindingControl("text", "latest")}
                              </React.Fragment>)}
                        </section>
                      );
                    })}
                    {!hasMatches && <p className="od-workbench__pane-note">No matching properties.</p>}
                  </div>
                </TabPanel>
              );
            })}
          </Tabs>
          <div className="od-workbench__property-actions">
            {selectedWidget.type === "MODAL_WIDGET" && onModalOpenChange &&
              <Button kind="tertiary" onClick={() => onModalOpenChange(selectedWidget.widgetId, !modalOpen)} size="sm"
                startIcon={modalOpen ? "eye-off-line" : "eye-line"}>
                {modalOpen ? "Close modal" : "Open modal"}
              </Button>}
            <Button kind="tertiary" onClick={() => onDelete(selectedWidget.widgetId)} size="sm" startIcon="delete-bin-line">
              Delete widget
            </Button>
          </div>
        </>
      ) : (
        <div className="od-workbench__canvas-properties">
          <Text kind="heading-s" renderAs="h3">Canvas size</Text>
          <MainContainerWidthToggles
            onChange={onCanvasWidthPresetChange}
            value={canvasWidthPreset}
          />
          <PropertyInput label="Resolved width" value={`${resolvedCanvasWidth}px`} />
          <PropertyInput label="Layout" value={layoutSystem} />
          <p className="od-workbench__pane-note">Select a widget on the canvas or in the outline to edit its properties.</p>
        </div>
      )}
    </div>
  );
}
