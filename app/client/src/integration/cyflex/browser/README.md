# Browser Run value bridge

`BrowserCyflexRun` joins the V2 frame decoder, one viewer's Cyflex lease and
subscription, and the transient dashboard binding projector. It emits widget
updates at most once per target per received frame. A changed `go_time` resets
chart history. A terminal subscription close clears the local Run state and
allows a new Run attempt. The saved dashboard package is never changed by live
values.

The caller supplies an authorized cell, its exact NATS subject, resolved
variable IDs and labels, concrete control/subscription transports, and a
`timestampToMs(utime, goTime)` conversion. The C++ source writes
`sample.update_time` to `fbChunk.utime`, but the supplied source does not
establish its time unit or whether it is relative to `go_time`; deployment
verification must provide the conversion. A numeric boolean value
must be encoded as integer 0 or 1.

The marketplace proxy currently has an unresolved HTTP/HTTPS/authentication
mismatch at its downstream Cyflex hop. NATS WebSocket URL, browser credentials,
and subject permissions are deployment configuration. This module is tested
with local transports and decoded-message fixtures, not a live cell.
