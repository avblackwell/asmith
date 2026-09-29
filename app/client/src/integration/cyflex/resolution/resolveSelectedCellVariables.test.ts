import { exampleDashboardDocument } from "../../document";
import type { DashboardDocument } from "../../document";
import type { MarketplaceClient, MarketplaceTestCell } from "../../marketplace";
import {
  CYFLEX_INFO_ACCEPT,
  CYFLEX_VARIABLES_ACCEPT,
  CyflexVariableResolutionError,
  listSelectedCellVariables,
  resolveSelectedCellVariables,
} from "./resolveSelectedCellVariables";

const softwareId = 6;
const uint64Id = "18446744073709551615";
const subject = "global.streaming.TEST.sitehash";

const cell: MarketplaceTestCell = {
  id: softwareId,
  name: "Test cell 6",
  site: { oid: 3, name: "TEST" },
  state: null,
};

function document(): DashboardDocument {
  return JSON.parse(JSON.stringify(exampleDashboardDocument));
}

function response(text: string, status = 200): Response {
  return new Response(text, { status });
}

function fixture(
  variablesBody = `{"go_time":123,"variables":[{"id":${uint64Id},"label":"ENGINE_SPEED","unit_code":16}]}`,
  infoBody = JSON.stringify({ stream_subject: subject }),
) {
  const getTestCell = jest.fn(async () => cell);
  const proxyTestCellRequest = jest
    .fn()
    .mockResolvedValueOnce(response(infoBody))
    .mockResolvedValueOnce(response(variablesBody));
  const marketplace = {
    getTestCell,
    proxyTestCellRequest,
  } as unknown as Pick<
    MarketplaceClient,
    "getTestCell" | "proxyTestCellRequest"
  >;

  return { getTestCell, marketplace, proxyTestCellRequest };
}

function listFixture(
  variablesBody = `{"variables":[{"id":${uint64Id},"label":"ENGINE_SPEED"}]}`,
  status = 200,
) {
  const getTestCell = jest.fn(async () => cell);
  const proxyTestCellRequest = jest.fn(async () =>
    response(variablesBody, status),
  );
  const marketplace = {
    getTestCell,
    proxyTestCellRequest,
  } as unknown as Pick<
    MarketplaceClient,
    "getTestCell" | "proxyTestCellRequest"
  >;

  return { getTestCell, marketplace, proxyTestCellRequest };
}

describe("selected-cell Cyflex variable listing", () => {
  it("lists authorized cell variables with exact uint64 IDs and passes the abort signal", async () => {
    const f = listFixture(
      `{"variables":[{"id":${uint64Id},"label":"ENGINE_SPEED"},{"id":"7","label":"PRESSURE"}]}`,
    );
    const signal = new AbortController().signal;

    await expect(
      listSelectedCellVariables(f.marketplace, softwareId, signal),
    ).resolves.toEqual({
      cell,
      variables: [
        { id: uint64Id, label: "ENGINE_SPEED" },
        { id: "7", label: "PRESSURE" },
      ],
    });
    expect(f.getTestCell).toHaveBeenCalledWith(softwareId, signal);
    expect(f.proxyTestCellRequest).toHaveBeenCalledWith(softwareId, {
      method: "GET",
      path: "cyflex/variables",
      accept: CYFLEX_VARIABLES_ACCEPT,
      signal,
    });
    expect(f.getTestCell.mock.invocationCallOrder[0]).toBeLessThan(
      f.proxyTestCellRequest.mock.invocationCallOrder[0],
    );
  });

  it("collapses duplicate identical records and rejects conflicting IDs or labels", async () => {
    const duplicate = listFixture(
      '{"variables":[{"id":7,"label":"PRESSURE"},{"id":"7","label":"PRESSURE"}]}',
    );

    await expect(
      listSelectedCellVariables(duplicate.marketplace, softwareId),
    ).resolves.toEqual({
      cell,
      variables: [{ id: "7", label: "PRESSURE" }],
    });

    for (const body of [
      '{"variables":[{"id":7,"label":"PRESSURE"},{"id":7,"label":"TEMPERATURE"}]}',
      '{"variables":[{"id":7,"label":"PRESSURE"},{"id":8,"label":"PRESSURE"}]}',
    ]) {
      const f = listFixture(body);

      await expect(
        listSelectedCellVariables(f.marketplace, softwareId),
      ).rejects.toThrow("ambiguous ID or label");
    }
  });

  it("rejects invalid responses, uint64 overflow, application errors, and HTTP failures", async () => {
    for (const body of [
      "not JSON",
      "[]",
      '{"variables":null}',
      '{"variables":[{"id":7,"label":""}]}',
      '{"variables":[{"id":18446744073709551616,"label":"PRESSURE"}]}',
      '{"error":"VariableManager is null"}',
    ]) {
      const f = listFixture(body);

      await expect(
        listSelectedCellVariables(f.marketplace, softwareId),
      ).rejects.toBeInstanceOf(CyflexVariableResolutionError);
    }

    const failed = listFixture("", 502);

    await expect(
      listSelectedCellVariables(failed.marketplace, softwareId),
    ).rejects.toThrow("HTTP 502");
  });

  it("rejects an invalid or mismatched cell before requesting Cyflex metadata", async () => {
    const f = listFixture();

    await expect(listSelectedCellVariables(f.marketplace, 0)).rejects.toThrow(
      "positive safe integer",
    );
    expect(f.getTestCell).not.toHaveBeenCalled();

    f.getTestCell.mockResolvedValueOnce({ ...cell, id: softwareId + 1 });
    await expect(
      listSelectedCellVariables(f.marketplace, softwareId),
    ).rejects.toThrow("does not match");
    expect(f.proxyTestCellRequest).not.toHaveBeenCalled();
  });

  it("propagates abort errors without requesting or parsing more data", async () => {
    const f = listFixture();
    const signal = new AbortController().signal;
    const abortError = new Error("Aborted");

    abortError.name = "AbortError";
    f.getTestCell.mockRejectedValueOnce(abortError);
    await expect(
      listSelectedCellVariables(f.marketplace, softwareId, signal),
    ).rejects.toBe(abortError);
    expect(f.proxyTestCellRequest).not.toHaveBeenCalled();

    f.proxyTestCellRequest.mockRejectedValueOnce(abortError);
    await expect(
      listSelectedCellVariables(f.marketplace, softwareId, signal),
    ).rejects.toBe(abortError);
  });

  it("does not request variable metadata after a cell lookup is aborted", async () => {
    const f = listFixture();
    const controller = new AbortController();

    f.getTestCell.mockImplementationOnce(async () => {
      controller.abort();

      return cell;
    });
    await expect(
      listSelectedCellVariables(f.marketplace, softwareId, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(f.proxyTestCellRequest).not.toHaveBeenCalled();
  });
});

describe("selected-cell Cyflex resolution", () => {
  it("preserves uint64 JSON numbers and resolves the exact selected-cell subject", async () => {
    const f = fixture();
    const signal = new AbortController().signal;

    await expect(
      resolveSelectedCellVariables(
        f.marketplace,
        softwareId,
        document(),
        signal,
      ),
    ).resolves.toEqual({
      cell,
      subject,
      resolvedVariables: [
        { key: "engineSpeed", id: uint64Id, label: "ENGINE_SPEED" },
      ],
    });
    expect(f.getTestCell).toHaveBeenCalledWith(softwareId, signal);
    expect(f.proxyTestCellRequest).toHaveBeenNthCalledWith(1, softwareId, {
      method: "GET",
      path: "cyflex",
      accept: CYFLEX_INFO_ACCEPT,
      signal,
    });
    expect(f.proxyTestCellRequest).toHaveBeenNthCalledWith(2, softwareId, {
      method: "GET",
      path: "cyflex/variables",
      accept: CYFLEX_VARIABLES_ACCEPT,
      signal,
    });
  });

  it("resolves direct IDs to the cell's actual label", async () => {
    const input = document();

    input.variables[0].selector = { kind: "cyflexId", id: uint64Id };
    const f = fixture();

    const result = await resolveSelectedCellVariables(
      f.marketplace,
      softwareId,
      input,
    );

    expect(result.resolvedVariables).toEqual([
      { key: "engineSpeed", id: uint64Id, label: "ENGINE_SPEED" },
    ]);
  });

  it("ignores unbound declarations and accepts quoted IDs and info key aliases", async () => {
    const input = document();

    input.variables.push({
      key: "unused",
      label: "Unused",
      selector: { kind: "logicalName", name: "ABSENT" },
      valueType: "number",
    });
    const f = fixture(
      `{"variables":[{"id":"${uint64Id}","label":"ENGINE_SPEED"}]}`,
      JSON.stringify({ streaming_subject: subject }),
    );

    const result = await resolveSelectedCellVariables(
      f.marketplace,
      softwareId,
      input,
    );

    expect(result.resolvedVariables).toHaveLength(1);
  });

  it("rejects missing, ambiguous, or wildcard subjects before fetching variables", async () => {
    for (const info of [
      { site: "TEST" },
      { stream_subject: subject, streaming_subject: `${subject}.other` },
      { stream_subject: "global.streaming.TEST.*" },
    ]) {
      const f = fixture(undefined, JSON.stringify(info));

      await expect(
        resolveSelectedCellVariables(f.marketplace, softwareId, document()),
      ).rejects.toBeInstanceOf(CyflexVariableResolutionError);
      expect(f.proxyTestCellRequest).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects ambiguous labels and IDs instead of choosing a variable", async () => {
    const f = fixture(
      `{"variables":[{"id":${uint64Id},"label":"ENGINE_SPEED"},{"id":7,"label":"ENGINE_SPEED"}]}`,
    );

    await expect(
      resolveSelectedCellVariables(f.marketplace, softwareId, document()),
    ).rejects.toThrow("ambiguous ID or label");
  });

  it("rejects missing variables, out-of-range IDs, and Cyflex application errors", async () => {
    for (const body of [
      '{"variables":[]}',
      '{"variables":[{"id":18446744073709551616,"label":"ENGINE_SPEED"}]}',
      '{"error":"VariableManager is null"}',
    ]) {
      const f = fixture(body);

      await expect(
        resolveSelectedCellVariables(f.marketplace, softwareId, document()),
      ).rejects.toBeInstanceOf(CyflexVariableResolutionError);
    }
  });

  it("does not call the proxy for an invalid or mismatched selected cell", async () => {
    const f = fixture();

    await expect(
      resolveSelectedCellVariables(f.marketplace, 0, document()),
    ).rejects.toThrow("positive safe integer");
    expect(f.getTestCell).not.toHaveBeenCalled();

    f.getTestCell.mockResolvedValueOnce({ ...cell, id: 7 });
    await expect(
      resolveSelectedCellVariables(f.marketplace, softwareId, document()),
    ).rejects.toThrow("does not match");
    expect(f.proxyTestCellRequest).not.toHaveBeenCalled();
  });

  it("does not issue cell requests for a dashboard with no bindings", async () => {
    const input = document();

    input.bindings = [];
    const f = fixture();

    await expect(
      resolveSelectedCellVariables(f.marketplace, softwareId, input),
    ).rejects.toThrow("at least one bound Cyflex variable");
    expect(f.getTestCell).not.toHaveBeenCalled();
  });
});
