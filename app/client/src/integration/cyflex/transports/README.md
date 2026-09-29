# Cyflex browser transports

`MarketplaceCyflexControlTransport` implements the control half of
`CyflexRunSession` using `MarketplaceClient.proxyTestCellRequest`. Construct it
with the authorized test cell's **software ID**, as returned by the marketplace
test-cell API. It posts to `/remote/tc/{softwareId}/cyflex/streaming`, preserving
the session's vendor `Content-Type`, `Accept`, JSON body, and abort signal. The
marketplace session cookie authenticates the same-origin request. The Java
resource performs the user's test-cell access check.

The transport returns the raw response text, including Cyflex's HTTP-200
application errors, for `CyflexRunSession` to parse. It also converts
`MarketplaceHttpError` into a status-bearing response. Network and abort errors
still reject the request.

**Deployment limitation:** the supplied Cyflex source configures HTTPS on port
8822 and Basic authentication. The supplied Java proxy constructs an HTTP URL
to that port and does not supply a downstream Authorization header. The actual
deployment must reconcile this server-to-server mismatch before this route can
be used. The browser must not embed shared service credentials. No live route
has been verified.

## NATS WebSocket subscription

`NatsWebSocketSubscriptionTransport` uses the official
[`@nats-io/nats-core` WebSocket client](https://nats-io.github.io/nats.js/core/functions/wsconnect.html).
Its constructor requires a browser-reachable `ws://` or `wss://` URL and accepts
broker authentication through `WsConnectionOptions`. Supply a cell subject
obtained through an authorized deployment route; wildcard subjects are rejected.
Each subscription owns one NATS connection, forwards raw `Uint8Array` payloads,
and closes that connection on unsubscribe. NATS disconnect/reconnect events are
forwarded to `CyflexRunSession`, which reconfigures the Cyflex lease after a
reconnect. A final connection or subscription closure stops the local run and
its keepalive timer. Other asynchronous errors go to the transport's `onError`
callback.

The browser only applies the selected exact subject. The broker must enforce
authorization to that subject, using browser-appropriate credentials. No live
NATS WebSocket endpoint or broker permission boundary has been verified yet.
