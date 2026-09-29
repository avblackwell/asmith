/* Browser check for the standalone marketplace using controlled Java-shaped responses. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const baseUrl =
  process.env.MARKETPLACE_URL ||
  process.env.STANDALONE_URL ||
  "http://127.0.0.1:3003";
const appsmithPath = /^\/(api|v1|rts|oauth2|login|logout|user)(?:\/|$)/;
const screenshotDir = process.env.MARKETPLACE_SCREENSHOT_DIR;

const publicGroup = {
  id: 5,
  name: "Public",
  description: null,
  creationSource: "LOCAL",
  externalGroupId: null,
  creatorId: null,
  creatorName: null,
  memberCount: 2,
  createdAt: 0,
  updatedAt: null,
  admins: [],
};

function item(id, name, type) {
  return {
    id,
    name,
    description: `${name} description`,
    typeId: type === "dashboard" ? 1 : type === "component" ? 2 : 3,
    type,
    tags: [],
    publisherId: 12,
    publisherUsername: "publisher@example.com",
    createdAt: 0,
    updatedAt: 0,
    publishedAt: null,
    downloadCount: id,
    rating: null,
    ratingCount: 0,
    thumbnailUrl: "",
    previewImages: [],
  };
}

const dashboard = item(7, "Engine overview", "dashboard");
const component = item(8, "Coolant gauge", "component");
const theme = item(9, "Night shift", "theme");
const restricted = item(10, "Restricted diagnostics", "dashboard");

function paged(data, cursor = 0, nextCursor = null, previousCursor = null) {
  return {
    data,
    meta: {
      cursor,
      previousCursor,
      nextCursor,
      pageSize: 12,
      currentPage: cursor === 0 ? 1 : 2,
      totalPages: nextCursor === null && previousCursor === null ? 1 : 2,
      totalItems: nextCursor === null && previousCursor === null ? data.length : 4,
      sorts: null,
      filters: null,
    },
  };
}

function replyJson(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function exactQuery(requestUrl) {
  const params = new URL(requestUrl).searchParams;

  return {
    cursor: params.get("cursor"),
    limit: params.get("limit"),
    search: params.get("search"),
    filters: params.getAll("filter"),
    values: params.getAll("filterValue"),
  };
}

async function main() {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome",
    headless: true,
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors = [];
    const appsmithRequests = [];
    const unknownRequests = [];
    const itemQueries = [];
    const detailRequests = [];

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("request", (request) => {
      if (appsmithPath.test(new URL(request.url()).pathname)) {
        appsmithRequests.push(request.url());
      }
    });

    await page.route("**/operator_display/**", (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;

      if (path === "/operator_display/system/userInfo") {
        return replyJson(route, {
          id: 11,
          username: "operator@example.com",
          isSystemAdmin: false,
          groupMemberships: [
            {
              groupId: 5,
              groupName: "Public",
              roleId: 2,
              role: "MEMBER",
              addedBy: null,
            },
          ],
        });
      }

      if (path === "/operator_display/marketplace/groups") {
        return replyJson(route, paged([publicGroup]));
      }

      if (path === "/operator_display/marketplace/item-tags") {
        return replyJson(route, paged([]));
      }

      if (path === "/operator_display/marketplace/items" && request.method() === "GET") {
        itemQueries.push(exactQuery(request.url()));
        const groupId = url.searchParams.get("filterValue");
        const filter = url.searchParams.get("filter");
        const cursor = url.searchParams.get("cursor");
        const search = url.searchParams.get("search");

        if (filter === "group_id" && groupId === "5") {
          if (search === "coolant") return replyJson(route, paged([component]));
          if (cursor === "20") {
            return replyJson(route, paged([theme, restricted], 20, null, 0));
          }

          return replyJson(route, paged([dashboard, component], 0, 20));
        }

        if (filter === null && search === null) {
          return replyJson(route, paged([dashboard, component, theme]));
        }
      }

      if (path === "/operator_display/marketplace/items/7") {
        detailRequests.push(7);

        return replyJson(route, dashboard);
      }

      if (path === "/operator_display/marketplace/items/10") {
        detailRequests.push(10);

        return route.fulfill({ status: 403, body: "Forbidden" });
      }

      unknownRequests.push(`${request.method()} ${path}${url.search}`);

      return route.fulfill({ status: 500, body: "Unexpected marketplace request" });
    });

    await page.goto(`${baseUrl}/marketplace`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Marketplace", exact: true }).waitFor();
    await page.getByRole("button", { name: "Public" }).waitFor();
    await page.getByRole("heading", { name: "Engine overview" }).waitFor();
    assert.equal(await page.locator(".marketplace-page__card").count(), 3);

    await page.getByRole("button", { name: "Public" }).click();
    await page.getByRole("heading", { name: "Group: Public" }).waitFor();
    await page.getByRole("heading", { name: "Coolant gauge" }).waitFor();
    assert.equal(await page.locator(".marketplace-page__card").count(), 2);
    assert.deepEqual(itemQueries.at(-1), {
      cursor: null,
      limit: "12",
      search: null,
      filters: ["group_id"],
      values: ["5"],
    });
    assert.equal(new URL(page.url()).search, "?groupId=5");
    if (screenshotDir) {
      fs.mkdirSync(screenshotDir, { recursive: true });
      await page.screenshot({
        path: path.join(screenshotDir, "marketplace-desktop.png"),
        fullPage: true,
      });
    }

    await page
      .locator(".marketplace-page__card")
      .filter({ hasText: "Engine overview" })
      .locator("a")
      .click();
    await page.getByRole("heading", { name: "Engine overview" }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/marketplace/items/7");
    assert.equal(new URL(page.url()).search, "?groupId=5");
    assert.equal(detailRequests.at(-1), 7);
    await page.getByRole("link", { name: "Back to marketplace" }).click();
    await page.getByRole("heading", { name: "Coolant gauge" }).waitFor();

    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("heading", { name: "Night shift" }).waitFor();
    await page.getByRole("heading", { name: "Restricted diagnostics" }).waitFor();
    assert.deepEqual(itemQueries.at(-1), {
      cursor: "20",
      limit: "12",
      search: null,
      filters: ["group_id"],
      values: ["5"],
    });

    await page
      .locator(".marketplace-page__card")
      .filter({ hasText: "Restricted diagnostics" })
      .locator("a")
      .click();
    await page
      .getByRole("alert")
      .getByText("You do not have access to this marketplace item.")
      .waitFor();
    assert.equal(detailRequests.at(-1), 10);
    await page.getByRole("link", { name: "Back to marketplace" }).click();
    await page.getByRole("heading", { name: "Coolant gauge" }).waitFor();

    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("heading", { name: "Night shift" }).waitFor();
    await page.getByPlaceholder("Search marketplace").fill("  coolant  ");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("heading", { name: "Coolant gauge" }).waitFor();
    assert.equal(await page.locator(".marketplace-page__card").count(), 1);
    assert.deepEqual(itemQueries.at(-1), {
      cursor: null,
      limit: "12",
      search: "coolant",
      filters: ["group_id"],
      values: ["5"],
    });

    await page.setViewportSize({ width: 390, height: 844 });
    const layout = page.locator(".marketplace-page__layout");
    const contentBox = await page.locator(".marketplace-page__content").boundingBox();
    const sidebarBox = await page.locator(".marketplace-page__sidebar").boundingBox();
    const cardBox = await page.locator(".marketplace-page__card").boundingBox();
    const mobileLayout = await layout.evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns,
    );

    assert.ok(contentBox && sidebarBox && cardBox);
    assert.ok(sidebarBox.y < contentBox.y, "mobile filters should precede the catalog");
    assert.ok(cardBox.width <= 390, "mobile card should fit the viewport");
    assert.equal(mobileLayout.trim().split(/\s+/).length, 1);
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      "mobile page should not overflow horizontally",
    );
    if (screenshotDir) {
      await page.screenshot({
        path: path.join(screenshotDir, "marketplace-mobile.png"),
      });
    }
    await page.locator(".marketplace-page__sidebar").scrollIntoViewIfNeeded();
    assert.ok(
      await page.locator(".marketplace-page__sidebar").evaluate((element) => {
        const box = element.getBoundingClientRect();

        return box.top < innerHeight && box.bottom > 0;
      }),
      "mobile filters should be reachable above the catalog",
    );
    if (screenshotDir) {
      await page.screenshot({
        path: path.join(screenshotDir, "marketplace-mobile-filters.png"),
      });
      await page.locator(".marketplace-page__content").scrollIntoViewIfNeeded();
      await page.screenshot({
        path: path.join(screenshotDir, "marketplace-mobile-results.png"),
      });
    }

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(appsmithRequests, []);
    assert.deepEqual(unknownRequests, []);
    process.stdout.write("Marketplace mock-browser flow passed\n");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
