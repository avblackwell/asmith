import React, { useMemo, useState } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import styled from "styled-components";
import Interweave from "interweave";
import {
  getClientTableRows,
  getTableCellValue,
  getTableColumns,
  getTableDisplayText,
  getTablePageSize,
  isTableCellVisible,
  normalizeStaticTableData,
} from "./tableModel";
import type { TableColumn, TableMode, TableSort, TableWidgetLike, TableRow } from "./tableModel";

// Appsmith TableWidgetV2/component/TableStyledWrappers.tsx and
// StaticTable/StaticTableBodyComponent.tsx. The original wrapper uses
// react-table, SimpleBar, and Appsmith commands; this display-only branch
// retains its fixed header, static rows, compact sizes, and toolbar geometry.
const TableHost = styled.div`
  width: 100%; height: 100%; background: white; box-sizing: border-box;
  display: flex; flex-direction: column; overflow: hidden; color: #231f20;
  font-family: var(--ads-font-family, Inter, Arial, sans-serif);
`;
const Toolbar = styled.div`
  flex: 0 0 40px; height: 40px; display: flex; align-items: center;
  gap: 8px; padding: 0 8px; box-sizing: border-box;
  border-bottom: 1px solid #e7e7e7; background: white;
`;
const Search = styled.input`
  width: min(180px, 40%); min-width: 70px; height: 26px; box-sizing: border-box;
  padding: 0 8px; border: 1px solid #d0d0d0; border-radius: 4px;
  outline: none; font: 12px inherit; background: white;
  &:focus { border-color: #6a8df0; }
  &:disabled { opacity: 0.55; }
`;
const ToolButton = styled.button`
  display: inline-flex; align-items: center; justify-content: center;
  height: 26px; min-width: 26px; padding: 0 6px;
  color: #555; background: white; border: 1px solid #ddd; border-radius: 4px;
  font: 12px inherit; cursor: pointer;
  &:disabled { opacity: 0.48; cursor: default; }
`;
const PageLabel = styled.span`
  white-space: nowrap; color: #555; font-size: 12px;
`;
const TableScroll = styled.div`
  position: relative; min-height: 0; flex: 1 1 auto; overflow: auto;
`;
const Grid = styled.table`
  border-spacing: 0; table-layout: fixed; min-width: 100%; width: max-content;
  color: #231f20;
  th, td { box-sizing: border-box; position: relative; border-right: 1px solid #e7e7e7;
    border-bottom: 1px solid #e7e7e7; overflow: hidden; white-space: nowrap;
    text-overflow: ellipsis; text-align: left; }
  th:last-child, td:last-child { border-right: 0; }
  th { position: sticky; top: 0; z-index: 1; height: 32px; padding: 0 8px;
    background: var(--table-header-background, #f7f7f7);
    color: var(--table-header-color, #231f20); font-size: 14px; font-weight: 600; }
  td { height: var(--table-row-height, 40px); padding: 0 8px;
    font-size: var(--table-row-font-size, 14px); vertical-align: middle; }
  tr:nth-child(odd) td { background: var(--table-odd-background, #fff); }
  tr:nth-child(even) td { background: var(--table-even-background, #fff); }
  tbody tr:hover td { background: #f4f5f6; }
  [data-hidden-column="true"] { opacity: 0.5; }
  a { color: #276ef1; text-decoration: underline; }
  img { max-width: 32px; max-height: 32px; object-fit: contain; vertical-align: middle; }
  button { height: 24px; border: 0; border-radius: 4px; background: #e7e7e7;
    color: #555; padding: 0 8px; cursor: default; }
  button:disabled { opacity: 0.6; }
`;
const ConnectOverlay = styled.div`
  position: absolute; inset: 32px 0 0; z-index: 2; display: flex;
  align-items: center; justify-content: center; padding: 20px;
  text-align: center; color: #757575; background: rgba(255,255,255,.86); font-size: 12px;
`;

export interface NativeTableViewProps {
  widget: TableWidgetLike;
  width: number;
  height: number;
  mode: TableMode;
}

function safeColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const color = value.trim();
  return /^#[\da-f]{3,8}$/i.test(color) || /^rgba?\([\d\s.,%]+\)$/i.test(color) ||
    /^hsla?\([\d\s.,%]+\)$/i.test(color) || /^[a-z]+$/i.test(color) ? color : fallback;
}

function safeRadius(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "0px";
  const radius = String(value).trim();
  return /^\d+(?:\.\d+)?(?:px|rem|em|%)?$/.test(radius) ? radius : "0px";
}

function readSort(value: unknown): TableSort | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const sort = value as Record<string, unknown>;
    if (typeof sort.column === "string" && (sort.order === "asc" || sort.order === "desc"))
      return { column: sort.column, order: sort.order };
  }
  return undefined;
}

function safeImageSource(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const candidate = value.trim();
  return /^https?:\/\//i.test(candidate) || /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(candidate)
    ? candidate : undefined;
}

function rowProperty(value: unknown, rowIndex: number): unknown {
  return Array.isArray(value) ? value[rowIndex] : value;
}

// TableWidget/widget/getTableColumns.tsx resolves each child style for a row;
// its button/menu renderers use column color, radius and shadow with the table
// accent color as the color fallback.
function actionStyle(column: TableColumn, rowIndex: number, widget: TableWidgetLike): CSSProperties {
  const colorValue = column.columnType === "menuButton" ? column.menuColor : column.buttonColor;
  const color = safeColor(rowProperty(colorValue, rowIndex),
    safeColor(widget.accentColor, "#03B365"));
  const radius = safeRadius(rowProperty(column.borderRadius, rowIndex) ?? widget.borderRadius);
  const shadow = rowProperty(column.boxShadow, rowIndex);
  const variant = rowProperty(column.columnType === "menuButton" ?
    column.menuVariant : column.buttonVariant, rowIndex);
  return {
    backgroundColor: variant === "SECONDARY" ? "white" : color,
    border: variant === "SECONDARY" ? `1px solid ${color}` : "1px solid transparent",
    borderRadius: radius,
    boxShadow: typeof shadow === "string" && !/[;{}]/.test(shadow) ? shadow : undefined,
    color: variant === "SECONDARY" ? color :
      safeColor(rowProperty(column.buttonLabelColor, rowIndex), "white"),
  };
}

function cellContent(row: TableRow, column: TableColumn, rowIndex: number,
  widget: TableWidgetLike): ReactNode {
  if (!isTableCellVisible(column, rowIndex)) return null;
  const value = getTableCellValue(row, column, rowIndex);
  const display = getTableDisplayText(row, column, rowIndex);
  switch (column.columnType) {
    case "checkbox":
    case "switch":
      return <input aria-label={column.label} checked={value === true} disabled readOnly type="checkbox" />;
    case "image": {
      const source = safeImageSource(value);
      return source ? <img alt={column.label} src={source} /> : null;
    }
    case "html":
      return <Interweave content={typeof value === "string" ? value : display} />;
    case "button": {
      const label = rowProperty(column.buttonLabel, rowIndex);
      return <button disabled style={actionStyle(column, rowIndex, widget)}
        title="Table actions are not connected" type="button">{
          typeof label === "string" && label ? label : display || "Action"}</button>;
    }
    case "menuButton": {
      const label = rowProperty(column.menuButtonLabel, rowIndex);
      return <button disabled style={actionStyle(column, rowIndex, widget)}
        title="Table actions are not connected" type="button">{
          typeof label === "string" && label ? label : display || "Open menu"}</button>;
    }
    case "iconButton":
      return display ? <button disabled style={actionStyle(column, rowIndex, widget)}
        title="Table actions are not connected" type="button">{display}</button> : null;
    case "editActions":
      return display ? <button disabled title="Table actions are not connected" type="button">{display}</button> : null;
    case "url":
      return display ? <span style={{ color: "#276ef1", textDecoration: "underline" }}>{display}</span> : null;
    default:
      return display;
  }
}

export function NativeTableView({ widget, width, height, mode }: NativeTableViewProps): ReactElement {
  const rows = useMemo(() => normalizeStaticTableData(widget.tableData), [widget.tableData]);
  const columns = useMemo(() => getTableColumns(widget, rows, width, mode), [widget, rows, width, mode]);
  const [searchText, setSearchText] = useState(typeof widget.searchText === "string" ? widget.searchText : "");
  const [sort, setSort] = useState<TableSort | undefined>(() => readSort(widget.sortOrder));
  const [pageNo, setPageNo] = useState(() => typeof widget.pageNo === "number" && widget.pageNo >= 1 ? Math.floor(widget.pageNo) : 1);
  const clientSearch = widget.enableClientSideSearch !== false &&
    (typeof widget.onSearchTextChanged !== "string" || widget.onSearchTextChanged.trim() === "");
  const clientSort = widget.isSortable !== false && widget.serverSidePaginationEnabled !== true &&
    (typeof widget.onSort !== "string" || widget.onSort.trim() === "");
  const clientPagination = widget.serverSidePaginationEnabled !== true && widget.infiniteScrollEnabled !== true;
  const searchableRows = getClientTableRows(rows, columns, clientSearch ? searchText : "", clientSort ? sort : undefined);
  const pageSize = getTablePageSize(widget, height, searchableRows.length);
  const pageCount = Math.max(1, Math.ceil(searchableRows.length / pageSize));
  const currentPage = Math.min(pageNo, pageCount);
  const pageRows = clientPagination
    ? searchableRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : searchableRows;
  const showToolbar = widget.isVisibleSearch !== false || widget.isVisibleFilters === true ||
    widget.isVisibleDownload !== false || widget.isVisiblePagination !== false;
  const borderWidth = typeof widget.borderWidth === "number" || typeof widget.borderWidth === "string"
    ? Math.max(0, Math.min(12, Number(widget.borderWidth) || 0)) : 1;
  const hostStyle: CSSProperties = {
    border: `${borderWidth}px solid ${safeColor(widget.borderColor, "#e7e7e7")}`,
    borderRadius: safeRadius(widget.borderRadius),
    boxShadow: typeof widget.boxShadow === "string" && !/[;{}]/.test(widget.boxShadow) ? widget.boxShadow : undefined,
    "--table-row-height": `${widget.compactMode === "TALL" ? 60 : widget.compactMode === "SHORT" ? widget.type === "TABLE_WIDGET" ? 20 : 30 : 40}px`,
    "--table-row-font-size": `${widget.compactMode === "TALL" ? 18 : widget.compactMode === "SHORT" ? 12 : 14}px`,
    "--table-header-background": safeColor(widget.headerRowColor, "#f7f7f7"),
    "--table-header-color": safeColor(widget.headerTextColor, "#231f20"),
    "--table-odd-background": safeColor(widget.oddRowColor, "#fff"),
    "--table-even-background": safeColor(widget.evenRowColor, "#fff"),
  } as CSSProperties;
  const showOverlay = mode === "editor" && widget.type !== "TABLE_WIDGET" && columns.length === 0;

  return <TableHost data-table-kind={widget.type} data-testid={`native-table-${widget.widgetId}`} style={hostStyle}>
    {showToolbar && <Toolbar>
      {widget.isVisibleSearch !== false && <Search aria-label="Search table" disabled={!clientSearch}
        onChange={(event) => { setSearchText(event.target.value); setPageNo(1); }}
        placeholder="Search..." title={clientSearch ? undefined : "Server search is not connected"}
        type="search" value={searchText} />}
      {widget.isVisibleFilters === true && <ToolButton aria-label="Filters" disabled title="Table filters are not connected" type="button">☷</ToolButton>}
      {widget.isVisibleDownload !== false && <ToolButton aria-label="Download" disabled title="Table download is not connected" type="button">↓</ToolButton>}
      <span style={{ flex: 1 }} />
      {widget.isVisiblePagination !== false && columns.length > 0 && <>
        <PageLabel>{searchableRows.length} Records</PageLabel>
        <ToolButton aria-label="Previous page" disabled={!clientPagination || currentPage <= 1}
          onClick={() => setPageNo(currentPage - 1)} type="button">‹</ToolButton>
        <PageLabel>Page {currentPage} of {pageCount}</PageLabel>
        <ToolButton aria-label="Next page" disabled={!clientPagination || currentPage >= pageCount}
          onClick={() => setPageNo(currentPage + 1)} type="button">›</ToolButton>
      </>}
    </Toolbar>}
    <TableScroll>
      <Grid aria-label={widget.widgetName || "Table"}>
        <colgroup>{columns.map((column) => <col key={column.id} style={{ width: column.width }} />)}</colgroup>
        <thead><tr>{columns.map((column) => <th aria-sort={sort?.column === column.id ? sort.order === "asc" ? "ascending" : "descending" : undefined}
          data-hidden-column={column.hidden} key={column.id} scope="col"
          style={{ textAlign: column.alignment.toLowerCase() as CSSProperties["textAlign"] }}>
          {clientSort && column.enableSort ? <button aria-label={`Sort ${column.label}`}
            onClick={() => { setSort({ column: column.id, order: sort?.column === column.id && sort.order === "asc" ? "desc" : "asc" }); setPageNo(1); }}
            style={{ all: "unset", cursor: "pointer", width: "100%" }} type="button">{column.label}{sort?.column === column.id ? sort.order === "asc" ? " ↑" : " ↓" : ""}</button>
            : column.label}
        </th>)}</tr></thead>
        <tbody>{pageRows.map(({ row, originalIndex }) => <tr data-table-row={originalIndex} key={originalIndex}>
          {columns.map((column) => <td data-hidden-column={column.hidden} data-table-column={column.id}
            key={column.id} style={{ textAlign: column.alignment.toLowerCase() as CSSProperties["textAlign"] }}
            title={getTableDisplayText(row, column, originalIndex)}>{cellContent(row, column, originalIndex, widget)}</td>)}
        </tr>)}
        {clientPagination && Array.from({ length: Math.max(0, pageSize - pageRows.length) }, (_, index) =>
          <tr aria-hidden="true" data-table-empty-row="true" key={`empty-${index}`}>
            {columns.map((column) => <td key={column.id} />)}
          </tr>)}</tbody>
      </Grid>
      {showOverlay && <ConnectOverlay>Connect your data or use sample data to display table</ConnectOverlay>}
    </TableScroll>
  </TableHost>;
}
