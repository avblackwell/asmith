import React from "react";
import { Option, Select } from "@appsmith/ads";

interface ThemeFontControlProps {
  options: readonly string[];
  selectedOption: string;
  onSelect: (value: string) => void;
}

/** Appsmith ThemeFontControl.tsx option markup using its ADS Select port. */
export function ThemeFontControl({ options, selectedOption, onSelect }: ThemeFontControlProps): React.ReactElement {
  return <section className="od-theme-font-control">
    <Select dropdownClassName="t--theme-font-dropdown" onSelect={(value: string) => onSelect(String(value))} value={selectedOption}>
      {options.map((option) => <Option key={option} label={option} value={option}>
        <div className="od-theme-font-control__option">
          <span className="od-theme-font-control__sample">Aa</span>
          <span>{option}</span>
        </div>
      </Option>)}
    </Select>
  </section>;
}
