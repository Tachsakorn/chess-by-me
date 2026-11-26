import { useEffect, useId, useRef, useState } from 'react';
import { Group, Row, SwitchRow } from '@/ui/components/GroupedList';
import { Icon } from '@/ui/components/Icon';
import { useMessages } from '@/ui/i18n/LanguageContext';
import { setSoundEnabled, soundEnabled } from '@/ui/sound/player';
import {
  saveBoardSettings,
  SECOND_CHOICES,
  useBoardSettings,
  type BoardSettings,
} from './boardSettings';
import styles from './BoardSettingsSheet.module.css';

/**
 * The analysis board's settings (owner, 2026-11-26): a bottom sheet, a native modal dialog like
 * the Paste PGN sheet (focus stays inside, Escape or a tap above it closes). Every change is kept
 * and used at once; there is no Save button.
 */
export function BoardSettingsSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const t = useMessages().analysis.settings;
  const settings = useBoardSettings();
  // The app's own Sound switch (Settings), read again each time the sheet opens.
  const [sound, setSound] = useState(soundEnabled);
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const timeNoteId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      setSound(soundEnabled());
      element.showModal();
      close.current?.focus();
    }
    if (!open && element.open) element.close();
  }, [open]);

  const toggle = (key: keyof Omit<BoardSettings, 'seconds'>, label: string) => (
    <SwitchRow
      label={label}
      checked={settings[key]}
      onChange={(checked) => saveBoardSettings({ [key]: checked })}
    />
  );

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
      <div className={styles.body}>
        <div className={styles.head}>
          <h2 id={titleId} className="t-section">
            {t.title}
          </h2>
          <button
            ref={close}
            type="button"
            aria-label={t.close}
            className={`${styles.close} pressable`}
            onClick={onClose}
          >
            <Icon name="close" size={18} stroke={2.5} />
          </button>
        </div>

        <Group title={t.onBoard}>
          {toggle('evalBar', t.evalBar)}
          {toggle('suggestion', t.suggestion)}
          {toggle('threat', t.threat)}
          {toggle('labels', t.labels)}
        </Group>

        <Group title={t.engine}>
          {toggle('lines', t.lines)}
          <Row
            label={t.time}
            value={t.seconds(settings.seconds)}
            note={t.timeNote}
            noteId={timeNoteId}
            overlay={
              <select
                aria-label={t.time}
                aria-describedby={timeNoteId}
                className={styles.select}
                value={settings.seconds}
                onChange={(event) => saveBoardSettings({ seconds: Number(event.target.value) })}
              >
                {SECOND_CHOICES.map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {t.seconds(seconds)}
                  </option>
                ))}
              </select>
            }
          />
        </Group>

        <Group title={t.general}>
          <SwitchRow
            label={t.sound}
            checked={sound}
            onChange={(on) => {
              setSoundEnabled(on);
              setSound(on);
            }}
          />
        </Group>
      </div>
    </dialog>
  );
}
