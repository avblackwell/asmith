import { CyflexV2FrameError } from "../frame";

// The TypeScript FlatBuffers runtime reads offsets without a verifier. Bound
// every reachable table, vector, union target, and string before using the
// generated accessors. These slot numbers are generated from variablesV2.fbs.
const MAX_FRAME_BYTES = 32 * 1024 * 1024;
const MAX_VECTOR_ELEMENTS = 250_000;

interface TableBounds {
  position: number;
  vtable: number;
  vtableBytes: number;
  objectBytes: number;
}

interface OffsetVector {
  start: number;
  length: number;
}

class CyflexV2LayoutVerifier {
  private readonly view: DataView;
  private visitedElements = 0;

  constructor(private readonly frame: Uint8Array) {
    this.view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  }

  verify(): void {
    if (this.frame.byteLength > MAX_FRAME_BYTES) {
      this.fail(`frame exceeds ${MAX_FRAME_BYTES} bytes`);
    }

    const root = this.table(this.view.getUint32(0, true), "messageRoot");

    this.field(root, 6, 8, "messageRoot.go_time");

    const variables = this.offsetVector(root, 8, "messageRoot.variables");

    if (variables === null) {
      return;
    }

    for (let i = 0; i < variables.length; i++) {
      const variable = this.table(
        this.indirect(variables.start + i * 4, `variables[${i}]`),
        `variables[${i}]`,
      );

      this.verifyVariable(variable, i);
    }
  }

  private verifyVariable(table: TableBounds, index: number): void {
    const label = `variables[${index}]`;

    this.field(table, 4, 8, `${label}.id`);
    this.field(table, 6, 4, `${label}.type`);
    this.field(table, 8, 4, `${label}.ucode`);
    this.field(table, 10, 4, `${label}.lstatus`);
    this.field(table, 14, 1, `${label}.lflag`);

    const chunks = this.offsetVector(table, 12, `${label}.chunks`);

    if (chunks !== null) {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = this.table(
          this.indirect(chunks.start + i * 4, `${label}.chunks[${i}]`),
          `${label}.chunks[${i}]`,
        );

        this.verifyChunk(chunk, `${label}.chunks[${i}]`);
      }
    }

    const limits = this.offsetVector(table, 16, `${label}.limits`);

    if (limits !== null) {
      for (let i = 0; i < limits.length; i++) {
        const limit = this.table(
          this.indirect(limits.start + i * 4, `${label}.limits[${i}]`),
          `${label}.limits[${i}]`,
        );

        this.field(limit, 4, 8, `${label}.limits[${i}].value`);
        this.field(limit, 6, 4, `${label}.limits[${i}].type`);
        this.field(limit, 8, 4, `${label}.limits[${i}].color`);
        this.field(limit, 10, 1, `${label}.limits[${i}].enable`);
      }
    }
  }

  private verifyChunk(table: TableBounds, label: string): void {
    const typePosition = this.field(table, 4, 1, `${label}.value_type`);
    const type = typePosition === null ? 0 : this.view.getUint8(typePosition);
    const valuePosition = this.field(table, 6, 4, `${label}.value`);

    this.field(table, 8, 8, `${label}.utime`);

    if (type < 1 || type > 3 || valuePosition === null) {
      this.fail(`${label} has no supported value union`);
    }

    const target = this.indirect(valuePosition, `${label}.value`);

    switch (type) {
      case 1:
        this.bounds(target, 8, `${label}.rvalue`);
        break;
      case 2:
        this.bounds(target, 4, `${label}.ivalue`);
        break;
      case 3:
        this.verifyString(target, `${label}.svalue`);
        break;
    }
  }

  private verifyString(position: number, label: string): void {
    this.bounds(position, 4, label);

    const length = this.view.getUint32(position, true);
    const start = position + 4;

    this.bounds(start, length + 1, label);

    if (this.frame[start + length] !== 0) {
      this.fail(`${label} is missing a zero terminator`);
    }
  }

  private offsetVector(
    table: TableBounds,
    slot: number,
    label: string,
  ): OffsetVector | null {
    const position = this.field(table, slot, 4, label);

    if (position === null) {
      return null;
    }

    const vector = this.indirect(position, label);

    this.bounds(vector, 4, label);

    const length = this.view.getUint32(vector, true);
    const start = vector + 4;

    if (length > Math.floor((this.frame.byteLength - start) / 4)) {
      this.fail(`${label} length exceeds frame bounds`);
    }

    this.visitedElements += length;

    if (this.visitedElements > MAX_VECTOR_ELEMENTS) {
      this.fail(`frame exceeds ${MAX_VECTOR_ELEMENTS} vector elements`);
    }

    return { start, length };
  }

  private table(position: number, label: string): TableBounds {
    this.bounds(position, 4, label);

    const vtable = position - this.view.getInt32(position, true);

    this.bounds(vtable, 4, `${label} vtable`);

    const vtableBytes = this.view.getUint16(vtable, true);
    const objectBytes = this.view.getUint16(vtable + 2, true);

    if (vtableBytes < 4 || vtableBytes % 2 !== 0 || objectBytes < 4) {
      this.fail(`${label} table dimensions are invalid`);
    }

    this.bounds(vtable, vtableBytes, `${label} vtable`);
    this.bounds(position, objectBytes, `${label} table`);

    return { position, vtable, vtableBytes, objectBytes };
  }

  private field(
    table: TableBounds,
    slot: number,
    width: number,
    label: string,
  ): number | null {
    if (slot + 2 > table.vtableBytes) {
      return null;
    }

    const fieldOffset = this.view.getUint16(table.vtable + slot, true);

    if (fieldOffset === 0) {
      return null;
    }

    if (fieldOffset < 4 || fieldOffset + width > table.objectBytes) {
      this.fail(`${label} field exceeds table bounds`);
    }

    return table.position + fieldOffset;
  }

  private indirect(position: number, label: string): number {
    this.bounds(position, 4, label);

    const offset = this.view.getUint32(position, true);
    const target = position + offset;

    if (offset === 0 || target > this.frame.byteLength) {
      this.fail(`${label} offset exceeds frame bounds`);
    }

    return target;
  }

  private bounds(position: number, width: number, label: string): void {
    if (
      !Number.isInteger(position) ||
      !Number.isInteger(width) ||
      position < 0 ||
      width < 0 ||
      position > this.frame.byteLength - width
    ) {
      this.fail(`${label} exceeds frame bounds`);
    }
  }

  private fail(message: string): never {
    throw new CyflexV2FrameError(`Invalid Cyflex V2 layout: ${message}`);
  }
}

export function verifyCyflexV2Layout(frame: Uint8Array): void {
  new CyflexV2LayoutVerifier(frame).verify();
}
