/* eslint-disable testing-library/await-async-queries -- React test renderer queries are synchronous. */
import React from "react";
import { Provider } from "react-redux";
import TestRenderer, { act } from "react-test-renderer";
import type { ReactTestRenderer } from "react-test-renderer";
import Canvas from "pages/Editor/Canvas";
import { RunPanel } from "integration/workspace-ui/RunPanel";
import type { RunPanelProps } from "integration/workspace-ui/RunPanel";
import { ViewerShell } from "./ViewerShell";

jest.mock("ee/selectors/entitiesSelector", () => ({
  getCanvasWidgetsStructure: (state: { canvas: unknown }) => state.canvas,
}));
jest.mock("pages/Editor/Canvas", () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="t--mock-canvas" />),
}));
jest.mock("integration/workspace-ui/RunPanel", () => ({
  RunPanel: jest.fn(() => <div data-testid="t--mock-run-panel" />),
}));

const structure = { widgetId: "0", type: "CANVAS_WIDGET", children: [] };
const state = { canvas: structure, ui: { mainCanvas: { width: 1242 } } };
const store = {
  getState: () => state,
  subscribe: () => () => undefined,
  dispatch: jest.fn(),
};

const run = {
  marketplace: {},
  getDocument: jest.fn(),
  environment: null,
  onUpdates: jest.fn(),
  onClear: jest.fn(),
} as unknown as RunPanelProps;

async function renderViewer(): Promise<ReactTestRenderer> {
  let renderer: ReactTestRenderer | undefined;

  await act(async () => {
    renderer = TestRenderer.create(
      <Provider store={store as never}>
        <ViewerShell itemId={7} run={run} title="Engine health" />
      </Provider>,
    );
  });

  if (!renderer) throw new Error("Viewer did not render");

  return renderer;
}

describe("ViewerShell", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the dashboard canvas and Run controls without editor actions", async () => {
    const renderer = await renderViewer();
    const output = JSON.stringify(renderer.toJSON());

    expect(output).toContain("Engine health");
    expect(renderer.root.findByType("p").children.join("")).toBe(
      "Marketplace dashboard #7",
    );
    expect(output).toContain("Back to dashboard catalog");
    expect(output).toContain("t--mock-canvas");
    expect(output).toContain("t--mock-run-panel");
    expect(output).not.toMatch(
      /Save local draft|Export JSON|Publish|Widget properties|Local history/,
    );
    expect(renderer.root.findByProps({ href: "/workspace" })).toBeTruthy();
    expect(jest.mocked(Canvas).mock.calls[0][0]).toEqual({
      canvasWidth: 1242,
      widgetsStructure: structure,
    });
    expect(jest.mocked(RunPanel).mock.calls[0][0]).toEqual(run);
  });
});
