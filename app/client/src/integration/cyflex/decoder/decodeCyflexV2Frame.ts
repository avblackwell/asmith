import * as flatbuffers from "flatbuffers";

import { CyflexV2FrameError, inspectCyflexV2Frame } from "../frame";
import type {
  CyflexV2Chunk,
  CyflexV2Limit,
  CyflexV2Message,
  CyflexV2Variable,
} from "../types";
import { DoubleValue } from "./generated/cyflex-v2/double-value";
import type { fbChunk } from "./generated/cyflex-v2/fb-chunk";
import type { fbLimit } from "./generated/cyflex-v2/fb-limit";
import type { fbVariable } from "./generated/cyflex-v2/fb-variable";
import { IntValue } from "./generated/cyflex-v2/int-value";
import { messageRoot } from "./generated/cyflex-v2/message-root";
import { valueUnion } from "./generated/cyflex-v2/value-union";
import { verifyCyflexV2Layout } from "./verifyLayout";

function invalid(message: string): never {
  throw new CyflexV2FrameError(`Invalid Cyflex V2 payload: ${message}`);
}

function decodeChunk(chunk: fbChunk): CyflexV2Chunk {
  let value: CyflexV2Chunk["value"];

  switch (chunk.valueType()) {
    case valueUnion.rvalue: {
      const real = chunk.value(new DoubleValue()) as DoubleValue | null;

      if (real === null) {
        invalid("rvalue union payload is missing");
      }

      value = { kind: "rvalue", value: real.value() };
      break;
    }
    case valueUnion.ivalue: {
      const integer = chunk.value(new IntValue()) as IntValue | null;

      if (integer === null) {
        invalid("ivalue union payload is missing");
      }

      value = { kind: "ivalue", value: integer.value() };
      break;
    }
    case valueUnion.svalue: {
      const stringValue = chunk.value("") as string | null;

      if (stringValue === null) {
        invalid("svalue union payload is missing");
      }

      value = { kind: "svalue", value: stringValue };
      break;
    }
    default:
      return invalid(`unsupported value union tag ${chunk.valueType()}`);
  }

  return { timestamp: chunk.utime(), value };
}

function decodeLimit(limit: fbLimit): CyflexV2Limit {
  return {
    value: limit.value(),
    type: limit.type(),
    color: limit.color(),
    enabled: limit.enable(),
  };
}

function decodeVariable(variable: fbVariable): CyflexV2Variable {
  const chunks: CyflexV2Chunk[] = [];
  const limits: CyflexV2Limit[] = [];

  for (let i = 0; i < variable.chunksLength(); i++) {
    const chunk = variable.chunks(i);

    if (chunk === null) {
      invalid(`chunk ${i} is missing`);
    }

    chunks.push(decodeChunk(chunk));
  }

  for (let i = 0; i < variable.limitsLength(); i++) {
    const limit = variable.limits(i);

    if (limit === null) {
      invalid(`limit ${i} is missing`);
    }

    limits.push(decodeLimit(limit));
  }

  return {
    id: variable.id().toString(),
    type: variable.type(),
    unitCode: variable.ucode(),
    limitStatus: variable.lstatus(),
    limitFlag: variable.lflag(),
    chunks,
    limits,
  };
}

/**
 * Decode a non-size-prefixed `V2FB` message using FlatBuffers 25.2.10
 * generated readers. The layout pass prevents malformed offsets from reaching
 * the generated JavaScript accessors, which do not verify buffer bounds.
 *
 * `goTime` and variable IDs remain decimal strings to retain all 64 bits.
 * `timestamp` is the wire's double `utime`; its unit is not assumed here.
 */
export function decodeCyflexV2Frame(frame: Uint8Array): CyflexV2Message {
  inspectCyflexV2Frame(frame);
  verifyCyflexV2Layout(frame);

  const root = messageRoot.getRootAsmessageRoot(
    new flatbuffers.ByteBuffer(frame),
  );
  const variables: CyflexV2Variable[] = [];

  for (let i = 0; i < root.variablesLength(); i++) {
    const variable = root.variables(i);

    if (variable === null) {
      invalid(`variable ${i} is missing`);
    }

    variables.push(decodeVariable(variable));
  }

  return {
    version: 4,
    goTime: root.goTime().toString(),
    variables,
  };
}
