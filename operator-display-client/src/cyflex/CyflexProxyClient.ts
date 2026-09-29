import type { MarketplacePage, MarketplaceTestCell } from "../api/types";
import {
  OperationsClient,
  OperationsHttpError,
} from "../features/admin/operations/OperationsClient";

export type { MarketplacePage, MarketplaceTestCell } from "../api/types";

export interface CyflexProxyClientOptions {
  /** Same-origin Java context path. No Cyflex host or browser Basic auth. */
  basePath?: string;
  fetcher?: typeof fetch;
}

export type CyflexProxyRequest =
  | {
      method: "GET";
      path: "cyflex" | "cyflex/variables";
      accept: string;
      signal?: AbortSignal;
    }
  | {
      method: "POST";
      path: "cyflex/streaming";
      accept: string;
      contentType: string;
      body: string;
      signal?: AbortSignal;
    };

export class CyflexProxyHttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly responseText: string,
  ) {
    super(responseText.trim() || `Cyflex proxy returned HTTP ${status}`);
    this.name = "CyflexProxyHttpError";
  }
}

function positiveSoftwareId(id: number): void {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new TypeError("Test cell software ID must be a positive safe integer");
  }
}

function sameOriginPath(path: string): string {
  const normalized = path.replace(/\/$/, "");
  if (!normalized.startsWith("/") || normalized.startsWith("//") ||
      normalized.includes("..") || /[?#\\]/.test(normalized)) {
    throw new TypeError("Cyflex proxy base path must be a same-origin path");
  }
  return normalized;
}

/** Browser HTTP boundary: Java session cookie -> authorized cell -> Cyflex. */
export class CyflexProxyClient {
  private readonly basePath: string;
  private readonly fetcher: typeof fetch;
  private readonly operations: OperationsClient;

  constructor(options: CyflexProxyClientOptions = {}) {
    this.basePath = sameOriginPath(options.basePath ?? "/operator_display");
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    this.operations = new OperationsClient({
      basePath: this.basePath,
      fetcher: this.fetcher,
    });
  }

  async listTestCells(
    query: { cursor?: number; limit?: number } = {},
    signal?: AbortSignal,
  ): Promise<MarketplacePage<MarketplaceTestCell>> {
    try {
      return await this.operations.listTestCells(query, signal);
    } catch (error) {
      if (error instanceof OperationsHttpError) {
        throw new CyflexProxyHttpError(error.status, error.url, "");
      }
      throw error;
    }
  }

  async getTestCell(
    softwareId: number,
    signal?: AbortSignal,
  ): Promise<MarketplaceTestCell> {
    positiveSoftwareId(softwareId);
    try {
      return await this.operations.getTestCell(softwareId, signal);
    } catch (error) {
      if (error instanceof OperationsHttpError) {
        throw new CyflexProxyHttpError(error.status, error.url, "");
      }
      throw error;
    }
  }

  async proxyTestCellRequest(
    softwareId: number,
    request: CyflexProxyRequest,
  ): Promise<Response> {
    positiveSoftwareId(softwareId);
    const url = `${this.basePath}/remote/tc/${softwareId}/${request.path}`;
    const headers = new Headers({ Accept: request.accept });
    let body: string | undefined;

    if (request.method === "POST") {
      headers.set("Content-Type", request.contentType);
      body = request.body;
    }

    const response = await this.fetcher(url, {
      method: request.method,
      headers,
      body,
      signal: request.signal,
      credentials: "same-origin",
    });

    if (!response.ok) {
      throw new CyflexProxyHttpError(
        response.status,
        url,
        await response.text(),
      );
    }

    return response;
  }
}
