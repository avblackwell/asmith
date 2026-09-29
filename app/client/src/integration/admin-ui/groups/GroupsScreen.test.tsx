/* eslint-disable testing-library/await-async-queries -- react-test-renderer lookup methods are synchronous. */
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import type { ReactTestInstance, ReactTestRenderer } from "react-test-renderer";
import type { MarketplaceUser } from "../../marketplace";
import { GroupsScreen } from "./GroupsScreen";
import type { GroupsScreenClient } from "./GroupsScreen";

jest.mock("@appsmith/ads", () => {
  const ReactMock = jest.requireActual("react");
  const TabsContext = ReactMock.createContext({
    onValueChange: (_value: string) => undefined,
    value: "",
  });

  type MockRow = Record<string, unknown>;

  interface MockColumn {
    dataIndex: string;
    render?: (value: unknown, row: MockRow, index: number) => React.ReactNode;
  }

  return {
    Button: ({ children, isDisabled, ...props }: Record<string, unknown>) =>
      ReactMock.createElement(
        "button",
        { ...props, disabled: isDisabled },
        children,
      ),
    Input: ({
      label,
      onChange,
      renderAs,
      value,
      ...props
    }: Record<string, unknown>) =>
      ReactMock.createElement(renderAs === "textarea" ? "textarea" : "input", {
        ...props,
        "aria-label": label,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
          (onChange as (value: string) => void)(event.target.value),
        value,
      }),
    SearchInput: ({ onChange, value, ...props }: Record<string, unknown>) =>
      ReactMock.createElement("input", {
        ...props,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
          (onChange as (value: string) => void)(event.target.value),
        value,
      }),
    Tabs: ({ children, onValueChange, value }: Record<string, unknown>) =>
      ReactMock.createElement(
        TabsContext.Provider,
        { value: { onValueChange, value } },
        children,
      ),
    TabsList: ({ children, ...props }: Record<string, unknown>) =>
      ReactMock.createElement("div", { ...props, role: "tablist" }, children),
    Tab: ({ children, value }: Record<string, unknown>) => {
      const tabs = ReactMock.useContext(TabsContext);

      return ReactMock.createElement(
        "button",
        {
          "aria-selected": tabs.value === value,
          onClick: () => tabs.onValueChange(value),
          role: "tab",
        },
        children,
      );
    },
    TabPanel: ({ children, value }: Record<string, unknown>) => {
      const tabs = ReactMock.useContext(TabsContext);

      return tabs.value === value
        ? ReactMock.createElement("div", { role: "tabpanel" }, children)
        : null;
    },
    Table: ({ columns, data }: Record<string, unknown>) =>
      ReactMock.createElement(
        "table",
        null,
        (data as MockRow[]).map((row, index) =>
          ReactMock.createElement(
            "tr",
            { key: index },
            (columns as MockColumn[]).map((column, columnIndex) =>
              ReactMock.createElement(
                "td",
                { key: columnIndex },
                column.render
                  ? column.render(row[column.dataIndex], row, index)
                  : String(row[column.dataIndex] ?? ""),
              ),
            ),
          ),
        ),
      ),
    Tag: ({ children }: Record<string, unknown>) =>
      ReactMock.createElement("span", null, children),
    Text: ({ children, renderAs }: Record<string, unknown>) =>
      ReactMock.createElement(renderAs || "span", null, children),
  };
});

const systemAdmin: MarketplaceUser = {
  id: 1,
  username: "admin",
  isSystemAdmin: true,
  groupMemberships: [],
};

const groupAdmin: MarketplaceUser = {
  id: 2,
  username: "manager",
  isSystemAdmin: false,
  groupMemberships: [
    {
      groupId: 5,
      groupName: "Operators",
      roleId: 1,
      role: "admin",
      addedBy: null,
    },
  ],
};

const group = {
  id: 5,
  name: "Operators",
  description: "Site operators",
  creationSource: "user",
  externalGroupId: null,
  creatorId: 1,
  creatorName: "admin",
  memberCount: 1,
  createdAt: 1,
  updatedAt: null,
  admins: [{ id: 2, username: "manager" }],
};

const member = {
  user: { id: 14, username: "operator" },
  roleId: 2,
  role: "member",
  addedBy: { id: 2, username: "manager" },
};

function page(data: unknown[]) {
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

function makeClient() {
  return {
    getCurrentUser: jest.fn().mockResolvedValue(systemAdmin),
    listGroups: jest.fn().mockResolvedValue(page([group])),
    getGroup: jest.fn().mockResolvedValue(group),
    createGroup: jest.fn().mockResolvedValue(6),
    updateGroup: jest.fn().mockResolvedValue(undefined),
    listMembers: jest.fn().mockResolvedValue(page([member])),
    addMember: jest.fn().mockResolvedValue(undefined),
    updateMemberRole: jest.fn().mockResolvedValue(undefined),
    removeMember: jest.fn().mockResolvedValue(undefined),
  };
}

async function render(
  client: GroupsScreenClient,
  view: "list" | "new" | "detail" | "members",
  user: MarketplaceUser = systemAdmin,
  onNavigate?: (href: string) => void,
): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;

  await act(async () => {
    renderer = TestRenderer.create(
      <GroupsScreen
        client={client}
        currentUser={user}
        groupId={view === "detail" || view === "members" ? 5 : undefined}
        onNavigate={onNavigate}
        view={view}
      />,
    );
  });

  return renderer;
}

function findButton(
  renderer: ReactTestRenderer,
  label: string,
): ReactTestInstance {
  const node = renderer.root
    .findAllByType("button")
    .find((candidate) =>
      JSON.stringify(candidate.props.children).includes(label),
    );

  if (!node) throw new Error(`Missing button: ${label}`);

  return node;
}

describe("GroupsScreen", () => {
  it("uses the Appsmith tabs while preserving group detail routes", async () => {
    const client = makeClient();
    const navigate = jest.fn();
    const detail = await render(client, "detail", systemAdmin, navigate);
    const detailTabs = detail.root.findAllByProps({ role: "tab" });

    expect(detailTabs.map((tab) => tab.props["aria-selected"])).toEqual([
      true,
      false,
    ]);
    await act(async () => detailTabs[1].props.onClick());
    expect(navigate).toHaveBeenCalledWith("/admin/groups/5/members");

    const members = await render(client, "members", systemAdmin, navigate);
    const memberTabs = members.root.findAllByProps({ role: "tab" });

    expect(memberTabs.map((tab) => tab.props["aria-selected"])).toEqual([
      false,
      true,
    ]);
    await act(async () => memberTabs[0].props.onClick());
    expect(navigate).toHaveBeenCalledWith("/admin/groups/5");
  });

  it("loads the managed group list with server paging and sorting", async () => {
    const client = makeClient();
    const renderer = await render(client, "list");

    expect(client.listGroups).toHaveBeenCalledWith(
      {
        cursor: undefined,
        limit: 20,
        search: "",
        sort: { field: "name", descending: false },
      },
      expect.any(AbortSignal),
    );
    expect(JSON.stringify(renderer.toJSON())).toContain("/admin/groups/5");
  });

  it("records an Entra group ID while clearly stating members will not sync", async () => {
    const client = makeClient();
    const navigate = jest.fn();
    const renderer = await render(client, "new", systemAdmin, navigate);
    const entraRadio = renderer.root
      .findAllByType("input")
      .find((node) => node.props.value === "entra");

    await act(async () => entraRadio?.props.onChange());
    expect(JSON.stringify(renderer.toJSON())).toContain(
      "does not import or synchronize",
    );

    const name = renderer.root.findByProps({ "aria-label": "Group name" });
    const externalId = renderer.root.findByProps({
      "aria-label": "Entra group object ID",
    });

    await act(async () => {
      name.props.onChange({ target: { value: "Cloud operators" } });
      externalId.props.onChange({ target: { value: "entra-id" } });
    });
    await act(async () => {
      renderer.root.findByType("form").props.onSubmit({ preventDefault() {} });
    });

    expect(client.createGroup).toHaveBeenCalledWith({
      name: "Cloud operators",
      description: "",
      externalGroupId: "entra-id",
    });
    expect(navigate).toHaveBeenCalledWith("/admin/groups/6");
  });

  it("adds a member using the internal application user ID", async () => {
    const client = makeClient();
    const renderer = await render(client, "members", groupAdmin);
    const userIdInput = renderer.root.findByProps({
      "aria-label": "Application user ID",
    });

    await act(async () =>
      userIdInput.props.onChange({ target: { value: "14" } }),
    );
    await act(async () => {
      renderer.root
        .findAllByType("form")[0]
        .props.onSubmit({ preventDefault() {} });
    });

    expect(client.addMember).toHaveBeenCalledWith(5, 14, "MEMBER");
  });

  it("does not request the member list for a non-admin member", async () => {
    const client = makeClient();
    const regularMember: MarketplaceUser = {
      ...groupAdmin,
      groupMemberships: [{ ...groupAdmin.groupMemberships[0], role: "member" }],
    };
    const renderer = await render(client, "members", regularMember);

    expect(client.listMembers).not.toHaveBeenCalled();
    expect(JSON.stringify(renderer.toJSON())).toContain(
      "Only group administrators can view this member list",
    );
    expect(() => findButton(renderer, "Add member")).toThrow();
  });
});
