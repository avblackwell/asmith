import React from "react";
import { Icon } from "@appsmith/ads";
import type { ThemeProperties } from "./types";
import { getComplementaryGrayscaleColor } from "./themeConstants";
import { DeleteThemeModal } from "./DeleteThemeModal";

/** Source markup from Appsmith ThemePropertyPane/ThemeCard.tsx; Redux dispatch is a prop. */
interface ThemeCardProps {
  name: string;
  displayName: string;
  properties: ThemeProperties;
  selectable?: boolean;
  onSelect?: () => void;
  onDelete?: () => Promise<void>;
  children?: React.ReactNode;
}

export function ThemeCard({
  name,
  displayName,
  properties,
  selectable = false,
  onSelect,
  onDelete,
  children,
}: ThemeCardProps): React.ReactElement {
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const userDefinedColors = properties.colors;
  const primaryColor = userDefinedColors.primaryColor;
  const backgroundColor = userDefinedColors.backgroundColor;
  const primaryBorderRadius = properties.borderRadius[Object.keys(properties.borderRadius)[0]] ?? "0px";
  const primaryBoxShadow = properties.boxShadow[Object.keys(properties.boxShadow)[0]] ?? "none";

  return <div className="od-theme-card-group">
    {selectable && <div className="od-theme-card__name-row">
      <h3 className="od-theme-card-name">{displayName}</h3>
      {onDelete && <button
        aria-label={`Delete ${displayName} theme`}
        className="od-theme-card__delete"
        onClick={() => setDeleteOpen(true)}
        title={`Delete ${displayName} theme`}
        type="button"
      ><Icon name="delete-bin-line" size="md" /></button>}
    </div>}
    <div
      aria-label={selectable ? `Apply ${displayName} theme` : `${displayName} theme`}
      className={`od-theme-card t--theme-card${selectable ? " od-theme-card--selectable" : ""}`}
      data-testid={`t--theme-card-${name}`}
      onClick={selectable ? onSelect : undefined}
      onKeyDown={selectable ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect?.();
        }
      } : undefined}
      role={selectable ? "button" : undefined}
      tabIndex={selectable ? 0 : undefined}
    >
      <main className="od-theme-card__main" style={{ backgroundColor }}>
        <div className="od-theme-card__header" style={{ backgroundColor: primaryColor }} />
        <section className="od-theme-card__sample-row">
          <span className="od-theme-card__sample-text" style={{ color: getComplementaryGrayscaleColor(backgroundColor) }}>
            AaBbCc
          </span>
          <div className="od-theme-card__colors">
            {Object.keys(userDefinedColors).map((colorKey) => <span
              className="od-theme-card__color-circle"
              key={colorKey}
              style={{ backgroundColor: userDefinedColors[colorKey] }}
            />)}
          </div>
        </section>
        <div className="od-theme-card__body">
          <div className="od-theme-card__buttons">
            <span className="od-theme-card__sample-button" style={{
              backgroundColor: primaryColor,
              borderColor: "transparent",
              borderRadius: primaryBorderRadius,
              boxShadow: primaryBoxShadow,
              color: getComplementaryGrayscaleColor(primaryColor),
            }}>Button</span>
            <span className="od-theme-card__sample-button" style={{
              backgroundColor: "white",
              borderColor: primaryColor,
              borderRadius: primaryBorderRadius,
              boxShadow: primaryBoxShadow,
              color: "black",
            }}>Button</span>
          </div>
        </div>
      </main>
      {selectable && <div className="od-theme-card__apply">Apply theme</div>}
      {children}
    </div>
    {onDelete && <DeleteThemeModal
      displayName={displayName}
      isOpen={deleteOpen}
      onClose={() => setDeleteOpen(false)}
      onDelete={onDelete}
    />}
  </div>;
}
