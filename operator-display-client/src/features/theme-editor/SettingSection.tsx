import React, { useState } from "react";
import { Collapse } from "@blueprintjs/core";
import { Icon } from "@appsmith/ads";

/** Adapted from Appsmith ThemePropertyPane/SettingSection.tsx. */
export interface SettingSectionProps extends React.ComponentPropsWithoutRef<"div"> {
  isDefaultOpen?: boolean;
  title: string;
  collapsible?: boolean;
}

export function SettingSection(props: SettingSectionProps): React.ReactElement {
  const {
    children,
    className = "",
    collapsible = true,
    isDefaultOpen = false,
    title,
    ...rest
  } = props;
  const [isOpen, setOpen] = useState(isDefaultOpen);

  return <div className={`od-theme-setting-section ${className}`} {...rest}>
    <button
      aria-expanded={isOpen}
      className="od-theme-setting-section__heading"
      onClick={() => setOpen((open) => !open)}
      type="button"
    >
      <span className="od-theme-setting-section__title">{title}</span>
      {collapsible && <Icon name={isOpen ? "arrow-down-s-line" : "arrow-right-s-line"} size="sm" />}
    </button>
    <Collapse isOpen={isOpen} transitionDuration={0}>
      <div className="od-theme-setting-section__body">{children}</div>
    </Collapse>
  </div>;
}
