/**
 * Normalized shape for the future generated FlatBuffers reader. The schema's
 * ulong and long fields stay decimal strings so JavaScript never rounds them.
 */
export interface CyflexV2Message {
  version: 4;
  goTime: string; // signed int64 decimal string
  variables: CyflexV2Variable[];
}

export interface CyflexV2Variable {
  id: string; // unsigned uint64 decimal string
  type: number; // signed int32
  unitCode: number; // signed int32 (fbVariable.ucode)
  limitStatus: number; // unsigned uint32
  limitFlag: boolean;
  chunks: CyflexV2Chunk[];
  limits: CyflexV2Limit[];
}

export interface CyflexV2Chunk {
  timestamp: number; // fbChunk.utime, double
  value:
    | { kind: "rvalue"; value: number }
    | { kind: "ivalue"; value: number }
    | { kind: "svalue"; value: string };
}

export interface CyflexV2Limit {
  value: number;
  type: number;
  color: number;
  enabled: boolean;
}
