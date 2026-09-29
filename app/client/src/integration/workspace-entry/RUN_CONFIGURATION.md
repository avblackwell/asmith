# Workspace Run configuration

`/workspace` shows Run controls only after a dashboard opens. The panel lists
test cells through the current marketplace session. At Start it reads the
selected cell's `/cyflex` and `/cyflex/variables` responses through the
marketplace permission-checked proxy. The exact NATS subject and variable IDs
come from those responses, not from the dashboard package or a cell-name guess.

The deployment must provide `window.operatorDisplayRunEnvironment` before the
frontend entrypoint runs. It implements `BrowserRunEnvironment` from
`workspace-ui/RunPanel.tsx`. Its `connectionForCell(cell)` method supplies a
browser-reachable NATS WebSocket connection with **per-user, cell-limited**
broker access and a verified `timestampToMs(utime, goTime)` conversion. The
dashboard document, local draft, and marketplace upload never store this
connection or its credentials. Without this environment, the Run panel states
that streaming is unavailable. Tests inject a controlled environment.

The supplied C++ source does not establish the `utime` unit or its relationship
to `go_time`. The supplied Java proxy also appears to use HTTP without the
downstream Basic authentication required by the Cyflex source configuration.
Confirm the deployed behavior and fix that route before enabling live Run.
The literal JSON key for Cyflex's `STREAM_SUBJECT` comes from an unavailable SDK
header; the frontend currently accepts three conservative spellings and rejects
missing or conflicting subjects. Confirm the deployed key before live use.
