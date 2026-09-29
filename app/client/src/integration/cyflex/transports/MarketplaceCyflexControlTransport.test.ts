import { MarketplaceClient, MarketplaceHttpError } from "../../marketplace";
import type { ProxyTestCellRequest } from "../../marketplace";
import type { StreamingControlRequest } from "../session/CyflexRunSession";
import { MarketplaceCyflexControlTransport } from "./MarketplaceCyflexControlTransport";

const URL = "/operator_display/remote/tc/41/cyflex/streaming";

function fixture() {
  const proxyTestCellRequest = jest.fn<
    Promise<Response>,
    [number, ProxyTestCellRequest]
  >();
  const transport = new MarketplaceCyflexControlTransport(
    { proxyTestCellRequest },
    41,
  );
  const signal = new AbortController().signal;
  const request: StreamingControlRequest = {
    contentType: "streaming/json_config+input+v1",
    accept: "streaming/json_config+output+v1",
    body: '{"uuid":"viewer-1","variables":[]}',
    signal,
  };

  return { proxyTestCellRequest, transport, request };
}

describe("MarketplaceCyflexControlTransport", () => {
  it("uses the marketplace's same-origin, cookie-backed proxy request", async () => {
    const fetcher = jest.fn(async () => new Response('{"go_time":123}'));
    const marketplace = new MarketplaceClient({ fetcher });
    const transport = new MarketplaceCyflexControlTransport(marketplace, 41);
    const { request } = fixture();

    await transport.postStreaming(request);
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];

    expect(url).toBe(URL);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(init.signal).toBe(request.signal);
    expect(init.body).toBe(request.body);
    expect((init.headers as Headers).get("Content-Type")).toBe(
      request.contentType,
    );
    expect((init.headers as Headers).get("Accept")).toBe(request.accept);
  });

  it("posts the unchanged control body and vendor headers to the selected cell", async () => {
    const f = fixture();

    f.proxyTestCellRequest.mockResolvedValue(
      new Response('{"go_time":123}', { status: 200 }),
    );

    await expect(f.transport.postStreaming(f.request)).resolves.toEqual({
      status: 200,
      body: '{"go_time":123}',
    });
    expect(f.proxyTestCellRequest).toHaveBeenCalledWith(41, {
      method: "POST",
      path: "cyflex/streaming",
      contentType: f.request.contentType,
      accept: f.request.accept,
      body: f.request.body,
      signal: f.request.signal,
    });
  });

  it("preserves an HTTP-200 Cyflex application error for the session", async () => {
    const f = fixture();
    const body = '{"error":"No valid variables found in input."}';

    f.proxyTestCellRequest.mockResolvedValue(new Response(body));
    await expect(f.transport.postStreaming(f.request)).resolves.toEqual({
      status: 200,
      body,
    });
  });

  it("turns a Java proxy HTTP error into a status-bearing session response", async () => {
    const f = fixture();

    f.proxyTestCellRequest.mockRejectedValue(
      new MarketplaceHttpError(502, URL, "Bad gateway"),
    );
    await expect(f.transport.postStreaming(f.request)).resolves.toEqual({
      status: 502,
      body: "Bad gateway",
    });
  });

  it("propagates network and abort failures", async () => {
    const f = fixture();
    const networkError = new TypeError("Failed to fetch");

    f.proxyTestCellRequest.mockRejectedValueOnce(networkError);
    await expect(f.transport.postStreaming(f.request)).rejects.toBe(
      networkError,
    );

    const abortError = new Error("aborted");

    f.proxyTestCellRequest.mockRejectedValueOnce(abortError);
    await expect(f.transport.postStreaming(f.request)).rejects.toBe(abortError);
  });

  it("requires a valid selected software ID", () => {
    const f = fixture();

    expect(
      () =>
        new MarketplaceCyflexControlTransport(
          { proxyTestCellRequest: f.proxyTestCellRequest },
          0,
        ),
    ).toThrow("positive safe integer");
  });
});
