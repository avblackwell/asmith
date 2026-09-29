import React from "react";
import { SegmentedControl, type SegmentedControlOption } from "@appsmith/ads";

interface ThemeBorderRadiusControlProps {
  options: Record<string, string>;
  selectedOption?: string;
  onChange: (value: string) => void;
}

/** Adapted from Appsmith ThemeBorderRadiusControl.tsx. */
export function ThemeBorderRadiusControl({ options, selectedOption, onChange }: ThemeBorderRadiusControlProps): React.ReactElement {
  const selectedOptionKey = Object.keys(options).find((key) => options[key] === selectedOption) ?? "";
  const buttonGroupOptions: SegmentedControlOption[] = ["none", "M", "L"]
    .filter((key) => key in options)
    .map((key) => ({
      label: <span className="od-theme-border-icon t--theme-appBorderRadius" style={{ borderTopLeftRadius: options[key] }} title={key} />,
      value: key,
    }));

  return <SegmentedControl
    isFullWidth={false}
    onChange={(value) => onChange(options[value])}
    options={buttonGroupOptions}
    value={selectedOptionKey}
  />;
}
