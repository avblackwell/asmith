import type { MarketplaceClient } from "../../marketplace";
import {
  MarketplaceCyflexControlTransport,
  NatsWebSocketSubscriptionTransport,
} from "../transports";
import { BrowserCyflexRun } from "./BrowserCyflexRun";
import type { BrowserCyflexRunOptions } from "./BrowserCyflexRun";

export interface MarketplaceBrowserRunOptions
  extends Omit<BrowserCyflexRunOptions, "control" | "subscriptions"> {
  marketplace: MarketplaceClient;
  /** Software ID of the cell already selected through marketplace identity. */
  softwareId: number;
  /** Browser-appropriate NATS WebSocket configuration supplied by deployment. */
  natsConnection: ConstructorParameters<
    typeof NatsWebSocketSubscriptionTransport
  >[0]["connection"];
}

/**
 * Concrete browser wiring. No URL, credentials, subject, or variable mapping
 * is bundled into the dashboard or source code.
 */
export function createMarketplaceBrowserRun(
  options: MarketplaceBrowserRunOptions,
): BrowserCyflexRun {
  const { marketplace, natsConnection, softwareId, ...runOptions } = options;

  return new BrowserCyflexRun({
    ...runOptions,
    control: new MarketplaceCyflexControlTransport(marketplace, softwareId),
    subscriptions: new NatsWebSocketSubscriptionTransport({
      connection: natsConnection,
      onError: options.onError,
    }),
  });
}
