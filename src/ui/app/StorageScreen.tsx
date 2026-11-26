import { useMessages } from '@/ui/i18n/LanguageContext';
import { MessageScreen } from '@/ui/screens/message/MessageScreen';
import { useApp } from './appStore';
import { reloadApp, useAppUpdate } from './appUpdate';

/**
 * Shown instead of a blank page when the browser does not let the app keep anything (Fable
 * review A6-01): Safari with all cookies blocked, some private or locked-down browsers.
 */
export function StorageScreen() {
  const text = useMessages().storage;
  const load = useApp((s) => s.load);
  return (
    <MessageScreen
      title={text.title}
      body={text.body}
      action={{ label: text.retry, onClick: () => void load() }}
    />
  );
}

/** A note over the screen after a save failed (a full device); it can be closed. */
export function SaveFailedNote() {
  const text = useMessages().storage;
  const failed = useApp((s) => s.storage === 'saveFailed');
  const dismiss = useApp((s) => s.dismissSaveFailed);
  if (!failed) return null;
  return (
    <div role="alert" className="save-failed t-caption">
      <span>{text.saveFailed}</span>
      <button type="button" className="save-failed-close w-600 pressable" onClick={dismiss}>
        {text.dismiss}
      </button>
    </div>
  );
}

/**
 * Over the screen when a new version took over while something was running (Fable review 1.1
 * B1-02); the page reloads by itself when nothing is. Same look as the note above.
 */
export function UpdateNote() {
  const text = useMessages().update;
  const show = useAppUpdate((s) => s.ready && s.reason === 'new-worker');
  if (!show) return null;
  return (
    <div role="status" className="save-failed t-caption">
      <span>{text.note}</span>
      <button type="button" className="save-failed-close w-600 pressable" onClick={reloadApp}>
        {text.reload}
      </button>
    </div>
  );
}
