import {
  CyflexProxyClient,
  CyflexProxyHttpError,
} from "../CyflexProxyClient";
import type {
  CyflexControlTransport,
  StreamingControlRequest,
  StreamingControlResponse,
} from "../session/CyflexRunSession";

/** All Cyflex control requests use the signed-in Java test-cell proxy. */
export class CyflexProxyControlTransport implements CyflexControlTransport {
  constructor(
    private readonly client: Pick<CyflexProxyClient, "proxyTestCellRequest">,
    private readonly softwareId: number,
  ) {
    if (!Number.isSafeInteger(softwareId) || softwareId <= 0) {
      throw new TypeError("Test cell software ID must be a positive safe integer");
    }
  }

  async postStreaming(request: StreamingControlRequest): Promise<StreamingControlResponse> {
    try {
      const response = await this.client.proxyTestCellRequest(this.softwareId, {
        method: "POST",
        path: "cyflex/streaming",
        contentType: request.contentType,
        accept: request.accept,
        body: request.body,
        signal: request.signal,
      });
      // Cyflex may return an application error in an HTTP-200 JSON response.
      return { status: response.status, body: await response.text() };
    } catch (error) {
      if (error instanceof CyflexProxyHttpError) {
        return { status: error.status, body: error.responseText };
      }
      throw error;
    }
  }
}
