# Cyflex browser boundary

This folder ports the existing project implementation from
`app/client/src/integration/cyflex` into the standalone client. Cyflex HTTP
calls use the same-origin Java route
`/operator_display/remote/tc/{softwareId}/...` with the current session cookie.
The browser sends no Cyflex Basic credentials and does not connect to a cell
HTTP address. `CyflexProxyClient` exposes only the three routes needed here:
`GET cyflex`, `GET cyflex/variables`, and `POST cyflex/streaming`.

Run starts by calling `resolveSelectedCellVariables(client, softwareId,
document)`. This fetches the cell through Java, then reads the exact stream
subject and variable IDs through the Java proxy. `createBrowserRun` combines
the Java control transport with a direct browser NATS WebSocket subscription.
The caller supplies a browser-reachable `wss://` broker connection scoped for
the user and cell, plus a deployment-verified `timestampToMs(utime, goTime)`
conversion. Neither is written to the dashboard document. Status, errors,
and transient widget updates are sent to callbacks. Stop unsubscribes from
NATS, aborts outstanding control calls, and clears the keepalive timer.

Cyflex V2 FlatBuffers readers are generated from `variablesV2.fbs` and keep
64-bit IDs as decimal strings. The copied binary fixture and
`node src/cyflex/contract.test.cjs` check the Java request route, uint64
resolution, stream control lifecycle, direct NATS adapter, and V2 decoding.
The backend TLS/authentication hop, actual Cyflex JSON subject key, NATS
authorization, and time conversion still need deployment verification.
