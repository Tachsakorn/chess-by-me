import { useEffect, useId, useRef } from 'react';
import styles from './ConfirmSheet.module.css';

/**
 * Asks before something that cannot be undone (deleting what is saved on the device): a native
 * modal dialog like the Paste PGN sheet, so focus stays inside and Escape or a tap above it
 * cancels. The safe choice is focused first.
 */
export function ConfirmSheet({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  onConfirm(): void;
  onCancel(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      cancel.current?.focus();
    }
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className={`${styles.sheet} squircle`}
      onClose={onCancel}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel(); // the space above the sheet
      }}
    >
      <div className={styles.body}>
        <h2 id={titleId} className="t-section">
          {title}
        </h2>
        <p id={bodyId} className={`${styles.text} t-body c-2`}>
          {body}
        </p>
        <button
          type="button"
          disabled={busy}
          aria-busy={busy}
          className={`${styles.confirm} t-nav-title pressable`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
        <button
          ref={cancel}
          type="button"
          disabled={busy}
          className={`${styles.cancel} t-body w-600 pressable`}
          onClick={onCancel}
        >
          {cancelLabel}
        </button>
      </div>
    </dialog>
  );
}
