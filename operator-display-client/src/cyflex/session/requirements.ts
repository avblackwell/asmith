import type { DashboardDocument } from "../../document";
import { parseDashboardDocument } from "../../document";

const UINT64_MAX = BigInt("18446744073709551615");

/** Metadata resolved for the selected, authorized cell before Run starts. */
export interface ResolvedCyflexVariable {
  key: string;
  id: string;
  /** Cyflex's streaming configuration addresses variables by label. */
  label: string;
}

export interface StreamWatcherRequirement {
  unitCode: number;
  /** A history binding requests the native buffer, if one exists. */
  buffered: boolean;
}

export interface StreamVariableRequirement {
  id: string;
  label: string;
  watchers: StreamWatcherRequirement[];
}

export interface StreamRequirements {
  variables: StreamVariableRequirement[];
}

function validId(id: string): boolean {
  return /^(0|[1-9]\d*)$/.test(id) && BigInt(id) <= UINT64_MAX;
}

/**
 * Produce one Cyflex watcher per (variable ID, unit code), even when several
 * widgets read the same value. IDs remain decimal strings at this boundary.
 */
export function deriveStreamRequirements(
  input: DashboardDocument,
  resolvedVariables: ResolvedCyflexVariable[],
): StreamRequirements {
  const document = parseDashboardDocument(input);
  const declarations = new Map(
    document.variables.map((item) => [item.key, item]),
  );
  const byKey = new Map<string, ResolvedCyflexVariable>();
  const idToLabel = new Map<string, string>();
  const labelToId = new Map<string, string>();

  for (const resolved of resolvedVariables) {
    if (
      !resolved.key.trim() ||
      !resolved.label.trim() ||
      !validId(resolved.id)
    ) {
      throw new TypeError(
        "Resolved Cyflex variable needs a key, label, and uint64 ID",
      );
    }

    if (!declarations.has(resolved.key)) {
      throw new TypeError(`Undeclared Cyflex variable ${resolved.key}`);
    }

    if (byKey.has(resolved.key)) {
      throw new TypeError(`Variable ${resolved.key} was resolved twice`);
    }

    const declaration = declarations.get(resolved.key);

    if (
      declaration?.selector.kind === "cyflexId" &&
      declaration.selector.id !== resolved.id
    ) {
      throw new TypeError(
        `Variable ${resolved.key} resolved to a different ID`,
      );
    }

    if (
      idToLabel.has(resolved.id) &&
      idToLabel.get(resolved.id) !== resolved.label
    ) {
      throw new TypeError(`Cyflex ID ${resolved.id} has conflicting labels`);
    }

    if (
      labelToId.has(resolved.label) &&
      labelToId.get(resolved.label) !== resolved.id
    ) {
      throw new TypeError(`Cyflex label ${resolved.label} has conflicting IDs`);
    }

    byKey.set(resolved.key, resolved);
    idToLabel.set(resolved.id, resolved.label);
    labelToId.set(resolved.label, resolved.id);
  }

  const byId = new Map<string, StreamVariableRequirement>();

  for (const binding of document.bindings) {
    const resolved = byKey.get(binding.variableKey);

    if (!resolved) {
      throw new TypeError(`Variable ${binding.variableKey} was not resolved`);
    }

    let variable = byId.get(resolved.id);

    if (!variable) {
      variable = { id: resolved.id, label: resolved.label, watchers: [] };
      byId.set(resolved.id, variable);
    }

    let watcher = variable.watchers.find(
      (entry) => entry.unitCode === binding.unitCode,
    );

    if (!watcher) {
      watcher = { unitCode: binding.unitCode, buffered: false };
      variable.watchers.push(watcher);
    }

    if (binding.presentation.kind === "history") watcher.buffered = true;
  }

  if (byId.size === 0) {
    throw new TypeError("Run requires at least one bound Cyflex variable");
  }

  return { variables: Array.from(byId.values()) };
}

/** Cyflex's VariableManager.fromJson accepts labels and grouped watchers. */
export function streamConfigBody(
  uuid: string,
  requirements: StreamRequirements,
) {
  return {
    uuid,
    variables: requirements.variables.map(({ label }) => ({ label })),
    watchers: requirements.variables.map(({ label, watchers }) => ({
      label,
      watchers: watchers.map(({ buffered, unitCode }) => ({
        count: 1,
        limit_count: 0,
        buffer_count: buffered ? 1 : 0,
        unit_code: unitCode,
      })),
    })),
  };
}
