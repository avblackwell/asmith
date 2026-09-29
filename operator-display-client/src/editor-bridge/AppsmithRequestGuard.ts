/**
 * Route-independent version of the legacy standalone network guard. Install
 * before dynamically importing any native editor module and dispose after the
 * editor has unmounted. Java /operator_display routes remain available.
 */
export interface AppsmithRequestGuard {
  blockedCount(): number;
  subscribe(listener: (count: number) => void): () => void;
  dispose(): void;
}

function guardedPath(input: string | URL): string | null {
  try {
    const pathname = new URL(String(input), window.location.href).pathname;

    return /^\/(?:api|v1|rts|oauth2|login|logout|user)(?:\/|$)/.test(
      pathname,
    )
      ? pathname
      : null;
  } catch {
    return null;
  }
}

export function installAppsmithRequestGuard(): AppsmithRequestGuard {
  let blocked = 0;
  let disposed = false;
  const listeners = new Set<(count: number) => void>();
  const originalFetch = window.fetch;
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalWebSocket = window.WebSocket;
  const originalEventSource = window.EventSource;
  const originalSendBeacon = navigator.sendBeacon;
  let guardedWebSocket: typeof WebSocket | undefined;
  let guardedEventSource: typeof EventSource | undefined;
  let guardedSendBeacon: typeof navigator.sendBeacon | undefined;

  function reject(input: string | URL): never {
    const pathname = guardedPath(input);

    blocked += 1;
    listeners.forEach((listener) => listener(blocked));
    throw new Error(`Appsmith API is disabled in the editor: ${pathname}`);
  }

  const guardedFetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const target = input instanceof Request ? input.url : input;

    if (guardedPath(target)) reject(target);

    return originalFetch.call(window, input, init);
  }) as typeof window.fetch;

  const guardedOpen = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ): void {
    if (guardedPath(url)) reject(url);

    originalOpen.call(
      this,
      method,
      url,
      async ?? true,
      username,
      password,
    );
  };

  window.fetch = guardedFetch;
  XMLHttpRequest.prototype.open = guardedOpen;

  if (originalWebSocket) {
    guardedWebSocket = new Proxy(originalWebSocket, {
      construct(target, args, newTarget) {
        if (guardedPath(args[0])) reject(args[0]);

        return Reflect.construct(target, args, newTarget);
      },
    });
    window.WebSocket = guardedWebSocket;
  }

  if (originalEventSource) {
    guardedEventSource = new Proxy(originalEventSource, {
      construct(target, args, newTarget) {
        if (guardedPath(args[0])) reject(args[0]);

        return Reflect.construct(target, args, newTarget);
      },
    });
    window.EventSource = guardedEventSource;
  }

  if (originalSendBeacon) {
    guardedSendBeacon = (url, data) => {
      if (guardedPath(url)) reject(url);

      return originalSendBeacon.call(navigator, url, data);
    };
    navigator.sendBeacon = guardedSendBeacon;
  }

  return {
    blockedCount: () => blocked,
    subscribe(listener) {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return;

      disposed = true;
      listeners.clear();

      if (window.fetch === guardedFetch) window.fetch = originalFetch;
      if (XMLHttpRequest.prototype.open === guardedOpen) {
        XMLHttpRequest.prototype.open = originalOpen;
      }

      // Do not overwrite wrappers installed by another owner after this one.
      if (guardedWebSocket && window.WebSocket === guardedWebSocket) {
        window.WebSocket = originalWebSocket;
      }

      if (guardedEventSource && window.EventSource === guardedEventSource) {
        window.EventSource = originalEventSource;
      }

      if (guardedSendBeacon && navigator.sendBeacon === guardedSendBeacon) {
        navigator.sendBeacon = originalSendBeacon;
      }
    },
  };
}
