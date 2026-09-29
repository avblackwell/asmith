// react-test-renderer queries are synchronous; this rule assumes Testing Library queries.
/* eslint-disable testing-library/await-async-queries */
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import type { ReactTestInstance, ReactTestRenderer } from "react-test-renderer";
import { OperationsScreen } from "./OperationsScreen";
import type { OperationsPageClient } from "./OperationsScreen";

jest.mock("@appsmith/ads", () => {
  const ReactMock = jest.requireActual("react");

  return {
    Button: ({ children, isDisabled, ...props }: Record<string, unknown>) =>
      ReactMock.createElement(
        "button",
        { ...props, disabled: isDisabled },
        children,
      ),
    SearchInput: ({ onChange, value, ...props }: Record<string, unknown>) =>
      ReactMock.createElement("input", {
        ...props,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
          (onChange as (value: string) => void)(event.target.value),
        value,
      }),
    Text: ({ children, renderAs }: Record<string, unknown>) =>
      ReactMock.createElement(renderAs || "span", null, children),
  };
});

const catalog = {
  universalVariables: [
    {
      name: "speed",
      description: "Shaft speed",
      unit: "rpm",
      status: "active",
      source: "system",
    },
  ],
  units: [{ name: "rpm", unitGroup: "rotation", source: "system" }],
  unitGroups: [{ name: "rotation", source: "system" }],
};

function client(): OperationsPageClient {
  return {
    listSites: jest.fn(),
    getSite: jest.fn(),
    listTestCells: jest.fn(),
    getTestCell: jest.fn(),
    getUniversalVariableCatalog: jest.fn().mockResolvedValue(catalog),
    getUniversalVariableStatuses: jest
      .fn()
      .mockResolvedValue(["active", "inactive"]),
    getUniversalVariable: jest
      .fn()
      .mockResolvedValue(catalog.universalVariables[0]),
    createUniversalVariable: jest.fn(),
    updateUniversalVariableStatus: jest.fn(),
  };
}

async function render(element: React.ReactElement): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;

  await act(async () => {
    renderer = TestRenderer.create(element);
  });

  return renderer;
}

function nodes(
  renderer: ReactTestRenderer,
  type: React.ElementType,
): ReactTestInstance[] {
  return renderer.root.findAllByType(type);
}

describe("OperationsScreen pending-write behavior", () => {
  it("renders the variable catalog while keeping create disabled by default", async () => {
    const api = client();
    const renderer = await render(
      <OperationsScreen client={api} kind="universal-variables" />,
    );
    const links = nodes(renderer, "a");

    expect(
      links.some(
        (link) => link.props.href === "/admin/universal-variables/speed",
      ),
    ).toBe(true);
    const create = nodes(renderer, "button").find(
      (button) => button.props.children === "Create variable",
    );

    expect(create?.props.disabled).toBe(true);
    expect(api.createUniversalVariable).not.toHaveBeenCalled();
  });

  it("shows a read-only status form without calling the unprotected write route", async () => {
    const api = client();
    const renderer = await render(
      <OperationsScreen client={api} id="speed" kind="universal-variables" />,
    );
    const save = nodes(renderer, "button").find(
      (button) => button.props.children === "Save status",
    );

    expect(save?.props.disabled).toBe(true);
    expect(api.updateUniversalVariableStatus).not.toHaveBeenCalled();
  });
});
