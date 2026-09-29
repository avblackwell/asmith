import React from "react";
import styled from "styled-components";
import { Icon, SegmentedControl } from "@appsmith/ads";
import { APPSMITH_CANVAS_WIDTH_PRESETS, isCanvasWidthPreset,
  type CanvasWidthPreset } from "./widthPresets";

const StyledSegmentedControl = styled(SegmentedControl)`
  > .ads-v2-segmented-control__segments-container {
    flex: 1 1 0%;
  }
`;

interface MainContainerWidthTogglesProps {
  value: CanvasWidthPreset;
  onChange: (value: CanvasWidthPreset) => void;
}

const options = APPSMITH_CANVAS_WIDTH_PRESETS.map((layout) => ({
  label: <Icon aria-label={layout.name} name={layout.icon} size="md" title={layout.name} />,
  value: layout.type,
}));

/**
 * Appsmith MainContainerWidthToggles with its application action replaced by
 * an editor callback. The ADS SegmentedControl and icons are copied verbatim.
 */
export function MainContainerWidthToggles({ value, onChange }:
  MainContainerWidthTogglesProps): React.ReactElement {
  return (
    <div className="pb-6 space-y-2 t--layout-control-wrapper">
      <StyledSegmentedControl
        aria-label="Canvas size"
        onChange={(nextValue) => { if (isCanvasWidthPreset(nextValue)) onChange(nextValue); }}
        options={options}
        value={value}
      />
    </div>
  );
}
