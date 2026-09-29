import type { AppsmithWidgetDsl, InlineDashboardTheme } from "../../document";

type ThemeProperties = InlineDashboardTheme["properties"];

// Appsmith's Fixed widget stylesheets use these literal appsmith.theme paths.
// The data tree evaluator evaluates the same bindings; this local display only
// needs its static theme-property subset, with literal widget overrides intact.
const themePath = /^\{\{appsmith\.theme\.(colors|borderRadius|boxShadow|fontFamily)\.([A-Za-z_][A-Za-z0-9_]*)\}\}$/;
// AppTheming/utils.ts uses getDynamicBindings/combineDynamicBindings to wrap
// legacy Table cell styles. JSONFormWidget/helper.ts uses getBindingTemplate.
// Accept just those generated, theme-only expressions; arbitrary JS still goes
// through the regular binding pipeline and is not evaluated here.
const tableThemePath = /^\{\{[A-Za-z_$][\w$]*\.sanitizedTableData\.map\(\(currentRow\) => \(\s*\(appsmith\.theme\.(colors|borderRadius|boxShadow|fontFamily)\.([A-Za-z_][A-Za-z0-9_]*)\)\)\)\}\}$/;
const tableLiteralPath = /^\{\{[A-Za-z_$][\w$]*\.sanitizedTableData\.map\(\(currentRow\) => \(\s*("(?:\\.|[^"\\])*")\)\)\}\}$/;
const jsonFormThemePath = /^\{\{\(\(sourceData, formData, fieldState\) => \(\(appsmith\.theme\.(colors|borderRadius|boxShadow|fontFamily)\.([A-Za-z_][A-Za-z0-9_]*)\)\)\)\([A-Za-z_$][\w$]*\.sourceData, [A-Za-z_$][\w$]*\.formData, [A-Za-z_$][\w$]*\.fieldState\)\}\}$/;

export function resolveThemeBinding(value: string, properties: ThemeProperties): string;
export function resolveThemeBinding(value: unknown, properties: ThemeProperties): unknown;
export function resolveThemeBinding(value: unknown, properties: ThemeProperties): unknown {
  if (typeof value !== "string") return value;
  const tableLiteral = tableLiteralPath.exec(value);
  if (tableLiteral) return JSON.parse(tableLiteral[1]) as string;
  const match = themePath.exec(value) ?? tableThemePath.exec(value) ??
    jsonFormThemePath.exec(value);
  if (!match) return value;
  const group = properties[match[1] as keyof ThemeProperties];
  return Object.prototype.hasOwnProperty.call(group, match[2])
    ? group[match[2]] : value;
}

function resolveTree(value: unknown, properties: ThemeProperties): unknown {
  if (typeof value === "string") return resolveThemeBinding(value, properties);
  if (Array.isArray(value)) {
    const next = value.map((entry) => resolveTree(entry, properties));
    return next.some((entry, index) => entry !== value[index]) ? next : value;
  }
  if (value === null || typeof value !== "object") return value;
  let next: Record<string, unknown> | null = null;
  for (const [key, entry] of Object.entries(value)) {
    const resolved = resolveTree(entry, properties);
    if (resolved !== entry) {
      next ??= { ...value };
      next[key] = resolved;
    }
  }
  return next ?? value;
}

/** Resolve rendered widget props without changing the authored Fixed DSL. */
export function resolveThemeBindingsInWidget(
  widget: AppsmithWidgetDsl,
  properties: ThemeProperties,
): AppsmithWidgetDsl {
  let next: AppsmithWidgetDsl | null = null;
  for (const [key, value] of Object.entries(widget)) {
    // Each child is rendered independently; retaining the authored children
    // also avoids cloning an entire canvas for one theme-bound style.
    if (key === "children") continue;
    const resolved = resolveTree(value, properties);
    if (resolved !== value) {
      next ??= { ...widget };
      (next as Record<string, unknown>)[key] = resolved;
    }
  }
  return next ?? widget;
}
