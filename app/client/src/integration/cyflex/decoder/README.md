# Cyflex V2 decoder

`decodeCyflexV2Frame` reads the checked-in `variablesV2.fbs` wire format. It
checks the `V2FB` identifier and internal version 4, validates all reachable
FlatBuffers offsets and lengths, then reads through generated TypeScript classes.
The normalized result keeps `ulong` IDs and signed `long` `go_time` as decimal
strings. It preserves the signed unit code, unsigned limit status, union value
kind, raw double `utime`, and version 4 limit enable flag.

The generated files under `generated/` were produced with the official
FlatBuffers `flatc` **25.2.10**, matching the version in the backend's
`variablesV2_generated.h`. The app uses `flatbuffers@25.2.10`. To regenerate:

```powershell
flatc --ts -o app/client/src/integration/cyflex/decoder/generated app/client/src/integration/cyflex/variablesV2.fbs
```

The binary test fixture was compiled independently by the same compiler from
`fixtures/variables-v2-sample.json`:

```powershell
flatc --binary -o app/client/src/integration/cyflex/decoder/fixtures app/client/src/integration/cyflex/variablesV2.fbs app/client/src/integration/cyflex/decoder/fixtures/variables-v2-sample.json
```

Generated sources are kept unchanged and excluded from ESLint and Prettier.
The extra layout pass is necessary because the generated JavaScript accessors
do not reject malformed offsets. A frame is limited to 32 MiB and 250,000
aggregate vector entries to bound browser work. `valueUnion.NONE` is rejected:
the backend skips samples with that tag, and the normalized chunk type needs a
value. Timestamp units are intentionally left uninterpreted until verified
against a running deployment.

Run tests from `app/client`:

```powershell
node_modules/.bin/jest --config src/integration/cyflex/decoder/jest.config.cjs --runInBand
```
