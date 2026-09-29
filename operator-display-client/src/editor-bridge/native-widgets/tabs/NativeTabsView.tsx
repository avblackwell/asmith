import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import styled from "styled-components";
import { orderedVisibleTabs, resolveSelectedTabCanvasId } from "./tabsModel";

const TabsContainerWrapper = styled.div<{
  $backgroundColor: string;
  $borderColor: string;
  $borderRadius: string;
  $borderWidth: number;
  $boxShadow: string;
}>`
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  justify-content: flex-start;
  align-items: center;
  border-radius: ${({ $borderRadius }) => $borderRadius};
  box-shadow: ${({ $boxShadow }) => $boxShadow};
  border-width: ${({ $borderWidth }) => $borderWidth}px;
  border-color: ${({ $borderColor }) => $borderColor};
  background-color: ${({ $backgroundColor }) => $backgroundColor};
  border-style: solid;
  overflow: hidden;
`;

const TabsHeader = styled.div`
  position: relative;
  display: flex;
  width: 100%;
  height: 40px;
  min-height: 40px;
  align-items: flex-end;
  padding: 0 24px;
  border-bottom: 1px solid var(--wds-color-border-onaccent, #e0dede);
`;

const TabsRow = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 32px;
  width: 100%;
  height: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
`;

const PageTab = styled.button<{ $accentColor: string; $textColor: string }>`
  position: relative;
  display: flex;
  flex: none;
  align-self: flex-end;
  align-items: center;
  justify-content: center;
  height: 34px;
  max-width: 12.5rem;
  padding: 0;
  border: 0;
  background: transparent;
  color: ${({ $textColor }) => $textColor};
  font: inherit;
  font-size: 14px;
  font-weight: 400;
  cursor: pointer;
  & > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 12.5rem;
  }
  &::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 2px;
    background: ${({ $accentColor }) => $accentColor};
    transform: scaleX(0);
    transform-origin: left;
    transition: transform 0.3s ease-in-out;
  }
  &:hover::after, &[aria-selected="true"]::after { transform: scaleX(1); }
  &[aria-selected="true"] { color: ${({ $accentColor }) => $accentColor}; }
  &:focus-visible { outline: 2px solid ${({ $accentColor }) => $accentColor}; outline-offset: -2px; }
`;

const ScrollArrow = styled.button<{ $right?: boolean; $visible: boolean }>`
  position: absolute;
  ${({ $right }) => $right ? "right: 0;" : "left: 0;"}
  top: 4px;
  z-index: 1;
  display: ${({ $visible }) => $visible ? "flex" : "none"};
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 0;
  background: white;
  color: #231f20;
  cursor: pointer;
`;

const ScrollCanvas = styled.div<{ $scroll: boolean }>`
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: ${({ $scroll }) => $scroll ? "auto" : "hidden"};
  scrollbar-color: #ccc transparent;
  scrollbar-width: thin;
`;

function safeColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const color = value.trim();
  return /^#[\da-f]{3,8}$/i.test(color) ||
    /^rgba?\([\d\s.,%]+\)$/i.test(color) ||
    /^hsla?\([\d\s.,%]+\)$/i.test(color) ||
    /^[a-z]+$/i.test(color)
    ? color : fallback;
}

function safeRadius(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "0px";
  const radius = String(value).trim();
  return /^\d+(?:\.\d+)?(?:px|rem|em|%)?$/.test(radius)
    ? radius : "0px";
}

function safeShadow(value: unknown): string {
  if (typeof value !== "string") return "none";
  const shadow = value.trim();
  return shadow === "none" || /^[\d\s.,()%a-z#-]+$/i.test(shadow)
    ? shadow : "none";
}

function contrastTextColor(background: string): string {
  const hex = /^#([\da-f]{6})$/i.exec(background);
  if (!hex) return "#231f20";
  const number = Number.parseInt(hex[1], 16);
  const r = (number >> 16) & 255;
  const g = (number >> 8) & 255;
  const b = number & 255;
  return (r * 0.2126 + g * 0.7152 + b * 0.0722) < 140 ? "#fff" : "#231f20";
}

export interface NativeTabsViewProps {
  widgetId: string;
  tabsObj: unknown;
  defaultTab?: string;
  selectedTabWidgetId?: string | null;
  selectedWidgetAncestry?: readonly string[];
  onTabChange?: (tabCanvasWidgetId: string) => void;
  renderCanvas: (tabCanvasWidgetId: string) => ReactNode;
  shouldShowTabs?: boolean;
  shouldScrollContents?: boolean;
  dynamicHeight?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderRadius?: string | number;
  borderWidth?: string | number;
  boxShadow?: string;
  accentColor?: string;
  primaryColor?: string;
}

/** Source-mapped presentation of TabsComponent/PageTabs with local tab meta. */
export function NativeTabsView(props: NativeTabsViewProps): React.ReactElement {
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ left: false, right: false });
  const visibleTabs = orderedVisibleTabs(props.tabsObj);
  const selectedId = resolveSelectedTabCanvasId(
    props.tabsObj,
    props.defaultTab,
    props.selectedTabWidgetId ?? localSelectedId,
    props.selectedWidgetAncestry,
  );
  const updateArrows = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    setScroll({
      left: row.scrollLeft > 0,
      right: row.scrollLeft + row.clientWidth < row.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    updateArrows();
    const row = rowRef.current;
    if (!row || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateArrows);
    observer.observe(row);
    return () => observer.disconnect();
  }, [updateArrows, props.tabsObj, props.shouldShowTabs]);

  const backgroundColor = safeColor(props.backgroundColor, "#FFFFFF");
  const accentColor = safeColor(props.accentColor,
    safeColor(props.primaryColor, "#553de9"));

  return (
    <TabsContainerWrapper
      $backgroundColor={backgroundColor}
      $borderColor={safeColor(props.borderColor, "#E0DEDE")}
      $borderRadius={safeRadius(props.borderRadius)}
      $borderWidth={Math.min(100, Math.max(0,
        Number.parseFloat(String(props.borderWidth ?? 1)) || 0))}
      $boxShadow={safeShadow(props.boxShadow)}
      data-native-widget="tabs"
      data-testid={`native-tabs-${props.widgetId}`}
    >
      {props.shouldShowTabs !== false && (
        <TabsHeader>
          <ScrollArrow
            $visible={scroll.left}
            aria-label="Scroll tabs left"
            onClick={(event) => {
              event.stopPropagation();
              rowRef.current?.scrollBy({ left: -50, behavior: "smooth" });
              updateArrows();
            }}
            type="button"
          >
            ‹
          </ScrollArrow>
          <TabsRow aria-label="Tabs" onScroll={updateArrows} ref={rowRef} role="tablist">
            {visibleTabs.map((tab) => (
              <PageTab
                $accentColor={accentColor}
                $textColor={contrastTextColor(backgroundColor)}
                aria-controls={`tab-canvas-${tab.widgetId}`}
                aria-selected={tab.widgetId === selectedId}
                className={`t--page-switch-tab t--tab-${tab.label} t--tabid-${tab.id}`}
                key={tab.id}
                onClick={(event) => {
                  event.stopPropagation();
                  setLocalSelectedId(tab.widgetId);
                  props.onTabChange?.(tab.widgetId);
                }}
                role="tab"
                title={tab.label}
                type="button"
              >
                <span>{tab.label}</span>
              </PageTab>
            ))}
          </TabsRow>
          <ScrollArrow
            $right
            $visible={scroll.right}
            aria-label="Scroll tabs right"
            onClick={(event) => {
              event.stopPropagation();
              rowRef.current?.scrollBy({ left: 50, behavior: "smooth" });
              updateArrows();
            }}
            type="button"
          >
            ›
          </ScrollArrow>
        </TabsHeader>
      )}
      <ScrollCanvas
        $scroll={props.shouldScrollContents === true &&
          props.dynamicHeight !== "AUTO_HEIGHT"}
        className={props.shouldScrollContents ? "canvas" : undefined}
        data-testid={`native-tabs-canvas-${props.widgetId}`}
        id={selectedId ? `tab-canvas-${selectedId}` : undefined}
        role="tabpanel"
      >
        {selectedId ? props.renderCanvas(selectedId) : null}
      </ScrollCanvas>
    </TabsContainerWrapper>
  );
}
