import React, { useCallback } from "react";
import { Icon, Tooltip } from "@appsmith/ads";
import type { IconNames } from "@appsmith/ads";
import "./IntegrationSidebar.css";

export type IntegrationSection = "widgets" | "outline" | "tools";

export interface IntegrationSidebarProps {
  activeSection: IntegrationSection;
  onSectionChange: (section: IntegrationSection) => void;
}

const SECTIONS: ReadonlyArray<{
  id: IntegrationSection;
  label: string;
  icon: IconNames;
}> = [
  { id: "widgets", label: "Widgets", icon: "widgets-v3" },
  { id: "outline", label: "Outline", icon: "layout-2-line" },
  { id: "tools", label: "Dashboard tools", icon: "settings-v3" },
];

/** Navigation for the integration workbench; it never enters Appsmith routes. */
export function IntegrationSidebar({
  activeSection,
  onSectionChange,
}: IntegrationSidebarProps) {
  const handleSectionClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const section = event.currentTarget.dataset.section;

      if (
        section === "widgets" ||
        section === "outline" ||
        section === "tools"
      ) {
        onSectionChange(section);
      }
    },
    [onSectionChange],
  );

  return (
    <nav aria-label="Workbench sections" className="integration-sidebar">
      {SECTIONS.map(({ icon, id, label }) => (
        <Tooltip content={label} key={id} placement="right">
          <button
            aria-label={label}
            aria-pressed={activeSection === id}
            className="integration-sidebar__button"
            data-section={id}
            data-testid={`t--workbench-nav-${id}`}
            onClick={handleSectionClick}
            type="button"
          >
            <Icon name={icon} size="lg" />
          </button>
        </Tooltip>
      ))}
    </nav>
  );
}
