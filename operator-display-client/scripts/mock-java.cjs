/** Local read-only fixture server for frontend work without a Java deployment. */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const port = Number(process.env.MOCK_JAVA_PORT || 8090);
const dashboard = JSON.parse(fs.readFileSync(
  path.join(__dirname, "fixtures", "published-dashboard.json"),
  "utf8",
));
const schematicSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="220" viewBox="0 0 560 220"><rect width="560" height="220" fill="#deedf4"/><circle cx="176" cy="110" r="73" fill="#fff" stroke="#3682a3" stroke-width="12"/><circle cx="176" cy="110" r="30" fill="#3682a3"/><path d="M249 110h168m-24-25 24 25-24 25" fill="none" stroke="#3682a3" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><text x="299" y="78" fill="#24506b" font-family="Arial" font-size="17">Engine flow</text></svg>`;
const canvasChildren = dashboard.layout.dsl.children;
canvasChildren.push(
  {
    widgetId: "engine-schematic",
    widgetName: "EngineSchematic",
    type: "IMAGE_WIDGET",
    version: 1,
    parentId: "0",
    topRow: 10,
    bottomRow: 32,
    leftColumn: 34,
    rightColumn: 62,
    parentRowSpace: 10,
    parentColumnSpace: 19.4,
    image: `data:image/svg+xml,${encodeURIComponent(schematicSvg)}`,
    defaultImage: "",
    objectFit: "cover",
    borderRadius: "8px",
    isVisible: true,
    dynamicBindingPathList: [],
  },
  {
    widgetId: "engine-divider",
    widgetName: "EngineDivider",
    type: "DIVIDER_WIDGET",
    version: 1,
    parentId: "0",
    topRow: 33,
    bottomRow: 35,
    leftColumn: 2,
    rightColumn: 62,
    parentRowSpace: 10,
    parentColumnSpace: 19.4,
    orientation: "horizontal",
    capType: "nc",
    strokeStyle: "solid",
    dividerColor: "#b8cbd8",
    thickness: 2,
    isVisible: true,
  },
  {
    widgetId: "engine-progress",
    widgetName: "EngineProgress",
    type: "PROGRESS_WIDGET",
    version: 1,
    parentId: "0",
    topRow: 89,
    bottomRow: 97,
    leftColumn: 2,
    rightColumn: 62,
    parentRowSpace: 10,
    parentColumnSpace: 19.4,
    progressType: "linear",
    progress: 72,
    isIndeterminate: false,
    showResult: true,
    fillColor: "#3682a3",
    steps: 1,
    isVisible: true,
    dynamicBindingPathList: [],
  },
);
const preview = (color, title) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600"><rect width="960" height="600" fill="${color}"/><rect x="52" y="52" width="856" height="496" rx="14" fill="white"/><text x="96" y="126" font-family="Arial" font-size="32" fill="#222">${title}</text><rect x="96" y="172" width="340" height="268" rx="8" fill="#e7ecf6"/><rect x="470" y="172" width="390" height="122" rx="8" fill="#e7ecf6"/><rect x="470" y="318" width="390" height="122" rx="8" fill="#e7ecf6"/></svg>`)}`;
const groups = [
  { id: 5, name: "Public", memberCount: 2 },
  { id: 6, name: "Laboratory", memberCount: 3 },
];
const items = [
  {
    id: 7,
    name: "Engine overview",
    description: "A dashboard of engine measurements.",
    typeId: 1,
    type: "dashboard",
    publisherUsername: "operator@example.com",
    downloadCount: 12,
    thumbnailUrl: "",
    tags: [{ id: 2, name: "Monitoring", color: null, icon: null }],
    previewImages: [preview("#dce5f5", "Engine overview"), preview("#ddf3ec", "Engine trends")],
    publishedAt: null,
  },
  {
    id: 8,
    name: "Coolant gauge",
    description: "A reusable coolant temperature component.",
    typeId: 2,
    type: "component",
    publisherUsername: "operator@example.com",
    downloadCount: 5,
    thumbnailUrl: "",
    previewImages: [],
    publishedAt: null,
  },
];

function paged(data) {
  return {
    data,
    meta: {
      cursor: 0,
      previousCursor: null,
      nextCursor: null,
      pageSize: 100,
      currentPage: 1,
      totalPages: 1,
      totalItems: data.length,
    },
  };
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  let body;

  if (url.pathname === "/operator_display/system/userInfo") {
    body = {
      id: 1,
      username: "operator@example.com",
      isSystemAdmin: false,
      groupMemberships: [],
    };
  } else if (url.pathname === "/operator_display/system/testcells" && request.method === "GET") {
    body = paged([{ id: 6, name: "Engine cell A", site: { oid: 3, name: "Laboratory" }, state: null }]);
  } else if (url.pathname === "/operator_display/system/testcells/6" && request.method === "GET") {
    body = { id: 6, name: "Engine cell A", site: { oid: 3, name: "Laboratory" }, state: null };
  } else if (url.pathname === "/operator_display/remote/tc/6/cyflex/variables" && request.method === "GET") {
    if (request.headers.accept !== "variables/json_all+output+v1") {
      response.writeHead(406, { "Content-Type": "text/plain" });
      response.end("Unsupported Accept type");
      return;
    }
    body = { variables: [
      { id: "101", label: "Engine speed" },
      { id: "102", label: "Oil pressure" },
      { id: "103", label: "Coolant temperature" },
    ] };
  } else if (url.pathname === "/operator_display/marketplace/groups") {
    body = paged(groups);
  } else if (url.pathname === "/operator_display/marketplace/items") {
    const fields = url.searchParams.getAll("filter");
    const values = url.searchParams.getAll("filterValue");
    const filters = new Map(fields.map((field, index) => [field, values[index]]));
    const groupId = filters.get("group_id") || null;
    const type = filters.get("type") || null;
    const search = (url.searchParams.get("search") || "").toLowerCase();
    body = paged(items.filter((item) => {
      if (groupId === "5" && item.id !== 7) return false;
      if (groupId === "6" && item.id !== 8) return false;
      if (type && item.type !== type) return false;

      return !search || item.name.toLowerCase().includes(search);
    }));
  } else if (/^\/operator_display\/marketplace\/items\/[1-9]\d*$/.test(url.pathname)) {
    const id = Number(url.pathname.split("/").pop());
    body = items.find((item) => item.id === id);

    if (!body) {
      response.writeHead(404, { "Content-Type": "text/plain" });
      response.end("Item unavailable");

      return;
    }
  } else if (url.pathname === "/operator_display/marketplace/items/7/download" && request.method === "POST") {
    body = {
      // Java development storage advertises this absolute URL. The frontend
      // maps it through its same-origin development proxy for authenticated GET.
      downloadUrl: "http://localhost:8080/operator_display/asset/7",
      metadata: items[0],
    };
  } else if (url.pathname === "/operator_display/asset/7" && request.method === "GET") {
    body = dashboard;
  } else {
    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("Fixture route unavailable");

    return;
  }

  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Mock Java marketplace listening on http://127.0.0.1:${port}`);
});
