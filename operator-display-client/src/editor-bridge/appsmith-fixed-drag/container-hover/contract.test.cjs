/* Run from operator-display-client: node src/editor-bridge/appsmith-fixed-drag/container-hover/contract.test.cjs */
const assert = require("node:assert/strict");
const path = require("node:path");
const esbuild = require("esbuild");

async function loadGate() {
  const build = await esbuild.build({
    entryPoints: [path.join(__dirname, "ContainerReflowGate.ts")],
    bundle: true,
    format: "cjs",
    platform: "node",
    write: false,
    logLevel: "silent",
  });
  const loaded = { exports: {} };
  new Function("module", "exports", "require", build.outputFiles[0].text)(
    loaded, loaded.exports, require,
  );
  return loaded.exports;
}

function fakeClock() {
  let now = 0;
  let nextId = 1;
  const tasks = new Map();
  return {
    set(callback, delayMs) {
      const id = nextId++;
      tasks.set(id, { at: now + delayMs, callback });
      return id;
    },
    clear(id) { tasks.delete(id); },
    advance(ms) {
      const end = now + ms;
      while (true) {
        const due = [...tasks].filter(([, task]) => task.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        tasks.delete(due[0]);
        due[1].callback();
      }
      now = end;
    },
    pending() { return tasks.size; },
  };
}

const container = {
  widgetId: "container-1", type: "CONTAINER_WIDGET",
  leftColumn: 12, topRow: 10, rightColumn: 32, bottomRow: 28,
};
const text = { ...container, widgetId: "text-1", type: "TEXT_WIDGET" };
const inside = { leftColumn: 15, topRow: 12, rightColumn: 22, bottomRow: 18 };
const shifted = { leftColumn: 16, topRow: 12, rightColumn: 23, bottomRow: 18 };
const outside = { leftColumn: 0, topRow: 0, rightColumn: 8, bottomRow: 6 };

async function main() {
  const { ContainerReflowGate, CONTAINER_REFLOW_DELAY_MS } = await loadGate();
  assert.equal(CONTAINER_REFLOW_DELAY_MS, 500);
  const clock = fakeClock();
  const gate = new ContainerReflowGate(clock);
  let activations = 0;
  const accept = () => { activations += 1; return true; };
  const sample = (target, occupied = [container], canvasId = "root", callback = accept) =>
    gate.sample({ canvasId, target, occupied }, callback);

  // Appsmith registers no timer for a pointer merely near a container, or
  // for collision with an ordinary widget.
  assert.equal(sample(outside), false);
  assert.equal(sample(inside, [text]), false);
  assert.equal(clock.pending(), 0);

  assert.equal(sample(inside), false);
  clock.advance(300);
  assert.equal(sample(inside, [container, text]), false);
  clock.advance(199);
  assert.equal(activations, 0);
  clock.advance(1);
  assert.equal(activations, 1, "same snapped rectangle keeps its original timer");
  assert.equal(sample(inside), true, "successful delayed reflow latches");
  assert.equal(sample(shifted), true, "the latch persists while colliding");
  assert.equal(sample(outside), false, "leaving all drop targets clears the latch");

  assert.equal(sample(inside), false);
  clock.advance(400);
  assert.equal(sample(shifted), false, "new snapped position resets the timer");
  clock.advance(499);
  assert.equal(activations, 1);
  clock.advance(1);
  assert.equal(activations, 2);
  sample(outside);

  // A rejected delayed reflow must not enable future container movement.
  let rejected = 0;
  assert.equal(sample(inside, [container], "root", () => {
    rejected += 1;
    return false;
  }), false);
  clock.advance(500);
  assert.equal(rejected, 1);
  assert.equal(sample(inside), false);
  clock.advance(500);
  assert.equal(activations, 2, "a failed attempt is not retried without movement");
  assert.equal(sample(shifted), false);
  clock.advance(500);
  assert.equal(activations, 3);
  sample(outside);

  // A change of canvas or drag session cancels a stale callback.
  assert.equal(sample(inside), false);
  clock.advance(250);
  assert.equal(sample(inside, [container], "nested"), false);
  clock.advance(250);
  assert.equal(activations, 3);
  gate.reset();
  clock.advance(500);
  assert.equal(activations, 3);
  assert.equal(clock.pending(), 0);

  assert.equal(sample(inside, [{ ...container, type: "STATBOX_WIDGET" }]), false);
  clock.advance(500);
  assert.equal(activations, 4, "Statbox widgets are also Appsmith drop targets");
  sample(outside);

  // Appsmith's checkIsDropTarget reads the widget config's isCanvas flag.
  // Tabs, Modal, and List V2 are canvas widgets too. The normal drag caller
  // excludes detached Modal widgets from its occupied spaces, and List V2's
  // generated template remains a separate noneditable child canvas.
  for (const [type, expected] of [["TABS_WIDGET", 5], ["MODAL_WIDGET", 6],
    ["LIST_WIDGET_V2", 7]]) {
    assert.equal(sample(inside, [{ ...container, type }]), false);
    assert.equal(clock.pending(), 1, `${type} registers one delayed retry`);
    clock.advance(499);
    assert.equal(activations, expected - 1);
    clock.advance(1);
    assert.equal(activations, expected, `${type} is an Appsmith canvas drop target`);
    sample(outside);
  }
  console.log("Appsmith container reflow gate contract passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
