import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { parsePgn } from '@/data';
import { saveOpened } from '@/ui/app/viewedGames';
import { reviewPath } from '@/ui/app/paths';
import { useMessages } from '@/ui/i18n/LanguageContext';
import styles from './SearchScreen.module.css';

/**
 * The sheet that takes a pasted PGN (BRIEF-UI 6.5): a native modal dialog, so focus stays inside
 * and Escape or a tap above it closes it.
 */
export function PgnSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const messages = useMessages();
  const text = messages.search;
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const [pgn, setPgn] = useState('');
  const [invalid, setInvalid] = useState(false);
  const titleId = useId();
  const errorId = useId();
  const noteId = useId();
  // Only the first game of a PGN opens: say so before the user taps (Fable review A6-06).
  const parsed = useMemo(() => (pgn.trim() === '' ? null : parsePgn(pgn)), [pgn]);
  const first = parsed?.ok ? parsed.games[0] : undefined;
  const many = parsed?.ok && first && parsed.games.length > 1 ? parsed.games.length : 0;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  const review = async () => {
    if (!first) {
      setInvalid(true);
      return;
    }
    const game = first;
    await saveOpened(game);
    onClose();
    void navigate(reviewPath(game.id));
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      className={`${styles.sheet} squircle`}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose(); // the space above the sheet
      }}
    >
      <form
        method="dialog"
        className={styles.sheetBody}
        onSubmit={(event) => {
          event.preventDefault();
          void review();
        }}
      >
        <h2 id={titleId} className="t-section">
          {text.pastePgn}
        </h2>
        <label className="visually-hidden" htmlFor={`${titleId}-pgn`}>
          {text.pgnLabel}
        </label>
        <textarea
          id={`${titleId}-pgn`}
          value={pgn}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : many ? noteId : undefined}
          className={`${styles.pgn} t-body squircle`}
          onChange={(event) => {
            setPgn(event.target.value);
            setInvalid(false);
          }}
        />
        {invalid ? (
          <p id={errorId} role="alert" className={`${styles.error} t-caption`}>
            {text.pgnInvalid}
          </p>
        ) : (
          many > 0 &&
          first && (
            <p id={noteId} role="status" className={`${styles.note} t-caption c-2`}>
              {text.pgnMany(many, messages.game.players(first.white.name, first.black.name))}
            </p>
          )
        )}
        <button
          type="submit"
          disabled={pgn.trim() === ''}
          className={`${styles.primary} t-nav-title pressable`}
        >
          {text.review}
        </button>
      </form>
    </dialog>
  );
}
