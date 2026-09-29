import { readFileSync } from "fs";
import { join } from "path";

import { exampleDashboardDocument } from "../../document";
import type { CyflexV2Message } from "../types";
import type {
  CyflexControlTransport,
  CyflexSubscriptionTransport,
  RunSessionInput,
} from "../session";
import { BrowserCyflexRun } from "./BrowserCyflexRun";

const variableId = "18446744073709551615";
const input: RunSessionInput = {
  document: exampleDashboardDocument,
  cellId: "cell-A",
  subject: "global.streaming.site.machinehash",
  resolvedVariables: [
    { key: "engineSpeed", id: variableId, label: "ENGINE_SPEED" },
  ],
};

function message(
  goTime: string,
  values: Array<[number, number]>,
): CyflexV2Message {
  return {
    version: 4,
    goTime,
    variables: [
      {
        id: variableId,
        type: 0,
        unitCode: 16,
        limitStatus: 0,
        limitFlag: false,
        limits: [],
        chunks: values.map(([timestamp, value]) => ({
          timestamp,
          value: { kind: "rvalue" as const, value },
        })),
      },
    ],
  };
}

function harness(decodeFrame?: (frame: Uint8Array) => CyflexV2Message) {
  const onUpdates = jest.fn();
  const onError = jest.fn();
  const unsubscribe = jest.fn();
  let callbacks: Parameters<CyflexSubscriptionTransport["subscribe"]>[1];
  const control = {
    postStreaming: jest.fn(async () => ({ status: 200, body: "{}" })),
  } as CyflexControlTransport;
  const subscriptions = {
    subscribe: jest.fn(async (_subject, nextCallbacks) => {
      callbacks = nextCallbacks;

      return { unsubscribe };
    }),
  } as CyflexSubscriptionTransport;
  const run = new BrowserCyflexRun({
    control,
    subscriptions,
    decodeFrame,
    timestampToMs: (seconds) => seconds * 1000,
    onUpdates,
    onError,
    createUuid: () => "run-1",
  });

  return {
    run,
    onUpdates,
    onError,
    unsubscribe,
    frame: (payload = new Uint8Array([1])) => callbacks.onFrame(payload),
    close: () => callbacks.onClose?.(new Error("broker closed")),
  };
}

describe("BrowserCyflexRun", () => {
  it("projects a compiler-built V2 binary fixture through the default decoder", async () => {
    const binary = new Uint8Array(
      readFileSync(
        join(__dirname, "../decoder/fixtures/variables-v2-sample.bin"),
      ),
    );
    const document = {
      ...exampleDashboardDocument,
      bindings: exampleDashboardDocument.bindings.map((binding) => ({
        ...binding,
        unitCode: -17,
      })),
    };
    const { frame, onError, onUpdates, run } = harness();

    await run.start({ ...input, document });
    frame(binary);

    expect(onError).not.toHaveBeenCalled();
    expect(onUpdates).toHaveBeenCalledTimes(1);
    expect(onUpdates.mock.calls[0][0][0].value).toBe("-1 rpm");
    expect(onUpdates.mock.calls[0][0][1].value).toHaveLength(2);
    await run.stop();
  });

  it("batches sorted V2 chunks into transient text and chart updates", async () => {
    const savedBefore = JSON.stringify(exampleDashboardDocument);
    const { frame, onUpdates, run } = harness(() =>
      message("1", [
        [3, 1200],
        [2, 1100],
      ]),
    );

    await run.start(input);
    frame();

    expect(onUpdates).toHaveBeenCalledTimes(1);
    expect(onUpdates.mock.calls[0][0]).toEqual([
      {
        widgetId: "engine-speed-value",
        propertyPath: "text",
        value: "1200 rpm",
      },
      {
        widgetId: "engine-speed-chart",
        propertyPath: "chartData.speedSeries.data",
        value: [
          { x: "1970-01-01T00:00:02.000Z", y: 1100 },
          { x: "1970-01-01T00:00:03.000Z", y: 1200 },
        ],
      },
    ]);
    expect(JSON.stringify(exampleDashboardDocument)).toBe(savedBefore);
    await run.stop();
  });

  it("resets chart history when Cyflex go_time changes", async () => {
    let current = message("1", [[2, 1100]]);
    const { frame, onUpdates, run } = harness(() => current);

    await run.start(input);
    frame();
    current = message("2", [[3, 1200]]);
    frame();

    expect(onUpdates.mock.calls[1][0][1].value).toEqual([
      { x: "1970-01-01T00:00:03.000Z", y: 1200 },
    ]);
    await run.stop();
  });

  it("ignores unrelated variables in a shared cell frame", async () => {
    const frameMessage = message("1", [[2, 1100]]);

    frameMessage.variables.unshift({
      ...frameMessage.variables[0],
      id: "42",
      chunks: [{ timestamp: Number.NaN, value: { kind: "rvalue", value: 99 } }],
    });
    const { frame, onError, onUpdates, run } = harness(() => frameMessage);

    await run.start(input);
    frame();

    expect(onError).not.toHaveBeenCalled();
    expect(onUpdates).toHaveBeenCalledTimes(1);
    await run.stop();
  });

  it("reports decode errors without tearing down another viewer", async () => {
    const first = harness(() => {
      throw new Error("Invalid V2 frame");
    });
    const second = harness(() => message("1", [[2, 1100]]));

    await first.run.start(input);
    await second.run.start(input);
    first.frame();
    second.frame();

    expect(first.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Invalid V2 frame" }),
    );
    expect(first.run.status).toBe("running");
    expect(second.onUpdates).toHaveBeenCalledTimes(1);
    await first.run.stop();
    expect(second.run.status).toBe("running");
    await second.run.stop();
  });

  it("ignores frames after stop and unsubscribes locally", async () => {
    const { frame, onUpdates, run, unsubscribe } = harness(() =>
      message("1", [[2, 1100]]),
    );

    await run.start(input);
    await run.stop();
    frame();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(onUpdates).not.toHaveBeenCalled();
    expect(run.status).toBe("idle");
  });

  it("clears its binding state after a terminal subscription close", async () => {
    const { close, frame, onError, onUpdates, run } = harness(() =>
      message("1", [[2, 1100]]),
    );

    await run.start(input);
    close();

    expect(run.status).toBe("idle");
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "broker closed" }),
    );

    await run.start(input);
    frame();
    expect(onUpdates).toHaveBeenCalledTimes(1);
    await run.stop();
  });

  it("keeps a new run active when a stopped start settles later", async () => {
    let releaseFirst!: () => void;
    let firstRequestStarted!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      firstRequestStarted = resolve;
    });
    const firstResponse = new Promise<{ status: number; body: string }>(
      (resolve) => {
        releaseFirst = () => resolve({ status: 200, body: "{}" });
      },
    );
    let requests = 0;
    let callbacks!: Parameters<CyflexSubscriptionTransport["subscribe"]>[1];
    const onUpdates = jest.fn();
    const run = new BrowserCyflexRun({
      control: {
        postStreaming: jest.fn(async () => {
          if (requests++ === 0) {
            firstRequestStarted();

            return firstResponse;
          }

          return Promise.resolve({ status: 200, body: "{}" });
        }),
      },
      subscriptions: {
        subscribe: jest.fn(async (_subject, nextCallbacks) => {
          callbacks = nextCallbacks;

          return { unsubscribe: jest.fn() };
        }),
      },
      decodeFrame: () => message("1", [[2, 1100]]),
      timestampToMs: (seconds) => seconds * 1000,
      onUpdates,
      createUuid: () => "run-1",
    });

    const stoppedStart = run.start(input);

    await firstStarted;
    await run.stop();
    await run.start(input);
    releaseFirst();
    await expect(stoppedStart).rejects.toThrow();

    callbacks.onFrame(new Uint8Array([1]));
    expect(onUpdates).toHaveBeenCalledTimes(1);
    expect(run.status).toBe("running");
    await run.stop();
  });
});
