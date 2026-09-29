# Selected-cell Cyflex resolution

`resolveSelectedCellVariables` takes a dashboard and a selected marketplace
test-cell **software ID**. It fetches the cell through the marketplace API, then
uses the permission-checked Java proxy for `GET /cyflex` and
`GET /cyflex/variables`. The Cyflex info request uses
`Accept: cyflex/json_info+output+v1` to retrieve the exact streaming subject.
The variables request uses `Accept: variables/json_all+output+v1` and maps only
bound dashboard selectors to the selected cell's variable IDs and labels.

`listSelectedCellVariables` supports authoring-time discovery. It verifies the
selected cell through the same marketplace API, then requests only
`GET /cyflex/variables` through the permission-checked proxy. It returns the
cell and a deduplicated list of `{ id, label }` entries. It forwards an abort
signal and does not start a proxy request if the cell lookup was cancelled.
Variable IDs retain exact uint64 decimal text. This is authoring-time data:
the selected cell ID is not stored in the dashboard's variable selector.

Cyflex's variables JSON contains numeric uint64 IDs. The resolver reads raw
response text and quotes `id` integer tokens before `JSON.parse` can round
them. It rejects missing or conflicting IDs and labels, invalid subjects,
Cyflex application errors, and mismatched selected-cell identity. It does not
guess subjects from cell names or check default `unit_code` against binding
unit codes, because Cyflex may convert to a requested unit when streaming.

The supplied backend references `jsonlabels::STREAM_SUBJECT` but the literal
constant lives in an unavailable external header. The parser currently accepts
`stream_subject`, `streaming_subject`, or `STREAM_SUBJECT` and rejects absent or
conflicting values. Confirm the deployed response field before live use.

Run focused tests from `app/client` with
`node_modules/.bin/jest --config src/integration/cyflex/resolution/jest.config.cjs --runInBand`.
