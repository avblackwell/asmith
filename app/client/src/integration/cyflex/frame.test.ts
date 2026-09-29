import {
  CYFLEX_V2_FILE_IDENTIFIER,
  CYFLEX_V2_INTERNAL_VERSION,
  CyflexV2FrameError,
  inspectCyflexV2Frame,
} from "./frame";

/** Minimal root table with the schema's first field, for envelope tests only. */
function frameWithVersion(version = 4): Uint8Array {
  const bytes = new Uint8Array(24);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, 16, true); // root table
  bytes.set([86, 50, 70, 66], 4); // V2FB
  view.setUint16(8, 6, true); // vtable length
  view.setUint16(10, 8, true); // object length
  view.setUint16(12, 4, true); // version field offset
  view.setInt32(16, 8, true); // root to vtable
  view.setInt32(20, version, true);

  return bytes;
}

describe("Cyflex V2 frame boundary", () => {
  it("accepts V2FB with internal version 4", () => {
    expect(inspectCyflexV2Frame(frameWithVersion())).toEqual({
      fileIdentifier: CYFLEX_V2_FILE_IDENTIFIER,
      version: CYFLEX_V2_INTERNAL_VERSION,
    });
  });

  it("respects a Uint8Array view's byte offset", () => {
    const backing = new Uint8Array(32);

    backing.set(frameWithVersion(), 5);

    expect(inspectCyflexV2Frame(backing.subarray(5, 29)).version).toBe(4);
  });

  it("uses the schema default when version is omitted", () => {
    const bytes = frameWithVersion().subarray(0, 20);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    view.setUint16(8, 4, true); // no version slot
    view.setUint16(10, 4, true); // root only has vtable pointer

    expect(inspectCyflexV2Frame(bytes).version).toBe(4);
  });

  it("rejects other file identifiers and internal versions", () => {
    const wrongIdentifier = frameWithVersion();

    wrongIdentifier[4] = 0;

    expect(() => inspectCyflexV2Frame(wrongIdentifier)).toThrow(
      CyflexV2FrameError,
    );
    expect(() => inspectCyflexV2Frame(frameWithVersion(3))).toThrow(
      "Unsupported Cyflex V2 internal version: 3",
    );
  });

  it("rejects truncated or out-of-bounds tables", () => {
    expect(() => inspectCyflexV2Frame(new Uint8Array(7))).toThrow("too short");

    const badRoot = frameWithVersion();
    const badRootView = new DataView(badRoot.buffer);

    badRootView.setUint32(0, 40, true);
    expect(() => inspectCyflexV2Frame(badRoot)).toThrow(
      "root table offset is out of bounds",
    );

    const badField = frameWithVersion();
    const badFieldView = new DataView(badField.buffer);

    badFieldView.setUint16(12, 7, true);
    expect(() => inspectCyflexV2Frame(badField)).toThrow(
      "version field is out of bounds",
    );
  });
});
