/* Browser check for the stock Appsmith canvas drag and resize interactions. */
const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");

const baseUrl = process.env.STANDALONE_URL || "http://127.0.0.1:3002";

function widgetsIn(document) {
  const widgets = [];

  function visit(widget) {
    widgets.push(widget);
    widget.children?.forEach(visit);
  }

  visit(document.layout.dsl);

  return widgets;
}

async function exportDocument(page) {
  const pendingDownload = page.waitForEvent("download");

  await page.getByTestId("t--standalone-export").click();

  const download = await pendingDownload;
  let json = "";

  for await (const chunk of await download.createReadStream()) {
    json += chunk.toString();
  }

  return JSON.parse(json);
}

function widgetById(document, widgetId) {
  const widget = widgetsIn(document).find(
    (entry) => entry.widgetId === widgetId,
  );

  assert.ok(widget, `Widget ${widgetId} is missing from the exported DSL`);

  return widget;
}

async function moveMouse(page, from, to, steps = 24) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

async function main() {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome",
    headless: true,
  });

  try {
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1440, height: 1300 },
    });
    const page = await context.newPage();
    const pageErrors = [];

    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`${baseUrl}/standalone`, {
      waitUntil: "domcontentloaded",
    });
    await page.locator("#engine-speed-card").waitFor();

    const workbench = await page.evaluate(() => {
      const palette = document.querySelector(".standalone-editor__palette");
      const canvas = document.querySelector(".standalone-editor__canvas");
      const properties = document.querySelector(
        ".standalone-editor__properties",
      );

      if (!palette || !canvas || !properties) return null;

      const paletteBounds = palette.getBoundingClientRect();
      const canvasBounds = canvas.getBoundingClientRect();
      const propertiesBounds = properties.getBoundingClientRect();
      const cards = ["textwidget", "chartwidget", "containerwidget"].map(
        (kind) => {
          const card = palette.querySelector(
            `.t--widget-card-draggable-${kind}`,
          );
          const bounds = card?.getBoundingClientRect();

          return {
            kind,
            present: Boolean(card),
            withinPalette:
              Boolean(bounds) &&
              bounds.left >= paletteBounds.left &&
              bounds.right <= paletteBounds.right,
            draggable: card?.getAttribute("draggable") === "true",
          };
        },
      );

      return {
        palette: { left: paletteBounds.left, right: paletteBounds.right },
        canvas: { left: canvasBounds.left, right: canvasBounds.right },
        properties: {
          left: propertiesBounds.left,
          right: propertiesBounds.right,
        },
        cards,
      };
    });

    assert.ok(workbench, "The three workbench regions are missing");
    assert.deepEqual(
      workbench.cards.map((card) => card.kind),
      ["textwidget", "chartwidget", "containerwidget"],
    );
    assert.ok(
      workbench.palette.right <= workbench.canvas.left + 1 &&
        workbench.canvas.right <= workbench.properties.left + 1,
      `Workbench columns are out of order: ${JSON.stringify(workbench)}`,
    );
    assert.ok(
      workbench.cards.every(
        (card) => card.present && card.withinPalette && card.draggable,
      ),
      `Palette cards are missing or outside the left rail: ${JSON.stringify(workbench.cards)}`,
    );

    if (process.env.WORKBENCH_SCREENSHOT) {
      await page.screenshot({ path: process.env.WORKBENCH_SCREENSHOT });
    }

    const canvasBox = await page
      .locator(".standalone-editor__canvas")
      .boundingBox();

    assert.ok(canvasBox);

    const initial = await exportDocument(page);
    const initialCard = widgetById(initial, "engine-speed-card");
    const initialTextIds = new Set(
      widgetsIn(initial)
        .filter((widget) => widget.type === "TEXT_WIDGET")
        .map((widget) => widget.widgetId),
    );

    // Click the container's border so its child Text widgets do not take selection.
    await page.locator("#engine-speed-card").click({
      force: true,
      position: { x: 5, y: 5 },
    });
    await page.getByTestId("t--workbench-live-data-tab").click();
    await page.getByTestId("t--binding-selected-widget-id").waitFor();
    assert.equal(
      await page.getByTestId("t--binding-selected-widget-id").textContent(),
      "engine-speed-card",
    );

    const cardDragSurface = page.locator(
      "#engine-speed-card .t--draggable-containerwidget",
    );
    const initialBox = await cardDragSurface.boundingBox();

    assert.ok(initialBox);
    await cardDragSurface.hover({ force: true, position: { x: 5, y: 5 } });
    await moveMouse(
      page,
      { x: initialBox.x + 5, y: initialBox.y + 5 },
      {
        x: Math.min(canvasBox.x + canvasBox.width - 90, initialBox.x + 130),
        y: Math.min(canvasBox.y + canvasBox.height - 130, 720),
      },
    );

    const moved = await exportDocument(page);
    const movedCard = widgetById(moved, "engine-speed-card");

    assert.ok(
      movedCard.topRow > initialCard.topRow,
      "Widget did not move down",
    );
    assert.ok(
      movedCard.leftColumn > initialCard.leftColumn,
      "Widget did not move right",
    );

    const resizeHandle = page
      .locator(
        '#engine-speed-card [data-testid="t--resizable-handle-undefined"]',
      )
      .nth(2);
    await resizeHandle.scrollIntoViewIfNeeded();
    const handleBox = await resizeHandle.boundingBox();

    assert.ok(handleBox, "Bottom-right resize handle is missing");

    const handleCenter = {
      x: handleBox.x + handleBox.width / 2,
      y: handleBox.y + handleBox.height / 2,
    };

    await moveMouse(page, handleCenter, {
      x: handleCenter.x + 75,
      y: handleCenter.y + 60,
    });

    const resized = await exportDocument(page);
    const resizedCard = widgetById(resized, "engine-speed-card");

    assert.ok(
      resizedCard.rightColumn - resizedCard.leftColumn >
        movedCard.rightColumn - movedCard.leftColumn,
      "Widget width did not increase",
    );
    assert.ok(
      resizedCard.bottomRow - resizedCard.topRow >
        movedCard.bottomRow - movedCard.topRow,
      "Widget height did not increase",
    );

    const textCard = page.locator(
      ".standalone-editor__palette .t--widget-card-draggable-textwidget",
    );
    const textCardBox = await textCard.boundingBox();

    assert.ok(textCardBox);
    await moveMouse(
      page,
      {
        x: textCardBox.x + textCardBox.width / 2,
        y: textCardBox.y + textCardBox.height / 2,
      },
      {
        x: canvasBox.x + Math.min(200, canvasBox.width / 2),
        y: Math.min(canvasBox.y + canvasBox.height - 80, 1120),
      },
      32,
    );

    const withText = await exportDocument(page);
    const addedText = widgetsIn(withText).filter(
      (widget) =>
        widget.type === "TEXT_WIDGET" && !initialTextIds.has(widget.widgetId),
    );

    assert.equal(
      addedText.length,
      1,
      "Dragging the Text card did not add one widget",
    );
    assert.equal(addedText[0].parentId, "0");
    assert.match(
      await page.locator(".standalone-editor__status").innerText(),
      /unsaved changes/,
    );

    await page.getByTestId("t--standalone-save").click();
    await page
      .getByTestId("t--standalone-revision")
      .getByText("Local revision: 1")
      .waitFor();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#engine-speed-card").waitFor();

    const reloaded = await exportDocument(page);
    const reloadedCard = widgetById(reloaded, "engine-speed-card");

    assert.deepEqual(
      [
        reloadedCard.topRow,
        reloadedCard.leftColumn,
        reloadedCard.bottomRow,
        reloadedCard.rightColumn,
      ],
      [
        resizedCard.topRow,
        resizedCard.leftColumn,
        resizedCard.bottomRow,
        resizedCard.rightColumn,
      ],
      "Moved and resized positions changed after saving and reloading",
    );
    assert.ok(widgetById(reloaded, addedText[0].widgetId));
    assert.match(
      await page.locator(".standalone-editor__status").innerText(),
      /Appsmith API requests blocked: 0/,
    );
    assert.deepEqual(pageErrors, []);

    // Appsmith's custom drop arena needs a stepped pointer path. Playwright's
    // locator.dragTo emits too few mouse moves for its reflow/drop lifecycle.
    console.log("Standalone canvas drag, resize, and save/reload flow passed");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
