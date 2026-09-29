/** @jest-environment node */

import { exampleDashboardDocument } from "../document";
import {
  ComponentPackageValidationError,
  createComponentFromDashboard,
  parseComponentPackage,
  serializeComponentPackage,
} from "./componentPackage";

describe("component package", () => {
  const packageFromExample = () =>
    createComponentFromDashboard(
      exampleDashboardDocument,
      "engine-speed-card",
      { componentId: "engine-speed-card", name: "Engine speed card" },
    );

  it("captures a group with only its own live bindings and variables", () => {
    const before = JSON.stringify(exampleDashboardDocument);
    const component = packageFromExample();

    expect(component.subtree.parentId).toBeUndefined();
    expect(component.subtree.type).toBe("CONTAINER_WIDGET");
    expect(component.variables.map((variable) => variable.key)).toEqual([
      "engineSpeed",
    ]);
    expect(component.bindings.map((binding) => binding.id)).toEqual([
      "engine-speed-value-binding",
    ]);
    expect(JSON.stringify(exampleDashboardDocument)).toBe(before);
    expect(
      parseComponentPackage(JSON.parse(serializeComponentPackage(component))),
    ).toEqual(component);
  });

  it("rejects unsupported roots and unknown package fields", () => {
    expect(() =>
      createComponentFromDashboard(
        exampleDashboardDocument,
        "engine-speed-chart",
        { componentId: "chart", name: "Chart" },
      ),
    ).toThrow(ComponentPackageValidationError);

    expect(() =>
      parseComponentPackage({ ...packageFromExample(), credential: "secret" }),
    ).toThrow("Unknown component field credential");
  });

  it("rejects a binding that targets a widget outside the group", () => {
    const component = packageFromExample();

    component.bindings[0].target.widgetId = "engine-speed-chart";
    expect(() => parseComponentPackage(component)).toThrow(
      "widget does not exist",
    );
  });

  it("rejects runtime connection data in a copied group", () => {
    const component = packageFromExample();

    component.subtree.natsUrl = "wss://private.example";
    expect(() => parseComponentPackage(component)).toThrow(
      "run session and connection data must stay outside documents",
    );
  });
});
