/**
 * Validates the FlatBuffers frame envelope before a generated decoder reads
 * variable tables. This module deliberately does not hand-decode the payload.
 */
export const CYFLEX_V2_FILE_IDENTIFIER = "V2FB";
export const CYFLEX_V2_INTERNAL_VERSION = 4 as const;

export class CyflexV2FrameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CyflexV2FrameError";
  }
}

export interface CyflexV2FrameHeader {
  fileIdentifier: typeof CYFLEX_V2_FILE_IDENTIFIER;
  version: typeof CYFLEX_V2_INTERNAL_VERSION;
}

function invalid(message: string): never {
  throw new CyflexV2FrameError(message);
}

/**
 * FlatBuffers stores the root offset at byte 0 and the four-byte file ID at
 * bytes 4-7. The root table's first vtable slot is `messageRoot.version`; an
 * omitted slot has the schema default of 4. All offset arithmetic is checked.
 */
export function inspectCyflexV2Frame(frame: Uint8Array): CyflexV2FrameHeader {
  if (!(frame instanceof Uint8Array)) {
    invalid("Cyflex V2 frame must be a Uint8Array");
  }

  if (frame.byteLength < 12) {
    invalid("Cyflex V2 frame is too short");
  }

  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const identifier = String.fromCharCode(...frame.subarray(4, 8));

  if (identifier !== CYFLEX_V2_FILE_IDENTIFIER) {
    invalid(`Unsupported Cyflex file identifier: ${identifier}`);
  }

  const root = view.getUint32(0, true);

  if (root < 8 || root > frame.byteLength - 4) {
    invalid("Cyflex V2 root table offset is out of bounds");
  }

  const vtableOffset = view.getInt32(root, true);
  const vtable = root - vtableOffset;

  if (vtable < 8 || vtable > frame.byteLength - 4) {
    invalid("Cyflex V2 vtable offset is out of bounds");
  }

  const vtableBytes = view.getUint16(vtable, true);
  const objectBytes = view.getUint16(vtable + 2, true);

  if (
    vtableBytes < 4 ||
    vtableBytes % 2 !== 0 ||
    vtable + vtableBytes > frame.byteLength ||
    objectBytes < 4 ||
    root + objectBytes > frame.byteLength
  ) {
    invalid("Cyflex V2 table bounds are invalid");
  }

  // FlatBuffers omits scalar fields that equal their schema default.
  let version: number = CYFLEX_V2_INTERNAL_VERSION;

  if (vtableBytes >= 6) {
    const fieldOffset = view.getUint16(vtable + 4, true);

    if (fieldOffset !== 0) {
      if (fieldOffset < 4 || fieldOffset + 4 > objectBytes) {
        invalid("Cyflex V2 version field is out of bounds");
      }

      version = view.getInt32(root + fieldOffset, true);
    }
  }

  if (version !== CYFLEX_V2_INTERNAL_VERSION) {
    invalid(`Unsupported Cyflex V2 internal version: ${version}`);
  }

  return {
    fileIdentifier: CYFLEX_V2_FILE_IDENTIFIER,
    version: CYFLEX_V2_INTERNAL_VERSION,
  };
}
