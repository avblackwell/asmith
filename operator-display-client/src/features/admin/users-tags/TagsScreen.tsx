import React, { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Button, Input, SearchInput, Table, Tag, Text } from "@appsmith/ads";
import { MarketplaceHttpError } from "../../marketplace";
import type {
  MarketplacePage,
  MarketplaceTag,
  MarketplaceUser,
} from "../../marketplace";
import type { AdminUsersTagsClient, TagChanges } from "./AdminUsersTagsClient";
import { AdminPager, adminError } from "./screenShared";
import "./adminUsersTags.css";

export type TagsScreenClient = Pick<
  AdminUsersTagsClient,
  | "getCurrentUser"
  | "listTags"
  | "getTag"
  | "checkTagName"
  | "createTag"
  | "updateTag"
  | "deleteTag"
>;

export interface TagsScreenProps {
  client: TagsScreenClient;
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function TagsScreen({ client }: TagsScreenProps): React.ReactElement {
  const [currentUser, setCurrentUser] = useState<MarketplaceUser | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [authRevision, setAuthRevision] = useState(0);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState(0);
  const [page, setPage] = useState<MarketplacePage<MarketplaceTag> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<MarketplaceTag | "create" | null>(
    null,
  );
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [icon, setIcon] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [deleting, setDeleting] = useState<MarketplaceTag | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    setCurrentUser(null);
    setSessionError("");
    void client
      .getCurrentUser(controller.signal)
      .then(setCurrentUser)
      .catch((caught: unknown) => {
        if (!isAbort(caught))
          setSessionError(adminError(caught, "Load account"));
      });

    return () => controller.abort();
  }, [client, authRevision]);

  useEffect(() => {
    if (!currentUser) return;

    const controller = new AbortController();

    setLoading(true);
    setListError("");
    setPage(null);
    void client
      .listTags({ cursor, limit: 20, search }, controller.signal)
      .then(setPage)
      .catch((caught: unknown) => {
        if (!isAbort(caught)) setListError(adminError(caught, "Load tags"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [client, currentUser, cursor, revision, search]);

  function beginCreate(): void {
    setNotice("");
    setFormError("");
    setName("");
    setColor("");
    setIcon("");
    setEditing("create");
  }

  async function beginEdit(tag: MarketplaceTag): Promise<void> {
    if (editLoading) return;

    setNotice("");
    setFormError("");
    setEditLoading(true);
    try {
      const fresh = await client.getTag(tag.id);

      setEditing(fresh);
      setName(fresh.name);
      setColor(fresh.color ?? "");
      setIcon(fresh.icon ?? "");
    } catch (caught) {
      setNotice(adminError(caught, "Open tag"));
    } finally {
      setEditLoading(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (saving || !editing) return;

    const nextName = name.trim();
    const nextColor = color.trim();
    const nextIcon = icon.trim();

    if (!nextName) {
      setFormError("Tag name is required.");

      return;
    }

    if (
      editing !== "create" &&
      ((editing.color && !nextColor) || (editing.icon && !nextIcon))
    ) {
      setFormError(
        "The backend cannot remove a tag color or icon yet. Enter a replacement value or keep the existing one.",
      );

      return;
    }

    setSaving(true);
    setFormError("");
    setNotice("");
    try {
      if (editing === "create") {
        if (await client.checkTagName(nextName)) {
          setFormError("A tag with this name already exists.");

          return;
        }

        const tagId = await client.createTag({
          name: nextName,
          color: nextColor || null,
          icon: nextIcon || null,
        });
        const created = await client.getTag(tagId);

        if (created.name !== nextName) {
          throw new Error(
            "The backend did not confirm the requested tag name.",
          );
        }

        setNotice(`Created tag “${created.name}”.`);
      } else {
        const changes: TagChanges = {};

        if (nextName !== editing.name) changes.name = nextName;

        if (nextColor !== (editing.color ?? "")) changes.color = nextColor;

        if (nextIcon !== (editing.icon ?? "")) changes.icon = nextIcon;

        if (Object.keys(changes).length === 0) {
          setFormError("No changes to save.");

          return;
        }

        if (changes.name && (await client.checkTagName(changes.name))) {
          setFormError("A tag with this name already exists.");

          return;
        }

        await client.updateTag(editing.id, changes);
        const updated = await client.getTag(editing.id);

        if (
          (changes.name !== undefined && updated.name !== changes.name) ||
          (changes.color !== undefined && updated.color !== changes.color) ||
          (changes.icon !== undefined && updated.icon !== changes.icon)
        ) {
          throw new Error(
            "The backend did not confirm the requested tag changes.",
          );
        }

        setNotice(`Saved tag “${updated.name}”.`);
      }

      setEditing(null);
      setCursor(0);
      setRevision((n) => n + 1);
    } catch (caught) {
      setFormError(adminError(caught, "Save tag"));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!deleting || deleteBusy) return;

    const tag = deleting;

    setDeleteBusy(true);
    setDeleteError("");
    setNotice("");
    try {
      await client.deleteTag(tag.id);

      try {
        await client.getTag(tag.id);
        throw new Error(
          "The backend accepted deletion, but the tag still exists.",
        );
      } catch (caught) {
        if (
          !(caught instanceof MarketplaceHttpError && caught.status === 404)
        ) {
          throw caught;
        }
      }

      setDeleting(null);
      setNotice(`Deleted tag “${tag.name}” and removed its item assignments.`);
      setCursor(0);
      setRevision((n) => n + 1);
    } catch (caught) {
      setDeleteError(adminError(caught, "Delete tag"));
    } finally {
      setDeleteBusy(false);
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setCursor(0);
    setSearch(input.trim());
  }

  const columns = [
    {
      title: "Tag",
      dataIndex: "name",
      key: "name",
      render: (_: unknown, tag: MarketplaceTag) => (
        <Tag isClosable={false}>{tag.name}</Tag>
      ),
    },
    {
      title: "Color",
      dataIndex: "color",
      key: "color",
      render: (_: unknown, tag: MarketplaceTag) => tag.color || "—",
    },
    {
      title: "Icon",
      dataIndex: "icon",
      key: "icon",
      render: (_: unknown, tag: MarketplaceTag) => tag.icon || "—",
    },
    {
      title: "Actions",
      dataIndex: "id",
      key: "actions",
      render: (_: unknown, tag: MarketplaceTag) =>
        currentUser?.isSystemAdmin ? (
          <div className="admin-entity__row-actions">
            <Button
              isDisabled={editLoading || saving || deleteBusy}
              kind="tertiary"
              onClick={() => void beginEdit(tag)}
              size="sm"
            >
              Edit
            </Button>
            <Button
              isDisabled={editLoading || saving || deleteBusy}
              kind="tertiary"
              onClick={() => {
                setDeleting(tag);
                setDeleteError("");
              }}
              size="sm"
            >
              Delete
            </Button>
          </div>
        ) : null,
    },
  ];

  if (sessionError) {
    return (
      <div
        className="admin-entity__notice admin-entity__notice--error"
        role="alert"
      >
        <p>{sessionError}</p>
        <Button
          kind="secondary"
          onClick={() => setAuthRevision((n) => n + 1)}
          size="sm"
        >
          Retry
        </Button>
      </div>
    );
  }

  if (!currentUser) return <p role="status">Loading account…</p>;

  return (
    <section aria-label="Marketplace tags" className="admin-entity__content">
      <div className="admin-entity__heading">
        <div>
          <Text kind="heading-l" renderAs="h1">
            Tags
          </Text>
          <p>Manage the labels used to filter marketplace items.</p>
        </div>
        {currentUser.isSystemAdmin && (
          <Button kind="primary" onClick={beginCreate} size="sm">
            Create tag
          </Button>
        )}
      </div>
      {!currentUser.isSystemAdmin && (
        <p className="admin-entity__hint">
          Tag definitions are read-only without system administrator access.
        </p>
      )}
      <form className="admin-entity__toolbar" onSubmit={submitSearch}>
        <SearchInput
          onChange={setInput}
          placeholder="Search tags"
          value={input}
        />
        <Button kind="secondary" size="sm" type="submit">
          Search
        </Button>
        <Button
          kind="tertiary"
          onClick={() => setRevision((n) => n + 1)}
          size="sm"
          type="button"
        >
          Refresh
        </Button>
      </form>
      {notice && (
        <p className="admin-entity__notice" role="status">
          {notice}
        </p>
      )}
      {editing && (
        <form
          className="admin-entity__card admin-entity__form"
          onSubmit={(event) => void save(event)}
        >
          <Text kind="heading-s" renderAs="h2">
            {editing === "create" ? "Create tag" : `Edit ${editing.name}`}
          </Text>
          <div className="admin-entity__field-grid">
            <Input isRequired label="Name" onChange={setName} value={name} />
            <Input
              description="Optional color value or design token"
              label="Color"
              onChange={setColor}
              value={color}
            />
            <Input
              description="Optional icon name"
              label="Icon"
              onChange={setIcon}
              value={icon}
            />
          </div>
          {formError && (
            <p
              className="admin-entity__notice admin-entity__notice--error"
              role="alert"
            >
              {formError}
            </p>
          )}
          <div className="admin-entity__actions">
            <Button
              isDisabled={saving || !name.trim()}
              kind="primary"
              size="sm"
              type="submit"
            >
              {saving
                ? "Saving…"
                : editing === "create"
                  ? "Create tag"
                  : "Save changes"}
            </Button>
            <Button
              isDisabled={saving}
              kind="secondary"
              onClick={() => {
                setEditing(null);
                setFormError("");
              }}
              size="sm"
              type="button"
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {deleting && (
        <div
          aria-labelledby="admin-tag-delete-title"
          className="admin-entity__card admin-entity__confirm"
          role="alertdialog"
        >
          <Text id="admin-tag-delete-title" kind="heading-s" renderAs="h2">
            Delete {deleting.name}?
          </Text>
          <p>
            This removes the tag from every marketplace item. This action cannot
            be undone.
          </p>
          {deleteError && (
            <p
              className="admin-entity__notice admin-entity__notice--error"
              role="alert"
            >
              {deleteError}
            </p>
          )}
          <div className="admin-entity__actions">
            <Button
              isDisabled={deleteBusy}
              kind="primary"
              onClick={() => void confirmDelete()}
              size="sm"
            >
              {deleteBusy ? "Deleting…" : "Delete tag"}
            </Button>
            <Button
              isDisabled={deleteBusy}
              kind="secondary"
              onClick={() => setDeleting(null)}
              size="sm"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      <div aria-busy={loading} className="admin-entity__table-wrap">
        {loading && <p role="status">Loading tags…</p>}
        {listError && (
          <div
            className="admin-entity__notice admin-entity__notice--error"
            role="alert"
          >
            <p>{listError}</p>
            <Button
              kind="secondary"
              onClick={() => setRevision((n) => n + 1)}
              size="sm"
            >
              Retry
            </Button>
          </div>
        )}
        {!loading && !listError && page && (
          <>
            <p className="admin-entity__count">{page.meta.totalItems} tags</p>
            <Table<MarketplaceTag>
              columns={columns}
              data={page.data}
              emptyText="No tags found."
              rowKey="id"
            />
            <AdminPager
              ariaLabel="Tag pages"
              busy={loading}
              meta={page.meta}
              onPage={setCursor}
            />
          </>
        )}
      </div>
    </section>
  );
}
