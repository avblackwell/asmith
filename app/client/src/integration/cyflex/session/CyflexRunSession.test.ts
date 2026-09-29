import { exampleDashboardDocument } from "../../document";
import type { DashboardDocument } from "../../document";
import {
  CyflexControlError,
  CyflexRunSession,
  RunSessionStoppedError,
  STREAM_ALIVE_INPUT,
  STREAM_CONFIG_INPUT,
} from "./CyflexRunSession";
import type {
  CyflexSubscriptionTransport,
  StreamingControlRequest,
} from "./CyflexRunSession";
import { deriveStreamRequirements, streamConfigBody } from "./requirements";

const SUBJECT = "global.streaming.test.machine";
const ID = "18446744073709551615";

function cloneDocument(): DashboardDocument {
  return JSON.parse(JSON.stringify(exampleDashboardDocument));
}

function input(document = cloneDocument()) {
  return {
    document,
    cellId: "cell-a",
    subject: SUBJECT,
    resolvedVariables: [{ key: "engineSpeed", id: ID, label: "ENGINE_SPEED" }],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function fixture() {
  const requests: StreamingControlRequest[] = [];
  const subscriptionCalls: Array<{
    subject: string;
    callbacks: Parameters<CyflexSubscriptionTransport["subscribe"]>[1];
    unsubscribe: jest.Mock;
  }> = [];
  const control = {
    postStreaming: jest.fn(async (request: StreamingControlRequest) => {
      requests.push(request);

      return { status: 200, body: '{"go_time":123}' };
    }),
  };
  const subscriptions: CyflexSubscriptionTransport = {
    subscribe: jest.fn(async (subject, callbacks) => {
      const unsubscribe = jest.fn();

      subscriptionCalls.push({ subject, callbacks, unsubscribe });

      return { unsubscribe };
    }),
  };

  return { requests, subscriptionCalls, control, subscriptions };
}

describe("Cyflex streaming requirements", () => {
  it("deduplicates widget bindings by uint64 ID and unit and requests buffer for history", () => {
    const requirements = deriveStreamRequirements(
      cloneDocument(),
      input().resolvedVariables,
    );

    expect(requirements).toEqual({
      variables: [
        {
          id: ID,
          label: "ENGINE_SPEED",
          watchers: [{ unitCode: 16, buffered: true }],
        },
      ],
    });
    expect(streamConfigBody("viewer-1", requirements)).toEqual({
      uuid: "viewer-1",
      variables: [{ label: "ENGINE_SPEED" }],
      watchers: [
        {
          label: "ENGINE_SPEED",
          watchers: [
            { count: 1, limit_count: 0, buffer_count: 1, unit_code: 16 },
          ],
        },
      ],
    });
  });

  it("rejects unresolved or mismatched direct IDs before control traffic", () => {
    const document = cloneDocument();

    expect(() => deriveStreamRequirements(document, [])).toThrow(
      "was not resolved",
    );

    document.variables[0].selector = { kind: "cyflexId", id: "7" };
    expect(() =>
      deriveStreamRequirements(document, input().resolvedVariables),
    ).toThrow("resolved to a different ID");
  });
});

describe("CyflexRunSession", () => {
  afterEach(() => jest.useRealTimers());

  it("rejects malformed or wildcard subjects before control traffic", async () => {
    const f = fixture();
    const session = new CyflexRunSession({
      control: f.control,
      subscriptions: f.subscriptions,
      onFrame: jest.fn(),
      createUuid: () => "viewer-1",
    });

    for (const subject of [
      "global.streaming..cell",
      "global.streaming.site.",
      "global.streaming.*",
    ]) {
      await expect(session.start({ ...input(), subject })).rejects.toThrow(
        "exact Cyflex cell streaming subject",
      );
    }

    expect(f.requests).toHaveLength(0);
    expect(f.subscriptionCalls).toHaveLength(0);
  });

  it("registers, subscribes to the chosen subject, sends keepalive and stops locally", async () => {
    jest.useFakeTimers();
    const f = fixture();
    const onFrame = jest.fn();
    const session = new CyflexRunSession({
      control: f.control,
      subscriptions: f.subscriptions,
      onFrame,
      createUuid: () => "viewer-1",
      keepaliveIntervalMs: 60_000,
    });

    await session.start(input());

    expect(session.status).toBe("running");
    expect(f.requests[0].contentType).toBe(STREAM_CONFIG_INPUT);
    expect(JSON.parse(f.requests[0].body).uuid).toBe("viewer-1");
    expect(f.subscriptionCalls[0].subject).toBe(SUBJECT);
    const frame = new Uint8Array([1, 2]);

    f.subscriptionCalls[0].callbacks.onFrame(frame);
    expect(onFrame).toHaveBeenCalledWith(frame);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(f.requests[1].contentType).toBe(STREAM_ALIVE_INPUT);
    expect(JSON.parse(f.requests[1].body)).toEqual({ uuid: "viewer-1" });

    await session.stop();
    expect(session.status).toBe("idle");
    expect(f.subscriptionCalls[0].unsubscribe).toHaveBeenCalledTimes(1);
    expect(f.requests).toHaveLength(2);
    await jest.advanceTimersByTimeAsync(120_000);
    expect(f.requests).toHaveLength(2);
    f.subscriptionCalls[0].callbacks.onFrame(frame);
    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  it("stops keepalive and reports an error after a terminal subscription close", async () => {
    jest.useFakeTimers();
    const f = fixture();
    const onError = jest.fn();
    const session = new CyflexRunSession({
      control: f.control,
      subscriptions: f.subscriptions,
      onFrame: jest.fn(),
      onError,
      createUuid: () => "viewer-1",
      keepaliveIntervalMs: 60_000,
    });

    await session.start(input());
    const error = new Error("NATS WebSocket connection closed");

    f.subscriptionCalls[0].callbacks.onClose?.(error);
    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith(error);
    expect(session.status).toBe("idle");
    expect(f.subscriptionCalls[0].unsubscribe).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(120_000);
    expect(f.requests).toHaveLength(1);
  });

  it("keeps two viewers independent when one leaves", async () => {
    jest.useFakeTimers();
    const f = fixture();
    const viewer1 = new CyflexRunSession({
      control: f.control,
      subscriptions: f.subscriptions,
      onFrame: jest.fn(),
      createUuid: () => "viewer-1",
      keepaliveIntervalMs: 60_000,
    });
    const viewer2 = new CyflexRunSession({
      control: f.control,
      subscriptions: f.subscriptions,
      onFrame: jest.fn(),
      createUuid: () => "viewer-2",
      keepaliveIntervalMs: 60_000,
    });

    await Promise.all([viewer1.start(input()), viewer2.start(input())]);
    await viewer1.stop();
    await jest.advanceTimersByTimeAsync(60_000);

    expect(f.subscriptionCalls[0].unsubscribe).toHaveBeenCalledTimes(1);
    expect(f.subscriptionCalls[1].unsubscribe).not.toHaveBeenCalled();
    expect(
      f.requests
        .filter((request) => request.contentType === STREAM_ALIVE_INPUT)
        .map((request) => JSON.parse(request.body).uuid),
    ).toEqual(["viewer-2"]);
    await viewer2.stop();
  });

  it("rejects HTTP-200 application errors before subscribing", async () => {
    const f = fixture();

    f.control.postStreaming.mockResolvedValueOnce({
      status: 200,
      body: '{"go_time":123,"error":"No valid variables found in input."}',
    });
    const session = new CyflexRunSession({
      control: f.control,
      subscriptions: f.subscriptions,
      onFrame: jest.fn(),
      createUuid: () => "viewer-1",
    });

    await expect(session.start(input())).rejects.toThrow(CyflexControlError);
    expect(session.status).toBe("idle");
    expect(f.subscriptionCalls).toHaveLength(0);
  });

  it("rejects failed HTTP status and malformed success bodies", async () => {
    const f = fixture();
    const session = new CyflexRunSession({
      control: f.control,
      subscriptions: f.subscriptions,
      onFrame: jest.fn(),
      createUuid: () => "viewer-1",
    });

    f.control.postStreaming.mockResolvedValueOnce({
      status: 503,
      body: "unavailable",
    });
    await expect(session.start(input())).rejects.toThrow("HTTP 503");
    f.control.postStreaming.mockResolvedValueOnce({
      status: 200,
      body: "not JSON",
    });
    await expect(session.start(input())).rejects.toThrow("invalid JSON");
    expect(f.subscriptionCalls).toHaveLength(0);
  });

  it("reports keepalive application errors and retries on the next interval", async () => {
    jest.useFakeTimers();
    const f = fixture();
    const onError = jest.fn();
    const session = new CyflexRunSession({
      control: f.control,
      subscriptions: f.subscriptions,
      onFrame: jest.fn(),
      onError,
      createUuid: () => "viewer-1",
      keepaliveIntervalMs: 60_000,
    });

    await session.start(input());
    f.control.postStreaming.mockResolvedValueOnce({
      status: 200,
      body: '{"error":"Cyflex is not running."}',
    });
    await jest.advanceTimersByTimeAsync(60_000);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ applicationError: "Cyflex is not running." }),
    );
    await jest.advanceTimersByTimeAsync(60_000);
    expect(
      f.control.postStreaming.mock.calls.filter(
        ([request]) => request.contentType === STREAM_ALIVE_INPUT,
      ),
    ).toHaveLength(2);
    await session.stop();
  });

  it("re-registers after an expired lease and after a subscription reconnect", async () => {
    jest.useFakeTimers();
    const f = fixture();
    const session = new CyflexRunSession({
      control: f.control,
      subscriptions: f.subscriptions,
      onFrame: jest.fn(),
      createUuid: () => "viewer-1",
      keepaliveIntervalMs: 60_000,
    });

    await session.start(input());
    f.control.postStreaming.mockImplementationOnce(async (request) => {
      f.requests.push(request);

      return {
        status: 200,
        body: '{"error":"Client UUID not found in tracker."}',
      };
    });
    await jest.advanceTimersByTimeAsync(60_000);
    expect(f.requests.map((request) => request.contentType)).toEqual([
      STREAM_CONFIG_INPUT,
      STREAM_ALIVE_INPUT,
      STREAM_CONFIG_INPUT,
    ]);

    f.subscriptionCalls[0].callbacks.onDisconnect();
    expect(session.status).toBe("reconnecting");
    f.subscriptionCalls[0].callbacks.onReconnect();
    await jest.advanceTimersByTimeAsync(0);
    expect(f.requests[3].contentType).toBe(STREAM_CONFIG_INPUT);
    expect(session.status).toBe("running");
    await session.stop();
  });

  it("does not report running when another disconnect occurs during reconnect configuration", async () => {
    const f = fixture();
    const pending = deferred<{ status: number; body: string }>();
    const session = new CyflexRunSession({
      control: f.control,
      subscriptions: f.subscriptions,
      onFrame: jest.fn(),
      createUuid: () => "viewer-1",
    });

    await session.start(input());
    f.control.postStreaming.mockImplementationOnce(async (request) => {
      f.requests.push(request);

      return pending.promise;
    });

    const callbacks = f.subscriptionCalls[0].callbacks;

    callbacks.onDisconnect();
    callbacks.onReconnect();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(f.requests).toHaveLength(2);

    callbacks.onDisconnect();
    pending.resolve({ status: 200, body: "{}" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(session.status).toBe("reconnecting");

    callbacks.onReconnect();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(f.requests).toHaveLength(3);
    expect(session.status).toBe("running");
    await session.stop();
  });

  it("uses the same viewer UUID when requirements change", async () => {
    const f = fixture();
    const session = new CyflexRunSession({
      control: f.control,
      subscriptions: f.subscriptions,
      onFrame: jest.fn(),
      createUuid: () => "viewer-1",
    });

    await session.start(input());
    const changed = cloneDocument();

    changed.bindings[0].unitCode = 17;
    changed.bindings[1].unitCode = 17;
    await session.reconfigure(changed, input().resolvedVariables);
    expect(JSON.parse(f.requests[1].body)).toMatchObject({
      uuid: "viewer-1",
      watchers: [{ watchers: [{ unit_code: 17, buffer_count: 1 }] }],
    });
    await session.stop();
  });

  it("aborts startup before subscription if stopped during registration", async () => {
    const f = fixture();
    const pending = deferred<{ status: number; body: string }>();

    f.control.postStreaming.mockImplementationOnce(async () => pending.promise);
    const session = new CyflexRunSession({
      control: f.control,
      subscriptions: f.subscriptions,
      onFrame: jest.fn(),
      createUuid: () => "viewer-1",
    });
    const starting = session.start(input());

    await Promise.resolve();
    await session.stop();
    pending.resolve({ status: 200, body: "{}" });
    await expect(starting).rejects.toThrow(RunSessionStoppedError);
    expect(f.subscriptionCalls).toHaveLength(0);
  });

  it("unsubscribes a late subscription after stop", async () => {
    const f = fixture();
    const pending = deferred<{ unsubscribe(): void }>();
    const unsubscribe = jest.fn();

    (f.subscriptions.subscribe as jest.Mock).mockImplementationOnce(
      async () => pending.promise,
    );
    const session = new CyflexRunSession({
      control: f.control,
      subscriptions: f.subscriptions,
      onFrame: jest.fn(),
      createUuid: () => "viewer-1",
    });
    const starting = session.start(input());

    while ((f.subscriptions.subscribe as jest.Mock).mock.calls.length === 0) {
      await Promise.resolve();
    }

    await session.stop();
    pending.resolve({ unsubscribe });
    await expect(starting).rejects.toThrow(RunSessionStoppedError);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
