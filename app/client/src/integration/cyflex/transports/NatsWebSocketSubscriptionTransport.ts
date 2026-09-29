import {
  wsconnect,
  type Msg,
  type Subscription,
  type WsConnectionOptions,
} from "@nats-io/nats-core";

import type {
  CyflexSubscription,
  CyflexSubscriptionTransport,
} from "../session/CyflexRunSession";

export interface NatsWebSocketSubscriptionTransportOptions {
  /** Browser-reachable ws:// or wss:// URL and broker authentication. */
  connection: WsConnectionOptions & { servers: string | string[] };
  /** Receives asynchronous subscription and connection errors. */
  onError?: (error: Error) => void;
  /** Allows a connection substitute in focused tests. */
  connect?: typeof wsconnect;
}

function asError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

function validateServers(servers: string | string[]): void {
  const urls = typeof servers === "string" ? [servers] : servers;

  if (urls.length === 0) {
    throw new TypeError("At least one NATS WebSocket URL is required");
  }

  for (const server of urls) {
    let parsed: URL;

    try {
      parsed = new URL(server);
    } catch {
      throw new TypeError("NATS server must be an absolute WebSocket URL");
    }

    if (
      server !== server.trim() ||
      !["ws:", "wss:"].includes(parsed.protocol) ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      throw new TypeError("NATS server must be a ws:// or wss:// URL");
    }
  }
}

function validateSubject(subject: string): void {
  if (
    !subject.startsWith("global.streaming.") ||
    subject.split(".").some((token) => token.length === 0) ||
    /[*>\s]/.test(subject)
  ) {
    throw new TypeError("Expected an exact Cyflex cell streaming subject");
  }
}

/** One exact subject and one browser NATS connection per active run session. */
export class NatsWebSocketSubscriptionTransport
  implements CyflexSubscriptionTransport
{
  private readonly connection: WsConnectionOptions & {
    servers: string | string[];
  };
  private readonly connect: typeof wsconnect;
  private readonly onError?: (error: Error) => void;

  constructor(options: NatsWebSocketSubscriptionTransportOptions) {
    validateServers(options.connection.servers);
    this.connection = {
      ...options.connection,
      servers: Array.isArray(options.connection.servers)
        ? [...options.connection.servers]
        : options.connection.servers,
    };
    this.connect = options.connect ?? wsconnect;
    this.onError = options.onError;
  }

  private reportError(reason: unknown): void {
    try {
      this.onError?.(asError(reason));
    } catch {
      // An error consumer cannot interrupt socket cleanup.
    }
  }

  async subscribe(
    subject: string,
    callbacks: {
      onFrame(frame: Uint8Array): void;
      onDisconnect(): void;
      onReconnect(): void;
      onClose?(error: Error): void;
    },
  ): Promise<CyflexSubscription> {
    validateSubject(subject);

    const connection = await this.connect(this.connection);
    let subscription: Subscription | undefined;
    let stopped = false;
    let disconnected = false;
    let terminalNotified = false;
    let terminalFallbackTimer: ReturnType<typeof setTimeout> | undefined;
    let stopPromise: Promise<void> | undefined;

    const notifyDisconnect = () => {
      if (stopped || disconnected) return;

      disconnected = true;

      try {
        callbacks.onDisconnect();
      } catch (reason) {
        this.reportError(reason);
      }
    };

    const notifyTerminal = (reason?: unknown) => {
      if (stopped || terminalNotified) return;

      terminalNotified = true;

      if (terminalFallbackTimer) clearTimeout(terminalFallbackTimer);

      const error = reason
        ? asError(reason)
        : new Error("NATS WebSocket connection closed");

      if (callbacks.onClose) {
        try {
          callbacks.onClose(error);
        } catch (callbackError) {
          this.reportError(callbackError);
        }
      } else {
        this.reportError(error);
      }
    };

    const closeFromSubscription = (reason?: unknown) => {
      if (stopped || terminalNotified) return;

      notifyTerminal(reason);

      if (stopped) return;

      void connection
        .close()
        .catch((closeError) => this.reportError(closeError));
    };

    const onMessage = (error: Error | null, message: Msg | null) => {
      if (stopped) return;

      if (error) {
        closeFromSubscription(error);
      } else if (message) {
        try {
          callbacks.onFrame(message.data);
        } catch (reason) {
          this.reportError(reason);
        }
      }
    };

    try {
      subscription = connection.subscribe(subject, { callback: onMessage });

      void (async () => {
        try {
          for await (const event of connection.status()) {
            if (stopped) break;

            if (event.type === "disconnect") {
              notifyDisconnect();
            } else if (event.type === "reconnect") {
              disconnected = false;

              try {
                callbacks.onReconnect();
              } catch (reason) {
                this.reportError(reason);
              }
            }
          }
        } catch (reason) {
          if (!stopped) this.reportError(reason);
        }
      })();

      void connection
        .closed()
        .then((reason) => {
          notifyTerminal(reason);
        })
        .catch((reason) => {
          notifyTerminal(reason);
        });

      void subscription.closed
        .then((reason) => {
          if (stopped) return;

          if (reason) {
            closeFromSubscription(reason);
          } else {
            // A connection close can settle its subscription before closed()
            // provides the actual socket error. Let that reason win first.
            terminalFallbackTimer = setTimeout(() => closeFromSubscription());
          }
        })
        .catch(closeFromSubscription);

      // Ensure the SUB command has reached the broker before start() reports running.
      await connection.flush();
    } catch (reason) {
      stopped = true;

      if (terminalFallbackTimer) clearTimeout(terminalFallbackTimer);

      try {
        subscription?.unsubscribe();
      } catch (cleanupError) {
        this.reportError(cleanupError);
      }

      try {
        await connection.close();
      } catch (cleanupError) {
        this.reportError(cleanupError);
      }

      throw reason;
    }

    return {
      unsubscribe: async () => {
        if (!stopPromise) {
          stopped = true;

          if (terminalFallbackTimer) clearTimeout(terminalFallbackTimer);

          stopPromise = (async () => {
            try {
              subscription.unsubscribe();
            } finally {
              await connection.close();
            }
          })();
        }

        return stopPromise;
      },
    };
  }
}
