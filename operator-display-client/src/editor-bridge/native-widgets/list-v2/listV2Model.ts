import { isEmpty } from "lodash";

// WidgetConstants.tsx: DEFAULT_GRID_ROW_HEIGHT = 10 and WIDGET_PADDING = 4.
export const LIST_V2_WIDGET_PADDING = 4;
// ListWidgetV2/widget/index.tsx: LIST_WIDGET_PAGINATION_HEIGHT = 36.
export const LIST_V2_PAGINATION_HEIGHT = 36;
export const LIST_V2_DEFAULT_TEMPLATE_HEIGHT = 100;
export const LIST_V2_MAX_NESTING_LEVELS = 3;
export const LIST_V2_NESTING_ERROR = "Cannot have more than 3 levels of nesting in the list widget";

export interface ListV2PageSizeInput {
  componentHeight: number;
  templateHeight: number;
  itemSpacing: number;
  itemCount: number;
  serverSidePagination?: boolean;
  infiniteScroll?: boolean;
}

/** ListWidget.getContainerRowHeight, including Appsmith's averaged padding. */
export function listV2ContainerRowHeight(input: Pick<ListV2PageSizeInput,
  "templateHeight" | "itemSpacing" | "itemCount">): number {
  const averageItemSpacing = input.itemCount
    ? (input.itemSpacing - LIST_V2_WIDGET_PADDING * 2) *
      ((input.itemCount - 1) / input.itemCount)
    : 0;
  return input.templateHeight + averageItemSpacing;
}

/** ListWidget.getPageSize; inputs are evaluated widget dimensions and data. */
export function listV2PageSize(input: ListV2PageSizeInput): number {
  const spaceTakenByOneContainer = listV2ContainerRowHeight(input);
  const spaceAvailableWithoutPaginationControls =
    input.componentHeight - LIST_V2_WIDGET_PADDING * 2;
  const spaceAvailableWithPaginationControls =
    spaceAvailableWithoutPaginationControls - LIST_V2_PAGINATION_HEIGHT;
  const spaceTakenByAllContainers = spaceTakenByOneContainer * input.itemCount;
  const exceedsAvailableSpace =
    spaceTakenByAllContainers > spaceAvailableWithoutPaginationControls;
  const paginationControlsEnabled =
    spaceTakenByAllContainers > 0 &&
    (exceedsAvailableSpace || input.serverSidePagination) &&
    !input.infiniteScroll;
  const totalAvailableSpace = paginationControlsEnabled
    ? spaceAvailableWithPaginationControls
    : spaceAvailableWithoutPaginationControls;
  const pageSize = totalAvailableSpace / spaceTakenByOneContainer;
  return Number.isNaN(pageSize) ? 0 : Math.floor(pageSize);
}

/** ListWidget.shouldPaginate, separate from page-size calculation. */
export function shouldPaginateListV2(input: {
  itemCount: number;
  pageSize: number;
  serverSidePagination?: boolean;
  infiniteScroll?: boolean;
}): boolean {
  return Boolean(
    (!input.serverSidePagination && !input.infiniteScroll &&
      input.pageSize < input.itemCount) || input.serverSidePagination,
  );
}

/** MetaWidgetGenerator.getStartIndex for the supported paged path. */
export function listV2PageStartIndex(pageNo: number, pageSize: number): number {
  return pageSize * (pageNo - 1);
}

/** ListWidget.shouldRenderEmptyListComponent. */
export function listV2TemplateDoesNotFit(
  templateHeight: number,
  componentHeight: number,
  pageSize: number,
): boolean {
  return Number.isNaN(templateHeight) ||
    templateHeight > componentHeight - 45 || pageSize === 0;
}

/** ListWidget's lodash isEmpty check on evaluated listData. */
export function listV2DataIsEmpty(listData: readonly unknown[] | undefined): boolean {
  return Array.isArray(listData) && listData.filter((item) => !isEmpty(item)).length === 0;
}

/** Fixed BEFORE_ADD/PASTE/DROP rule, with childDepth including the new List. */
export function assertListV2Nesting(parentDepth: number, childDepth = 1): void {
  if (parentDepth + childDepth > LIST_V2_MAX_NESTING_LEVELS) {
    throw new Error(LIST_V2_NESTING_ERROR);
  }
}
