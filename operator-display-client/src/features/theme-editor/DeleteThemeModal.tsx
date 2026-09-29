import React, { useEffect, useState } from "react";
import Modal from "react-modal";
import { Button } from "@appsmith/ads";

interface DeleteThemeModalProps {
  displayName: string;
  isOpen: boolean;
  onClose: () => void;
  onDelete: () => Promise<void>;
}

/** Appsmith's delete confirmation, with the operator theme store as the action. */
export function DeleteThemeModal({ displayName, isOpen, onClose, onDelete }: DeleteThemeModalProps): React.ReactElement {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (isOpen) setError(null); }, [isOpen]);

  const confirm = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await onDelete();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Deleting the theme failed.");
    } finally {
      setPending(false);
    }
  };

  return <Modal
    appElement={document.getElementById("root") ?? undefined}
    className="od-theme-modal"
    contentLabel={`Delete ${displayName} theme`}
    isOpen={isOpen}
    onRequestClose={() => { if (!pending) onClose(); }}
    overlayClassName="od-theme-modal__overlay"
    shouldCloseOnOverlayClick={false}
  >
    <h2>Are you sure?</h2>
    <p>Do you really want to delete this theme? This process cannot be undone.</p>
    {error && <p className="od-theme-modal__error" role="alert">{error}</p>}
    <footer>
      <Button isDisabled={pending} kind="secondary" onClick={onClose} size="md">No</Button>
      <Button isDisabled={pending} kind="error" onClick={() => { void confirm(); }} size="md">Delete</Button>
    </footer>
  </Modal>;
}
