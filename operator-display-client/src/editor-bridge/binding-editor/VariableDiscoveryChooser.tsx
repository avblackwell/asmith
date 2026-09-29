import React, { useEffect, useState } from "react";
import { Button } from "@appsmith/ads";
import {
  CyflexProxyClient,
  listSelectedCellVariables,
} from "../../cyflex";
import type { MarketplacePage, MarketplaceTestCell } from "../../api/types";

interface VariableDiscoveryChooserProps {
  disabled: boolean;
  onChoose(label: string): void;
  onClose(): void;
}

interface DiscoveredVariables {
  cellId: number;
  entries: Array<{ id: string; label: string }>;
}

const VISIBLE_VARIABLE_LIMIT = 100;
const discoveryClient = new CyflexProxyClient();

function describeError(cause: unknown): string {
  if (cause && typeof cause === "object" && "status" in cause) {
    const status = cause.status;
    if (status === 401) return "Your session has expired. Sign in and try again.";
    if (status === 403) return "You do not have access to this test cell.";
    if (status === 502 || status === 503 || status === 504) {
      return "Java could not reach the Cyflex service for this test cell. Try again later.";
    }
  }
  return (cause instanceof Error ? cause.message : String(cause)).slice(0, 240);
}

/** Uses a cell for authoring-time lookup. The saved selector contains only its label. */
export function VariableDiscoveryChooser({
  disabled,
  onChoose,
  onClose,
}: VariableDiscoveryChooserProps): React.ReactElement {
  const [cursor, setCursor] = useState<number | undefined>();
  const [cells, setCells] = useState<MarketplacePage<MarketplaceTestCell> | null>(null);
  const [selectedCellId, setSelectedCellId] = useState<number | null>(null);
  const [cellRefresh, setCellRefresh] = useState(0);
  const [variableRefresh, setVariableRefresh] = useState(0);
  const [loadingCells, setLoadingCells] = useState(true);
  const [cellError, setCellError] = useState("");
  const [loadingVariables, setLoadingVariables] = useState(false);
  const [variableError, setVariableError] = useState("");
  const [discovered, setDiscovered] = useState<DiscoveredVariables | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setCells(null);
    setLoadingCells(true);
    setCellError("");

    void discoveryClient.listTestCells({ cursor, limit: 24 }, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) setCells(page);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setCellError(`Could not load test cells: ${describeError(cause)}`);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingCells(false);
      });

    return () => controller.abort();
  }, [cursor, cellRefresh]);

  useEffect(() => {
    if (selectedCellId === null) return;
    const controller = new AbortController();
    setDiscovered(null);
    setLoadingVariables(true);
    setVariableError("");

    void listSelectedCellVariables(discoveryClient, selectedCellId, controller.signal)
      .then(({ cell, variables }) => {
        if (!controller.signal.aborted) {
          setDiscovered({ cellId: cell.id, entries: variables });
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setVariableError(`Could not load variables: ${describeError(cause)}`);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingVariables(false);
      });

    return () => controller.abort();
  }, [selectedCellId, variableRefresh]);

  const selectedCell = cells?.data.find((cell) => cell.id === selectedCellId);
  const variables = discovered?.cellId === selectedCellId ? discovered.entries : null;
  const query = search.trim().toLocaleLowerCase();
  const matches = variables?.filter((entry) =>
    entry.label.toLocaleLowerCase().includes(query) || entry.id.includes(query));
  const visibleMatches = matches?.slice(0, VISIBLE_VARIABLE_LIMIT);
  const hasPrevious = typeof cells?.meta.previousCursor === "number";
  const hasNext = typeof cells?.meta.nextCursor === "number";

  function changePage(nextCursor: number | undefined) {
    setSelectedCellId(null);
    setDiscovered(null);
    setSearch("");
    setCursor(nextCursor);
  }

  return (
    <section aria-label="Browse Cyflex variables" className="od-cyflex-discovery">
      <div className="od-cyflex-discovery__heading">
        <strong>Browse Cyflex variables</strong>
        <Button isDisabled={disabled} kind="tertiary" onClick={onClose} size="sm" type="button">
          Close
        </Button>
      </div>
      <p className="od-cyflex-binding__hint">
        Choose a test cell to find an exact variable label. This cell is only used for lookup.
      </p>
      <label>
        Test cell
        <select
          data-testid="t--binding-discovery-cell"
          disabled={disabled || loadingCells || !cells?.data.length}
          onChange={(event) => {
            setSelectedCellId(Number(event.target.value) || null);
            setDiscovered(null);
            setSearch("");
          }}
          value={selectedCellId ?? ""}
        >
          <option value="">Select a test cell</option>
          {cells?.data.map((cell) => (
            <option key={cell.id} value={cell.id}>
              {cell.name}{cell.site?.name ? ` · ${cell.site.name}` : ""}{` · ID ${cell.id}`}
            </option>
          ))}
        </select>
      </label>
      {loadingCells && <p role="status">Loading authorized test cells…</p>}
      {cellError && <p role="alert">{cellError}</p>}
      {cellError && (
        <Button isDisabled={disabled} kind="tertiary" onClick={() => setCellRefresh((value) => value + 1)} size="sm" type="button">
          Retry test cells
        </Button>
      )}
      {!loadingCells && !cellError && cells?.data.length === 0 && (
        <p role="status">No test cells are available for this account.</p>
      )}
      {(hasPrevious || hasNext) && (
        <nav aria-label="Test cell pages" className="od-cyflex-discovery__pages">
          <Button isDisabled={disabled || loadingCells || !hasPrevious} kind="tertiary" onClick={() => changePage(cells?.meta.previousCursor ?? undefined)} size="sm" type="button">
            Previous
          </Button>
          <span>Page {cells?.meta.currentPage} of {cells?.meta.totalPages}</span>
          <Button isDisabled={disabled || loadingCells || !hasNext} kind="tertiary" onClick={() => changePage(cells?.meta.nextCursor ?? undefined)} size="sm" type="button">
            Next
          </Button>
        </nav>
      )}
      {selectedCell && (
        <>
          {loadingVariables && <p role="status">Loading variables from {selectedCell.name}…</p>}
          {variableError && <p role="alert">{variableError}</p>}
          {variableError && (
            <Button isDisabled={disabled} kind="tertiary" onClick={() => setVariableRefresh((value) => value + 1)} size="sm" type="button">
              Retry variables
            </Button>
          )}
          {variables && (
            <>
              <label>
                Search variables
                <input
                  data-testid="t--binding-discovery-search"
                  disabled={disabled}
                  onChange={(event) => setSearch(event.target.value)}
                  type="search"
                  value={search}
                />
              </label>
              {variables.length === 0 && <p role="status">This test cell returned no variables.</p>}
              {variables.length > 0 && matches?.length === 0 && <p role="status">No variables match this search.</p>}
              {visibleMatches && visibleMatches.length > 0 && (
                <ul className="od-cyflex-discovery__variables">
                  {visibleMatches.map((entry, index) => (
                    <li key={`${entry.id}:${entry.label}`}>
                      <button
                        data-testid={`t--binding-discovery-result-${index}`}
                        disabled={disabled}
                        onClick={() => onChoose(entry.label)}
                        type="button"
                      >
                        <span>{entry.label}</span>
                        <small>ID {entry.id}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {matches && matches.length > VISIBLE_VARIABLE_LIMIT && (
                <p className="od-cyflex-binding__hint">
                  Showing the first {VISIBLE_VARIABLE_LIMIT} of {matches.length} matches. Narrow the search to find another variable.
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
