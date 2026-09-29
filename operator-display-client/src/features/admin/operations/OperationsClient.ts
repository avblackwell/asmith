import type {
  OperationsPage,
  OperationsQuery,
  Site,
  TestCell,
  UniversalVariable,
  UniversalVariableCatalog,
  UniversalVariableCreate,
} from "./types";

export interface OperationsClientOptions {
  /** Same-origin Java context path; /operator_display in the supplied backend. */
  basePath?: string;
  fetcher?: typeof fetch;
}

export class OperationsHttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`Operations request failed with HTTP ${status}`);
    this.name = "OperationsHttpError";
  }
}

export class OperationsResponseError extends Error {
  constructor(
    readonly url: string,
    reason: string,
  ) {
    super(`Invalid operations response from ${url}: ${reason}`);
    this.name = "OperationsResponseError";
  }
}

function record(value: unknown, url: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new OperationsResponseError(url, "expected a JSON object");
  }

  return value as Record<string, unknown>;
}

function site(value: unknown, url: string): Site {
  const result = record(value, url);

  if (
    typeof result.oid !== "number" ||
    !Number.isSafeInteger(result.oid) ||
    (result.name !== null && typeof result.name !== "string")
  ) {
    throw new OperationsResponseError(url, "missing site OID or name");
  }

  return result as unknown as Site;
}

function testCell(value: unknown, url: string): TestCell {
  const result = record(value, url);
  const nestedSite = result.site == null ? null : record(result.site, url);
  const nestedState = result.state == null ? null : record(result.state, url);

  if (
    typeof result.id !== "number" ||
    !Number.isSafeInteger(result.id) ||
    typeof result.name !== "string" ||
    (nestedSite &&
      (typeof nestedSite.oid !== "number" ||
        !Number.isSafeInteger(nestedSite.oid))) ||
    (nestedState &&
      typeof nestedState.state !== "string" &&
      nestedState.state !== null)
  ) {
    throw new OperationsResponseError(
      url,
      "missing test-cell identity or state",
    );
  }

  return result as unknown as TestCell;
}

function variable(value: unknown, url: string): UniversalVariable {
  const result = record(value, url);

  if (
    typeof result.name !== "string" ||
    typeof result.unit !== "string" ||
    typeof result.status !== "string"
  ) {
    throw new OperationsResponseError(
      url,
      "missing variable identity, unit, or status",
    );
  }

  return result as unknown as UniversalVariable;
}

function page<T>(
  value: unknown,
  url: string,
  validate: (entry: unknown, url: string) => T,
): OperationsPage<T> {
  const result = record(value, url);
  const meta = record(result.meta, url);

  if (
    !Array.isArray(result.data) ||
    typeof meta.totalItems !== "number" ||
    typeof meta.currentPage !== "number" ||
    typeof meta.totalPages !== "number" ||
    (meta.nextCursor !== null && typeof meta.nextCursor !== "number") ||
    (meta.previousCursor !== null && typeof meta.previousCursor !== "number")
  ) {
    throw new OperationsResponseError(
      url,
      "expected a paginated { data, meta } response",
    );
  }

  return {
    data: result.data.map((entry) => validate(entry, url)),
    meta: meta as unknown as OperationsPage<T>["meta"],
  };
}

function catalog(value: unknown, url: string): UniversalVariableCatalog {
  const result = record(value, url);

  if (
    !Array.isArray(result.universalVariables) ||
    !Array.isArray(result.units) ||
    !Array.isArray(result.unitGroups)
  ) {
    throw new OperationsResponseError(
      url,
      "expected variables, units, and unit groups",
    );
  }

  return {
    universalVariables: result.universalVariables.map((entry) =>
      variable(entry, url),
    ),
    units: result.units.map((entry) => {
      const unit = record(entry, url);

      if (typeof unit.name !== "string")
        throw new OperationsResponseError(url, "unit missing name");

      return unit as unknown as UniversalVariableCatalog["units"][number];
    }),
    unitGroups: result.unitGroups.map((entry) => {
      const group = record(entry, url);

      if (typeof group.name !== "string")
        throw new OperationsResponseError(url, "unit group missing name");

      return group as unknown as UniversalVariableCatalog["unitGroups"][number];
    }),
  };
}

function positiveId(id: number, label: string): void {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
}

function queryString(
  query: OperationsQuery,
  allowedSorts: readonly string[],
): string {
  const params = new URLSearchParams();

  if (query.cursor !== undefined) {
    if (!Number.isSafeInteger(query.cursor) || query.cursor < 0)
      throw new TypeError("Cursor must be a nonnegative safe integer");

    params.set("cursor", String(query.cursor));
  }

  if (query.limit !== undefined) {
    if (
      !Number.isSafeInteger(query.limit) ||
      query.limit < 1 ||
      query.limit > 100
    )
      throw new TypeError("Limit must be between 1 and 100");

    params.set("limit", String(query.limit));
  }

  if (query.search) params.set("search", query.search);

  if (query.sort) {
    if (!allowedSorts.includes(query.sort.field))
      throw new TypeError(`Unsupported sort field: ${query.sort.field}`);

    params.set("sort", query.sort.field);
    params.set("sortValue", String(query.sort.descending));
  }

  const encoded = params.toString();

  return encoded ? `?${encoded}` : "";
}

/** Direct browser adapter for the existing Java operations endpoints. */
export class OperationsClient {
  private readonly basePath: string;
  private readonly fetcher: typeof fetch;

  constructor(options: OperationsClientOptions = {}) {
    this.basePath = (options.basePath ?? "/operator_display").replace(
      /\/$/,
      "",
    );
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  }

  private url(path: string): string {
    return `${this.basePath}${path}`;
  }

  private async request(
    url: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const response = await this.fetcher(url, {
      credentials: "same-origin",
      ...init,
    });

    if (!response.ok) throw new OperationsHttpError(response.status, url);

    return response;
  }

  private async json(url: string, signal?: AbortSignal): Promise<unknown> {
    const response = await this.request(url, { signal });

    try {
      return await response.json();
    } catch {
      throw new OperationsResponseError(url, "expected JSON body");
    }
  }

  async listSites(
    query: OperationsQuery = {},
    signal?: AbortSignal,
  ): Promise<OperationsPage<Site>> {
    const url = this.url(`/system/sites${queryString(query, ["name", "oid"])}`);

    return page(await this.json(url, signal), url, site);
  }

  async getSite(oid: number, signal?: AbortSignal): Promise<Site> {
    positiveId(oid, "Site OID");
    const url = this.url(`/system/sites/${oid}`);

    return site(await this.json(url, signal), url);
  }

  async listTestCells(
    query: OperationsQuery = {},
    signal?: AbortSignal,
  ): Promise<OperationsPage<TestCell>> {
    const url = this.url(
      `/system/testcells${queryString(query, ["cell", "site", "id"])}`,
    );

    return page(await this.json(url, signal), url, testCell);
  }

  async getTestCell(
    softwareId: number,
    signal?: AbortSignal,
  ): Promise<TestCell> {
    positiveId(softwareId, "Test-cell software ID");
    const url = this.url(`/system/testcells/${softwareId}`);

    return testCell(await this.json(url, signal), url);
  }

  async getUniversalVariableCatalog(
    signal?: AbortSignal,
  ): Promise<UniversalVariableCatalog> {
    const url = this.url("/system/universal-variable-catalog");

    return catalog(await this.json(url, signal), url);
  }

  async getUniversalVariableStatuses(signal?: AbortSignal): Promise<string[]> {
    const url = this.url("/system/universal-variable-statuses");
    const result = record(await this.json(url, signal), url);

    if (
      !Array.isArray(result.statuses) ||
      result.statuses.some((entry) => typeof entry !== "string")
    )
      throw new OperationsResponseError(url, "expected statuses array");

    return result.statuses;
  }

  async getUniversalVariable(
    name: string,
    signal?: AbortSignal,
  ): Promise<UniversalVariable> {
    if (!name.trim()) throw new TypeError("Variable name is required");

    const url = this.url(
      `/system/universal-variable/${encodeURIComponent(name)}`,
    );

    return variable(await this.json(url, signal), url);
  }

  async createUniversalVariable(
    input: UniversalVariableCreate,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!input.name.trim() || !input.unit.trim())
      throw new TypeError("Variable name and unit are required");

    const url = this.url("/system/universal-variable");

    await this.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
  }

  async updateUniversalVariableStatus(
    name: string,
    status: string,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!name.trim() || !status.trim())
      throw new TypeError("Variable name and status are required");

    const url = this.url(
      `/system/universal-variable/${encodeURIComponent(name)}/status`,
    );

    await this.request(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
      signal,
    });
  }
}
