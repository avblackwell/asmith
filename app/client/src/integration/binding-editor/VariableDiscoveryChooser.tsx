import React, { useEffect, useState } from "react";
import { listSelectedCellVariables } from "../cyflex/resolution";
import type {
  MarketplaceClient,
  MarketplacePage,
  MarketplaceTestCell,
} from "../marketplace";

interface VariableDiscoveryChooserProps {
  disabled: boolean;
  marketplace: MarketplaceClient;
  onChoose(label: string): void;
  onClose(): void;
}

interface DiscoveredVariables {
  cellId: number;
  entries: Array<{ id: string; label: string }>;
}

const CELL_PAGE_SIZE = 24;
const VISIBLE_VARIABLE_LIMIT = 100;

function describeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 240);
}

/** Authoring-time discovery only. The chosen test cell is never saved. */
export function VariableDiscoveryChooser({
  disabled,
  marketplace,
  onChoose,
  onClose,
}: VariableDiscoveryChooserProps): React.ReactElement {
  const [cursor, setCursor] = useState<number | undefined>();
  const [cells, setCells] =
    useState<MarketplacePage<MarketplaceTestCell> | null>(null);
  const [selectedCellId, setSelectedCellId] = useState<number | null>(null);
  const [cellRefresh, setCellRefresh] = useState(0);
  const [variableRefresh, setVariableRefresh] = useState(0);
  const [loadingCells, setLoadingCells] = useState(true);
  const [cellError, setCellError] = useState("");
  const [loadingVariables, setLoadingVariables] = useState(false);
  const [variableError, setVariableError] = useState("");
  const [discovered, setDiscovered] = useState<DiscoveredVariables | null>(
    null,
  );
  const [search, setSearch] = useState("");

  useEffect(
    function loadAuthorizedCells() {
      const controller = new AbortController();

      setCells(null);
      setLoadingCells(true);
      setCellError("");

      void marketplace
        .listTestCells({ cursor, limit: CELL_PAGE_SIZE }, controller.signal)
        .then((page) => {
          if (!controller.signal.aborted) setCells(page);
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            setCellError(`Could not load test cells: ${describeError(error)}`);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingCells(false);
        });

      return () => controller.abort();
    },
    [cursor, cellRefresh, marketplace],
  );

  useEffect(
    function loadVariablesForSelectedCell() {
      if (selectedCellId === null) return;

      const controller = new AbortController();

      setDiscovered(null);
      setLoadingVariables(true);
      setVariableError("");

      void listSelectedCellVariables(
        marketplace,
        selectedCellId,
        controller.signal,
      )
        .then(({ cell, variables }) => {
          if (!controller.signal.aborted) {
            setDiscovered({ cellId: cell.id, entries: variables });
          }
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            setVariableError(
              `Could not load variables: ${describeError(error)}`,
            );
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingVariables(false);
        });

      return () => controller.abort();
    },
    [marketplace, selectedCellId, variableRefresh],
  );

  const selectedCell = cells?.data.find((cell) => cell.id === selectedCellId);
  const variables =
    discovered?.cellId === selectedCellId ? discovered.entries : null;
  const query = search.trim().toLocaleLowerCase();
  const matches = variables?.filter(
    (entry) =>
      entry.label.toLocaleLowerCase().includes(query) ||
      entry.id.includes(query),
  );
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
    <section
      aria-label="Browse Cyflex variables"
      className="binding-editor__discovery"
      data-testid="t--binding-discovery"
    >
      <div className="binding-editor__discovery-header">
        <h3>Browse Cyflex variables</h3>
        <button
          data-testid="t--binding-discovery-close"
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      </div>
      <p className="binding-editor__hint">
        Choose an authorized test cell to find an exact variable label. The cell
        is used for this lookup only.
      </p>
      <label>
        Test cell
        <select
          data-testid="t--binding-discovery-cell"
          disabled={disabled || loadingCells || !cells?.data.length}
          onChange={(event) => {
            setSelectedCellId(Number(event.target.value) || null);
            setSearch("");
          }}
          value={selectedCellId ?? ""}
        >
          <option value="">Select a test cell</option>
          {cells?.data.map((cell) => (
            <option key={cell.id} value={cell.id}>
              {cell.name}
              {cell.site?.name ? ` · ${cell.site.name}` : ""}
              {` · ID ${cell.id}`}
            </option>
          ))}
        </select>
      </label>
      {loadingCells && <p role="status">Loading authorized test cells…</p>}
      {cellError && <p role="alert">{cellError}</p>}
      {cellError && (
        <button
          disabled={disabled}
          onClick={() => setCellRefresh((value) => value + 1)}
          type="button"
        >
          Retry test cells
        </button>
      )}
      {!loadingCells && !cellError && cells?.data.length === 0 && (
        <p role="status">No test cells are available for this account.</p>
      )}
      {(hasPrevious || hasNext) && (
        <nav aria-label="Test cell pages" className="binding-editor__pages">
          <button
            data-testid="t--binding-discovery-cell-previous"
            disabled={disabled || loadingCells || !hasPrevious}
            onClick={() => changePage(cells?.meta.previousCursor ?? undefined)}
            type="button"
          >
            Previous cells
          </button>
          <span>
            Page {cells?.meta.currentPage} of {cells?.meta.totalPages}
          </span>
          <button
            data-testid="t--binding-discovery-cell-next"
            disabled={disabled || loadingCells || !hasNext}
            onClick={() => changePage(cells?.meta.nextCursor ?? undefined)}
            type="button"
          >
            Next cells
          </button>
        </nav>
      )}
      {selectedCell && (
        <>
          {loadingVariables && (
            <p role="status">Loading variables from {selectedCell.name}…</p>
          )}
          {variableError && <p role="alert">{variableError}</p>}
          {variableError && (
            <button
              disabled={disabled}
              onClick={() => setVariableRefresh((value) => value + 1)}
              type="button"
            >
              Retry variables
            </button>
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
              {variables.length === 0 && (
                <p role="status">This test cell returned no variables.</p>
              )}
              {variables.length > 0 && matches?.length === 0 && (
                <p role="status">No variables match this search.</p>
              )}
              {visibleMatches && visibleMatches.length > 0 && (
                <ul className="binding-editor__variable-list">
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
                <p className="binding-editor__hint">
                  Showing the first {VISIBLE_VARIABLE_LIMIT} of {matches.length}{" "}
                  matches. Narrow the search to find another variable.
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
