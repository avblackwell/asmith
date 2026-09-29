import { readFileSync } from "fs";
import { join } from "path";

import { CyflexV2FrameError } from "../frame";
import { decodeCyflexV2Frame } from "./decodeCyflexV2Frame";

const fixture = new Uint8Array(
  readFileSync(join(__dirname, "fixtures", "variables-v2-sample.bin")),
);

function copyFixture(): Uint8Array {
  return Uint8Array.from(fixture);
}

function fieldPosition(bytes: Uint8Array, table: number, slot: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vtable = table - view.getInt32(table, true);
  const fieldOffset = view.getUint16(vtable + slot, true);

  if (fieldOffset === 0) {
    throw new Error(`fixture omitted slot ${slot}`);
  }

  return table + fieldOffset;
}

function indirect(bytes: Uint8Array, position: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  return position + view.getUint32(position, true);
}

function variableAt(bytes: Uint8Array, index: number): number {
  const root = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint32(0, true);
  const vector = indirect(bytes, fieldPosition(bytes, root, 8));

  return indirect(bytes, vector + 4 + index * 4);
}

function chunkAt(bytes: Uint8Array, variableIndex: number): number {
  const vector = indirect(
    bytes,
    fieldPosition(bytes, variableAt(bytes, variableIndex), 12),
  );

  return indirect(bytes, vector + 4);
}

describe("Cyflex V2 generated decoder", () => {
  it("decodes all schema union members, units, limits, and exact 64-bit fields", () => {
    expect(decodeCyflexV2Frame(fixture)).toEqual({
      version: 4,
      goTime: "-9007199254740993",
      variables: [
        {
          id: "18446744073709551615",
          type: 1,
          unitCode: -17,
          limitStatus: 4294967295,
          limitFlag: true,
          chunks: [
            { timestamp: 1234.25, value: { kind: "rvalue", value: 12.5 } },
            { timestamp: 1235.5, value: { kind: "rvalue", value: -0.5 } },
          ],
          limits: [
            { value: 100.25, type: -2, color: 16711680, enabled: true },
            { value: 0, type: 0, color: 0, enabled: false },
          ],
        },
        {
          id: "9007199254740993",
          type: 2,
          unitCode: 23,
          limitStatus: 0,
          limitFlag: false,
          chunks: [
            {
              timestamp: 0,
              value: { kind: "ivalue", value: -2147483648 },
            },
          ],
          limits: [],
        },
        {
          id: "0",
          type: 3,
          unitCode: 0,
          limitStatus: 0,
          limitFlag: false,
          chunks: [
            {
              timestamp: 42.75,
              value: { kind: "svalue", value: "Café 日本語" },
            },
          ],
          limits: [],
        },
      ],
    });
  });

  it("respects Uint8Array offsets and uses the union tag, not variable type", () => {
    const shifted = new Uint8Array(fixture.length + 11);

    shifted.set(fixture, 7);

    const slice = shifted.subarray(7, 7 + fixture.length);
    const view = new DataView(slice.buffer, slice.byteOffset, slice.byteLength);

    view.setInt32(fieldPosition(slice, variableAt(slice, 0), 6), 999, true);

    const decoded = decodeCyflexV2Frame(slice);

    expect(decoded.variables[0].type).toBe(999);
    expect(decoded.variables[0].chunks[0].value).toEqual({
      kind: "rvalue",
      value: 12.5,
    });
  });

  it("rejects a vector whose declared length exceeds the frame", () => {
    const frame = copyFixture();
    const view = new DataView(frame.buffer);
    const root = view.getUint32(0, true);
    const vector = indirect(frame, fieldPosition(frame, root, 8));

    view.setUint32(vector, 0xffffffff, true);

    expect(() => decodeCyflexV2Frame(frame)).toThrow(CyflexV2FrameError);
    expect(() => decodeCyflexV2Frame(frame)).toThrow(
      "variables length exceeds frame bounds",
    );
  });

  it("rejects an unknown union tag before generated accessors run", () => {
    const frame = copyFixture();
    const tag = fieldPosition(frame, chunkAt(frame, 0), 4);

    frame[tag] = 255;

    expect(() => decodeCyflexV2Frame(frame)).toThrow(
      "no supported value union",
    );
  });

  it("rejects an absent union payload", () => {
    const frame = copyFixture();

    frame[fieldPosition(frame, chunkAt(frame, 0), 4)] = 0;

    expect(() => decodeCyflexV2Frame(frame)).toThrow(
      "no supported value union",
    );
  });

  it("rejects an out-of-bounds union payload offset", () => {
    const frame = copyFixture();
    const view = new DataView(frame.buffer);

    view.setUint32(
      fieldPosition(frame, chunkAt(frame, 0), 6),
      0xffffffff,
      true,
    );

    expect(() => decodeCyflexV2Frame(frame)).toThrow(
      "offset exceeds frame bounds",
    );
  });

  it("rejects a string length that exceeds the frame", () => {
    const frame = copyFixture();
    const view = new DataView(frame.buffer);
    const string = indirect(frame, fieldPosition(frame, chunkAt(frame, 2), 6));

    view.setUint32(string, 0xffffffff, true);

    expect(() => decodeCyflexV2Frame(frame)).toThrow(
      "svalue exceeds frame bounds",
    );
  });

  it("rejects truncated frames", () => {
    expect(() => decodeCyflexV2Frame(fixture.subarray(0, 80))).toThrow(
      CyflexV2FrameError,
    );
  });

  it("contains generated-reader failures for single-byte corruption", () => {
    for (let index = 0; index < fixture.length; index++) {
      const frame = copyFixture();

      frame[index] ^= 0xff;

      try {
        decodeCyflexV2Frame(frame);
      } catch (error) {
        expect(error).toBeInstanceOf(CyflexV2FrameError);
      }
    }
  });
});
