import type {
  PropertyPaneConfig,
  PropertyPaneControlConfig,
  PropertyPaneSectionConfig,
} from "constants/PropertyControlConstants";

/** Event handlers require Appsmith actions, which the dashboard runtime does not run. */
export function filterIntegrationPropertyControls(
  config: readonly PropertyPaneConfig[],
): PropertyPaneConfig[] {
  return config.flatMap<PropertyPaneConfig>((item) => {
    if ("sectionName" in item) {
      const section = item as PropertyPaneSectionConfig;

      if (section.sectionName.toLowerCase() === "events") return [];

      const children = filterIntegrationPropertyControls(section.children);

      return children.length ? [{ ...section, children }] : [];
    }

    const control = item as PropertyPaneControlConfig;

    if (
      control.isTriggerProperty ||
      control.controlType === "ACTION_SELECTOR" ||
      control.controlType === "CUSTOM_WIDGET_ADD_EVENT_BUTTON_CONTROL" ||
      /^on[A-Z]/.test(control.propertyName)
    ) {
      return [];
    }

    const children = control.children
      ? filterIntegrationPropertyControls(control.children)
      : undefined;
    const panelConfig = control.panelConfig;

    return [
      {
        ...control,
        ...(children ? { children } : {}),
        ...(panelConfig
          ? {
              panelConfig: {
                ...panelConfig,
                ...(panelConfig.children
                  ? {
                      children: filterIntegrationPropertyControls(
                        panelConfig.children,
                      ),
                    }
                  : {}),
                ...(panelConfig.contentChildren
                  ? {
                      contentChildren: filterIntegrationPropertyControls(
                        panelConfig.contentChildren,
                      ),
                    }
                  : {}),
                ...(panelConfig.styleChildren
                  ? {
                      styleChildren: filterIntegrationPropertyControls(
                        panelConfig.styleChildren,
                      ),
                    }
                  : {}),
                ...(panelConfig.searchConfig
                  ? {
                      searchConfig: filterIntegrationPropertyControls(
                        panelConfig.searchConfig,
                      ),
                    }
                  : {}),
              },
            }
          : {}),
      },
    ];
  });
}
