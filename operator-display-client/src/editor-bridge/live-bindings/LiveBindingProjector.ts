import type { DashboardBinding, DashboardDocument } from "../../document";
import { parseDashboardDocument } from "../../document";

export interface ResolvedVariable {
  /** Dashboard variable key from the document. */
  key: string;
  /** Cyflex uint64 variable ID, kept as a decimal string. */
  id: string;
}

/** A normalized value from a selected, authorized cell. */
export interface LiveSample {
  cellId: string;
  variableId: string;
  unitCode: number;
  /** Conversion from the Cyflex timestamp unit happens at the decoder boundary. */
  timestampMs: number;
  value: number | string | boolean;
}

export interface ChartPoint {
  x: string;
  y: number;
}

/** Apply these to a transient widget overlay; never serialize them into the DSL. */
export interface TransientWidgetUpdate {
  widgetId: string;
  propertyPath: string;
  value: string | ChartPoint[];
}

interface BindingState {
  binding: DashboardBinding;
  valueType: "number" | "string" | "boolean";
  latestTimestampMs: number;
  points: Array<{ timestampMs: number; point: ChartPoint }>;
}

const UINT64_MAX = BigInt("18446744073709551615");

function assertVariableId(id: string): void {
  if (!/^(0|[1-9]\d*)$/.test(id) || BigInt(id) > UINT64_MAX) {
    throw new TypeError(`Invalid Cyflex variable ID: ${id}`);
  }
}

function sampleKey(id: string, unitCode: number): string {
  return JSON.stringify([id, unitCode]);
}

/**
 * Holds Run-mode values separately from the package that is saved and shared.
 * The selected cell is fixed for this session. Creating another projector
 * starts a fresh session without changing any other viewer's state.
 */
export class LiveBindingProjector {
  private readonly byVariable = new Map<string, BindingState[]>();
  private readonly cellId: string;

  constructor(
    input: DashboardDocument,
    cellId: string,
    resolvedVariables: ResolvedVariable[],
  ) {
    const document = parseDashboardDocument(input);

    if (!cellId.trim()) throw new TypeError("Cell ID must be nonempty");

    this.cellId = cellId;
    const resolved = new Map<string, string>();

    for (const variable of resolvedVariables) {
      assertVariableId(variable.id);

      if (resolved.has(variable.key)) {
        throw new TypeError(`Variable ${variable.key} was resolved twice`);
      }

      resolved.set(variable.key, variable.id);
    }

    const declarations = new Map(
      document.variables.map((variable) => [variable.key, variable]),
    );

    for (const binding of document.bindings) {
      const declaration = declarations.get(binding.variableKey);
      const id = resolved.get(binding.variableKey);

      if (!declaration || id === undefined) {
        throw new TypeError(`Variable ${binding.variableKey} was not resolved`);
      }

      if (
        declaration.selector.kind === "cyflexId" &&
        declaration.selector.id !== id
      ) {
        throw new TypeError(
          `Variable ${binding.variableKey} resolved to a different ID`,
        );
      }

      const key = sampleKey(id, binding.unitCode);
      const states = this.byVariable.get(key) ?? [];

      states.push({
        binding,
        valueType: declaration.valueType,
        latestTimestampMs: -Infinity,
        points: [],
      });
      this.byVariable.set(key, states);
    }
  }

  accept(sample: LiveSample): TransientWidgetUpdate[] {
    if (sample.cellId !== this.cellId) return [];

    assertVariableId(sample.variableId);

    if (!Number.isInteger(sample.unitCode)) {
      throw new TypeError("Live sample unit code must be an integer");
    }

    if (
      !Number.isFinite(sample.timestampMs) ||
      !Number.isFinite(new Date(sample.timestampMs).getTime())
    ) {
      throw new TypeError(
        "Live sample timestamp must be a valid millisecond date",
      );
    }

    const states = this.byVariable.get(
      sampleKey(sample.variableId, sample.unitCode),
    );

    if (!states) return [];

    return states.flatMap((state): TransientWidgetUpdate[] => {
      if (
        typeof sample.value !== state.valueType ||
        (typeof sample.value === "number" && !Number.isFinite(sample.value))
      ) {
        throw new TypeError(
          `Live sample type does not match ${state.binding.variableKey}`,
        );
      }

      if (sample.timestampMs < state.latestTimestampMs) return [];

      const { binding } = state;
      const target = {
        widgetId: binding.target.widgetId,
        propertyPath: binding.target.propertyPath,
      };

      if (binding.presentation.kind === "latest") {
        state.latestTimestampMs = sample.timestampMs;
        const formatted =
          typeof sample.value === "number" &&
          binding.presentation.decimalPlaces !== undefined
            ? sample.value.toFixed(binding.presentation.decimalPlaces)
            : String(sample.value);

        return [
          {
            ...target,
            value: binding.presentation.template.replace("{value}", formatted),
          },
        ];
      }

      const value = sample.value as number;
      const point = { x: new Date(sample.timestampMs).toISOString(), y: value };

      if (sample.timestampMs === state.latestTimestampMs) {
        state.points[state.points.length - 1] = {
          timestampMs: sample.timestampMs,
          point,
        };
      } else {
        state.points.push({ timestampMs: sample.timestampMs, point });
      }

      state.latestTimestampMs = sample.timestampMs;
      const cutoff =
        sample.timestampMs - binding.presentation.windowSeconds * 1000;

      state.points = state.points
        .filter(({ timestampMs }) => timestampMs >= cutoff)
        .slice(-binding.presentation.maxPoints);

      return [
        { ...target, value: state.points.map(({ point }) => ({ ...point })) },
      ];
    });
  }
}
