/** Browser-side boundary for the Appsmith API in the standalone editor. */
let blockedRequests = 0;
const listeners = new Set<() => void>();

export const getBlockedAppsmithRequests = () => blockedRequests;

export function subscribeBlockedAppsmithRequests(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function isAppsmithApiUrl(input: string | URL) {
  try {
    const url = new URL(String(input), window.location.href);

    return /^\/(?:api|v1|rts|oauth2|login|logout|user)(?:\/|$)/.test(
      url.pathname,
    );
  } catch {
    return false;
  }
}

function recordBlockedRequest(url: string | URL) {
  blockedRequests += 1;
  listeners.forEach((listener) => listener());
  // Keep the route visible in diagnostics without exposing query parameters.
  throw new Error(
    `Appsmith API is disabled in integration mode: ${new URL(String(url), window.location.href).pathname}`,
  );
}

function installAppsmithApiBlock() {
  if (
    !/^\/(?:standalone|workspace|marketplace|admin|operations|view)(?:\/|$)/.test(
      window.location.pathname,
    )
  )
    return;

  const originalFetch = window.fetch.bind(window);

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input;

    if (isAppsmithApiUrl(url)) recordBlockedRequest(url);

    return await originalFetch(input, init);
  }) as typeof window.fetch;

  const originalOpen = XMLHttpRequest.prototype.open;

  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ) {
    if (isAppsmithApiUrl(url)) recordBlockedRequest(url);

    return originalOpen.call(
      this,
      method,
      url,
      async ?? true,
      username,
      password,
    );
  };

  if (window.WebSocket) {
    window.WebSocket = new Proxy(window.WebSocket, {
      construct(target, args, newTarget) {
        if (isAppsmithApiUrl(args[0])) recordBlockedRequest(args[0]);

        return Reflect.construct(target, args, newTarget);
      },
    });
  }

  if (window.EventSource) {
    window.EventSource = new Proxy(window.EventSource, {
      construct(target, args, newTarget) {
        if (isAppsmithApiUrl(args[0])) recordBlockedRequest(args[0]);

        return Reflect.construct(target, args, newTarget);
      },
    });
  }

  const originalSendBeacon = navigator.sendBeacon?.bind(navigator);

  if (originalSendBeacon) {
    navigator.sendBeacon = (url, data) => {
      if (isAppsmithApiUrl(url)) recordBlockedRequest(url);

      return originalSendBeacon(url, data);
    };
  }
}

installAppsmithApiBlock();
