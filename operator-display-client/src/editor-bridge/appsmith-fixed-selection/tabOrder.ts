/** Direct port of app/client/src/utils/widgetTabOrder.ts. */
export function sanitizeTabOrder(value: unknown): number | undefined {
  let parsed: number;
  if (typeof value === "number") {
    parsed = value;
  } else if (typeof value === "string") {
    if (value.trim() === "") return undefined;
    parsed = Number(value);
  } else {
    return undefined;
  }
  if (!Number.isInteger(parsed) || parsed < 1) return undefined;
  return parsed;
}
