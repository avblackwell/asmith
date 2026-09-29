import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import type { ReactTestInstance, ReactTestRenderer } from "react-test-renderer";
import type {
  MarketplaceClient,
  MarketplacePage,
  MarketplaceTestCell,
} from "../marketplace";
import { VariableDiscoveryChooser } from "./VariableDiscoveryChooser";

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

function control(
  renderer: ReactTestRenderer,
  testId: string,
): ReactTestInstance {
  const found = renderer.root
    .findAll((node) => node.props["data-testid"] === testId)
    .find(Boolean);

  if (!found) throw new Error(`Missing control: ${testId}`);

  return found;
}

function visibleText(renderer: ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

function makeMarketplace() {
  const listTestCells = jest.fn().mockResolvedValue(page([cell]));
  const getTestCell = jest.fn().mockResolvedValue(cell);
  const proxyTestCellRequest = jest.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        variables: [
          { id: "18446744073709551615", label: "ENGINE_SPEED" },
          { id: "42", label: "COOLANT_TEMP" },
        ],
      }),
      { status: 200 },
    ),
  );
  const marketplace = {
    getTestCell,
    listTestCells,
    proxyTestCellRequest,
  } as unknown as MarketplaceClient;

  return { getTestCell, listTestCells, marketplace, proxyTestCellRequest };
}

describe("VariableDiscoveryChooser", () => {
  it("lists authorized cells and fetches no Cyflex metadata until a cell is selected", async () => {
    const { getTestCell, listTestCells, marketplace, proxyTestCellRequest } =
      makeMarketplace();
    const onChoose = jest.fn();
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <VariableDiscoveryChooser
          disabled={false}
          marketplace={marketplace}
          onChoose={onChoose}
          onClose={jest.fn()}
        />,
      );
    });

    if (!renderer) throw new Error("Chooser did not render");

    expect(listTestCells).toHaveBeenCalledWith(
      { cursor: undefined, limit: 24 },
      expect.any(AbortSignal),
    );
    expect(getTestCell).not.toHaveBeenCalled();
    expect(proxyTestCellRequest).not.toHaveBeenCalled();

    await act(async () => {
      control(renderer!, "t--binding-discovery-cell").props.onChange({
        target: { value: "6" },
      });
    });

    expect(getTestCell).toHaveBeenCalledWith(6, expect.any(AbortSignal));
    expect(proxyTestCellRequest).toHaveBeenCalledWith(
      6,
      expect.objectContaining({
        method: "GET",
        path: "cyflex/variables",
        accept: "variables/json_all+output+v1",
      }),
    );
    expect(visibleText(renderer)).toContain("ENGINE_SPEED");

    await act(async () => {
      control(renderer!, "t--binding-discovery-search").props.onChange({
        target: { value: "coolant" },
      });
    });
    expect(visibleText(renderer)).toContain("COOLANT_TEMP");
    expect(visibleText(renderer)).not.toContain("ENGINE_SPEED");

    await act(async () => {
      control(renderer!, "t--binding-discovery-result-0").props.onClick();
    });
    expect(onChoose).toHaveBeenCalledWith("COOLANT_TEMP");
  });

  it("aborts an in-flight cell request when the chooser closes", async () => {
    const { listTestCells, marketplace } = makeMarketplace();
    let requestSignal: AbortSignal | undefined;

    listTestCells.mockImplementation(async (_query, signal) => {
      requestSignal = signal;

      return new Promise(() => undefined);
    });
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <VariableDiscoveryChooser
          disabled={false}
          marketplace={marketplace}
          onChoose={jest.fn()}
          onClose={jest.fn()}
        />,
      );
    });

    expect(requestSignal?.aborted).toBe(false);
    await act(async () => {
      renderer?.unmount();
    });
    expect(requestSignal?.aborted).toBe(true);
  });

  it("ignores stale metadata when switching selected cells", async () => {
    const secondCell = { ...cell, id: 7, name: "Cooling cell" };
    const { getTestCell, listTestCells, marketplace, proxyTestCellRequest } =
      makeMarketplace();
    const onChoose = jest.fn();
    let firstResolve: ((response: Response) => void) | undefined;
    let firstSignal: AbortSignal | undefined;

    listTestCells.mockResolvedValue(page([cell, secondCell]));
    getTestCell.mockImplementation(async (id) =>
      id === 6 ? cell : secondCell,
    );
    proxyTestCellRequest.mockImplementation(async (id, options) => {
      if (id === 6) {
        firstSignal = options.signal;

        return new Promise<Response>((resolve) => {
          firstResolve = resolve;
        });
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({ variables: [{ id: "7", label: "COOLANT_TEMP" }] }),
          { status: 200 },
        ),
      );
    });
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <VariableDiscoveryChooser
          disabled={false}
          marketplace={marketplace}
          onChoose={onChoose}
          onClose={jest.fn()}
        />,
      );
    });

    if (!renderer) throw new Error("Chooser did not render");

    await act(async () => {
      control(renderer!, "t--binding-discovery-cell").props.onChange({
        target: { value: "6" },
      });
    });
    expect(firstSignal?.aborted).toBe(false);

    await act(async () => {
      control(renderer!, "t--binding-discovery-cell").props.onChange({
        target: { value: "7" },
      });
    });
    expect(firstSignal?.aborted).toBe(true);
    expect(visibleText(renderer)).toContain("COOLANT_TEMP");

    await act(async () => {
      firstResolve?.(
        new Response(
          JSON.stringify({ variables: [{ id: "6", label: "ENGINE_SPEED" }] }),
          { status: 200 },
        ),
      );
    });
    expect(visibleText(renderer)).not.toContain("ENGINE_SPEED");
  });
});
