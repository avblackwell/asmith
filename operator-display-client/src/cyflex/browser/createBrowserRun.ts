import type { CyflexProxyClient } from "../CyflexProxyClient";
import {
  CyflexProxyControlTransport,
  NatsWebSocketSubscriptionTransport,
} from "../transports";
import { BrowserCyflexRun } from "./BrowserCyflexRun";
import type { BrowserCyflexRunOptions } from "./BrowserCyflexRun";

export type BrowserNatsConnection = ConstructorParameters<
  typeof NatsWebSocketSubscriptionTransport
>[0]["connection"];
export type CyflexTimestampToMs = BrowserCyflexRunOptions["timestampToMs"];

export interface BrowserRunOptions
  extends Omit<BrowserCyflexRunOptions, "control" | "subscriptions"> {
  client: Pick<CyflexProxyClient, "proxyTestCellRequest">;
  softwareId: number;
  /** Browser WSS connection; the deployment must scope broker access. */
  natsConnection: BrowserNatsConnection;
}

/** Cyflex HTTP through Java; NATS messages directly to the browser. */
export function createBrowserRun(options: BrowserRunOptions): BrowserCyflexRun {
  const { client, softwareId, natsConnection, ...runOptions } = options;
  return new BrowserCyflexRun({
    ...runOptions,
    control: new CyflexProxyControlTransport(client, softwareId),
    subscriptions: new NatsWebSocketSubscriptionTransport({
      connection: natsConnection,
      onError: options.onError,
    }),
  });
}
