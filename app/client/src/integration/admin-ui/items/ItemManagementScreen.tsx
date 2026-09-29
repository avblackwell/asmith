import React, { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Button, Input, Tag, Text } from "@appsmith/ads";
import { MarketplaceHttpError } from "integration/marketplace";
import type {
  MarketplaceClient,
  MarketplaceItem,
  MarketplacePreview,
  MarketplaceTag,
  MarketplaceUser,
} from "integration/marketplace";
import "./itemManagement.css";

export type ItemManagementClient = Pick<
  MarketplaceClient,
  | "getCurrentUser"
  | "getItem"
  | "listItemTags"
  | "listPreviews"
  | "updateItem"
  | "deleteItem"
  | "updateThumbnail"
  | "addPreview"
  | "reorderPreviews"
  | "deletePreview"
  | "assignTag"
  | "removeTag"
>;

interface Props {
  client: ItemManagementClient;
  itemId: number;
}

function errorText(error: unknown): string {
  if (error instanceof MarketplaceHttpError) {
    if (error.status === 401) return "Your session expired. Sign in again.";

    if (error.status === 403)
      return "The backend denied this action for your account.";

    return `The backend returned HTTP ${error.status}${error.responseText ? `: ${error.responseText.slice(0, 160)}` : "."}`;
  }

  return error instanceof Error ? error.message : "The action failed.";
}

function mayManage(user: MarketplaceUser, item: MarketplaceItem): boolean {
  return (
    user.isSystemAdmin ||
    user.id === item.publisherId ||
    user.groupMemberships.some(
      (membership) => membership.role.toLowerCase() === "admin",
    )
  );
}

export function ItemManagementScreen({
  client,
  itemId,
}: Props): React.ReactElement {
  const [item, setItem] = useState<MarketplaceItem | null>(null);
  const [user, setUser] = useState<MarketplaceUser | null>(null);
  const [previews, setPreviews] = useState<MarketplacePreview[]>([]);
  const [tags, setTags] = useState<MarketplaceTag[]>([]);
  const [tagsCursor, setTagsCursor] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [previewUpload, setPreviewUpload] = useState<File | null>(null);
  const [selectedTag, setSelectedTag] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewsError, setPreviewsError] = useState<string | null>(null);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPreview, setConfirmPreview] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const acceptedMutation = useRef(false);

  useEffect(
    function loadItemManagement() {
      const controller = new AbortController();

      setLoading(true);
      setError(null);
      setPreviewsError(null);
      setTagsError(null);

      void Promise.allSettled([
        client.getCurrentUser(controller.signal),
        client.getItem(itemId, controller.signal),
        client.listPreviews(itemId, controller.signal),
        client.listItemTags({ limit: 100 }, controller.signal),
      ])
        .then(([userResult, itemResult, previewsResult, tagsResult]) => {
          if (controller.signal.aborted) return;

          if (
            userResult.status === "fulfilled" &&
            itemResult.status === "fulfilled"
          ) {
            setUser(userResult.value);
            setItem(itemResult.value);
            setName(itemResult.value.name);
            setDescription(itemResult.value.description || "");
            acceptedMutation.current = false;
          } else {
            setUser(null);
            setItem(null);
            const failure = errorText(
              userResult.status === "rejected"
                ? userResult.reason
                : itemResult.status === "rejected"
                  ? itemResult.reason
                  : new Error("Unable to load item."),
            );

            setError(
              acceptedMutation.current
                ? `The backend accepted the change, but item refresh failed: ${failure}`
                : failure,
            );
          }

          if (previewsResult.status === "fulfilled") {
            setPreviews(previewsResult.value);
          } else {
            setPreviews([]);
            setPreviewsError(errorText(previewsResult.reason));
          }

          if (tagsResult.status === "fulfilled") {
            setTags(tagsResult.value.data);
            setTagsCursor(tagsResult.value.meta.nextCursor);
          } else {
            setTags([]);
            setTagsCursor(null);
            setTagsError(errorText(tagsResult.reason));
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });

      return () => controller.abort();
    },
    [client, itemId, revision],
  );

  const canAttempt = !!item && !!user && mayManage(user, item);
  const unassignedTags = useMemo(
    () =>
      tags.filter(
        (tag) => !item?.tags.some((assigned) => assigned.id === tag.id),
      ),
    [item, tags],
  );

  async function runAction(
    label: string,
    action: () => Promise<void>,
    success: string,
    reload = true,
  ): Promise<boolean> {
    setBusy(label);
    setError(null);
    setNotice(null);

    try {
      await action();
      setNotice(success);

      if (reload) {
        acceptedMutation.current = true;
        setRevision((value) => value + 1);
      }

      return true;
    } catch (reason) {
      setError(errorText(reason));

      return false;
    } finally {
      setBusy(null);
    }
  }

  function replaceContent(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!item || !content || !name.trim()) return;

    void runAction(
      "replace",
      async () =>
        client.updateItem(itemId, {
          name: name.trim(),
          description,
          typeId: item.typeId,
          content,
        }),
      "Item content and metadata replaced.",
    ).then((succeeded) => {
      if (succeeded) setContent(null);
    });
  }

  function movePreview(index: number, direction: -1 | 1): void {
    const target = index + direction;

    if (target < 0 || target >= previews.length) return;

    // The Java reorder endpoint accepts current preview indices, not row IDs.
    const order = previews.map((preview) => preview.index);

    [order[index], order[target]] = [order[target], order[index]];
    void runAction(
      "reorder",
      async () => client.reorderPreviews(itemId, order),
      "Preview order saved.",
    );
  }

  async function loadMoreTags(): Promise<void> {
    if (tagsCursor === null) return;

    setBusy("tags");

    try {
      const nextPage = await client.listItemTags({
        limit: 100,
        cursor: tagsCursor,
      });

      setTags((current) => {
        const seen = new Set(current.map((tag) => tag.id));

        return [
          ...current,
          ...nextPage.data.filter((tag) => !seen.has(tag.id)),
        ];
      });
      setTagsCursor(nextPage.meta.nextCursor);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="item-management">
      <a
        className="item-management__back"
        href={`/marketplace/items/${itemId}`}
      >
        ← Back to item
      </a>
      <div className="item-management__heading">
        <div>
          <Text kind="heading-xl" renderAs="h1">
            Manage marketplace item
          </Text>
          <p>Update the uploaded asset and its marketplace presentation.</p>
        </div>
        {item && (
          <Tag isClosable={false} size="sm">
            {item.type}
          </Tag>
        )}
      </div>

      {loading && <p role="status">Loading item management…</p>}
      {error && (
        <div className="item-management__alert" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="item-management__success" role="status">
          {notice}
        </div>
      )}
      {!loading && !item && (
        <Button
          kind="secondary"
          onClick={() => setRevision((value) => value + 1)}
          size="sm"
        >
          Retry
        </Button>
      )}

      {item && user && (
        <>
          <p className="item-management__identity">
            Item #{item.id} · uploaded by {item.publisherUsername}
          </p>
          {!canAttempt && (
            <div className="item-management__alert" role="note">
              Item changes are available to its publisher, an associated group
              admin, or a system admin.
            </div>
          )}
          {canAttempt &&
            !user.isSystemAdmin &&
            user.id !== item.publisherId && (
              <p className="item-management__hint">
                Group admin permissions depend on this item&apos;s group
                assignment. The backend checks each change.
              </p>
            )}

          <div className="item-management__sections">
            <section
              aria-labelledby="item-replace-heading"
              className="item-management__card"
            >
              <Text id="item-replace-heading" kind="heading-m" renderAs="h2">
                Content and details
              </Text>
              <p>
                Replacing content overwrites the uploaded file. Keep a local
                draft before saving.
              </p>
              <form className="item-management__form" onSubmit={replaceContent}>
                <Input
                  isDisabled={!canAttempt || !!busy}
                  label="Item name"
                  onChange={setName}
                  value={name}
                />
                <Input
                  isDisabled={!canAttempt || !!busy}
                  label="Description"
                  onChange={setDescription}
                  renderAs="textarea"
                  value={description}
                />
                <label className="item-management__file">
                  Replacement content
                  <input
                    disabled={!canAttempt || !!busy}
                    onChange={(event) =>
                      setContent(event.target.files?.[0] ?? null)
                    }
                    type="file"
                  />
                </label>
                <Button
                  isDisabled={!canAttempt || !!busy || !content || !name.trim()}
                  kind="primary"
                  size="sm"
                  type="submit"
                >
                  Replace content and details
                </Button>
              </form>
            </section>

            <section
              aria-labelledby="item-tags-heading"
              className="item-management__card"
            >
              <Text id="item-tags-heading" kind="heading-m" renderAs="h2">
                Tags
              </Text>
              <div className="item-management__chips">
                {item.tags.length === 0 && <p>No tags assigned.</p>}
                {item.tags.map((tag) => (
                  <span className="item-management__chip" key={tag.id}>
                    {tag.name}
                    <button
                      aria-label={`Remove ${tag.name} tag`}
                      disabled={!canAttempt || !!busy}
                      onClick={() =>
                        void runAction(
                          "tag",
                          async () => client.removeTag(itemId, tag.id),
                          "Tag removed.",
                        )
                      }
                      type="button"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              {tagsError && (
                <p className="item-management__alert" role="alert">
                  Unable to load available tags: {tagsError}
                </p>
              )}
              <div className="item-management__inline">
                <label>
                  Add a tag
                  <select
                    disabled={!canAttempt || !!busy}
                    onChange={(event) => setSelectedTag(event.target.value)}
                    value={selectedTag}
                  >
                    <option value="">Choose a tag</option>
                    {unassignedTags.map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  isDisabled={!canAttempt || !!busy || !selectedTag}
                  kind="secondary"
                  onClick={() => {
                    const tagId = Number(selectedTag);

                    void runAction(
                      "tag",
                      async () => client.assignTag(itemId, tagId),
                      "Tag added.",
                    ).then((succeeded) => {
                      if (succeeded) setSelectedTag("");
                    });
                  }}
                  size="sm"
                >
                  Add tag
                </Button>
                {tagsCursor !== null && (
                  <Button
                    isDisabled={!!busy}
                    kind="tertiary"
                    onClick={() => void loadMoreTags()}
                    size="sm"
                  >
                    More tags
                  </Button>
                )}
              </div>
            </section>

            <section
              aria-labelledby="item-media-heading"
              className="item-management__card"
            >
              <Text id="item-media-heading" kind="heading-m" renderAs="h2">
                Thumbnail and previews
              </Text>
              <div className="item-management__media-upload">
                <label className="item-management__file">
                  New thumbnail
                  <input
                    accept="image/*"
                    disabled={!canAttempt || !!busy}
                    onChange={(event) =>
                      setThumbnail(event.target.files?.[0] ?? null)
                    }
                    type="file"
                  />
                </label>
                <Button
                  isDisabled={!canAttempt || !!busy || !thumbnail}
                  kind="secondary"
                  onClick={() =>
                    thumbnail &&
                    void runAction(
                      "thumbnail",
                      async () => client.updateThumbnail(itemId, thumbnail),
                      "Thumbnail updated.",
                    ).then((succeeded) => {
                      if (succeeded) setThumbnail(null);
                    })
                  }
                  size="sm"
                >
                  Update thumbnail
                </Button>
              </div>
              <div className="item-management__media-upload">
                <label className="item-management__file">
                  Add preview
                  <input
                    accept="image/*"
                    disabled={!canAttempt || !!busy}
                    onChange={(event) =>
                      setPreviewUpload(event.target.files?.[0] ?? null)
                    }
                    type="file"
                  />
                </label>
                <Button
                  isDisabled={!canAttempt || !!busy || !previewUpload}
                  kind="secondary"
                  onClick={() =>
                    previewUpload &&
                    void runAction(
                      "preview",
                      async () => client.addPreview(itemId, previewUpload),
                      "Preview added.",
                    ).then((succeeded) => {
                      if (succeeded) setPreviewUpload(null);
                    })
                  }
                  size="sm"
                >
                  Add preview
                </Button>
              </div>
              {previewsError && (
                <p className="item-management__alert" role="alert">
                  Unable to load previews: {previewsError}
                </p>
              )}
              {previews.length === 0 && !previewsError && (
                <p>No previews uploaded.</p>
              )}
              {previews.length > 0 && (
                <ol className="item-management__previews">
                  {previews.map((preview, index) => (
                    <li key={preview.id}>
                      <img
                        alt={`Item preview ${index + 1}`}
                        src={preview.url}
                      />
                      <span>Preview {index + 1}</span>
                      <div className="item-management__preview-actions">
                        <Button
                          isDisabled={!canAttempt || !!busy || index === 0}
                          kind="tertiary"
                          onClick={() => movePreview(index, -1)}
                          size="sm"
                        >
                          Up
                        </Button>
                        <Button
                          isDisabled={
                            !canAttempt ||
                            !!busy ||
                            index === previews.length - 1
                          }
                          kind="tertiary"
                          onClick={() => movePreview(index, 1)}
                          size="sm"
                        >
                          Down
                        </Button>
                        {confirmPreview === preview.index ? (
                          <>
                            <Button
                              isDisabled={!!busy}
                              kind="tertiary"
                              onClick={() => setConfirmPreview(null)}
                              size="sm"
                            >
                              Cancel
                            </Button>
                            <Button
                              isDisabled={!!busy}
                              kind="secondary"
                              onClick={() =>
                                void runAction(
                                  "preview",
                                  async () =>
                                    client.deletePreview(itemId, preview.index),
                                  "Preview removed.",
                                ).then((succeeded) => {
                                  if (succeeded) setConfirmPreview(null);
                                })
                              }
                              size="sm"
                            >
                              Confirm remove
                            </Button>
                          </>
                        ) : (
                          <Button
                            isDisabled={!canAttempt || !!busy}
                            kind="tertiary"
                            onClick={() => setConfirmPreview(preview.index)}
                            size="sm"
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section
              aria-labelledby="item-sharing-heading"
              className="item-management__card"
            >
              <Text id="item-sharing-heading" kind="heading-m" renderAs="h2">
                Publication and groups
              </Text>
              <p>
                The backend has no publish, public visibility, or item-to-group
                assignment action yet.
              </p>
              <Button isDisabled kind="secondary" size="sm">
                Publish or share
              </Button>
            </section>

            <section
              aria-labelledby="item-delete-heading"
              className="item-management__card item-management__card--danger"
            >
              <Text id="item-delete-heading" kind="heading-m" renderAs="h2">
                Delete item
              </Text>
              <p>
                This removes the uploaded marketplace item. Keep a local copy if
                you may need it again.
              </p>
              {confirmDelete ? (
                <div className="item-management__inline">
                  <Button
                    isDisabled={!!busy}
                    kind="secondary"
                    onClick={() => setConfirmDelete(false)}
                    size="sm"
                  >
                    Cancel
                  </Button>
                  <Button
                    isDisabled={!!busy}
                    kind="primary"
                    onClick={() =>
                      void runAction(
                        "delete",
                        async () => client.deleteItem(itemId),
                        "Item deleted.",
                        false,
                      ).then((succeeded) => {
                        if (succeeded) window.location.assign("/marketplace");
                      })
                    }
                    size="sm"
                  >
                    Confirm deletion
                  </Button>
                </div>
              ) : (
                <Button
                  isDisabled={!canAttempt || !!busy}
                  kind="secondary"
                  onClick={() => setConfirmDelete(true)}
                  size="sm"
                >
                  Delete item…
                </Button>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
