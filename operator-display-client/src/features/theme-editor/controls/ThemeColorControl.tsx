import React, { useCallback, useState } from "react";
import type { ThemeProperties } from "../types";
import { themeControlLabel } from "../themeConstants";
import { ThemeColorPicker } from "./ThemeColorPicker";

interface ThemeColorControlProps {
  properties: ThemeProperties;
  onChange: (properties: ThemeProperties) => void;
}

/** Adapted from Appsmith ThemePropertyPane/controls/ThemeColorControl.tsx. */
export function ThemeColorControl({ properties, onChange }: ThemeColorControlProps): React.ReactElement {
  const [autoFocus, setAutoFocus] = useState(false);
  const userDefinedColors = properties.colors;
  const [selectedColor, setSelectedColor] = useState<string>("primaryColor");

  const onColorClick = useCallback((colorName: string) => {
    setAutoFocus(selectedColor === colorName ? !autoFocus : true);
    setSelectedColor(colorName);
  }, [autoFocus, selectedColor]);

  const onChangeColor = useCallback((color: string) => {
    onChange({
      ...properties,
      colors: { ...properties.colors, [selectedColor]: color },
    });
  }, [selectedColor, properties, onChange]);

  return <div className="od-theme-color-control">
    <div className="od-theme-color-control__swatches">
      {Object.keys(userDefinedColors).map((colorName) => <button
        aria-label={themeControlLabel(colorName)}
        aria-pressed={selectedColor === colorName}
        className={`od-theme-color-control__swatch${selectedColor === colorName ? " selected" : ""}`}
        data-color-name={colorName}
        data-testid={`theme-${colorName}`}
        key={colorName}
        onClick={() => onColorClick(colorName)}
        style={{ backgroundColor: userDefinedColors[colorName] }}
        title={themeControlLabel(colorName)}
        type="button"
      />)}
    </div>
    {selectedColor && <div className="od-theme-color-control__selected">
      <h3>{themeControlLabel(selectedColor)}</h3>
      <ThemeColorPicker
        color={userDefinedColors[selectedColor]}
        isOpen={autoFocus}
        key={selectedColor}
        onChange={onChangeColor}
        onPopupClosed={() => setAutoFocus(false)}
      />
    </div>}
  </div>;
}
