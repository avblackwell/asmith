import React, { useEffect, useRef, useState } from "react";
import { TAILWIND_COLORS } from "../themeConstants";

interface ThemeColorPickerProps {
  color: string;
  isOpen: boolean;
  onChange: (color: string) => void;
  onPopupClosed: () => void;
}

function isValidColor(color: string): boolean {
  return !color.trim() || (typeof CSS !== "undefined" && CSS.supports("color", color));
}

/**
 * The Appsmith ColorPickerComponentV2's input, 35 Tailwind swatches, popup,
 * and full-picker switch. Its brand/application selectors and telemetry are
 * omitted because ThemeColorControl does not enable those sections.
 */
export function ThemeColorPicker({ color, isOpen, onChange, onPopupClosed }: ThemeColorPickerProps): React.ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const currentFocus = useRef(0);
  const focusTrapped = useRef(false);
  const pointerFocus = useRef(false);
  const [value, setValue] = useState(color);
  const [popupOpen, setPopupOpen] = useState(isOpen);
  const [isFullColorPicker, setFullColorPicker] = useState(false);

  useEffect(() => setValue(color), [color]);
  useEffect(() => {
    setPopupOpen(isOpen);
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!popupOpen) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setPopupOpen(false);
        focusTrapped.current = false;
        onPopupClosed();
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [popupOpen, onPopupClosed]);

  // ColorPickerComponentV2 listens on body while the popover is open. A Tab
  // from its input enters the palette; keyboard focus then stays in the
  // popup until Escape closes it and returns focus to the input.
  useEffect(() => {
    if (!popupOpen || isFullColorPicker) return;
    const handleKeydown = (event: KeyboardEvent) => {
      const active = document.activeElement;
      const swatches = Array.from(popupRef.current?.querySelectorAll<HTMLButtonElement>(
        ".od-theme-color-picker__palette-color",
      ) ?? []);
      const swatchIndex = swatches.indexOf(active as HTMLButtonElement);
      if (active !== inputRef.current && swatchIndex < 0) return;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setPopupOpen(false);
        focusTrapped.current = false;
        onPopupClosed();
        window.setTimeout(() => inputRef.current?.focus(), 300);
      } else if (event.key === "Tab") {
        if (active === inputRef.current) {
          event.preventDefault();
          currentFocus.current = 0;
          swatches[0]?.focus();
          focusTrapped.current = true;
        } else if (focusTrapped.current) {
          event.preventDefault();
          swatches[0]?.focus();
        }
      } else if (event.key === "Enter" && swatchIndex >= 0) {
        event.preventDefault();
        swatches[swatchIndex]?.click();
        window.setTimeout(() => inputRef.current?.focus(), 300);
      } else if (swatchIndex >= 0 && event.key.startsWith("Arrow")) {
        event.preventDefault();
        const totalColors = swatches.length;
        const maxCols = 10;
        currentFocus.current = swatchIndex;
        switch (event.key) {
          case "ArrowRight":
            currentFocus.current++;
            if (currentFocus.current % maxCols === 0 || currentFocus.current >= totalColors) {
              currentFocus.current = currentFocus.current % maxCols === 0
                ? currentFocus.current - maxCols
                : totalColors - (totalColors % maxCols);
            }
            break;
          case "ArrowLeft":
            currentFocus.current--;
            if (currentFocus.current < 0 || currentFocus.current % maxCols === maxCols - 1) {
              currentFocus.current += maxCols;
              if (currentFocus.current >= totalColors) currentFocus.current = totalColors - 1;
            }
            break;
          case "ArrowDown":
            currentFocus.current += maxCols;
            if (currentFocus.current >= totalColors) currentFocus.current %= maxCols;
            break;
          case "ArrowUp":
            currentFocus.current -= maxCols;
            if (currentFocus.current < 0) {
              const factor = Math.floor(totalColors / maxCols) * maxCols;
              const nextIndex = factor + currentFocus.current + maxCols;
              currentFocus.current = nextIndex >= totalColors ? nextIndex - maxCols : nextIndex;
            }
            break;
        }
        swatches[currentFocus.current]?.focus();
      }
    };
    document.body.addEventListener("keydown", handleKeydown);
    return () => document.body.removeEventListener("keydown", handleKeydown);
  }, [popupOpen, isFullColorPicker, onPopupClosed]);

  useEffect(() => {
    if (value === color || !value.trim() || !isValidColor(value)) return;
    const timer = window.setTimeout(() => onChange(value), 250);
    return () => window.clearTimeout(timer);
  }, [value, color, onChange]);

  const palette = Object.entries(TAILWIND_COLORS).flatMap(([family, shades]) =>
    Object.entries(shades).map(([shade, shadeColor]) => ({ family, shade, color: shadeColor })));

  const selectColor = (nextColor: string) => {
    setValue(nextColor);
    setPopupOpen(false);
    onPopupClosed();
    onChange(nextColor);
  };

  return <div className="od-theme-color-picker t--colorpicker-v2-popover" ref={rootRef}>
    <div className="od-theme-color-picker__input-wrap">
      {!isFullColorPicker && <span className="od-theme-color-picker__swatch" style={{ backgroundColor: isValidColor(value) ? value : "white" }} />}
      <input
        aria-label="Theme color value"
        aria-invalid={!isValidColor(value)}
        className={`od-theme-color-picker__input${isFullColorPicker ? " od-theme-color-picker__input--full" : ""}`}
        data-testid="t--color-picker-input"
        onChange={(event) => setValue(event.target.value)}
        onClick={() => !isFullColorPicker && setPopupOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !isFullColorPicker && !popupOpen) setPopupOpen(true);
          if (event.key === "Escape" && !popupOpen) inputRef.current?.blur();
        }}
        placeholder="enter color name or hex"
        ref={inputRef}
        type={isFullColorPicker ? "color" : "text"}
        value={value}
      />
    </div>
    {popupOpen && !isFullColorPicker && <div
      className="od-theme-color-picker__popup"
      data-testid="color-picker"
      onFocusCapture={() => {
        if (!pointerFocus.current) focusTrapped.current = true;
        pointerFocus.current = false;
      }}
      onPointerDownCapture={() => { pointerFocus.current = true; }}
      ref={popupRef}
    >
      <div className="od-theme-color-picker__palette t--tailwind-colors" data-testid="t--all-colors">
        {palette.map(({ family, shade, color: swatchColor }, index) => <button
          aria-label={`${family} ${shade} ${swatchColor}`}
          aria-selected={value.toLowerCase() === swatchColor.toLowerCase()}
          className="od-theme-color-picker__palette-color t--colorpicker-v2-color"
          key={`${family}-${shade}`}
          onClick={() => selectColor(swatchColor)}
          style={{ backgroundColor: swatchColor }}
          tabIndex={index === 0 ? 0 : -1}
          title={`${family} ${shade}`}
          type="button"
        />)}
      </div>
    </div>}
    <label className="od-theme-color-picker__full-switch">
      <span>Full color picker</span>
      <input
        aria-label="Full color picker"
        checked={isFullColorPicker}
        onChange={(event) => {
          setFullColorPicker(event.target.checked);
          setPopupOpen(false);
          onPopupClosed();
        }}
        type="checkbox"
      />
    </label>
  </div>;
}
