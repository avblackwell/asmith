import React, { useState } from "react";

interface PublishControlsProps {
  itemId: number | null;
  onPublishNew: (description: string, thumbnail: File) => Promise<string>;
  onReplace?: () => Promise<string>;
}

/** Shared writes are only triggered by one of these explicit user actions. */
export function PublishControls({
  itemId,
  onPublishNew,
  onReplace,
}: PublishControlsProps) {
  const [description, setDescription] = useState("");
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setMessage("");

    try {
      setMessage(await action());
      setIsError(false);
    } catch (error) {
      setMessage(`Marketplace action failed: ${String(error)}`);
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Marketplace uploads" className="workspace-publishing">
      <strong>Marketplace uploads</strong>
      <p>
        Local saves stay in this browser. Uploading sends a snapshot to the
        marketplace.
      </p>
      <label>
        New item description
        <input
          aria-label="New item description"
          onChange={(event) => setDescription(event.target.value)}
          value={description}
        />
      </label>
      <label>
        New item thumbnail
        <input
          accept="image/*"
          aria-label="New item thumbnail"
          onChange={(event) => setThumbnail(event.target.files?.[0] ?? null)}
          type="file"
        />
      </label>
      <div className="workspace-publishing__actions">
        <button
          data-testid="t--publish-new"
          disabled={busy || !thumbnail}
          onClick={() =>
            thumbnail &&
            void run(async () => await onPublishNew(description, thumbnail))
          }
          type="button"
        >
          Upload as new item
        </button>
        {itemId !== null && onReplace && (
          <button
            data-testid="t--publish-replace"
            disabled={busy}
            onClick={() => void run(onReplace)}
            type="button"
          >
            Replace marketplace item #{itemId}
          </button>
        )}
      </div>
      {message && <p role={isError ? "alert" : "status"}>{message}</p>}
    </section>
  );
}
