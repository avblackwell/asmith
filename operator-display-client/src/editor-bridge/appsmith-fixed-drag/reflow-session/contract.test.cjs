/* Run from operator-display-client: node src/editor-bridge/appsmith-fixed-drag/reflow-session/contract.test.cjs */
const assert = require("node:assert/strict");
const path = require("node:path");
const esbuild = require("esbuild");

async function loadModule(entry) {
  const build = await esbuild.build({
    entryPoints: [entry],
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
  };
}

const gridProps = {
  parentColumnSpace: 10,
  parentRowSpace: 10,
  maxGridColumns: 64,
};
const original = { id: "dragged", left: 0, top: 0, right: 8, bottom: 4 };
const at = (left) => ({ ...original, left, right: left + 8 });
const text = (id, left) => ({
  id, left, right: left + 8, top: 0, bottom: 4,
  type: "TEXT_WIDGET", isDropTarget: false,
});

async function main() {
  const { AppsmithReflowSession } = await loadModule(path.join(__dirname, "index.ts"));
  const { ContainerReflowGate } = await loadModule(path.join(
    __dirname, "../container-hover/ContainerReflowGate.ts",
  ));
  const direction = "RIGHT";
  const session = new AppsmithReflowSession();
  session.begin({
    canvasId: "root",
    originalPositions: [original],
    occupiedSpaces: [text("a", 12), text("b", 20)],
    gridProps,
  });
  const first = session.sample({
    canvasId: "root", positions: [at(12)], direction,
    shouldSkipContainerReflow: true,
  });
  assert.equal(first.movementMap.a.X, 80);
  assert.equal(first.movementMap.b.X, 80,
    "the first sibling collision pushes the second-order sibling too");
  assert.equal(first.shouldRegisterContainerTimeout, false);
  const second = session.sample({
    canvasId: "root", positions: [at(16)], direction,
    shouldSkipContainerReflow: true,
  });
  assert.equal(second.movementMap.a.X, 120);
  assert.equal(second.movementMap.b.X, 120);
  const turn = session.sample({
    canvasId: "root", positions: [at(14)], direction,
    shouldSkipContainerReflow: true,
  });
  assert.equal(turn.movementMap.a.X, 100,
    "reversing the pointer unwinds the previous displacement");
  assert.equal(turn.movementMap.b.X, 100);
  const back = session.sample({
    canvasId: "root", positions: [at(0)], direction: "LEFT",
    shouldSkipContainerReflow: true,
  });
  assert.deepEqual(back.movementMap, {}, "leaving the collision clears reflow");
  assert.equal(back.spacePositionMap.dragged.left, 0);

  const container = {
    id: "container", left: 12, right: 32, top: 0, bottom: 20,
    type: "CONTAINER_WIDGET", isDropTarget: true,
  };
  session.begin({ canvasId: "root", originalPositions: [original],
    occupiedSpaces: [container], gridProps });
  const blocked = session.sample({ canvasId: "root", positions: [at(16)],
    direction, shouldSkipContainerReflow: true });
  assert.deepEqual(blocked.movementMap, {});
  assert.equal(blocked.movementLimitMap.dragged.canHorizontalMove, false);
  assert.equal(blocked.shouldRegisterContainerTimeout, true);
  assert.equal(blocked.spacePositionMap.dragged.right, 18,
    "before the delay, Appsmith shrinks the dragged block against the container");
  const clock = fakeClock();
  const gate = new ContainerReflowGate(clock);
  let delayed;
  const sampleGate = () => gate.sample({ canvasId: "root",
    target: { leftColumn: 16, topRow: 0, rightColumn: 24, bottomRow: 4 },
    occupied: [{ widgetId: "container", type: "CONTAINER_WIDGET",
      leftColumn: 12, topRow: 0, rightColumn: 32, bottomRow: 20 }],
  }, () => {
    delayed = session.activateContainerReflow("root");
    return !!delayed;
  });
  assert.equal(sampleGate(), false);
  clock.advance(499);
  assert.equal(delayed, undefined, "a stationary container collision waits 500 ms");
  assert.equal(sampleGate(), false, "the same snapped cell preserves its timer");
  clock.advance(1);
  assert.equal(delayed.movementMap.container.X, 120);
  assert.equal(sampleGate(), true);
  assert.equal(session.activateContainerReflow("root"), undefined,
    "the same stationary sample can only activate once");
  const after = session.sample({ canvasId: "root", positions: [at(17)],
    direction, shouldSkipContainerReflow: true });
  assert.equal(after.movementMap.container.X, 130,
    "container movement stays enabled during the same collision");
  const leave = session.sample({ canvasId: "root", positions: [at(0)],
    direction: "LEFT", shouldSkipContainerReflow: true });
  assert.deepEqual(leave.movementMap, {});
  const reenter = session.sample({ canvasId: "root", positions: [at(16)],
    direction, shouldSkipContainerReflow: true });
  assert.deepEqual(reenter.movementMap, {},
    "exiting the container clears the delayed-reflow latch");
  assert.equal(reenter.shouldRegisterContainerTimeout, true);

  const secondSelected = {
    id: "dragged-2", left: 0, right: 8, top: 6, bottom: 10,
  };
  session.begin({ canvasId: "root", originalPositions: [original, secondSelected],
    occupiedSpaces: [text("a", 12)], gridProps });
  const group = session.sample({ canvasId: "root",
    positions: [at(12), { ...secondSelected, left: 12, right: 20 }],
    direction, shouldSkipContainerReflow: true });
  assert.equal(group.movementMap.a.X, 80);
  assert.deepEqual(Object.keys(group.movementLimitMap).sort(),
    ["dragged", "dragged-2"], "each selected block has its own movement limit");
  assert.equal(group.bottomMostRow, 10);
  const groupBack = session.sample({ canvasId: "root",
    positions: [original, secondSelected], direction: "LEFT",
    shouldSkipContainerReflow: true });
  assert.deepEqual(groupBack.movementMap, {});

  assert.throws(() => session.sample({ canvasId: "other", positions: [at(0)],
    direction }), /Begin an Appsmith reflow session/);
  assert.equal(session.canvasId, undefined);
  session.begin({ canvasId: "other", originalPositions: [original],
    occupiedSpaces: [text("a", 12)], gridProps });
  const newCanvas = session.sample({ canvasId: "other", positions: [at(12)],
    direction, shouldSkipContainerReflow: true });
  assert.equal(newCanvas.movementMap.a.X, 80,
    "new canvas uses its own collision history");
  session.reset();
  assert.equal(session.canvasId, undefined);
  console.log("Appsmith reflow session contract passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
