import type { DashboardDocument } from "../../document";
import { parseDashboardDocument } from "../../document";
import { LiveBindingProjector } from "../../runtime";
import type { TransientWidgetUpdate } from "../../runtime";
import { decodeCyflexV2Frame } from "../decoder";
import type { CyflexV2Chunk, CyflexV2Message } from "../types";
import { CyflexRunSession } from "../session";
import type {
  CyflexControlTransport,
  CyflexSubscriptionTransport,
  RunSessionInput,
  RunSessionStatus,
} from "../session";

export interface BrowserCyflexRunOptions {
  control: CyflexControlTransport;
  subscriptions: CyflexSubscriptionTransport;
  /** Conversion is explicit until the deployment confirms fbChunk.utime units. */
  timestampToMs: (utime: number, goTime: string) => number;
  onUpdates: (updates: TransientWidgetUpdate[]) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: RunSessionStatus) => void;
  createUuid?: () => string;
  keepaliveIntervalMs?: number;
  /** Injectable for the bridge's unit tests; production uses the V2 decoder. */
  decodeFrame?: (frame: Uint8Array) => CyflexV2Message;
}

interface PreparedInput {
  input: RunSessionInput;
  projector: LiveBindingProjector;
  valueTypes: Map<string, "number" | "string" | "boolean">;
}

const sampleKey = (id: string, unitCode: number): string =>
  JSON.stringify([id, unitCode]);

function prepare(input: RunSessionInput): PreparedInput {
  const document: DashboardDocument = parseDashboardDocument(
    JSON.parse(JSON.stringify(input.document)),
  );
  const resolvedVariables = input.resolvedVariables.map((variable) => ({
    ...variable,
  }));
  const projector = new LiveBindingProjector(
    document,
    input.cellId,
    resolvedVariables,
  );
  const declarations = new Map(
    document.variables.map((variable) => [variable.key, variable]),
  );
  const ids = new Map(
    resolvedVariables.map((variable) => [variable.key, variable.id]),
  );
  const valueTypes = new Map<string, "number" | "string" | "boolean">();

  for (const binding of document.bindings) {
    const id = ids.get(binding.variableKey);
    const valueType = declarations.get(binding.variableKey)?.valueType;

    if (!id || !valueType) {
      throw new TypeError(`Variable ${binding.variableKey} was not resolved`);
    }

    const key = sampleKey(id, binding.unitCode);
    const previous = valueTypes.get(key);

    if (previous && previous !== valueType) {
      throw new TypeError(`Conflicting value types for Cyflex variable ${id}`);
    }

    valueTypes.set(key, valueType);
  }

  return {
    input: { ...input, document, resolvedVariables },
    projector,
    valueTypes,
  };
}

function chunkValue(
  chunk: CyflexV2Chunk,
  expectedType: "number" | "string" | "boolean" | undefined,
): number | string | boolean {
  if (chunk.value.kind === "ivalue" && expectedType === "boolean") {
    if (chunk.value.value !== 0 && chunk.value.value !== 1) {
      throw new TypeError("Boolean Cyflex variable must contain 0 or 1");
    }

    return chunk.value.value === 1;
  }

  return chunk.value.value;
}

/**
 * Composes the wire decoder, per-viewer lease, and transient widget values.
 * It does not mutate the dashboard document or start/stop the shared publisher.
 */
export class BrowserCyflexRun {
  private readonly session: CyflexRunSession;
  private readonly decodeFrame: (frame: Uint8Array) => CyflexV2Message;
  private prepared?: PreparedInput;
  private lastGoTime?: string;

  constructor(private readonly options: BrowserCyflexRunOptions) {
    this.decodeFrame = options.decodeFrame ?? decodeCyflexV2Frame;
    this.session = new CyflexRunSession({
      control: options.control,
      subscriptions: options.subscriptions,
      onFrame: (frame) => this.handleFrame(frame),
      onError: options.onError,
      onStatusChange: (status) => {
        if (status === "idle") {
          this.prepared = undefined;
          this.lastGoTime = undefined;
        }

        options.onStatusChange?.(status);
      },
      createUuid: options.createUuid,
      keepaliveIntervalMs: options.keepaliveIntervalMs,
    });
  }

  get status(): RunSessionStatus {
    return this.session.status;
  }

  async start(input: RunSessionInput): Promise<void> {
    if (this.prepared) throw new Error("Run session is already active");

    const prepared = prepare(input);

    this.prepared = prepared;
    this.lastGoTime = undefined;

    try {
      await this.session.start(prepared.input);
    } catch (error) {
      if (this.prepared === prepared) {
        this.prepared = undefined;
        this.lastGoTime = undefined;
      }

      throw error;
    }
  }

  async reconfigure(input: RunSessionInput): Promise<void> {
    const next = prepare(input);
    const current = this.prepared;

    if (!current || current.input.cellId !== input.cellId) {
      throw new Error("Reconfiguration must keep the selected cell");
    }

    if (current.input.subject !== input.subject) {
      throw new Error("Reconfiguration must keep the selected subject");
    }

    await this.session.reconfigure(
      next.input.document,
      next.input.resolvedVariables,
    );
    this.prepared = next;
    this.lastGoTime = undefined;
  }

  async stop(): Promise<void> {
    this.prepared = undefined;
    this.lastGoTime = undefined;
    await this.session.stop();
  }

  private reportError(error: unknown): void {
    try {
      this.options.onError?.(
        error instanceof Error ? error : new Error(String(error)),
      );
    } catch {
      // UI error reporting cannot interrupt a broker callback.
    }
  }

  private handleFrame(frame: Uint8Array): void {
    const prepared = this.prepared;

    if (!prepared) return;

    try {
      const message = this.decodeFrame(frame);

      if (this.lastGoTime !== undefined && message.goTime !== this.lastGoTime) {
        prepared.projector = new LiveBindingProjector(
          prepared.input.document,
          prepared.input.cellId,
          prepared.input.resolvedVariables,
        );
      }

      this.lastGoTime = message.goTime;
      const updates = new Map<string, TransientWidgetUpdate>();

      for (const variable of message.variables) {
        const expectedType = prepared.valueTypes.get(
          sampleKey(variable.id, variable.unitCode),
        );

        if (expectedType === undefined) continue;

        for (const chunk of [...variable.chunks].sort(
          (left, right) => left.timestamp - right.timestamp,
        )) {
          const projected = prepared.projector.accept({
            cellId: prepared.input.cellId,
            variableId: variable.id,
            unitCode: variable.unitCode,
            timestampMs: this.options.timestampToMs(
              chunk.timestamp,
              message.goTime,
            ),
            value: chunkValue(chunk, expectedType),
          });

          for (const update of projected) {
            updates.set(
              JSON.stringify([update.widgetId, update.propertyPath]),
              update,
            );
          }
        }
      }

      if (updates.size) this.options.onUpdates([...updates.values()]);
    } catch (error) {
      this.reportError(error);
    }
  }
}
