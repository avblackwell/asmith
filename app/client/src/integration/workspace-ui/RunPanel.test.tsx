import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import type { ReactTestInstance, ReactTestRenderer } from "react-test-renderer";
import { exampleDashboardDocument } from "../document";
import type {
  MarketplaceClient,
  MarketplacePage,
  MarketplaceTestCell,
} from "../marketplace";
import type { MarketplaceBrowserRunOptions } from "../cyflex/browser";
import { RunPanel } from "./RunPanel";
import type { BrowserRunEnvironment } from "./RunPanel";

const cell: MarketplaceTestCell = {
  id: 6,
  name: "Engine cell",
  site: { oid: 3, name: "North" },
  state: null,
};

function page(
  data: MarketplaceTestCell[],
  previousCursor: number | null = null,
  nextCursor: number | null = null,
): MarketplacePage<MarketplaceTestCell> {
  return {
    data,
    meta: {
      cursor: previousCursor ?? 0,
      previousCursor,
      nextCursor,
      pageSize: 24,
      currentPage: previousCursor === null ? 1 : 2,
      totalPages: nextCursor !== null || previousCursor !== null ? 2 : 1,
      totalItems: data.length,
      sorts: null,
      filters: null,
    },
  };
}

function makeMarketplace() {
  const listTestCells = jest.fn().mockResolvedValue(page([cell]));
  const getTestCell = jest.fn().mockResolvedValue(cell);
  const proxyTestCellRequest = jest
    .fn()
    .mockImplementation(async (_id, request) => {
      const data =
        request.path === "cyflex"
          ? { stream_subject: "global.streaming.north.engine" }
          : {
              variables: [
                { id: "18446744073709551615", label: "ENGINE_SPEED" },
              ],
            };

      return new Response(JSON.stringify(data), { status: 200 });
    });
  const marketplace = {
    getTestCell,
    listTestCells,
    proxyTestCellRequest,
  } as unknown as MarketplaceClient;

  return { getTestCell, listTestCells, marketplace, proxyTestCellRequest };
}

function makeEnvironment(): BrowserRunEnvironment {
  return {
    connectionForCell: jest.fn().mockResolvedValue({
      natsConnection: { servers: "wss://broker.example.test/nats" },
      timestampToMs: (utime: number) => utime * 1000,
    }),
  };
}

async function renderPanel(
  marketplace: MarketplaceClient,
  environment: BrowserRunEnvironment | null,
  extras: Partial<React.ComponentProps<typeof RunPanel>> = {},
): Promise<ReactTestRenderer> {
  let renderer: ReactTestRenderer | undefined;

  await act(async () => {
    renderer = TestRenderer.create(
      <RunPanel
        environment={environment}
        getDocument={() => exampleDashboardDocument}
        marketplace={marketplace}
        onClear={jest.fn()}
        onUpdates={jest.fn()}
        {...extras}
      />,
    );
  });

  if (!renderer) throw new Error("Run panel did not render");

  return renderer;
}

function button(renderer: ReactTestRenderer, label: string): ReactTestInstance {
  const found = renderer.root
    .findAll((node) => node.type === "button")
    .find((candidate) => candidate.props.children === label);

  if (!found) throw new Error(`Missing button: ${label}`);

  return found;
}

function visibleText(renderer: ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

function cellControl(renderer: ReactTestRenderer): ReactTestInstance {
  const control = renderer.root
    .findAll((node) => node.type === "select")
    .find((node) => node.props["aria-label"] === "Test cell");

  if (!control) throw new Error("Missing test-cell selector");

  return control;
}

describe("RunPanel", () => {
  it("does no cell discovery before opening and explains unavailable deployment config", async () => {
    const { listTestCells, marketplace } = makeMarketplace();
    const renderer = await renderPanel(marketplace, null);

    expect(listTestCells).not.toHaveBeenCalled();
    await act(async () => {
      button(renderer, "Open Run controls").props.onClick();
    });

    expect(listTestCells).not.toHaveBeenCalled();
    expect(visibleText(renderer)).toContain("Run is unavailable");
  });

  it("explains why an unbound new dashboard cannot start Run", async () => {
    const { getTestCell, marketplace } = makeMarketplace();
    const document = JSON.parse(JSON.stringify(exampleDashboardDocument));

    document.variables = [];
    document.bindings = [];
    const renderer = await renderPanel(marketplace, makeEnvironment(), {
      getDocument: () => document,
    });

    await act(async () => {
      button(renderer, "Open Run controls").props.onClick();
    });
    await act(async () => {
      cellControl(renderer).props.onChange({ target: { value: "6" } });
    });
    await act(async () => {
      button(renderer, "Start Run").props.onClick();
    });

    expect(visibleText(renderer)).toContain(
      "Add a live data binding before starting Run",
    );
    expect(getTestCell).not.toHaveBeenCalled();
  });

  it("selects an authorized cell, resolves its subject and variables, and stops only its viewer", async () => {
    const { getTestCell, listTestCells, marketplace, proxyTestCellRequest } =
      makeMarketplace();
    const environment = makeEnvironment();
    const onClear = jest.fn();
    const onUpdates = jest.fn();
    const start = jest.fn(async () => {
      options?.onStatusChange?.("running");
      options?.onUpdates([
        {
          widgetId: "engine-speed-value",
          propertyPath: "text",
          value: "1500 rpm",
        },
      ]);
    });
    const stop = jest.fn().mockResolvedValue(undefined);
    let options: MarketplaceBrowserRunOptions | undefined;
    const createRun = jest.fn((next: MarketplaceBrowserRunOptions) => {
      options = next;

      return { start, status: "idle" as const, stop };
    });
    const renderer = await renderPanel(marketplace, environment, {
      createRun,
      onClear,
      onUpdates,
    });

    expect(listTestCells).not.toHaveBeenCalled();
    await act(async () => {
      button(renderer, "Open Run controls").props.onClick();
    });
    expect(listTestCells).toHaveBeenCalledWith(
      { cursor: undefined, limit: 24 },
      expect.any(AbortSignal),
    );
    expect(visibleText(renderer)).toContain("Engine cell");

    await act(async () => {
      cellControl(renderer).props.onChange({
        target: { value: "6" },
      });
    });
    await act(async () => {
      button(renderer, "Start Run").props.onClick();
    });

    expect(getTestCell).toHaveBeenCalledWith(6, expect.any(AbortSignal));
    expect(proxyTestCellRequest).toHaveBeenCalledTimes(2);
    expect(proxyTestCellRequest).toHaveBeenCalledWith(
      6,
      expect.objectContaining({
        accept: "cyflex/json_info+output+v1",
        path: "cyflex",
      }),
    );
    expect(environment.connectionForCell).toHaveBeenCalledWith(
      cell,
      expect.any(AbortSignal),
    );
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        marketplace,
        softwareId: 6,
        natsConnection: { servers: "wss://broker.example.test/nats" },
      }),
    );
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        cellId: "6",
        subject: "global.streaming.north.engine",
        resolvedVariables: [
          {
            key: "engineSpeed",
            id: "18446744073709551615",
            label: "ENGINE_SPEED",
          },
        ],
      }),
    );
    expect(onUpdates).toHaveBeenCalledWith([
      {
        widgetId: "engine-speed-value",
        propertyPath: "text",
        value: "1500 rpm",
      },
    ]);
    expect(visibleText(renderer)).toContain(
      '"children":["Status: ","running"]',
    );

    await act(async () => {
      button(renderer, "Stop Run").props.onClick();
    });
    expect(stop).toHaveBeenCalledTimes(1);
    expect(onClear).toHaveBeenCalled();
    expect(visibleText(renderer)).toContain('"children":["Status: ","idle"]');
  });

  it("uses marketplace cursors and resets cell selection on page change", async () => {
    const { listTestCells, marketplace } = makeMarketplace();

    listTestCells.mockImplementation(async ({ cursor }) =>
      cursor === 10
        ? page([{ ...cell, id: 7, name: "Cooling cell" }], 0, null)
        : page([cell], null, 10),
    );
    const renderer = await renderPanel(marketplace, makeEnvironment());

    await act(async () => {
      button(renderer, "Open Run controls").props.onClick();
    });
    await act(async () => {
      cellControl(renderer).props.onChange({
        target: { value: "6" },
      });
    });
    await act(async () => {
      button(renderer, "Next cells").props.onClick();
    });

    expect(listTestCells).toHaveBeenLastCalledWith(
      { cursor: 10, limit: 24 },
      expect.any(AbortSignal),
    );
    expect(visibleText(renderer)).toContain("Cooling cell");
    expect(cellControl(renderer).props.value).toBe("");
    expect(button(renderer, "Start Run").props.disabled).toBe(true);
  });

  it("shows resolution errors and stops the viewer on unmount", async () => {
    const { marketplace, proxyTestCellRequest } = makeMarketplace();

    proxyTestCellRequest.mockImplementationOnce(
      async () =>
        new Response(JSON.stringify({ error: "Cell metadata unavailable" }), {
          status: 200,
        }),
    );
    const stop = jest.fn().mockResolvedValue(undefined);
    const createRun = jest.fn(() => ({
      start: jest.fn().mockResolvedValue(undefined),
      status: "idle" as const,
      stop,
    }));
    const onClear = jest.fn();
    const renderer = await renderPanel(marketplace, makeEnvironment(), {
      createRun,
      onClear,
    });

    await act(async () => {
      button(renderer, "Open Run controls").props.onClick();
    });
    await act(async () => {
      cellControl(renderer).props.onChange({
        target: { value: "6" },
      });
    });
    await act(async () => {
      button(renderer, "Start Run").props.onClick();
    });
    expect(visibleText(renderer)).toContain("Cell metadata unavailable");
    expect(createRun).not.toHaveBeenCalled();

    await act(async () => {
      button(renderer, "Start Run").props.onClick();
    });
    expect(createRun).toHaveBeenCalledTimes(1);
    await act(async () => {
      renderer.unmount();
    });
    expect(stop).toHaveBeenCalledTimes(1);
    expect(onClear).toHaveBeenCalled();
  });
});
