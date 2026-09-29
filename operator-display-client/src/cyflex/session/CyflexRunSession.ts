import type { DashboardDocument } from "../../document";
import { deriveStreamRequirements, streamConfigBody } from "./requirements";
import type {
  ResolvedCyflexVariable,
  StreamRequirements,
} from "./requirements";

export const STREAM_CONFIG_INPUT = "streaming/json_config+input+v1";
export const STREAM_CONFIG_OUTPUT = "streaming/json_config+output+v1";
export const STREAM_ALIVE_INPUT = "streaming/json_alive+input+v1";
export const STREAM_ALIVE_OUTPUT = "streaming/json_alive+output+v1";

export interface StreamingControlRequest {
  contentType: string;
  accept: string;
  body: string;
  signal: AbortSignal;
}

export interface StreamingControlResponse {
  status: number;
  body: string;
}

/** Route selection and authentication belong to the deployment adapter. */
export interface CyflexControlTransport {
  postStreaming(
    request: StreamingControlRequest,
  ): Promise<StreamingControlResponse>;
}

export interface CyflexSubscription {
  unsubscribe(): void | Promise<void>;
}

export interface CyflexSubscriptionTransport {
  subscribe(
    subject: string,
    callbacks: {
      onFrame(frame: Uint8Array): void;
      onDisconnect(): void;
      onReconnect(): void;
      /** The subscription or connection has closed and will not reconnect. */
      onClose?(error: Error): void;
    },
  ): Promise<CyflexSubscription>;
}

export type RunSessionStatus = "idle" | "starting" | "running" | "reconnecting";

export interface RunSessionInput {
  document: DashboardDocument;
  cellId: string;
  /** Exact subject obtained for the selected, authorized cell. */
  subject: string;
  resolvedVariables: ResolvedCyflexVariable[];
}

export interface CyflexRunSessionOptions {
  control: CyflexControlTransport;
  subscriptions: CyflexSubscriptionTransport;
  onFrame: (frame: Uint8Array) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: RunSessionStatus) => void;
  createUuid?: () => string;
  /** Must be shorter than Cyflex's 331-second abandoned-client timeout. */
  keepaliveIntervalMs?: number;
}

export class CyflexControlError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly applicationError?: string,
  ) {
    super(message);
    this.name = "CyflexControlError";
  }
}

export class RunSessionStoppedError extends Error {
  constructor() {
    super("Run session was stopped before startup completed");
    this.name = "RunSessionStoppedError";
  }
}

interface ActiveSession {
  uuid: string;
  cellId: string;
  subject: string;
  abort: AbortController;
  requirements: StreamRequirements;
  subscription?: CyflexSubscription;
  timer?: ReturnType<typeof setInterval>;
  controlTail: Promise<void>;
  keepalivePending: boolean;
  disconnected: boolean;
  disconnectGeneration: number;
}

function asError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

function assertControlResponse(response: StreamingControlResponse): void {
  if (response.status < 200 || response.status >= 300) {
    throw new CyflexControlError(
      `Cyflex control returned HTTP ${response.status}`,
      response.status,
    );
  }

  let body: unknown;

  try {
    body = JSON.parse(response.body);
  } catch {
    throw new CyflexControlError(
      "Cyflex control returned invalid JSON",
      response.status,
    );
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new CyflexControlError(
      "Cyflex control returned an invalid JSON body",
      response.status,
    );
  }

  const error = (body as Record<string, unknown>).error;

  if (error !== undefined && error !== null && error !== "") {
    const message = typeof error === "string" ? error : JSON.stringify(error);

    throw new CyflexControlError(
      `Cyflex control error: ${message}`,
      response.status,
      message,
    );
  }
}

/**
 * Owns one viewer's Cyflex lease and NATS subscription. The publisher is
 * shared, so stopping a viewer only unsubscribes and lets its lease expire.
 */
export class CyflexRunSession {
  private active?: ActiveSession;
  private currentStatus: RunSessionStatus = "idle";
  private readonly keepaliveIntervalMs: number;
  private readonly createUuid: () => string;

  constructor(private readonly options: CyflexRunSessionOptions) {
    this.keepaliveIntervalMs = options.keepaliveIntervalMs ?? 60_000;

    if (
      !Number.isInteger(this.keepaliveIntervalMs) ||
      this.keepaliveIntervalMs < 1 ||
      this.keepaliveIntervalMs >= 331_000
    ) {
      throw new RangeError(
        "Keepalive interval must be shorter than 331 seconds",
      );
    }

    this.createUuid =
      options.createUuid ??
      (() => {
        if (!globalThis.crypto?.randomUUID) {
          throw new Error("Secure UUID generation is unavailable");
        }

        return globalThis.crypto.randomUUID();
      });
  }

  get status(): RunSessionStatus {
    return this.currentStatus;
  }

  get cellId(): string | undefined {
    return this.active?.cellId;
  }

  private setStatus(status: RunSessionStatus): void {
    if (this.currentStatus === status) return;

    this.currentStatus = status;

    try {
      this.options.onStatusChange?.(status);
    } catch {
      // A consumer callback cannot leave an active lease half started.
    }
  }

  private isActive(session: ActiveSession): boolean {
    return this.active === session && !session.abort.signal.aborted;
  }

  private assertActive(session: ActiveSession): void {
    if (!this.isActive(session)) throw new RunSessionStoppedError();
  }

  private reportError(session: ActiveSession, reason: unknown): void {
    if (!this.isActive(session)) return;

    try {
      this.options.onError?.(asError(reason));
    } catch {
      // A consumer callback cannot break the lease timer.
    }
  }

  private async enqueueControl(
    session: ActiveSession,
    operation: () => Promise<void>,
  ): Promise<void> {
    const pending = session.controlTail.then(async () => {
      this.assertActive(session);
      await operation();
    });

    session.controlTail = pending.catch(() => undefined);

    return pending;
  }

  private async post(
    session: ActiveSession,
    contentType: string,
    accept: string,
    body: object,
  ): Promise<void> {
    this.assertActive(session);
    const response = await this.options.control.postStreaming({
      contentType,
      accept,
      body: JSON.stringify(body),
      signal: session.abort.signal,
    });

    this.assertActive(session);
    assertControlResponse(response);
  }

  private async configure(
    session: ActiveSession,
    requirements: StreamRequirements,
  ): Promise<void> {
    return this.enqueueControl(session, async () =>
      this.post(
        session,
        STREAM_CONFIG_INPUT,
        STREAM_CONFIG_OUTPUT,
        streamConfigBody(session.uuid, requirements),
      ),
    );
  }

  private keepalive(session: ActiveSession): void {
    if (!this.isActive(session) || session.keepalivePending) return;

    session.keepalivePending = true;
    void this.enqueueControl(session, async () => {
      try {
        await this.post(session, STREAM_ALIVE_INPUT, STREAM_ALIVE_OUTPUT, {
          uuid: session.uuid,
        });
      } catch (reason) {
        if (
          reason instanceof CyflexControlError &&
          reason.applicationError === "Client UUID not found in tracker."
        ) {
          await this.post(
            session,
            STREAM_CONFIG_INPUT,
            STREAM_CONFIG_OUTPUT,
            streamConfigBody(session.uuid, session.requirements),
          );

          return;
        }

        throw reason;
      }
    })
      .catch((reason) => this.reportError(session, reason))
      .finally(() => {
        session.keepalivePending = false;
      });
  }

  private reconnect(session: ActiveSession): void {
    if (!this.isActive(session)) return;

    const generation = session.disconnectGeneration;

    void this.enqueueControl(session, async () =>
      this.post(
        session,
        STREAM_CONFIG_INPUT,
        STREAM_CONFIG_OUTPUT,
        streamConfigBody(session.uuid, session.requirements),
      ),
    )
      .then(() => {
        if (
          this.isActive(session) &&
          session.disconnectGeneration === generation
        ) {
          session.disconnected = false;
          this.setStatus("running");
        }
      })
      .catch((reason) => this.reportError(session, reason));
  }

  async start(input: RunSessionInput): Promise<void> {
    if (this.active) throw new Error("Run session is already active");

    if (!input.cellId.trim()) throw new TypeError("Cell ID must be nonempty");

    if (
      !input.subject.startsWith("global.streaming.") ||
      input.subject.split(".").some((token) => token.length === 0) ||
      /[*>\s]/.test(input.subject)
    ) {
      throw new TypeError("Expected an exact Cyflex cell streaming subject");
    }

    const requirements = deriveStreamRequirements(
      input.document,
      input.resolvedVariables,
    );
    const uuid = this.createUuid();

    if (!uuid.trim()) throw new TypeError("Run session UUID must be nonempty");

    const session: ActiveSession = {
      uuid,
      cellId: input.cellId,
      subject: input.subject,
      abort: new AbortController(),
      requirements,
      controlTail: Promise.resolve(),
      keepalivePending: false,
      disconnected: false,
      disconnectGeneration: 0,
    };

    this.active = session;
    this.setStatus("starting");

    try {
      await this.configure(session, requirements);
      this.assertActive(session);

      const subscription = await this.options.subscriptions.subscribe(
        session.subject,
        {
          onFrame: (frame) => {
            if (this.isActive(session)) this.options.onFrame(frame);
          },
          onDisconnect: () => {
            if (!this.isActive(session)) return;

            session.disconnectGeneration += 1;
            session.disconnected = true;
            this.setStatus("reconnecting");
          },
          onReconnect: () => this.reconnect(session),
          onClose: (error) => {
            if (!this.isActive(session)) return;

            this.reportError(session, error);
            void this.stop().catch((reason) => {
              try {
                this.options.onError?.(asError(reason));
              } catch {
                // Cleanup failure must not escape a broker callback.
              }
            });
          },
        },
      );

      if (!this.isActive(session)) {
        await subscription.unsubscribe();
        throw new RunSessionStoppedError();
      }

      session.subscription = subscription;
      session.timer = setInterval(
        () => this.keepalive(session),
        this.keepaliveIntervalMs,
      );
      this.setStatus(session.disconnected ? "reconnecting" : "running");
    } catch (reason) {
      if (this.isActive(session)) await this.stop();

      throw reason;
    }
  }

  /** Replace this viewer's requirements using the same UUID and subject. */
  async reconfigure(
    document: DashboardDocument,
    resolvedVariables: ResolvedCyflexVariable[],
  ): Promise<void> {
    const session = this.active;

    if (!session || this.currentStatus === "starting") {
      throw new Error("Run session must be started before reconfiguration");
    }

    const requirements = deriveStreamRequirements(document, resolvedVariables);

    await this.configure(session, requirements);
    this.assertActive(session);
    session.requirements = requirements;
  }

  async stop(): Promise<void> {
    const session = this.active;

    if (!session) return;

    this.active = undefined;
    session.abort.abort();

    if (session.timer) clearInterval(session.timer);

    this.setStatus("idle");
    await session.subscription?.unsubscribe();
  }
}
