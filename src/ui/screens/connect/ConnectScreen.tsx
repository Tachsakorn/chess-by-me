import { useId, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { local, ownerKey } from '@/data/local';
import { checkAccount, type AccountSource } from '@/data/ratings';
import { useApp } from '@/ui/app/appStore';
import { MiniBoard } from '@/ui/board/MiniBoard';
import { BackButton } from '@/ui/components/BackButton';
import { ConfirmSheet } from '@/ui/components/ConfirmSheet';
import { Segmented } from '@/ui/components/Segmented';
import { useMessages } from '@/ui/i18n/LanguageContext';
import styles from './ConnectScreen.module.css';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

type Problem = { kind: 'not-found'; name: string } | { kind: 'offline' } | { kind: 'busy' } | null;

/**
 * Connect (BRIEF-UI 6.7): the first screen of a new install, and where Settings sends the user
 * to connect or disconnect a site.
 */
export function ConnectScreen() {
  const text = useMessages();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const fromSettings = (location.state as { from?: string } | null)?.from === 'settings';
  const accounts = useApp((s) => s.accounts);
  const setAccounts = useApp((s) => s.setAccounts);
  const [site, setSite] = useState<AccountSource>(
    params.get('site') === 'chesscom' ? 'chesscom' : 'lichess',
  );
  const [name, setName] = useState('');
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const inputId = useId();
  const errorId = useId();
  const connected = accounts?.[site] ?? null;

  const submit = async () => {
    const username = name.trim();
    if (username === '' || checking) return;
    setChecking(true);
    setProblem(null);
    const result = await checkAccount(site, username);
    setChecking(false);
    if (!result.ok) {
      setProblem(
        result.error.code === 'user-not-found'
          ? { kind: 'not-found', name: username }
          : result.error.code === 'rate-limited'
            ? { kind: 'busy' }
            : { kind: 'offline' },
      );
      return;
    }
    await setAccounts({
      lichess: accounts?.lichess ?? null,
      chesscom: accounts?.chesscom ?? null,
      primary: accounts?.primary ?? site,
      [site]: result.username,
    });
    void navigate(fromSettings ? '/settings' : '/', { replace: true });
  };

  const disconnect = async () => {
    if (!connected) return;
    setDeleting(true);
    // Disconnecting deletes what was kept for that account (Fable review A2-02).
    await local.deleteOwner(ownerKey(site, connected));
    const other: AccountSource = site === 'lichess' ? 'chesscom' : 'lichess';
    const left = accounts?.[other] ?? null;
    // At least one account stays; disconnecting the last one starts the app over.
    await setAccounts(
      left ? { lichess: null, chesscom: null, [other]: left, primary: other } : null,
    );
    void navigate(left ? '/settings' : '/connect', { replace: true });
  };

  return (
    <main className={styles.page}>
      {fromSettings && (
        <div className={styles.back}>
          <BackButton />
        </div>
      )}
      <MiniBoard fen={START} lastMove={null} palette="blue" className={styles.board} />
      <h1 className={`${styles.title} t-large-title`}>{text.connect.title}</h1>
      <p className={`${styles.intro} t-body-lg c-2`}>{text.connect.intro}</p>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Segmented
          size="large"
          kind="radio"
          label={text.connect.sitesLabel}
          value={site}
          onChange={(next) => {
            setSite(next);
            setProblem(null);
          }}
          options={[
            { value: 'lichess', label: text.sites.lichess },
            { value: 'chesscom', label: text.sites.chesscom },
          ]}
        />
        <label htmlFor={inputId} className={`${styles.label} t-caption w-600 c-3`}>
          {text.connect.username(site)}
        </label>
        <input
          id={inputId}
          type="text"
          value={name}
          placeholder={connected ?? text.connect.placeholder(site)}
          autoComplete="username"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-invalid={problem !== null}
          aria-describedby={problem ? errorId : undefined}
          className={`${styles.input} squircle`}
          onChange={(event) => {
            setName(event.target.value);
            setProblem(null);
          }}
        />
        {problem && (
          <p id={errorId} role="alert" className={`${styles.error} t-caption`}>
            {problem.kind === 'not-found'
              ? text.connect.notFound(problem.name, site)
              : problem.kind === 'busy'
                ? text.connect.busy(site)
                : text.connect.offline(site)}
          </p>
        )}
        <div className={styles.spacer} />
        <button
          type="submit"
          disabled={name.trim() === '' || checking}
          aria-busy={checking}
          className={`${styles.primary} t-nav-title pressable${checking ? ` ${styles.checking}` : ''}`}
        >
          {checking ? text.connect.checking : text.connect.continue}
        </button>
        {fromSettings && connected ? (
          <button
            type="button"
            className={`${styles.link} ${styles.danger} t-body w-600 pressable`}
            onClick={() => setConfirming(true)}
          >
            {text.connect.disconnect}
          </button>
        ) : (
          <Link
            to="/search"
            state={{ pgn: true }}
            className={`${styles.link} t-body w-600 pressable`}
          >
            {text.connect.pasteInstead}
          </Link>
        )}
        <p className={`${styles.note} t-caption c-3`}>{text.connect.laterNote}</p>
      </form>
      {connected && (
        <ConfirmSheet
          open={confirming}
          title={text.connect.disconnectTitle(site)}
          body={text.connect.disconnectBody(connected)}
          confirmLabel={text.connect.disconnectConfirm}
          cancelLabel={text.connect.disconnectCancel}
          busy={deleting}
          onConfirm={() => void disconnect()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </main>
  );
}
