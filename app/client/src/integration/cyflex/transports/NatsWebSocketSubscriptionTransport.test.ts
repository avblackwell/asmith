import type {
  Msg,
  NatsConnection,
  Status,
  Subscription,
  SubscriptionOptions,
} from "@nats-io/nats-core";

import { NatsWebSocketSubscriptionTransport } from "./NatsWebSocketSubscriptionTransport";

const SUBJECT = "global.streaming.test.machine";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });

  return { promise, resolve };
}

class StatusQueue implements AsyncIterable<Status> {
  private readonly values: Array<IteratorResult<Status>> = [];
  private readonly waiters: Array<(value: IteratorResult<Status>) => void> = [];

  push(value: Status) {
    this.deliver({ value, done: false });
  }

  end() {
    this.deliver({ value: undefined, done: true });
  }

  private deliver(value: IteratorResult<Status>) {
    const waiter = this.waiters.shift();

    if (waiter) waiter(value);
    else this.values.push(value);
  }

  [Symbol.asyncIterator](): AsyncIterator<Status> {
    return {
      next: async () => {
        const value = this.values.shift();

        if (value) return Promise.resolve(value);

        return new Promise<IteratorResult<Status>>((resolve) => {
          this.waiters.push(resolve);
        });
      },
    };
  }
}

function fixture() {
  const status = new StatusQueue();
  const connectionClosed = deferred<void | Error>();
  const subscriptionClosed = deferred<void | Error>();
  let messageCallback!: (error: Error | null, message: Msg) => void;

  const subscription = {
    closed: subscriptionClosed.promise,
    unsubscribe: jest.fn(() => subscriptionClosed.resolve()),
  } as unknown as Subscription;

  const connection = {
    subscribe: jest.fn((_subject: string, options?: SubscriptionOptions) => {
      messageCallback = options?.callback as typeof messageCallback;

      return subscription;
    }),
    status: jest.fn(() => status),
    closed: jest.fn(async () => connectionClosed.promise),
    flush: jest.fn(async () => undefined),
    close: jest.fn(async () => {
      status.end();
      connectionClosed.resolve();
      subscriptionClosed.resolve();
    }),
  } as unknown as NatsConnection;

  const connect = jest.fn(async () => connection);
  const onFrame = jest.fn();
  const onDisconnect = jest.fn();
  const onReconnect = jest.fn();
  const onError = jest.fn();
  const transport = new NatsWebSocketSubscriptionTransport({
    connection: {
      servers: "wss://broker.example.test/nats",
      token: "injected-token",
      ignoreClusterUpdates: true,
    },
    connect,
    onError,
  });

  return {
    transport,
    connect,
    connection,
    subscription,
    status,
    connectionClosed,
    subscriptionClosed,
    onFrame,
    onDisconnect,
    onReconnect,
    onError,
    emitFrame: (data: Uint8Array) =>
      messageCallback(null, { data, subject: SUBJECT } as Msg),
    emitSubscriptionError: (error: Error) =>
      messageCallback(error, { data: new Uint8Array() } as Msg),
    callbacks: { onFrame, onDisconnect, onReconnect },
  };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("NatsWebSocketSubscriptionTransport", () => {
  it("connects with injected broker options and forwards raw bytes from one exact subject", async () => {
    const f = fixture();
    const active = await f.transport.subscribe(SUBJECT, f.callbacks);
    const frame = new Uint8Array([1, 2, 3]);

    expect(f.connect).toHaveBeenCalledWith({
      servers: "wss://broker.example.test/nats",
      token: "injected-token",
      ignoreClusterUpdates: true,
    });
    expect(f.connection.subscribe).toHaveBeenCalledWith(
      SUBJECT,
      expect.objectContaining({ callback: expect.any(Function) }),
    );
    expect(f.connection.flush).toHaveBeenCalledTimes(1);

    f.emitFrame(frame);
    expect(f.onFrame).toHaveBeenCalledWith(frame);
    expect(f.onFrame.mock.calls[0][0]).toBe(frame);

    await active.unsubscribe();
  });

  it("relays disconnect and reconnect once, then suppresses all callbacks after stop", async () => {
    const f = fixture();
    const active = await f.transport.subscribe(SUBJECT, f.callbacks);

    f.status.push({ type: "disconnect", server: "broker.example.test" });
    f.status.push({ type: "disconnect", server: "broker.example.test" });
    await settle();
    expect(f.onDisconnect).toHaveBeenCalledTimes(1);

    f.status.push({ type: "reconnect", server: "broker.example.test" });
    await settle();
    expect(f.onReconnect).toHaveBeenCalledTimes(1);

    await active.unsubscribe();
    await active.unsubscribe();
    expect(f.subscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(f.connection.close).toHaveBeenCalledTimes(1);

    f.emitFrame(new Uint8Array([9]));
    f.status.push({ type: "disconnect", server: "broker.example.test" });
    await settle();
    expect(f.onFrame).not.toHaveBeenCalled();
    expect(f.onDisconnect).toHaveBeenCalledTimes(1);
    expect(f.onReconnect).toHaveBeenCalledTimes(1);
  });

  it("rejects wildcard, malformed, and non-WebSocket configuration", async () => {
    const f = fixture();

    for (const subject of [
      "global.streaming.*",
      "global.streaming.site.>",
      "global.streaming..machine",
      "global.streaming.site machine",
    ]) {
      await expect(f.transport.subscribe(subject, f.callbacks)).rejects.toThrow(
        "exact Cyflex cell streaming subject",
      );
    }

    expect(f.connect).not.toHaveBeenCalled();
    expect(
      () =>
        new NatsWebSocketSubscriptionTransport({
          connection: { servers: "nats://broker.example.test:4222" },
        }),
    ).toThrow("ws:// or wss://");
    expect(
      () =>
        new NatsWebSocketSubscriptionTransport({
          connection: { servers: "wss://user:pass@broker.example.test" },
        }),
    ).toThrow("ws:// or wss://");
  });

  it("closes a connection when SUB registration fails", async () => {
    const f = fixture();

    (f.connection.subscribe as jest.Mock).mockImplementationOnce(() => {
      throw new Error("subject denied");
    });

    await expect(f.transport.subscribe(SUBJECT, f.callbacks)).rejects.toThrow(
      "subject denied",
    );
    expect(f.connection.close).toHaveBeenCalledTimes(1);
  });

  it("reports asynchronous subscription errors and closes the connection", async () => {
    const f = fixture();
    const onClose = jest.fn();

    await f.transport.subscribe(SUBJECT, { ...f.callbacks, onClose });
    const error = new Error("permission violation");

    f.emitSubscriptionError(error);
    f.subscriptionClosed.resolve(error);
    await settle();

    expect(onClose).toHaveBeenCalledWith(error);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(f.onError).not.toHaveBeenCalled();
    expect(f.connection.close).toHaveBeenCalledTimes(1);
  });

  it("reports terminal socket closure without emitting callbacks after manual stop", async () => {
    const f = fixture();
    const onClose = jest.fn();
    const active = await f.transport.subscribe(SUBJECT, {
      ...f.callbacks,
      onClose,
    });
    const error = new Error("connection ended");

    f.connectionClosed.resolve(error);
    await settle();

    expect(onClose).toHaveBeenCalledWith(error);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(f.onError).not.toHaveBeenCalled();

    await active.unsubscribe();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("preserves the connection error when its subscription closes first", async () => {
    const f = fixture();
    const onClose = jest.fn();
    const active = await f.transport.subscribe(SUBJECT, {
      ...f.callbacks,
      onClose,
    });
    const error = new Error("authentication failed");

    f.subscriptionClosed.resolve();
    f.connectionClosed.resolve(error);
    await settle();

    expect(onClose).toHaveBeenCalledWith(error);
    expect(onClose).toHaveBeenCalledTimes(1);
    await active.unsubscribe();
  });

  it("does not report normal unsubscribe as terminal closure", async () => {
    const f = fixture();
    const onClose = jest.fn();
    const active = await f.transport.subscribe(SUBJECT, {
      ...f.callbacks,
      onClose,
    });

    await active.unsubscribe();
    await settle();

    expect(onClose).not.toHaveBeenCalled();
    expect(f.onError).not.toHaveBeenCalled();
  });
});
