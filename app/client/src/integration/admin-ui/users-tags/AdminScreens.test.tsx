/* react-test-renderer's findAllByType is synchronous. */
/* eslint-disable testing-library/await-async-queries */
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import type { ReactTestInstance, ReactTestRenderer } from "react-test-renderer";
import { MarketplaceHttpError } from "../../marketplace";
import type {
  MarketplacePage,
  MarketplaceTag,
  MarketplaceUser,
} from "../../marketplace";
import { TagsScreen } from "./TagsScreen";
import type { TagsScreenClient } from "./TagsScreen";
import { UsersScreen } from "./UsersScreen";
import type { UsersScreenClient } from "./UsersScreen";

jest.mock("@appsmith/ads", () => {
  const ReactMock = jest.requireActual("react");

  return {
    Button: ({ children, isDisabled, ...props }: Record<string, unknown>) =>
      ReactMock.createElement(
        "button",
        { ...props, disabled: isDisabled },
        children,
      ),
    Input: ({ label, onChange, value, ...props }: Record<string, unknown>) =>
      ReactMock.createElement("input", {
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
    Table: ({
      columns,
      data,
    }: {
      columns: Array<Record<string, unknown>>;
      data: Array<Record<string, unknown>>;
    }) =>
      ReactMock.createElement(
        "div",
        null,
        data.map((row) =>
          ReactMock.createElement(
            "div",
            { key: String(row.id) },
            columns.map((column) =>
              ReactMock.createElement(
                "span",
                { key: String(column.key) },
                column.render
                  ? (
                      column.render as (value: unknown, row: unknown) => unknown
                    )(row[String(column.dataIndex)], row)
                  : String(row[String(column.dataIndex)]),
              ),
            ),
          ),
        ),
      ),
    Tag: ({ children }: Record<string, unknown>) =>
      ReactMock.createElement("span", null, children),
    Text: ({ children, renderAs, ...props }: Record<string, unknown>) =>
      ReactMock.createElement(renderAs || "span", props, children),
  };
});

const admin: MarketplaceUser = {
  id: 1,
  username: "admin",
  isSystemAdmin: true,
  groupMemberships: [],
};

const user: MarketplaceUser = {
  id: 5,
  username: "operator",
  isSystemAdmin: false,
  groupMemberships: [],
};

const tag: MarketplaceTag = {
  id: 9,
  name: "Operations",
  color: "blue",
  icon: null,
};

function page<T>(data: T[]): MarketplacePage<T> {
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

function button(renderer: ReactTestRenderer, label: string): ReactTestInstance {
  const found = renderer.root
    .findAllByType("button")
    .find((node) => JSON.stringify(node.props.children).includes(label));

  if (!found) throw new Error(`Missing button: ${label}`);

  return found;
}

async function render(element: React.ReactElement): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;

  await act(async () => {
    renderer = TestRenderer.create(element);
  });

  return renderer;
}

describe("admin Users and Tags screens", () => {
  test("the Add User form reports backend failure instead of claiming success", async () => {
    const client = {
      getCurrentUser: jest.fn().mockResolvedValue(admin),
      listUsers: jest.fn().mockResolvedValue(page([user])),
      getUser: jest.fn(),
      addUser: jest
        .fn()
        .mockRejectedValue(
          new MarketplaceHttpError(500, "/system/users", "Creation failed"),
        ),
    };
    const renderer = await render(
      <UsersScreen client={client as UsersScreenClient} />,
    );

    await act(async () => {
      button(renderer, "Add user").props.onClick();
    });
    const usernameInput = renderer.root
      .findAllByType("input")
      .find((node) => node.props["aria-label"] === "Username");

    if (!usernameInput) throw new Error("Username input missing");

    await act(async () => {
      usernameInput.props.onChange({ target: { value: "new.operator" } });
    });
    const form = renderer.root.findAllByType("form")[1];

    await act(async () => {
      form.props.onSubmit({ preventDefault: () => undefined });
    });

    expect(client.addUser).toHaveBeenCalledWith("new.operator");
    expect(client.getUser).not.toHaveBeenCalled();
    expect(JSON.stringify(renderer.toJSON())).toContain(
      "Add user failed (HTTP 500)",
    );
    expect(JSON.stringify(renderer.toJSON())).not.toContain(
      "Created new.operator",
    );
  });

  test("editing only color omits the unchanged tag name", async () => {
    const client = {
      getCurrentUser: jest.fn().mockResolvedValue(admin),
      listTags: jest.fn().mockResolvedValue(page([tag])),
      getTag: jest
        .fn()
        .mockResolvedValueOnce(tag)
        .mockResolvedValueOnce({ ...tag, color: "red" }),
      checkTagName: jest.fn(),
      createTag: jest.fn(),
      updateTag: jest.fn().mockResolvedValue(undefined),
      deleteTag: jest.fn(),
    };
    const renderer = await render(
      <TagsScreen client={client as TagsScreenClient} />,
    );

    await act(async () => {
      button(renderer, "Edit").props.onClick();
    });
    const colorInput = renderer.root
      .findAllByType("input")
      .find((node) => node.props["aria-label"] === "Color");

    if (!colorInput) throw new Error("Color input missing");

    await act(async () => {
      colorInput.props.onChange({ target: { value: "red" } });
    });
    await act(async () => {
      renderer.root
        .findAllByType("form")[1]
        .props.onSubmit({ preventDefault: () => undefined });
    });

    expect(client.updateTag).toHaveBeenCalledWith(9, { color: "red" });
    expect(client.checkTagName).not.toHaveBeenCalled();
  });

  test("tag deletion requires confirmation", async () => {
    const client = {
      getCurrentUser: jest.fn().mockResolvedValue(admin),
      listTags: jest.fn().mockResolvedValue(page([tag])),
      getTag: jest
        .fn()
        .mockRejectedValue(
          new MarketplaceHttpError(404, "/marketplace/item-tags/9", ""),
        ),
      checkTagName: jest.fn(),
      createTag: jest.fn(),
      updateTag: jest.fn(),
      deleteTag: jest.fn().mockResolvedValue(undefined),
    };
    const renderer = await render(
      <TagsScreen client={client as TagsScreenClient} />,
    );

    await act(async () => {
      button(renderer, "Delete").props.onClick();
    });
    expect(client.deleteTag).not.toHaveBeenCalled();
    expect(JSON.stringify(renderer.toJSON())).toContain(
      "removes the tag from every marketplace item",
    );
    await act(async () => {
      button(renderer, "Delete tag").props.onClick();
    });
    expect(client.deleteTag).toHaveBeenCalledWith(9);
  });
});
