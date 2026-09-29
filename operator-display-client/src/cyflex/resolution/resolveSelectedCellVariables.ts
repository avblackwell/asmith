import type { DashboardDocument } from "../../document";
import { parseDashboardDocument } from "../../document";
import type { MarketplaceTestCell } from "../../api/types";
import type { CyflexProxyClient } from "../CyflexProxyClient";
import { deriveStreamRequirements } from "../session/requirements";
import type { ResolvedCyflexVariable } from "../session/requirements";

export const CYFLEX_VARIABLES_ACCEPT = "variables/json_all+output+v1";
export const CYFLEX_INFO_ACCEPT = "cyflex/json_info+output+v1";

const UINT64_MAX = BigInt("18446744073709551615");

type CellMetadataClient = Pick<
  CyflexProxyClient,
  "getTestCell" | "proxyTestCellRequest"
>;

export interface CyflexVariableMetadata {
  id: string;
  label: string;
}

export interface SelectedCellVariableList {
  cell: MarketplaceTestCell;
  variables: CyflexVariableMetadata[];
}

export interface SelectedCellVariableResolution {
  cell: MarketplaceTestCell;
  subject: string;
  resolvedVariables: ResolvedCyflexVariable[];
}

export class CyflexVariableResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CyflexVariableResolutionError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * JSON.parse rounds raw uint64 numbers. Quote only JSON integer tokens named
 * `id` while scanning around strings and escapes; all other JSON is untouched.
 */
function preserveIdNumbers(json: string): string {
  let output = "";
  let copiedThrough = 0;

  for (let i = 0; i < json.length; i++) {
    if (json[i] !== '"') continue;

    const stringStart = i;

    i++;

    while (i < json.length) {
      if (json[i] === "\\") {
        i += 2;
      } else if (json[i] === '"') {
        break;
      } else {
        i++;
      }
    }

    if (i >= json.length) break; // JSON.parse reports the malformed string.

    const stringEnd = i + 1;
    let key: unknown;

    try {
      key = JSON.parse(json.slice(stringStart, stringEnd));
    } catch {
      continue; // JSON.parse reports malformed escapes later.
    }

    if (key !== "id") continue;

    let colon = stringEnd;

    while (/\s/.test(json[colon] ?? "")) colon++;

    if (json[colon] !== ":") continue;

    let numberStart = colon + 1;

    while (/\s/.test(json[numberStart] ?? "")) numberStart++;

    let numberEnd = numberStart;

    while (/[0-9]/.test(json[numberEnd] ?? "")) numberEnd++;

    const token = json.slice(numberStart, numberEnd);

    if (
      !/^(0|[1-9]\d*)$/.test(token) ||
      !/[\s,}\]]/.test(json[numberEnd] ?? "")
    ) {
      continue;
    }

    output += `${json.slice(copiedThrough, numberStart)}"${token}"`;
    copiedThrough = numberEnd;
    i = numberEnd - 1;
  }

  return output + json.slice(copiedThrough);
}

function parseId(value: unknown): string {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) {
    throw new CyflexVariableResolutionError(
      "Cyflex variable metadata contains an invalid decimal ID",
    );
  }

  if (BigInt(value) > UINT64_MAX) {
    throw new CyflexVariableResolutionError(
      "Cyflex variable metadata contains an ID outside uint64 range",
    );
  }

  return value;
}

function parseMetadata(body: string): CyflexVariableMetadata[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(preserveIdNumbers(body));
  } catch {
    throw new CyflexVariableResolutionError(
      "Cyflex variable metadata is not valid JSON",
    );
  }

  if (!isRecord(parsed)) {
    throw new CyflexVariableResolutionError(
      "Cyflex variable metadata must be a JSON object",
    );
  }

  if (typeof parsed.error === "string" && parsed.error.trim()) {
    throw new CyflexVariableResolutionError(parsed.error);
  }

  if (!Array.isArray(parsed.variables)) {
    throw new CyflexVariableResolutionError(
      "Cyflex variable metadata needs a variables array",
    );
  }

  return parsed.variables.map((entry: unknown, index: number) => {
    if (
      !isRecord(entry) ||
      typeof entry.label !== "string" ||
      !entry.label.trim()
    ) {
      throw new CyflexVariableResolutionError(
        `Cyflex variable metadata entry ${index} has no label`,
      );
    }

    return { id: parseId(entry.id), label: entry.label };
  });
}

function validateUnambiguousMetadata(metadata: CyflexVariableMetadata[]): {
  byId: Map<string, CyflexVariableMetadata>;
  byLabel: Map<string, CyflexVariableMetadata>;
} {
  const byId = new Map<string, CyflexVariableMetadata>();
  const byLabel = new Map<string, CyflexVariableMetadata>();

  for (const entry of metadata) {
    const existingId = byId.get(entry.id);
    const existingLabel = byLabel.get(entry.label);

    if (
      (existingId && existingId.label !== entry.label) ||
      (existingLabel && existingLabel.id !== entry.id)
    ) {
      throw new CyflexVariableResolutionError(
        `Cyflex variable metadata has an ambiguous ID or label: ${entry.label}`,
      );
    }

    byId.set(entry.id, entry);
    byLabel.set(entry.label, entry);
  }

  return { byId, byLabel };
}

function validateSoftwareId(softwareId: number): void {
  if (!Number.isSafeInteger(softwareId) || softwareId <= 0) {
    throw new TypeError(
      "Test cell software ID must be a positive safe integer",
    );
  }
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted", "AbortError");
  }
}

async function getSelectedCell(
  marketplace: CellMetadataClient,
  softwareId: number,
  signal?: AbortSignal,
): Promise<MarketplaceTestCell> {
  assertNotAborted(signal);
  const cell = await marketplace.getTestCell(softwareId, signal);

  assertNotAborted(signal);

  if (cell.id !== softwareId) {
    throw new CyflexVariableResolutionError(
      "Selected test cell ID does not match the marketplace response",
    );
  }

  return cell;
}

async function getVariableMetadata(
  marketplace: CellMetadataClient,
  softwareId: number,
  signal?: AbortSignal,
): Promise<{
  variables: CyflexVariableMetadata[];
  byId: Map<string, CyflexVariableMetadata>;
  byLabel: Map<string, CyflexVariableMetadata>;
}> {
  assertNotAborted(signal);
  const response = await marketplace.proxyTestCellRequest(softwareId, {
    method: "GET",
    path: "cyflex/variables",
    accept: CYFLEX_VARIABLES_ACCEPT,
    signal,
  });

  assertNotAborted(signal);

  if (!response.ok) {
    throw new CyflexVariableResolutionError(
      `Cyflex variable metadata request failed with HTTP ${response.status}`,
    );
  }

  const body = await response.text();

  assertNotAborted(signal);
  const metadata = parseMetadata(body);
  const { byId, byLabel } = validateUnambiguousMetadata(metadata);

  return { variables: Array.from(byId.values()), byId, byLabel };
}

/**
 * List the variables visible through an authorized marketplace test cell.
 * IDs are returned as exact decimal strings, including raw JSON uint64 values.
 */
export async function listSelectedCellVariables(
  marketplace: CellMetadataClient,
  softwareId: number,
  signal?: AbortSignal,
): Promise<SelectedCellVariableList> {
  validateSoftwareId(softwareId);
  const cell = await getSelectedCell(marketplace, softwareId, signal);
  const { variables } = await getVariableMetadata(
    marketplace,
    softwareId,
    signal,
  );

  return { cell, variables };
}

function parseSubject(body: string): string {
  let parsed: unknown;

  try {
    parsed = JSON.parse(body);
  } catch {
    throw new CyflexVariableResolutionError("Cyflex info is not valid JSON");
  }

  if (!isRecord(parsed)) {
    throw new CyflexVariableResolutionError(
      "Cyflex info must be a JSON object",
    );
  }

  if (typeof parsed.error === "string" && parsed.error.trim()) {
    throw new CyflexVariableResolutionError(parsed.error);
  }

  // The supplied backend references jsonlabels::STREAM_SUBJECT, but that
  // constant's literal spelling is in an unavailable external header.
  const candidates = [
    parsed.stream_subject,
    parsed.streaming_subject,
    parsed.STREAM_SUBJECT,
  ].filter((value): value is string => typeof value === "string");

  if (candidates.length === 0 || new Set(candidates).size !== 1) {
    throw new CyflexVariableResolutionError(
      "Cyflex info has no unambiguous stream subject",
    );
  }

  const subject = candidates[0];

  if (
    !subject.startsWith("global.streaming.") ||
    subject.split(".").some((token) => token.length === 0) ||
    /[*>{}\s]/.test(subject)
  ) {
    throw new CyflexVariableResolutionError(
      "Cyflex info contains an invalid exact stream subject",
    );
  }

  return subject;
}

/**
 * Resolve only variables used by bindings against a selected, authorized cell.
 * The Java proxy checks cell access; this also fetches the selected cell's
 * identity through the marketplace API before reading its Cyflex metadata.
 */
export async function resolveSelectedCellVariables(
  marketplace: CellMetadataClient,
  softwareId: number,
  input: DashboardDocument,
  signal?: AbortSignal,
): Promise<SelectedCellVariableResolution> {
  validateSoftwareId(softwareId);

  const document = parseDashboardDocument(input);
  const boundKeys = new Set(
    document.bindings.map((binding) => binding.variableKey),
  );

  if (boundKeys.size === 0) {
    throw new CyflexVariableResolutionError(
      "Run requires at least one bound Cyflex variable",
    );
  }

  const cell = await getSelectedCell(marketplace, softwareId, signal);

  const infoResponse = await marketplace.proxyTestCellRequest(softwareId, {
    method: "GET",
    path: "cyflex",
    accept: CYFLEX_INFO_ACCEPT,
    signal,
  });

  if (!infoResponse.ok) {
    throw new CyflexVariableResolutionError(
      `Cyflex info request failed with HTTP ${infoResponse.status}`,
    );
  }

  const subject = parseSubject(await infoResponse.text());

  const { byId, byLabel } = await getVariableMetadata(
    marketplace,
    softwareId,
    signal,
  );

  const resolvedVariables: ResolvedCyflexVariable[] = [];

  for (const declaration of document.variables) {
    if (!boundKeys.has(declaration.key)) continue;

    const selector = declaration.selector;
    const entry =
      selector.kind === "cyflexId"
        ? byId.get(selector.id)
        : byLabel.get(selector.name);

    if (!entry) {
      throw new CyflexVariableResolutionError(
        `Variable ${declaration.key} was not found on test cell ${cell.name}`,
      );
    }

    resolvedVariables.push({
      key: declaration.key,
      id: entry.id,
      label: entry.label,
    });
  }

  deriveStreamRequirements(document, resolvedVariables);

  return { cell, subject, resolvedVariables };
}
