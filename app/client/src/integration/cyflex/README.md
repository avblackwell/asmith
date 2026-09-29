# Cyflex FlatBuffers V2 boundary

`variablesV2.fbs` is copied from `C:/Users/alexb/Downloads/cyflex_backend/cyflex_backend/inc/variablesV2.fbs`. The source declares file identifier `V2FB`, internal version 4, uint64 variable IDs, signed 32-bit unit codes, and the chunk/limit tables.

`inspectCyflexV2Frame` checks the file identifier, root/vtable bounds, and internal version. `decodeCyflexV2Frame` then validates and decodes variable payloads using generated TypeScript readers; see [decoder/README.md](decoder/README.md). The normalized types keep 64-bit IDs and `go_time` as decimal strings so JavaScript cannot round them. Decoding has been tested with compiler-built fixtures, not a live NATS deployment.

Run focused envelope tests from `app/client` with `node_modules/.bin/jest --config src/integration/cyflex/jest.node.config.cjs --runInBand`.
