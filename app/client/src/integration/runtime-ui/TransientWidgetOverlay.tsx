import React, { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { TransientWidgetUpdate } from "../runtime";

const EMPTY_UPDATES: readonly TransientWidgetUpdate[] = [];
const PROPERTY_PATH = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
const FORBIDDEN_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

function assertUpdate(update: TransientWidgetUpdate): void {
  if (!update.widgetId.trim())
    throw new TypeError("Widget ID must be nonempty");

  const segments = update.propertyPath.split(".");

  if (
    !PROPERTY_PATH.test(update.propertyPath) ||
    segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment))
  ) {
    throw new TypeError(`Invalid widget property path: ${update.propertyPath}`);
  }

  if (typeof update.value === "string") return;

  if (
    !Array.isArray(update.value) ||
    update.value.some(
      (point) =>
        typeof point.x !== "string" ||
        !Number.isFinite(Date.parse(point.x)) ||
        typeof point.y !== "number" ||
        !Number.isFinite(point.y),
    )
  ) {
    throw new TypeError("Chart updates require finite timestamped points");
  }
}

function copyUpdate(update: TransientWidgetUpdate): TransientWidgetUpdate {
  return {
    widgetId: update.widgetId,
    propertyPath: update.propertyPath,
    value:
      typeof update.value === "string"
        ? update.value
        : update.value.map((point) => ({ ...point })),
  };
}

/** Per-editor, in-memory values that never enter Redux's canvas widget tree. */
export class TransientWidgetOverlay {
  private readonly updates = new Map<
    string,
    readonly TransientWidgetUpdate[]
  >();
  private readonly listeners = new Map<string, Set<() => void>>();

  getWidgetUpdates(widgetId: string): readonly TransientWidgetUpdate[] {
    return this.updates.get(widgetId) ?? EMPTY_UPDATES;
  }

  subscribe(widgetId: string, listener: () => void): () => void {
    const listeners = this.listeners.get(widgetId) ?? new Set<() => void>();

    listeners.add(listener);

    this.listeners.set(widgetId, listeners);

    return () => {
      listeners.delete(listener);

      if (!listeners.size) this.listeners.delete(widgetId);
    };
  }

  apply(incoming: readonly TransientWidgetUpdate[]): void {
    // Validate the entire frame before making any widget visible changes.
    incoming.forEach(assertUpdate);

    const byWidget = new Map<string, Map<string, TransientWidgetUpdate>>();

    for (const update of incoming) {
      const propertyMap = byWidget.get(update.widgetId) ?? new Map();

      propertyMap.set(update.propertyPath, copyUpdate(update));
      byWidget.set(update.widgetId, propertyMap);
    }

    for (const [widgetId, propertyMap] of byWidget) {
      const existing = this.updates.get(widgetId) ?? EMPTY_UPDATES;

      for (const update of existing) {
        if (!propertyMap.has(update.propertyPath)) {
          propertyMap.set(update.propertyPath, update);
        }
      }

      this.updates.set(widgetId, [...propertyMap.values()]);
      this.listeners.get(widgetId)?.forEach((listener) => listener());
    }
  }

  clear(): void {
    const affectedWidgets = [...this.updates.keys()];

    this.updates.clear();
    affectedWidgets.forEach((widgetId) =>
      this.listeners.get(widgetId)?.forEach((listener) => listener()),
    );
  }
}

function withPropertyValue(
  source: unknown,
  segments: readonly string[],
  value: TransientWidgetUpdate["value"],
): unknown {
  if (source === null || typeof source !== "object" || Array.isArray(source)) {
    return source;
  }

  const record = source as Record<string, unknown>;
  const [segment, ...remaining] = segments;

  if (!Object.prototype.hasOwnProperty.call(record, segment)) return source;

  if (!remaining.length) return { ...record, [segment]: value };

  const child = withPropertyValue(record[segment], remaining, value);

  if (child === record[segment]) return source;

  return { ...record, [segment]: child };
}

/** Apply only declared render values to native widget props, using structural copies. */
export function applyTransientWidgetProps<T extends { widgetId: string }>(
  widgetProps: T,
  updates: readonly TransientWidgetUpdate[],
): T {
  let result = widgetProps;

  for (const update of updates) {
    assertUpdate(update);

    if (update.widgetId !== widgetProps.widgetId) continue;

    result = withPropertyValue(
      result,
      update.propertyPath.split("."),
      update.value,
    ) as T;
  }

  return result;
}

const TransientWidgetOverlayContext =
  createContext<TransientWidgetOverlay | null>(null);

export function TransientWidgetOverlayProvider({
  children,
  overlay,
}: {
  children: ReactNode;
  overlay: TransientWidgetOverlay;
}) {
  return (
    <TransientWidgetOverlayContext.Provider value={overlay}>
      {children}
    </TransientWidgetOverlayContext.Provider>
  );
}

/** No provider means normal Appsmith rendering on every existing route. */
export function useTransientWidgetUpdates(
  widgetId: string,
): readonly TransientWidgetUpdate[] {
  const overlay = useContext(TransientWidgetOverlayContext);
  const [updates, setUpdates] = useState<readonly TransientWidgetUpdate[]>(
    () => overlay?.getWidgetUpdates(widgetId) ?? EMPTY_UPDATES,
  );

  useEffect(
    function subscribeToWidgetUpdates() {
      if (!overlay) {
        setUpdates(EMPTY_UPDATES);

        return;
      }

      const refresh = () => setUpdates(overlay.getWidgetUpdates(widgetId));
      const unsubscribe = overlay.subscribe(widgetId, refresh);

      refresh();

      return unsubscribe;
    },
    [overlay, widgetId],
  );

  return updates;
}
