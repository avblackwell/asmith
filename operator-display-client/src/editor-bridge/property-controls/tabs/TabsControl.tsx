import { Button, Icon, Input, Tag } from "@appsmith/ads";
import React, { useEffect, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent } from "react";
import type { TabEditRequest } from "../../editable-store";
import { orderedTabs, type TabDescriptor } from "../../native-widgets/tabs";
import "./tabsControl.css";

interface TabsControlProps {
  widgetId: string;
  tabsObj: unknown;
  onTabEdit: (request: TabEditRequest) => void;
  onError: (message: string | null) => void;
}

interface TabRowProps extends TabsControlProps {
  tab: TabDescriptor;
  index: number;
  count: number;
  tabs: readonly TabDescriptor[];
  focusTitle: boolean;
  onOpenSettings: (tabId: string) => void;
}

/** Appsmith DraggableListCard's input, drag icon, and action layout. */
function TabRow({ widgetId, tab, index, count, tabs, focusTitle, onTabEdit,
  onError, onOpenSettings }: TabRowProps): React.ReactElement {
  const [label, setLabel] = useState(tab.label);
  const [isDragging, setDragging] = useState(false);
  const [isDropTarget, setDropTarget] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlurRef = useRef(false);

  useEffect(() => setLabel(tab.label), [tab.label]);
  useEffect(() => {
    if (focusTitle && !isDragging) inputRef.current?.focus();
  }, [focusTitle, isDragging]);

  const commitTitle = (value: string) => {
    const title = value.trim();
    if (!title) {
      onError("Tab title cannot be empty.");
      setLabel(tab.label);
      return;
    }
    if (tabs.some((entry) => entry.id !== tab.id && entry.label === title)) {
      onError("Tab titles must be unique.");
      setLabel(tab.label);
      return;
    }
    onError(null);
    setLabel(title);
    if (title !== tab.label) onTabEdit({ widgetId, kind: "rename", tabId: tab.id, label: title });
  };

  const reorder = (toIndex: number) => {
    if (toIndex < 0 || toIndex >= count || toIndex === index) return;
    onError(null);
    onTabEdit({ widgetId, kind: "reorder", tabId: tab.id, toIndex });
  };

  const onHandleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.altKey && event.key === "ArrowUp") {
      event.preventDefault();
      reorder(index - 1);
    } else if (event.altKey && event.key === "ArrowDown") {
      event.preventDefault();
      reorder(index + 1);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropTarget(false);
    const sourceId = event.dataTransfer.getData("application/x-od-tab-id");
    const source = tabs.find((entry) => entry.id === sourceId);
    if (source && source.id !== tab.id) {
      onError(null);
      onTabEdit({ widgetId, kind: "reorder", tabId: source.id, toIndex: index });
    }
  };

  return (
    <div
      className={`od-tabs-control__row${isDragging ? " od-tabs-control__row--dragging" : ""}${isDropTarget ? " od-tabs-control__row--drop-target" : ""}`}
      data-tab-id={tab.id}
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes("application/x-od-tab-id")) setDropTarget(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(false);
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("application/x-od-tab-id")) event.preventDefault();
      }}
      onDrop={onDrop}
    >
      <div className="od-tabs-control__card">
        <button
          aria-label={`Drag ${tab.label} to reorder`}
          className="od-tabs-control__drag-handle"
          draggable
          onDragEnd={() => setDragging(false)}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("application/x-od-tab-id", tab.id);
            setDragging(true);
            inputRef.current?.blur();
          }}
          onKeyDown={onHandleKeyDown}
          title="Drag to reorder; Alt+Up or Alt+Down to move by keyboard"
          type="button"
        >
          <Icon name="drag-control" size="md" />
        </button>
        <Input
          aria-label={`Title for ${tab.label}`}
          className="od-tabs-control__title"
          isValid={!tabs.some((entry) => entry.id !== tab.id && entry.label === label.trim())}
          onBlur={(event) => {
            if (skipBlurRef.current) {
              skipBlurRef.current = false;
              return;
            }
            commitTitle(event.currentTarget.value);
          }}
          onChange={setLabel}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              skipBlurRef.current = true;
              setLabel(tab.label);
              event.currentTarget.blur();
            }
          }}
          placeholder="Tab title"
          ref={inputRef}
          size="md"
          value={label}
        />
        <div className="od-tabs-control__actions">
          <Button
            aria-label={`Edit ${tab.label} settings`}
            className="t--edit-column-btn"
            isIconButton
            kind="tertiary"
            onClick={() => onOpenSettings(tab.id)}
            size="sm"
            startIcon="settings-v3"
            title={`Edit ${tab.label} settings`}
          />
          <Button
            aria-label={`Delete ${tab.label}`}
            className="t--delete-column-btn"
            isDisabled={count <= 1}
            isIconButton
            kind="tertiary"
            onClick={() => onTabEdit({ widgetId, kind: "delete", tabId: tab.id })}
            size="sm"
            startIcon="delete-bin-line"
            title="Delete tab"
          />
        </div>
      </div>
    </div>
  );
}

function TabSettings({ tab, widgetId, visibleCount, onBack, onTabEdit, onError }:
  Pick<TabsControlProps, "widgetId" | "onTabEdit" | "onError"> & {
    tab: TabDescriptor; visibleCount: number; onBack: () => void;
  }): React.ReactElement {
  return (
    <div className="od-tabs-control__settings">
      <div className="od-tabs-control__settings-header">
        <Button
          aria-label="Back to tabs"
          isIconButton
          kind="tertiary"
          onClick={onBack}
          size="sm"
          startIcon="arrow-left-s-line"
          title="Back to tabs"
        />
        <strong>{tab.label}</strong>
      </div>
      <div className="od-tabs-control__settings-content">
        <div className="od-tabs-control__settings-section">General</div>
        <label className="od-tabs-control__visibility">
          <span>Visible</span>
          <input
            aria-label={`Visible ${tab.label}`}
            checked={tab.isVisible !== false}
            disabled={tab.isVisible !== false && visibleCount <= 1}
            onChange={(event) => {
              onError(null);
              onTabEdit({ widgetId, kind: "visibility", tabId: tab.id,
                isVisible: event.target.checked });
            }}
            type="checkbox"
          />
          <span aria-hidden="true" className="od-tabs-control__visibility-track" />
        </label>
        <p className="od-tabs-control__visibility-help">Controls the visibility of the tab</p>
      </div>
    </div>
  );
}

/** Appsmith TabControl and DraggableListCard presentation with local DSL commands. */
export function TabsControl(props: TabsControlProps): React.ReactElement {
  const tabs = orderedTabs(props.tabsObj);
  const [settingsTabId, setSettingsTabId] = useState<string | null>(null);
  const [focusedTabId, setFocusedTabId] = useState<string | null>(null);
  const previousTabIds = useRef(tabs.map((tab) => tab.id));
  const settingsTab = tabs.find((tab) => tab.id === settingsTabId);

  useEffect(() => {
    setSettingsTabId(null);
    setFocusedTabId(null);
    previousTabIds.current = tabs.map((tab) => tab.id);
  }, [props.widgetId]);

  useEffect(() => {
    const previous = previousTabIds.current;
    if (tabs.length === previous.length + 1) {
      const added = tabs.find((tab) => !previous.includes(tab.id));
      if (added) setFocusedTabId(added.id);
    }
    previousTabIds.current = tabs.map((tab) => tab.id);
  }, [tabs]);

  if (settingsTab) {
    return <TabSettings onBack={() => setSettingsTabId(null)} onError={props.onError}
      onTabEdit={props.onTabEdit} tab={settingsTab} visibleCount={tabs.filter((tab) => tab.isVisible !== false).length}
      widgetId={props.widgetId} />;
  }

  return (
    <div className="od-tabs-control">
      <div className="od-tabs-control__heading">
        <span>Tabs</span>
        <Tag className="t--number-of-tabs" isClosable={false}>{tabs.length}</Tag>
      </div>
      <div className="od-tabs-control__list">
        {tabs.map((tab, index) => <TabRow {...props} count={tabs.length}
          focusTitle={focusedTabId === tab.id} index={index} key={tab.id}
          onOpenSettings={setSettingsTabId} tab={tab} tabs={tabs} />)}
      </div>
      <Button
        aria-label="+ Add tab"
        className="od-tabs-control__add t--add-tab-btn"
        kind="tertiary"
        onClick={() => {
          props.onError(null);
          props.onTabEdit({ widgetId: props.widgetId, kind: "add" });
        }}
        size="sm"
        startIcon="plus"
      >
        Add tab
      </Button>
    </div>
  );
}
