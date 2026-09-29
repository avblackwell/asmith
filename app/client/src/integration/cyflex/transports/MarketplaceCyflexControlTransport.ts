import {
  MarketplaceHttpError,
  type MarketplaceClient,
} from "../../marketplace";
import type {
  CyflexControlTransport,
  StreamingControlRequest,
  StreamingControlResponse,
} from "../session/CyflexRunSession";

/**
 * Sends Cyflex control requests through the marketplace's permission-checked
 * test-cell proxy. The selected cell's software ID is fixed for this instance.
 */
export class MarketplaceCyflexControlTransport
  implements CyflexControlTransport
{
  constructor(
    private readonly marketplace: Pick<
      MarketplaceClient,
      "proxyTestCellRequest"
    >,
    private readonly softwareId: number,
  ) {
    if (!Number.isSafeInteger(softwareId) || softwareId <= 0) {
      throw new TypeError(
        "Test cell software ID must be a positive safe integer",
      );
    }
  }

  async postStreaming(
    request: StreamingControlRequest,
  ): Promise<StreamingControlResponse> {
    try {
      const response = await this.marketplace.proxyTestCellRequest(
        this.softwareId,
        {
          method: "POST",
          path: "cyflex/streaming",
          contentType: request.contentType,
          accept: request.accept,
          body: request.body,
          signal: request.signal,
        },
      );

      // Cyflex can report application errors in an HTTP-200 JSON response.
      // Leave the body intact for CyflexRunSession to inspect.
      return { status: response.status, body: await response.text() };
    } catch (error) {
      // MarketplaceClient throws on HTTP failures. The session expects a
      // status-bearing response so it can report the failed control status.
      if (error instanceof MarketplaceHttpError) {
        return { status: error.status, body: error.responseText };
      }

      throw error;
    }
  }
}
