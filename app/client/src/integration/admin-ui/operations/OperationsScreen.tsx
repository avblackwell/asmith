import React, { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Button, SearchInput, Text } from "@appsmith/ads";
import { OperationsClient, OperationsHttpError } from "./OperationsClient";
import type {
  OperationsPage,
  Site,
  TestCell,
  UniversalVariable,
  UniversalVariableCatalog,
} from "./types";
import "./operations.css";

export type OperationsScreenKind =
  | "sites"
  | "testcells"
  | "universal-variables";

export type OperationsPageClient = Pick<
  OperationsClient,
  | "listSites"
  | "getSite"
  | "listTestCells"
  | "getTestCell"
  | "getUniversalVariableCatalog"
  | "getUniversalVariableStatuses"
  | "getUniversalVariable"
  | "createUniversalVariable"
  | "updateUniversalVariableStatus"
>;

export interface OperationsScreenProps {
  kind: OperationsScreenKind;
  /** Site OID, test-cell software ID, or universal-variable name. */
  id?: number | string;
  client?: OperationsPageClient;
  /** Enable only after the backend enforces the chosen write role. */
  enableUniversalVariableWrites?: boolean;
}

const defaultClient = new OperationsClient();

function messageFor(error: unknown, action: string): string {
  if (error instanceof OperationsHttpError) {
    if (error.status === 401)
      return "Your session has expired. Sign in and try again.";

    if (error.status === 403) return "You do not have access to this record.";

    if (error.status === 404)
      return "This record was not found, or you cannot view it.";

    return `${action} failed (HTTP ${error.status}).`;
  }

  if (error instanceof Error && error.message)
    return `${action} failed: ${error.message.slice(0, 180)}`;

  return `${action} failed. Please try again.`;
}

function ErrorNotice({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): React.ReactElement {
  return (
    <div className="operations-screen__notice" role="alert">
      <p>{message}</p>
      <Button kind="secondary" onClick={onRetry} size="sm">
        Retry
      </Button>
    </div>
  );
}

function PendingArea({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <aside className="operations-screen__pending">
      <strong>Backend action pending</strong>
      <p>{children}</p>
    </aside>
  );
}

function formatLastSeen(value: number | null | undefined): string {
  if (!value || value < 0) return "No report yet";

  const timestamp = new Date(value);

  return Number.isNaN(timestamp.getTime())
    ? "Unknown"
    : timestamp.toLocaleString();
}

function PageControls({
  meta,
  onChange,
}: {
  meta: OperationsPage<unknown>["meta"];
  onChange: (cursor: number) => void;
}): React.ReactElement {
  return (
    <nav aria-label="Directory pages" className="operations-screen__pagination">
      <Button
        isDisabled={meta.previousCursor === null}
        kind="secondary"
        onClick={() => onChange(meta.previousCursor ?? 0)}
        size="sm"
      >
        Previous
      </Button>
      <span>
        Page {meta.currentPage} of {meta.totalPages || 1} · {meta.totalItems}{" "}
        records
      </span>
      <Button
        isDisabled={meta.nextCursor === null}
        kind="secondary"
        onClick={() => onChange(meta.nextCursor ?? 0)}
        size="sm"
      >
        Next
      </Button>
    </nav>
  );
}

function DirectoryScreen({
  client,
  kind,
}: {
  client: OperationsPageClient;
  kind: "sites" | "testcells";
}): React.ReactElement {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState(0);
  const [sortField, setSortField] = useState(
    kind === "sites" ? "name" : "cell",
  );
  const [descending, setDescending] = useState(false);
  const [page, setPage] = useState<OperationsPage<Site | TestCell> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const isSites = kind === "sites";

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError(null);
    setPage(null);
    const query = {
      cursor,
      limit: 20,
      search,
      sort: { field: sortField, descending },
    };
    const request = isSites
      ? client.listSites(query, controller.signal)
      : client.listTestCells(query, controller.signal);

    void request
      .then((result) => {
        if (!controller.signal.aborted) setPage(result);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            messageFor(
              reason,
              isSites ? "Loading sites" : "Loading test cells",
            ),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [client, cursor, descending, isSites, retry, search, sortField]);

  function submitSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setCursor(0);
    setSearch(searchInput.trim());
  }

  return (
    <section className="operations-screen">
      <div className="operations-screen__heading">
        <div>
          <Text kind="heading-xl" renderAs="h1">
            {isSites ? "Sites" : "Test cells"}
          </Text>
          <p>
            {isSites
              ? "Browse sites you can access. Site setup and group access are managed outside this screen."
              : "Browse test cells you can access and inspect their last reported Cyflex state."}
          </p>
        </div>
      </div>
      <form className="operations-screen__toolbar" onSubmit={submitSearch}>
        <SearchInput
          onChange={setSearchInput}
          placeholder={isSites ? "Search sites" : "Search test cells"}
          value={searchInput}
        />
        <Button kind="primary" size="sm" type="submit">
          Search
        </Button>
        <Button
          kind="secondary"
          onClick={() => setRetry((value) => value + 1)}
          size="sm"
          type="button"
        >
          Refresh
        </Button>
        <label className="operations-screen__sort-label">
          Sort by
          <select
            onChange={(event) => {
              setSortField(event.target.value);
              setCursor(0);
            }}
            value={sortField}
          >
            {isSites ? (
              <>
                <option value="name">Name</option>
                <option value="oid">Site OID</option>
              </>
            ) : (
              <>
                <option value="cell">Cell name</option>
                <option value="site">Site OID</option>
                <option value="id">Software ID</option>
              </>
            )}
          </select>
        </label>
        <Button
          kind="tertiary"
          onClick={() => {
            setDescending((value) => !value);
            setCursor(0);
          }}
          size="sm"
          type="button"
        >
          {descending ? "Descending" : "Ascending"}
        </Button>
      </form>
      {loading && (
        <p role="status">Loading {isSites ? "sites" : "test cells"}…</p>
      )}
      {error && (
        <ErrorNotice
          message={error}
          onRetry={() => setRetry((value) => value + 1)}
        />
      )}
      {!loading && !error && page?.data.length === 0 && (
        <p className="operations-screen__empty">No records found.</p>
      )}
      {!loading && !error && page && page.data.length > 0 && (
        <>
          <div className="operations-screen__table-wrap">
            <table className="operations-screen__table">
              <thead>
                <tr>
                  {isSites ? (
                    <>
                      <th scope="col">Site</th>
                      <th scope="col">OID</th>
                    </>
                  ) : (
                    <>
                      <th scope="col">Test cell</th>
                      <th scope="col">Software ID</th>
                      <th scope="col">Site</th>
                      <th scope="col">State</th>
                      <th scope="col">Last seen</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {isSites
                  ? (page.data as Site[]).map((site) => (
                      <tr key={site.oid}>
                        <td>
                          <a href={`/operations/sites/${site.oid}`}>
                            {site.name || `Site ${site.oid}`}
                          </a>
                        </td>
                        <td>{site.oid}</td>
                      </tr>
                    ))
                  : (page.data as TestCell[]).map((cell) => (
                      <tr key={cell.id}>
                        <td>
                          <a href={`/operations/testcells/${cell.id}`}>
                            {cell.name}
                          </a>
                        </td>
                        <td>{cell.id}</td>
                        <td>
                          {cell.site?.name ||
                            (cell.site ? `Site ${cell.site.oid}` : "—")}
                        </td>
                        <td>{cell.state?.state || "Unknown"}</td>
                        <td>{formatLastSeen(cell.state?.lastSeen)}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          <PageControls meta={page.meta} onChange={setCursor} />
        </>
      )}
      <PendingArea>
        {isSites
          ? "Creating, editing, deleting, and assigning group access to sites need backend routes."
          : "Creating, editing, deleting, and assigning group access to test cells need backend routes. Test-cell registration currently comes from NATS."}
      </PendingArea>
    </section>
  );
}

function SiteDetail({
  client,
  oid,
}: {
  client: OperationsPageClient;
  oid: number;
}): React.ReactElement {
  const [site, setSite] = useState<Site | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError(null);
    setSite(null);
    void client
      .getSite(oid, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setSite(result);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(messageFor(reason, "Loading site"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [client, oid, retry]);

  return (
    <section className="operations-screen">
      <a className="operations-screen__back" href="/operations/sites">
        ← Sites
      </a>
      {loading && <p role="status">Loading site…</p>}
      {error && (
        <ErrorNotice
          message={error}
          onRetry={() => setRetry((value) => value + 1)}
        />
      )}
      {site && (
        <>
          <Text kind="heading-xl" renderAs="h1">
            {site.name || `Site ${site.oid}`}
          </Text>
          <div className="operations-screen__card">
            <Text kind="heading-m" renderAs="h2">
              Site details
            </Text>
            <dl className="operations-screen__fields">
              <dt>OID</dt>
              <dd>{site.oid}</dd>
              <dt>Name</dt>
              <dd>{site.name || "—"}</dd>
            </dl>
          </div>
          <p>
            <a href="/operations/testcells">Browse test cells</a> to inspect
            live inventory.
          </p>
        </>
      )}
      <PendingArea>
        Site setup, access groups, and a site-specific test-cell assignment view
        need backend routes.
      </PendingArea>
    </section>
  );
}

function TestCellDetail({
  client,
  softwareId,
}: {
  client: OperationsPageClient;
  softwareId: number;
}): React.ReactElement {
  const [cell, setCell] = useState<TestCell | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError(null);
    setCell(null);
    void client
      .getTestCell(softwareId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setCell(result);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(messageFor(reason, "Loading test cell"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [client, softwareId, retry]);

  return (
    <section className="operations-screen">
      <a className="operations-screen__back" href="/operations/testcells">
        ← Test cells
      </a>
      {loading && <p role="status">Loading test cell…</p>}
      {error && (
        <ErrorNotice
          message={error}
          onRetry={() => setRetry((value) => value + 1)}
        />
      )}
      {cell && (
        <>
          <Text kind="heading-xl" renderAs="h1">
            {cell.name}
          </Text>
          <div className="operations-screen__card">
            <Text kind="heading-m" renderAs="h2">
              Test-cell details
            </Text>
            <dl className="operations-screen__fields">
              <dt>Software ID</dt>
              <dd>{cell.id}</dd>
              <dt>Site</dt>
              <dd>
                {cell.site ? (
                  <a href={`/operations/sites/${cell.site.oid}`}>
                    {cell.site.name || `Site ${cell.site.oid}`}
                  </a>
                ) : (
                  "—"
                )}
              </dd>
              <dt>Cyflex state</dt>
              <dd>{cell.state?.state || "Unknown"}</dd>
              <dt>Last seen</dt>
              <dd>{formatLastSeen(cell.state?.lastSeen)}</dd>
              <dt>Generation</dt>
              <dd>{cell.state?.generation ?? "—"}</dd>
              <dt>Go time</dt>
              <dd>{cell.state?.go_time ?? "—"}</dd>
              <dt>Rebuild count</dt>
              <dd>{cell.state?.rebuild_count ?? "—"}</dd>
            </dl>
          </div>
        </>
      )}
      <PendingArea>
        Test-cell setup and group access assignments need backend routes.
        Operational controls belong to the workbench Run flow.
      </PendingArea>
    </section>
  );
}

function WritePolicyNotice(): React.ReactElement {
  return (
    <div className="operations-screen__policy">
      <strong>Write policy pending</strong>
      <p>
        The backend does not yet enforce a chosen admin or operator role for
        universal-variable creation and status changes. This frontend does not
        determine who may write.
      </p>
    </div>
  );
}

function VariableCatalog({
  client,
  enableWrites,
}: {
  client: OperationsPageClient;
  enableWrites: boolean;
}): React.ReactElement {
  const [catalog, setCatalog] = useState<UniversalVariableCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"variables" | "units" | "unitGroups">(
    "variables",
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError(null);
    setCatalog(null);
    void client
      .getUniversalVariableCatalog(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setCatalog(result);
          setUnit((current) => current || result.units[0]?.name || "");
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(messageFor(reason, "Loading variables"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [client, retry]);

  async function createVariable(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (!enableWrites || saving) return;

    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      await client.createUniversalVariable({
        name: name.trim(),
        description: description.trim(),
        unit,
      });
      setSaveMessage(`Created ${name.trim()}.`);
      setName("");
      setDescription("");
      setRetry((value) => value + 1);
    } catch (reason) {
      setSaveError(messageFor(reason, "Creating variable"));
    } finally {
      setSaving(false);
    }
  }

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const variables = catalog?.universalVariables.filter((item) =>
    `${item.name} ${item.description || ""} ${item.unit} ${item.status}`
      .toLocaleLowerCase()
      .includes(normalizedSearch),
  );
  const units = catalog?.units.filter((item) =>
    `${item.name} ${item.unitGroup || ""}`
      .toLocaleLowerCase()
      .includes(normalizedSearch),
  );
  const groups = catalog?.unitGroups.filter((item) =>
    item.name.toLocaleLowerCase().includes(normalizedSearch),
  );

  return (
    <section className="operations-screen">
      <div className="operations-screen__heading">
        <div>
          <Text kind="heading-xl" renderAs="h1">
            Universal variables
          </Text>
          <p>Review variable definitions, units, unit groups, and status.</p>
        </div>
        <Button
          kind="secondary"
          onClick={() => setRetry((value) => value + 1)}
          size="sm"
        >
          Refresh
        </Button>
      </div>
      <WritePolicyNotice />
      {loading && <p role="status">Loading variable catalog…</p>}
      {error && (
        <ErrorNotice
          message={error}
          onRetry={() => setRetry((value) => value + 1)}
        />
      )}
      {catalog && (
        <>
          <div
            aria-label="Catalog sections"
            className="operations-screen__tabs"
            role="group"
          >
            <button
              aria-pressed={tab === "variables"}
              onClick={() => setTab("variables")}
              type="button"
            >
              Variables ({catalog.universalVariables.length})
            </button>
            <button
              aria-pressed={tab === "units"}
              onClick={() => setTab("units")}
              type="button"
            >
              Units ({catalog.units.length})
            </button>
            <button
              aria-pressed={tab === "unitGroups"}
              onClick={() => setTab("unitGroups")}
              type="button"
            >
              Unit groups ({catalog.unitGroups.length})
            </button>
          </div>
          <div className="operations-screen__local-search">
            <SearchInput
              onChange={setSearch}
              placeholder="Filter this catalog"
              value={search}
            />
          </div>
          <div className="operations-screen__table-wrap">
            <table className="operations-screen__table">
              <thead>
                {tab === "variables" ? (
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Description</th>
                    <th scope="col">Unit</th>
                    <th scope="col">Status</th>
                    <th scope="col">Source</th>
                  </tr>
                ) : tab === "units" ? (
                  <tr>
                    <th scope="col">Unit</th>
                    <th scope="col">Unit group</th>
                    <th scope="col">Source</th>
                  </tr>
                ) : (
                  <tr>
                    <th scope="col">Unit group</th>
                    <th scope="col">Source</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {tab === "variables"
                  ? variables?.map((item) => (
                      <tr key={item.name}>
                        <td>
                          <a
                            href={`/admin/universal-variables/${encodeURIComponent(item.name)}`}
                          >
                            {item.name}
                          </a>
                        </td>
                        <td>{item.description || "—"}</td>
                        <td>{item.unit}</td>
                        <td>{item.status}</td>
                        <td>{item.source || "—"}</td>
                      </tr>
                    ))
                  : tab === "units"
                    ? units?.map((item) => (
                        <tr key={item.name}>
                          <td>{item.name}</td>
                          <td>{item.unitGroup || "—"}</td>
                          <td>{item.source || "—"}</td>
                        </tr>
                      ))
                    : groups?.map((item) => (
                        <tr key={item.name}>
                          <td>{item.name}</td>
                          <td>{item.source || "—"}</td>
                        </tr>
                      ))}
              </tbody>
            </table>
          </div>
          {((tab === "variables" && variables?.length === 0) ||
            (tab === "units" && units?.length === 0) ||
            (tab === "unitGroups" && groups?.length === 0)) && (
            <p className="operations-screen__empty">No matching records.</p>
          )}
          <div className="operations-screen__card">
            <Text kind="heading-m" renderAs="h2">
              Create variable
            </Text>
            <p>
              Choose a unit from the backend catalog. This form becomes
              available after a server-side write policy is in place.
            </p>
            <form
              className="operations-screen__form"
              onSubmit={(event) => void createVariable(event)}
            >
              <label>
                Name
                <input
                  disabled={!enableWrites || saving}
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
              </label>
              <label>
                Description
                <textarea
                  disabled={!enableWrites || saving}
                  onChange={(event) => setDescription(event.target.value)}
                  value={description}
                />
              </label>
              <label>
                Unit
                <select
                  disabled={
                    !enableWrites || saving || catalog.units.length === 0
                  }
                  onChange={(event) => setUnit(event.target.value)}
                  required
                  value={unit}
                >
                  {catalog.units.map((entry) => (
                    <option key={entry.name} value={entry.name}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                isDisabled={
                  !enableWrites || saving || catalog.units.length === 0
                }
                kind="primary"
                size="sm"
                type="submit"
              >
                {saving ? "Creating…" : "Create variable"}
              </Button>
              {saveError && <p role="alert">{saveError}</p>}
              {saveMessage && <p role="status">{saveMessage}</p>}
            </form>
          </div>
        </>
      )}
    </section>
  );
}

function VariableDetail({
  client,
  enableWrites,
  name,
}: {
  client: OperationsPageClient;
  enableWrites: boolean;
  name: string;
}): React.ReactElement {
  const [variable, setVariable] = useState<UniversalVariable | null>(null);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError(null);
    setStatusError(null);
    setVariable(null);
    setStatuses([]);
    void Promise.allSettled([
      client.getUniversalVariable(name, controller.signal),
      client.getUniversalVariableStatuses(controller.signal),
    ]).then(([variableResult, statusResult]) => {
      if (controller.signal.aborted) return;

      if (variableResult.status === "fulfilled") {
        setVariable(variableResult.value);
        setStatus(variableResult.value.status);
      } else {
        setError(messageFor(variableResult.reason, "Loading variable"));
      }

      if (statusResult.status === "fulfilled") {
        setStatuses(statusResult.value);
      } else {
        setStatusError(
          messageFor(statusResult.reason, "Loading available statuses"),
        );
      }

      setLoading(false);
    });

    return () => controller.abort();
  }, [client, name, retry]);

  async function saveStatus(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!enableWrites || saving || !variable || !statuses.includes(status))
      return;

    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      await client.updateUniversalVariableStatus(variable.name, status);
      const refreshed = await client.getUniversalVariable(variable.name);

      setVariable(refreshed);
      setStatus(refreshed.status);
      setSaveMessage("Status saved.");
    } catch (reason) {
      setSaveError(messageFor(reason, "Saving status"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="operations-screen">
      <a className="operations-screen__back" href="/admin/universal-variables">
        ← Universal variables
      </a>
      <WritePolicyNotice />
      {loading && <p role="status">Loading variable…</p>}
      {error && (
        <ErrorNotice
          message={error}
          onRetry={() => setRetry((value) => value + 1)}
        />
      )}
      {variable && (
        <>
          <Text kind="heading-xl" renderAs="h1">
            {variable.name}
          </Text>
          <div className="operations-screen__card">
            <Text kind="heading-m" renderAs="h2">
              Variable details
            </Text>
            <dl className="operations-screen__fields">
              <dt>Description</dt>
              <dd>{variable.description || "—"}</dd>
              <dt>Unit</dt>
              <dd>{variable.unit}</dd>
              <dt>Status</dt>
              <dd>{variable.status}</dd>
              <dt>Source</dt>
              <dd>{variable.source || "—"}</dd>
            </dl>
          </div>
          <div className="operations-screen__card">
            <Text kind="heading-m" renderAs="h2">
              Change status
            </Text>
            <p>
              Available statuses come from the backend. Status changes remain
              disabled until a server-side write policy is in place.
            </p>
            {statusError && (
              <ErrorNotice
                message={statusError}
                onRetry={() => setRetry((value) => value + 1)}
              />
            )}
            <form
              className="operations-screen__form"
              onSubmit={(event) => void saveStatus(event)}
            >
              <label>
                Status
                <select
                  disabled={!enableWrites || saving || statuses.length === 0}
                  onChange={(event) => setStatus(event.target.value)}
                  value={status}
                >
                  {!statuses.includes(status) && (
                    <option value={status}>{status}</option>
                  )}
                  {statuses.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                isDisabled={
                  !enableWrites ||
                  saving ||
                  statuses.length === 0 ||
                  status === variable.status
                }
                kind="primary"
                size="sm"
                type="submit"
              >
                {saving ? "Saving…" : "Save status"}
              </Button>
              {saveError && <p role="alert">{saveError}</p>}
              {saveMessage && <p role="status">{saveMessage}</p>}
            </form>
          </div>
        </>
      )}
    </section>
  );
}

/** Route content only; the caller provides the shared marketplace/admin shell. */
export function OperationsScreen({
  client = defaultClient,
  enableUniversalVariableWrites = false,
  id,
  kind,
}: OperationsScreenProps): React.ReactElement {
  if (kind === "sites") {
    if (id === undefined)
      return <DirectoryScreen client={client} key="sites" kind="sites" />;

    return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? (
      <SiteDetail client={client} oid={id} />
    ) : (
      <p className="operations-screen" role="alert">
        Invalid site OID.
      </p>
    );
  }

  if (kind === "testcells") {
    if (id === undefined)
      return (
        <DirectoryScreen client={client} key="testcells" kind="testcells" />
      );

    return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? (
      <TestCellDetail client={client} softwareId={id} />
    ) : (
      <p className="operations-screen" role="alert">
        Invalid test-cell software ID.
      </p>
    );
  }

  if (id === undefined)
    return (
      <VariableCatalog
        client={client}
        enableWrites={enableUniversalVariableWrites}
      />
    );

  return typeof id === "string" && id.length > 0 ? (
    <VariableDetail
      client={client}
      enableWrites={enableUniversalVariableWrites}
      name={id}
    />
  ) : (
    <p className="operations-screen" role="alert">
      Invalid variable name.
    </p>
  );
}
