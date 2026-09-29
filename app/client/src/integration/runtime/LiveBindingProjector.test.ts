import { exampleDashboardDocument } from "../document";
import { LiveBindingProjector } from "./LiveBindingProjector";

const fixture = () => JSON.parse(JSON.stringify(exampleDashboardDocument));
const variableId = "18446744073709551615";
const projector = () =>
  new LiveBindingProjector(fixture(), "cell-A", [
    { key: "engineSpeed", id: variableId },
  ]);
const sample = (timestampMs: number, value: number) => ({
  cellId: "cell-A",
  variableId,
  unitCode: 16,
  timestampMs,
  value,
});

describe("transient live binding projection", () => {
  it("updates the text and chart while leaving the saved document unchanged", () => {
    const document = fixture();
    const before = JSON.stringify(document);
    const run = new LiveBindingProjector(document, "cell-A", [
      { key: "engineSpeed", id: variableId },
    ]);
    const updates = run.accept(sample(Date.UTC(2026, 0, 1), 1234.4));

    expect(updates).toEqual([
      {
        widgetId: "engine-speed-value",
        propertyPath: "text",
        value: "1234 rpm",
      },
      {
        widgetId: "engine-speed-chart",
        propertyPath: "chartData.speedSeries.data",
        value: [{ x: "2026-01-01T00:00:00.000Z", y: 1234.4 }],
      },
    ]);
    expect(JSON.stringify(document)).toBe(before);
  });

  it("isolates selected cell, full uint64 ID, and unit code", () => {
    const run = projector();

    expect(run.accept({ ...sample(1000, 1), cellId: "cell-B" })).toEqual([]);
    expect(run.accept({ ...sample(1000, 1), variableId: "1" })).toEqual([]);
    expect(run.accept({ ...sample(1000, 1), unitCode: 17 })).toEqual([]);
    expect(run.accept(sample(1000, 1))).toHaveLength(2);
  });

  it("bounds history by time and point count, and ignores older samples", () => {
    const document = fixture();

    document.bindings[1].presentation.maxPoints = 2;
    document.bindings[1].presentation.windowSeconds = 2;
    const run = new LiveBindingProjector(document, "cell-A", [
      { key: "engineSpeed", id: variableId },
    ]);

    run.accept(sample(1000, 1));
    run.accept(sample(2000, 2));
    const latest = run.accept(sample(4000, 4));

    expect(latest[1].value).toEqual([
      { x: "1970-01-01T00:00:02.000Z", y: 2 },
      { x: "1970-01-01T00:00:04.000Z", y: 4 },
    ]);
    expect(run.accept(sample(3000, 3))).toEqual([]);
    expect(run.accept(sample(4000, 5))[1].value).toEqual([
      { x: "1970-01-01T00:00:02.000Z", y: 2 },
      { x: "1970-01-01T00:00:04.000Z", y: 5 },
    ]);
  });

  it("rejects unresolved variables and invalid sample types", () => {
    expect(() => new LiveBindingProjector(fixture(), "cell-A", [])).toThrow(
      "was not resolved",
    );
    expect(() =>
      projector().accept({ ...sample(1000, 1), value: NaN }),
    ).toThrow("type does not match");
  });
});
