/* Browser check for the extracted administration UI using Java-shaped fixtures. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const baseUrl = process.env.ADMIN_URL || "http://127.0.0.1:3004";
const screenshotDir = process.env.ADMIN_SCREENSHOT_DIR;
const appsmithPath = /^\/(api|v1|rts|oauth2|login|logout|user)(?:\/|$)/;
const tinyGif = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

const admin = {
  id: 1,
  username: "admin@example.com",
  isSystemAdmin: true,
  groupMemberships: [
    {
      groupId: 5,
      groupName: "Operators",
      roleId: 1,
      role: "ADMIN",
      addedBy: null,
    },
  ],
};
const operator = {
  id: 14,
  username: "operator@example.com",
  isSystemAdmin: false,
  groupMemberships: [
    {
      groupId: 5,
      groupName: "Operators",
      roleId: 2,
      role: "MEMBER",
      addedBy: { id: 1, username: admin.username },
    },
  ],
};
const groups = [
  {
    id: 5,
    name: "Operators",
    description: "Site operators",
    creationSource: "USER",
    externalGroupId: null,
    creatorId: 1,
    creatorName: admin.username,
    memberCount: 1,
    createdAt: 1,
    updatedAt: null,
    admins: [{ id: 1, username: admin.username }],
  },
];
const members = [
  {
    user: { id: 14, username: operator.username },
    roleId: 2,
    role: "MEMBER",
    addedBy: { id: 1, username: admin.username },
  },
];
const tags = [{ id: 3, name: "Engine", color: "#3878c8", icon: null }];
const site = { oid: 4, name: "West Plant" };
const cell = {
  id: 17,
  name: "Cell 17",
  site,
  state: {
    lastSeen: 1730000000000,
    generation: 2,
    go_time: 0,
    rebuild_count: 1,
    state: "running",
  },
};
const speed = {
  name: "shaft_speed",
  description: "Shaft speed",
  unit: "rpm",
  status: "active",
  source: "system",
};
const item = {
  id: 7,
  name: "Engine overview",
  description: "Engine dashboard",
  typeId: 1,
  type: "dashboard",
  tags: [],
  publisherId: 1,
  publisherUsername: admin.username,
  createdAt: 1,
  updatedAt: 1,
  publishedAt: null,
  downloadCount: 0,
  rating: null,
  ratingCount: 0,
  thumbnailUrl: "",
  previewImages: [tinyGif],
};

function paged(data) {
  return {
    data,
    meta: {
      cursor: 0,
      previousCursor: null,
      nextCursor: null,
      pageSize: 20,
      currentPage: 1,
      totalPages: 1,
      totalItems: data.length,
      sorts: null,
      filters: null,
    },
  };
}

function json(route, value, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(value),
  });
}

async function main() {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome",
    headless: true,
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    page.setDefaultTimeout(30000);
    const pageErrors = [];
    const appsmithRequests = [];
    const unexpectedRequests = [];
    const mutations = [];
    const observed = new Set();
    let failPreviews = false;

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("request", (request) => {
      if (appsmithPath.test(new URL(request.url()).pathname)) {
        appsmithRequests.push(request.url());
      }
    });

    await page.route("**/operator_display/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const endpoint = url.pathname.replace(/^\/operator_display/, "");
      const method = request.method();
      observed.add(`${method} ${endpoint}`);

      if (endpoint === "/system/userInfo" && method === "GET")
        return json(route, admin);

      if (endpoint === "/system/groups" && method === "GET")
        return json(route, paged(groups));
      if (endpoint === "/system/groups" && method === "POST") {
        const body = JSON.parse(request.postData());
        assert.deepEqual(body, {
          name: "New operators",
          description: "",
        });
        mutations.push(`${method} ${endpoint}`);
        groups.push({
          ...groups[0],
          id: 6,
          name: body.name,
          description: body.description,
          memberCount: 0,
        });
        return json(route, { groupId: 6 });
      }
      if (endpoint === "/system/groups/5" && method === "GET")
        return json(route, groups[0]);
      if (endpoint === "/system/groups/6" && method === "GET")
        return json(route, groups[1]);
      if (endpoint === "/system/groups/5/members" && method === "GET")
        return json(route, paged(members));

      if (endpoint === "/system/users" && method === "GET")
        return json(route, paged([admin, operator]));
      if (endpoint === "/system/users/14" && method === "GET")
        return json(route, operator);
      if (endpoint === "/system/users" && method === "POST") {
        assert.deepEqual(JSON.parse(request.postData()), {
          username: "new.operator@example.com",
        });
        mutations.push(`${method} ${endpoint}`);
        return route.fulfill({ status: 500, body: "User insert failed" });
      }

      if (endpoint === "/marketplace/item-tags" && method === "GET")
        return json(route, paged(tags));
      if (endpoint === "/system/checkItemTagName" && method === "POST") {
        assert.deepEqual(JSON.parse(request.postData()), {
          tagName: "Cooling",
        });
        return json(route, { exists: false });
      }
      if (endpoint === "/system/item-tags" && method === "POST") {
        const body = JSON.parse(request.postData());
        assert.deepEqual(body, { name: "Cooling", color: null, icon: null });
        mutations.push(`${method} ${endpoint}`);
        tags.push({ id: 4, ...body });
        return json(route, { id: 4 });
      }
      if (endpoint === "/marketplace/item-tags/4" && method === "GET")
        return json(route, tags[1]);

      if (endpoint === "/system/sites" && method === "GET")
        return json(route, paged([site]));
      if (endpoint === "/system/sites/4" && method === "GET")
        return json(route, site);
      if (endpoint === "/system/testcells" && method === "GET")
        return json(route, paged([cell]));
      if (endpoint === "/system/testcells/17" && method === "GET")
        return json(route, cell);

      if (endpoint === "/system/universal-variable-catalog" && method === "GET")
        return json(route, {
          universalVariables: [speed],
          units: [{ name: "rpm", unitGroup: "rotation", source: "system" }],
          unitGroups: [{ name: "rotation", source: "system" }],
        });
      if (
        endpoint === "/system/universal-variable-statuses" &&
        method === "GET"
      )
        return json(route, { statuses: ["active", "inactive"] });
      if (
        endpoint === "/system/universal-variable/shaft_speed" &&
        method === "GET"
      )
        return json(route, speed);

      if (endpoint === "/marketplace/items/7" && method === "GET")
        return json(route, item);
      if (endpoint === "/marketplace/items/7/previews" && method === "GET") {
        if (failPreviews)
          return route.fulfill({
            status: 503,
            body: "Preview service unavailable",
          });
        return json(route, [{ id: 11, index: 0, url: tinyGif }]);
      }
      if (endpoint === "/marketplace/items/7/tags/3" && method === "POST") {
        mutations.push(`${method} ${endpoint}`);
        item.tags.push(tags[0]);
        return route.fulfill({ status: 204 });
      }

      unexpectedRequests.push(`${method} ${endpoint}${url.search}`);
      return route.fulfill({ status: 500, body: "Unexpected admin request" });
    });

    async function open(route, heading) {
      await page.goto(`${baseUrl}${route}`, {
        waitUntil: "domcontentloaded",
        timeout: 120000,
      });
      await page
        .getByRole("heading", { level: 1, name: heading, exact: true })
        .waitFor();
      assert.equal(new URL(page.url()).pathname, route);
      if (screenshotDir && ["/admin", "/admin/groups/5"].includes(route)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
        await page.screenshot({
          path: path.join(
            screenshotDir,
            `${route.replace(/^\//, "").replaceAll("/", "-")}.png`,
          ),
          fullPage: true,
        });
      }
    }

    await open("/admin", "Administration");
    await page
      .getByRole("navigation", { name: "Administration sections" })
      .waitFor();
    await open("/admin/groups", "Groups");
    await page.getByRole("link", { name: "Operators", exact: true }).waitFor();
    await open("/admin/groups/new", "Create group");
    await page.getByLabel("Record an Entra group").check();
    await page.getByLabel("Entra group object ID").waitFor();
    await page
      .getByText("does not import or synchronize its members yet")
      .waitFor();
    await page.getByLabel("Application managed").check();
    await page.getByLabel("Group name").fill("New operators");
    await page.getByRole("button", { name: "Create group" }).click();
    await page.getByRole("heading", { name: "New operators" }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/admin/groups/6");
    await open("/admin/groups/5", "Operators");
    await page.getByRole("tab", { name: "Members", exact: true }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Delete group" }).isDisabled(),
      true,
    );
    await page.getByRole("tab", { name: "Members", exact: true }).click();
    await page.waitForURL(`${baseUrl}/admin/groups/5/members`);
    await page.getByLabel("Application user ID").waitFor();
    await page.getByText(operator.username).waitFor();

    await open("/admin/users", "Users");
    await page.getByRole("link", { name: operator.username }).waitFor();
    await page.getByRole("button", { name: "Add user", exact: true }).click();
    await page
      .locator(".admin-entity__form")
      .getByRole("textbox")
      .fill("new.operator@example.com");
    await page
      .getByRole("button", { name: "Add user", exact: true })
      .last()
      .click();
    await page
      .getByRole("alert")
      .getByText("Add user failed (HTTP 500).")
      .waitFor();
    await open("/admin/users/14", operator.username);
    await page.getByRole("heading", { name: "Group memberships" }).waitFor();

    await open("/admin/tags", "Tags");
    await page.getByText("Engine", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Create tag" }).click();
    await page
      .locator(".admin-entity__form")
      .getByRole("textbox", { name: /Name/ })
      .fill("Cooling");
    await page.getByRole("button", { name: "Create tag" }).last().click();
    await page
      .getByRole("status")
      .getByText("Created tag “Cooling”.")
      .waitFor();
    await page.getByText("Cooling", { exact: true }).waitFor();

    await open("/operations/sites", "Sites");
    await page.getByRole("link", { name: site.name }).waitFor();
    await open("/operations/sites/4", site.name);
    await page.getByText("Backend action pending").waitFor();
    await open("/operations/testcells", "Test cells");
    await page.getByRole("link", { name: cell.name }).waitFor();
    await open("/operations/testcells/17", cell.name);
    await page.getByRole("heading", { name: "Test-cell details" }).waitFor();

    await open("/admin/universal-variables", "Universal variables");
    await page.getByRole("link", { name: speed.name }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Create variable" }).isDisabled(),
      true,
    );
    await open("/admin/universal-variables/shaft_speed", speed.name);
    assert.equal(
      await page.getByRole("button", { name: "Save status" }).isDisabled(),
      true,
    );
    await open("/admin/access", "Access setup");
    for (const name of [
      "Assign item to group",
      "Assign site to group",
      "Assign test cell to group",
    ]) {
      assert.equal(await page.getByRole("button", { name }).isDisabled(), true);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await open("/admin/groups", "Groups");
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "mobile admin page should fit the viewport",
    );

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(appsmithRequests, []);
    assert.deepEqual(unexpectedRequests, []);
    assert.deepEqual(mutations, [
      "POST /system/groups",
      "POST /system/users",
      "POST /system/item-tags",
    ]);
    assert.ok(
      ![...observed].some((entry) =>
        /^(POST|PUT) \/system\/universal-variable/.test(entry),
      ),
    );
    process.stdout.write("Admin mock-browser flow passed\n");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
