import { parseDashboardDocument, type DashboardDocument } from "../document";
import {
  installAppsmithRequestGuard,
  type AppsmithRequestGuard,
} from "./AppsmithRequestGuard";

export interface EditorIdentity {
  deploymentId: string;
  accountId: string;
}

export interface EditorMountRequest {
  document: unknown;
  identity: EditorIdentity;
  itemId: number | null;
  mode: "edit" | "view";
}

export interface ValidatedEditorMountRequest
  extends Omit<EditorMountRequest, "document"> {
  document: DashboardDocument;
}

/** Implemented by the extracted Appsmith canvas runtime, never by a shell. */
export interface NativeEditorSession {
  replaceDocument(document: DashboardDocument): Promise<void>;
  snapshot(): Promise<unknown>;
  subscribe(listener: (document: DashboardDocument) => void): () => void;
  dispose(): Promise<void>;
}

export interface NativeEditorRuntime {
  mount(
    host: HTMLElement,
    request: ValidatedEditorMountRequest,
    guard: AppsmithRequestGuard,
  ): Promise<NativeEditorSession>;
}

export interface EditorBridgeOptions {
  /** Dynamically import native code only after the request guard is installed. */
  loadRuntime(): Promise<NativeEditorRuntime>;
}

export interface EditorBridgeSession {
  replaceDocument(input: unknown): Promise<void>;
  snapshot(): Promise<DashboardDocument>;
  subscribe(listener: (document: DashboardDocument) => void): () => void;
  blockedAppsmithRequests(): number;
  dispose(): Promise<void>;
}

// The current native Appsmith worker and widget registry are global singletons.
// A second editor mount would cross-contaminate canvas state until extraction.
let activeMount = false;

export async function mountEditorBridge(
  host: HTMLElement,
  request: EditorMountRequest,
  options: EditorBridgeOptions,
): Promise<EditorBridgeSession> {
  if (activeMount) throw new Error("An editor is already mounted.");
  if (!request.identity.deploymentId.trim() || !request.identity.accountId.trim()) {
    throw new TypeError("Editor identity is required.");
  }
  if (
    request.itemId !== null &&
    (!Number.isSafeInteger(request.itemId) || request.itemId <= 0)
  ) {
    throw new TypeError("Editor item ID must be a positive integer.");
  }

  const document = parseDashboardDocument(request.document);
  const validatedRequest: ValidatedEditorMountRequest = { ...request, document };

  activeMount = true;
  const guard = installAppsmithRequestGuard();

  try {
    const runtime = await options.loadRuntime();
    const nativeSession = await runtime.mount(host, validatedRequest, guard);
    let disposed = false;
    const subscriptions = new Set<() => void>();

    return {
      async replaceDocument(input) {
        if (disposed) throw new Error("Editor has been disposed.");

        await nativeSession.replaceDocument(parseDashboardDocument(input));
      },
      async snapshot() {
        if (disposed) throw new Error("Editor has been disposed.");

        return parseDashboardDocument(await nativeSession.snapshot());
      },
      subscribe(listener) {
        if (disposed) throw new Error("Editor has been disposed.");

        const unsubscribe = nativeSession.subscribe((next) =>
          listener(parseDashboardDocument(next)),
        );

        subscriptions.add(unsubscribe);

        return () => {
          subscriptions.delete(unsubscribe);
          unsubscribe();
        };
      },
      blockedAppsmithRequests: () => guard.blockedCount(),
      async dispose() {
        if (disposed) return;

        disposed = true;
        subscriptions.forEach((unsubscribe) => unsubscribe());
        subscriptions.clear();

        try {
          await nativeSession.dispose();
        } finally {
          guard.dispose();
          activeMount = false;
        }
      },
    };
  } catch (error) {
    guard.dispose();
    activeMount = false;
    throw error;
  }
}
