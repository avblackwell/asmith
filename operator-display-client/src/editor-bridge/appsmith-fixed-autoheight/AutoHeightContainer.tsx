import React, { useEffect, useRef, useState } from "react";
import type { PropsWithChildren } from "react";
import styled from "styled-components";
import {
  DEFAULT_GRID_ROW_HEIGHT,
  MIN_HEIGHT_IN_ROWS,
  paddedContentHeight,
  shouldUpdateWidgetHeightAutomatically,
  type AutoHeightWidget,
} from "./autoHeightRules";

const StyledAutoHeightContainer = styled.div<{ isOverflow?: boolean }>`
  overflow-y: ${(props) => (props.isOverflow ? "auto" : "unset")};
  overflow-x: ${(props) => (props.isOverflow ? "hidden" : "unset")};
  padding-right: 4px;
  height: 100%;
`;

const CenterContainer = styled.div<{ shouldBeCentered: boolean }>`
  display: flex;
  height: 100%;
  width: 100%;
  align-items: ${(props) => (props.shouldBeCentered ? "center" : "flex-start")};
`;

const SimpleContainer = styled.div`
  height: auto !important;
  width: 100%;
`;

export interface AppsmithAutoHeightContainerProps extends AutoHeightWidget {
  widgetId: string;
  widgetName: string;
  type: string;
  backgroundColor?: string;
  /** EditorContext.updateWidgetAutoHeight adapter. Height is padded pixels. */
  onHeightUpdate: (widgetId: string, heightInPixels: number) => void;
  /** Mounted editor payload revision; retries measurements deferred during projection. */
  retryEpoch?: number;
}

/**
 * Appsmith's FIXED content-measurement wrapper. This should only be mounted for
 * auto-height, non-canvas widgets, just as FixedLayoutWidgetComponent does.
 */
export function AppsmithAutoHeightContainer({
  children,
  onHeightUpdate,
  widgetId,
  widgetName,
  type,
  backgroundColor,
  retryEpoch = 0,
  ...widget
}: PropsWithChildren<AppsmithAutoHeightContainerProps>) {
  // Wait for the observer's first reading so a new widget cannot send a
  // spurious zero-height update before its Text content has rendered.
  const [expectedHeight, setExpectedHeight] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const unmountingTimeout = useRef<ReturnType<typeof setTimeout>>();
  const callbackRef = useRef(onHeightUpdate);
  callbackRef.current = onHeightUpdate;
  const widgetRef = useRef(widget);
  widgetRef.current = widget;
  const widgetHeightInPixels = (widget.bottomRow - widget.topRow) * DEFAULT_GRID_ROW_HEIGHT;
  const minDynamicHeight = widget.minDynamicHeight ?? MIN_HEIGHT_IN_ROWS;
  const maxDynamicHeight = widget.maxDynamicHeight ?? 9000;
  const isAutoHeightWithLimits = widget.dynamicHeight === "AUTO_HEIGHT_WITH_LIMITS";

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    // Switching to/from limits changes the wrapper tree and replaces this
    // measured DOM node while keeping the widget component mounted.
    setExpectedHeight(null);
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height ?? 0;
      if (unmountingTimeout.current) clearTimeout(unmountingTimeout.current);
      if (height) {
        setExpectedHeight(height);
      } else {
        unmountingTimeout.current = setTimeout(() => setExpectedHeight(height), 0);
      }
    });
    observer.observe(element);
    return () => {
      if (unmountingTimeout.current) clearTimeout(unmountingTimeout.current);
      observer.disconnect();
    };
  }, [isAutoHeightWithLimits]);

  function updateHeight() {
    if (expectedHeight === null) return;
    const paddedHeight = paddedContentHeight(expectedHeight);
    if (shouldUpdateWidgetHeightAutomatically(paddedHeight, widgetRef.current)) {
      callbackRef.current(widgetId, paddedHeight);
    }
  }

  // Appsmith runs a content/limit effect and a separate geometry effect. The
  // geometry effect needs the equality guard: WidgetUtils' final decision
  // branch may be true even when the measured and stored heights match.
  useEffect(() => {
    updateHeight();
  }, [expectedHeight, minDynamicHeight, maxDynamicHeight]);

  useEffect(() => {
    if (expectedHeight !== null &&
      widgetHeightInPixels !== paddedContentHeight(expectedHeight)) {
      updateHeight();
    }
  }, [widgetHeightInPixels]);

  // Another Text can commit a height change while this widget's observer
  // fires. The editor defers commands until the new payload is projected, so
  // retry an unchanged reading after that projection without remounting.
  useEffect(() => {
    if (!retryEpoch || expectedHeight === null ||
      widgetHeightInPixels === paddedContentHeight(expectedHeight)) return;
    updateHeight();
  }, [retryEpoch]);

  const shouldBeCentered =
    widgetHeightInPixels / DEFAULT_GRID_ROW_HEIGHT === minDynamicHeight &&
    minDynamicHeight === MIN_HEIGHT_IN_ROWS;
  const content = (
    <CenterContainer
      data-testid={`t--centered-${widgetName}-${widgetId}`}
      shouldBeCentered={shouldBeCentered}
    >
      <SimpleContainer className="auto-height-container" ref={ref}>
        {children}
      </SimpleContainer>
    </CenterContainer>
  );

  if (!isAutoHeightWithLimits) return content;
  return (
    <StyledAutoHeightContainer
      className="auto-height-scroll-container"
      isOverflow={expectedHeight !== null &&
        maxDynamicHeight < Math.ceil(expectedHeight / DEFAULT_GRID_ROW_HEIGHT)}
      style={{ backgroundColor: type === "TEXT_WIDGET" ? backgroundColor : undefined }}
    >
      {content}
    </StyledAutoHeightContainer>
  );
}
