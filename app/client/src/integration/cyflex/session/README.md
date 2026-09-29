# Cyflex Run session boundary

`CyflexRunSession` owns one viewer's control lease and binary subscription. Its
control and subscription transports are injected. The caller supplies the exact
subject for an authorized cell; this module has no deployment URL, credential,
or broker connection logic.

Before `start`, resolve each bound dashboard variable against the selected
cell's metadata to obtain its exact decimal uint64 ID and Cyflex label. The
document validator checks binding targets and unit codes. The session checks
the resolved IDs against direct-ID selectors, deduplicates bindings by ID and
unit code, and sends Cyflex's label-based `variables` and `watchers` request.
History bindings request `buffer_count: 1`, which asks Cyflex to include its
native buffer if the variable has one. It does not change a variable's native
buffer capacity.

The control transport must POST to the selected cell's `/cyflex/streaming`
route with the provided body, `Content-Type`, `Accept`, and abort signal. The
subscription transport must subscribe to the supplied exact subject and call
`onReconnect` when its connection recovers. Frame callbacks carry raw bytes;
`BrowserCyflexRun` decodes the Cyflex V2 FlatBuffers payload and projects its
values into transient widget updates. A terminal subscription or connection
closure calls `onClose`, reports the error, and stops the local lease and
keepalive timer. Ordinary disconnects remain eligible for NATS reconnection.

`stop()` aborts control work, clears keepalives, and unsubscribes. Cyflex has no
unregister endpoint, so its existing lease timeout handles server cleanup.
The shared publisher is never stopped by a viewer. These are local contract
tests; no development cell or NATS WebSocket route has been verified.

Run focused tests from `app/client` with
`node_modules/.bin/jest --config src/integration/cyflex/session/jest.config.cjs --runInBand`.
