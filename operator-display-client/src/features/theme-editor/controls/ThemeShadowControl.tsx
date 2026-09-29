import React from "react";
import { Icon, SegmentedControl } from "@appsmith/ads";
import { BOX_SHADOW_SIZE_MAPPINGS } from "../themeConstants";

interface ThemeShadowControlProps {
  options: Record<string, string>;
  selectedOption?: string;
  onChange: (value: string) => void;
}

/** Adapted from Appsmith ThemeShadowControl.tsx. */
export function ThemeShadowControl({ options, selectedOption, onChange }: ThemeShadowControlProps): React.ReactElement {
  const selectedOptionKey = Object.keys(options).find((key) => options[key] === selectedOption) ?? "";
  const buttonGroupOptions = Object.keys(options).map((optionKey) => ({
    label: optionKey === "none" ? <Icon name="close-line" size="md" /> : BOX_SHADOW_SIZE_MAPPINGS[optionKey] ?? optionKey,
    value: optionKey,
  }));

  return <SegmentedControl
    isFullWidth={false}
    onChange={(optionKey) => onChange(options[optionKey])}
    options={buttonGroupOptions}
    value={selectedOptionKey}
  />;
}
