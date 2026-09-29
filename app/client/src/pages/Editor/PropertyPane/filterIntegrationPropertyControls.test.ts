import type { PropertyPaneConfig } from "constants/PropertyControlConstants";
import { filterIntegrationPropertyControls } from "./filterIntegrationPropertyControls";

describe("filterIntegrationPropertyControls", () => {
  it("keeps value controls while removing action controls and empty event sections", () => {
    const config = [
      {
        sectionName: "Basic",
        children: [
          {
            propertyName: "text",
            label: "Text",
            controlType: "INPUT_TEXT",
            isBindProperty: true,
            isTriggerProperty: false,
          },
          {
            propertyName: "onClick",
            label: "onClick",
            controlType: "ACTION_SELECTOR",
            isBindProperty: true,
            isTriggerProperty: true,
          },
        ],
      },
      {
        sectionName: "Events",
        children: [
          {
            propertyName: "onDataPointClick",
            label: "onDataPointClick",
            controlType: "ACTION_SELECTOR",
            isBindProperty: true,
            isTriggerProperty: true,
          },
        ],
      },
    ] as PropertyPaneConfig[];

    const filtered = filterIntegrationPropertyControls(config);

    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({
      sectionName: "Basic",
      children: [{ propertyName: "text" }],
    });
    expect(config[0]).toMatchObject({
      children: [{}, { propertyName: "onClick" }],
    });
  });

  it("filters event controls in nested panel and search configs", () => {
    const config = [
      {
        propertyName: "items",
        label: "Items",
        controlType: "INPUT_TEXT",
        isBindProperty: false,
        isTriggerProperty: false,
        panelConfig: {
          editableTitle: false,
          titlePropertyName: "label",
          panelIdPropertyName: "id",
          updateHook: () => undefined,
          contentChildren: [
            {
              sectionName: "Item",
              children: [
                {
                  propertyName: "label",
                  label: "Label",
                  controlType: "INPUT_TEXT",
                  isBindProperty: true,
                  isTriggerProperty: false,
                },
                {
                  propertyName: "onClick",
                  label: "onClick",
                  controlType: "ACTION_SELECTOR",
                  isBindProperty: true,
                  isTriggerProperty: true,
                },
              ],
            },
          ],
          searchConfig: [
            {
              propertyName: "onClick",
              label: "onClick",
              controlType: "ACTION_SELECTOR",
              isBindProperty: true,
              isTriggerProperty: true,
            },
          ],
        },
      },
    ] as PropertyPaneConfig[];

    const filtered = filterIntegrationPropertyControls(config);

    expect(filtered[0]).toMatchObject({
      panelConfig: {
        contentChildren: [
          { sectionName: "Item", children: [{ propertyName: "label" }] },
        ],
        searchConfig: [],
      },
    });
  });
});
