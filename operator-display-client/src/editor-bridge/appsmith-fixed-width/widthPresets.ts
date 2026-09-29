/**
 * Appsmith's Fixed canvas size presets. Sources:
 * app/client/src/pages/Editor/MainContainerWidthToggles.tsx
 * app/client/src/constants/WidgetConstants.tsx
 * app/client/src/pages/hooks/utils/resolveCanvasWidth.ts
 *
 * The preset belongs to the document's editor configuration. The canvas width
 * is resolved from the available viewport; it is not itself a preset ID.
 */
export type CanvasWidthPreset =
  | "FLUID"
  | "DESKTOP"
  | "TABLET_LARGE"
  | "TABLET"
  | "MOBILE";

export interface CanvasWidthPresetOption {
  name: string;
  type: CanvasWidthPreset;
  icon: "fluid" | "desktop" | "tabletLandscape" | "tablet" | "mobile";
}

export const APPSMITH_DEFAULT_CANVAS_WIDTH_PRESET: CanvasWidthPreset = "FLUID";

/** Same order, labels and icons as MainContainerWidthToggles. */
export const APPSMITH_CANVAS_WIDTH_PRESETS: readonly CanvasWidthPresetOption[] = [
  { name: "Fluid width", type: "FLUID", icon: "fluid" },
  { name: "Desktop", type: "DESKTOP", icon: "desktop" },
  { name: "Tablet (Landscape)", type: "TABLET_LARGE", icon: "tabletLandscape" },
  { name: "Tablet (Portrait)", type: "TABLET", icon: "tablet" },
  { name: "Mobile device", type: "MOBILE", icon: "mobile" },
];

/** Exact min/max values from Appsmith's layoutConfigurations. */
export const APPSMITH_CANVAS_WIDTH_RANGES: Record<CanvasWidthPreset,
  { minWidth: number; maxWidth: number }> = {
  TABLET_LARGE: { minWidth: 960, maxWidth: 1080 },
  MOBILE: { minWidth: 350, maxWidth: 450 },
  DESKTOP: { minWidth: 1160, maxWidth: 1280 },
  TABLET: { minWidth: 650, maxWidth: 800 },
  FLUID: { minWidth: -1, maxWidth: -1 },
};

/** Port of Appsmith's resolveCanvasWidth, including its Fluid behavior. */
export function resolveCanvasWidth({ appLayoutType, containerWidth }: {
  appLayoutType: CanvasWidthPreset;
  containerWidth: number;
}): number {
  const { maxWidth, minWidth } = APPSMITH_CANVAS_WIDTH_RANGES[appLayoutType];

  switch (true) {
    case maxWidth < 0:
    case containerWidth >= minWidth && containerWidth <= maxWidth:
      return Math.trunc(containerWidth);
    case containerWidth < minWidth:
      return minWidth;
    case containerWidth > maxWidth:
      return maxWidth;
    default:
      return minWidth;
  }
}

export function isCanvasWidthPreset(value: unknown): value is CanvasWidthPreset {
  return typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(APPSMITH_CANVAS_WIDTH_RANGES, value);
}
