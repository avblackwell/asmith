import React, { useEffect, useState } from "react";
import Modal from "react-modal";
import { Button } from "@appsmith/ads";

interface SaveThemeModalProps {
  isOpen: boolean;
  suggestedName: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}

/** Named copy of the current theme, matching Appsmith's saved-theme data model. */
export function SaveThemeModal({ isOpen, suggestedName, onClose, onSave }: SaveThemeModalProps): React.ReactElement {
  const [name, setName] = useState(suggestedName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(suggestedName);
      setError(null);
    }
  }, [isOpen, suggestedName]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (!name.trim()) { setError("Enter a theme name."); return; }
    setPending(true);
    setError(null);
    try {
      await onSave(name.trim());
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Saving the theme failed.");
    } finally {
      setPending(false);
    }
  };

  return <Modal
    appElement={document.getElementById("root") ?? undefined}
    className="od-theme-modal"
    contentLabel="Save theme"
    isOpen={isOpen}
    onRequestClose={() => { if (!pending) onClose(); }}
    overlayClassName="od-theme-modal__overlay"
    shouldCloseOnOverlayClick={false}
  >
    <form onSubmit={(event) => { void save(event); }}>
      <h2>Save theme</h2>
      <p>Save the current colors, fonts, borders, and shadows to Your themes.</p>
      <label htmlFor="od-saved-theme-name">Theme name</label>
      <input autoFocus id="od-saved-theme-name" maxLength={80} onChange={(event) => setName(event.target.value)} value={name} />
      {error && <p className="od-theme-modal__error" role="alert">{error}</p>}
      <footer>
        <Button isDisabled={pending} kind="secondary" onClick={onClose} size="md" type="button">Cancel</Button>
        <Button isDisabled={pending || !name.trim()} kind="primary" size="md" type="submit">Save</Button>
      </footer>
    </form>
  </Modal>;
}
