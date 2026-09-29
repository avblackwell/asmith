import React, { useCallback, useEffect, useMemo, useState } from "react";
import { EntityListTree, ListItem, SearchInput } from "@appsmith/ads";
import type { EntityListTreeItem } from "@appsmith/ads";
import { useDispatch, useSelector } from "react-redux";
import type { DefaultRootState } from "react-redux";
import { setSelectedWidgets } from "actions/widgetSelectionActions";
import { getSelectedWidgets } from "selectors/ui";
import { WidgetTypeIcon } from "pages/AppIDE/components/UIEntityListTree/WidgetTypeIcon";
import {
  getOutlineAncestorIds,
  outlineWidgetTypeLabel,
  projectWidgetOutline,
} from "./projectWidgetOutline";
import "./widgetOutline.css";

function WidgetOutlineItem({ item }: { item: EntityListTreeItem }) {
  const dispatch = useDispatch();
  const handleSelect = useCallback(
    () => dispatch(setSelectedWidgets([item.id])),
    [dispatch, item.id],
  );
  const icon = useMemo(() => <WidgetTypeIcon type={item.type} />, [item.type]);

  return (
    <ListItem
      dataTestId={`t--widget-outline-${item.id}`}
      description={outlineWidgetTypeLabel(item.type)}
      isSelected={item.isSelected}
      onClick={handleSelect}
      startIcon={icon}
      title={item.name}
    />
  );
}

/** A local widget explorer for the standalone workbench. */
export function WidgetOutline() {
  const widgets = useSelector(
    (state: DefaultRootState) => state.entities.canvasWidgets,
  );
  const selectedWidgetIds = useSelector(getSelectedWidgets);
  const [searchText, setSearchText] = useState("");
  const [collapsedWidgetIds, setCollapsedWidgetIds] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(
    function revealSelectedWidget() {
      const selectedAncestors = getOutlineAncestorIds(
        widgets,
        selectedWidgetIds,
      );

      setCollapsedWidgetIds((previous) => {
        const next = new Set(previous);

        selectedAncestors.forEach((id) => next.delete(id));

        return next.size === previous.size ? previous : next;
      });
    },
    [selectedWidgetIds, widgets],
  );

  const items = useMemo(
    () =>
      projectWidgetOutline(
        widgets,
        selectedWidgetIds,
        collapsedWidgetIds,
        searchText,
      ),
    [widgets, selectedWidgetIds, collapsedWidgetIds, searchText],
  );
  const toggleExpanded = useCallback((id: string) => {
    setCollapsedWidgetIds((previous) => {
      const next = new Set(previous);

      if (next.has(id)) next.delete(id);
      else next.add(id);

      return next;
    });
  }, []);

  return (
    <section aria-label="Widget outline" className="widget-outline">
      <div className="widget-outline__search">
        <SearchInput
          aria-label="Search widgets"
          onChange={setSearchText}
          placeholder="Search widgets"
        />
      </div>
      <div className="widget-outline__tree">
        {items.length ? (
          <EntityListTree
            ItemComponent={WidgetOutlineItem}
            items={items}
            onItemExpand={toggleExpanded}
          />
        ) : (
          <p>{searchText.trim() ? "No matching widgets" : "No widgets yet"}</p>
        )}
      </div>
    </section>
  );
}
