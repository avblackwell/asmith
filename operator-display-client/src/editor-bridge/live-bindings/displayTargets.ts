const CHART_DATA_PATH = /^chartData\.([A-Za-z_$][\w$]*)\.data$/;
const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);

/** The two display targets supported by the read-only frontend. */
export function isSupportedDisplayTarget(
  widgetType: string,
  propertyPath: string,
): boolean {
  if (widgetType === "TEXT_WIDGET") return propertyPath === "text";
  if (widgetType !== "CHART_WIDGET") return false;

  const match = CHART_DATA_PATH.exec(propertyPath);

  return Boolean(match && !FORBIDDEN.has(match[1]));
}
