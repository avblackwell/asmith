import React from "react";
import type { ReactElement, ReactNode } from "react";
import styled from "styled-components";
import {
  LIST_V2_WIDGET_PADDING,
  listV2DataIsEmpty,
  listV2TemplateDoesNotFit,
} from "./listV2Model";

const ListHost = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
`;

// Appsmith ListWidgetV2/component/index.tsx, with evaluated CSS inputs.
const StyledListContainer = styled.div<{
  $backgroundColor: string;
  $borderRadius: string;
  $boxShadow: string;
}>`
  height: 100%;
  width: 100%;
  position: relative;
  background: ${({ $backgroundColor }) => $backgroundColor};
  border-radius: ${({ $borderRadius }) => $borderRadius};
  box-shadow: ${({ $boxShadow }) => $boxShadow};
  overflow: hidden;
`;

const ListComponentEmpty = styled.div<{ $borderColor: string }>`
  height: 100%;
  width: 100%;
  position: relative;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: Verdana, sans;
  font-size: 10px;
  text-anchor: middle;
  color: rgb(102, 102, 102);
  box-shadow: ${({ $borderColor }) => `0px 0px 0px 1px ${$borderColor}`};
`;

const ScrollableCanvasWrapper = styled.div<{ $height: number; $infiniteScroll: boolean }>`
  ${({ $infiniteScroll }) => $infiniteScroll && `
    position: relative;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-color: #cccccc transparent;
    scrollbar-width: thin;
    &::-webkit-scrollbar-thumb { background: #cccccc !important; }
    &::-webkit-scrollbar-track { background: transparent !important; }
  `}
  height: ${({ $height }) => $height - LIST_V2_WIDGET_PADDING * 2}px;
`;

// Appsmith ListWidgetV2/component/Loader.tsx. The source uses Blueprint's
// global bp3-skeleton style; these local rules supply its missing host style.
const LoaderWrapper = styled.div`
  height: 100%;
  width: 100%;
  position: relative;
  overflow: hidden;
  box-shadow: 0px 0px 0px 1px #e7e7e7;
`;

const LoaderItem = styled.div<{ $templateHeight: number; $itemSpacing: number }>`
  height: ${({ $templateHeight }) => $templateHeight - LIST_V2_WIDGET_PADDING * 2}px;
  margin: ${LIST_V2_WIDGET_PADDING}px;
  margin-bottom: ${({ $itemSpacing }) => $itemSpacing + LIST_V2_WIDGET_PADDING}px;
  &:last-of-type { margin-bottom: 0; }
  background: linear-gradient(90deg, #f0f0f0 0%, #e6e6e6 50%, #f0f0f0 100%);
  background-size: 200% 100%;
  animation: list-v2-skeleton 1.6s linear infinite;
  @keyframes list-v2-skeleton { to { background-position-x: -200%; } }
`;

// ListPagination.tsx uses rc-pagination's 28px buttons, centered 4px above
// the bottom edge. This static client-side branch keeps those dimensions and
// page actions local to the view; it does not execute onPageChange handlers.
const PaginationHost = styled.nav`
  position: absolute;
  bottom: 4px;
  left: 0;
  right: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font: 14px Verdana, sans-serif;
`;

const PageButton = styled.button`
  min-width: 28px;
  height: 28px;
  padding: 0 6px;
  border: 1px solid #d9d9d9;
  border-radius: 2px;
  background: #fff;
  color: rgba(0, 0, 0, 0.85);
  cursor: pointer;
  &:hover:not(:disabled) { border-color: #40a9ff; color: #1890ff; }
  &:disabled { color: rgba(0, 0, 0, 0.25); cursor: not-allowed; }
`;

export interface NativeListV2PaginationProps {
  widgetId: string;
  currentPage: number;
  pageCount: number;
  onPageChange: (pageNo: number) => void;
}

export function NativeListV2Pagination(props: NativeListV2PaginationProps): ReactElement {
  return <PaginationHost aria-label={`${props.widgetId} pages`} data-list-pagination="true">
    <PageButton aria-label="Previous Page" disabled={props.currentPage <= 1}
      onClick={() => props.onPageChange(props.currentPage - 1)} type="button">‹</PageButton>
    <span aria-live="polite">{props.currentPage} / {props.pageCount}</span>
    <PageButton aria-label="Next Page" disabled={props.currentPage >= props.pageCount}
      onClick={() => props.onPageChange(props.currentPage + 1)} type="button">›</PageButton>
  </PaginationHost>;
}

function safeColor(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const color = value.trim();
  return /^#[\da-f]{3,8}$/i.test(color) ||
    /^rgba?\([\d\s.,%]+\)$/i.test(color) ||
    /^hsla?\([\d\s.,%]+\)$/i.test(color) ||
    /^[a-z]+$/i.test(color) ? color : fallback;
}

function safeRadius(value: string | number | undefined): string {
  if (value === undefined) return "0px";
  const radius = String(value).trim();
  return /^\d+(?:\.\d+)?(?:px|rem|em|%)?$/.test(radius)
    ? radius : "0px";
}

function safeShadow(value: string | undefined): string {
  if (!value) return "none";
  const shadow = value.trim();
  return shadow === "none" || /^[\d\s.,()%a-z#-]+$/i.test(shadow)
    ? shadow : "none";
}

export interface NativeListV2ViewProps {
  widgetId: string;
  /** Already evaluated List data; this component never evaluates expressions. */
  listData?: readonly unknown[];
  /** The measured main item container height, not defaultProps.templateHeight. */
  templateHeight: number;
  componentHeight: number;
  pageSize: number;
  itemSpacing?: number;
  isLoading?: boolean;
  infiniteScroll?: boolean;
  backgroundColor?: string;
  borderRadius?: string | number;
  boxShadow?: string;
  emptyBorderColor?: string;
  /** Rendered Appsmith row/meta-widget canvas for the current page. */
  materializedRows: ReactNode;
  /** Caller supplies Appsmith's paginator and its page action wiring. */
  pagination?: ReactNode;
}

/** ListWidgetV2's visual shell, with an explicit materialized-row boundary. */
export function NativeListV2View(props: NativeListV2ViewProps): ReactElement {
  const itemSpacing = props.itemSpacing ?? 0;
  const emptyBorderColor = safeColor(props.emptyBorderColor, "#e7e7e7");
  let content: ReactNode;

  if (props.isLoading) {
    content = (
      <LoaderWrapper data-list-state="loading">
        {Array.from({ length: Math.max(0, Math.floor(props.pageSize)) }, (_, index) => (
          <LoaderItem
            $itemSpacing={itemSpacing}
            $templateHeight={props.templateHeight}
            className="bp3-card bp3-skeleton"
            key={index}
          />
        ))}
      </LoaderWrapper>
    );
  } else if (listV2DataIsEmpty(props.listData)) {
    content = (
      <>
        <ListComponentEmpty $borderColor={emptyBorderColor} data-list-state="empty">
          No data to display
        </ListComponentEmpty>
        {props.pagination}
      </>
    );
  } else if (listV2TemplateDoesNotFit(
    props.templateHeight, props.componentHeight, props.pageSize,
  )) {
    content = (
      <ListComponentEmpty $borderColor={emptyBorderColor} data-list-state="template-too-tall">
        Please make sure the list widget height is greater than the template
        container height.
      </ListComponentEmpty>
    );
  } else {
    content = (
      <StyledListContainer
        $backgroundColor={safeColor(props.backgroundColor, "transparent")}
        $borderRadius={safeRadius(props.borderRadius)}
        $boxShadow={safeShadow(props.boxShadow)}
        data-list-state="items"
      >
        <ScrollableCanvasWrapper
          $height={props.componentHeight}
          $infiniteScroll={props.infiniteScroll ?? false}
        >
          {props.materializedRows}
          {props.pagination}
        </ScrollableCanvasWrapper>
      </StyledListContainer>
    );
  }

  return (
    <ListHost data-native-widget="list-v2" data-testid={`native-list-v2-${props.widgetId}`}>
      {content}
    </ListHost>
  );
}
