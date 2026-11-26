import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { findGameLink, openPasted } from '@/data/lookup';
import { pathOf } from '@/ui/app/gamePath';
import { reviewPath } from '@/ui/app/paths';
import { saveOpened } from '@/ui/app/viewedGames';
import { useMessages } from '@/ui/i18n/LanguageContext';
import { MessageScreen } from '@/ui/screens/message/MessageScreen';

/**
 * /share (1.2): what Android hands the installed app through its Web Share Target
 * (public/manifest.webmanifest). A game link anywhere in the shared url, text or title opens like
 * its short address; a shared PGN is read on the device. The service worker never sends
 * /share?... to the network (public/sw.js), and the address is replaced at once, so the shared
 * text is not left in the history.
 */
export function ShareScreen() {
  const text = useMessages();
  const location = useLocation();
  const navigate = useNavigate();
  const [nothing, setNothing] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const shared = ['url', 'text', 'title']
      .map((key) => params.get(key)?.trim() ?? '')
      .filter(Boolean);
    let current = true;
    void (async () => {
      for (const part of shared) {
        const link = findGameLink(part);
        if (link) return void navigate(pathOf(link), { replace: true });
      }
      // No link: a PGN, read here (openPasted sends nothing for text that is not a link).
      for (const part of shared) {
        const pasted = await openPasted(part);
        if (!current) return;
        if (pasted.kind === 'game') {
          await saveOpened(pasted.game);
          return void navigate(reviewPath(pasted.game.id), { replace: true });
        }
      }
      if (!current) return;
      void navigate('/share', { replace: true }); // the shared text out of the address
      setNothing(true);
    })();
    return () => {
      current = false;
    };
    // Read once, when the share arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (nothing) {
    return (
      <MessageScreen
        title={text.share.nothing}
        body={text.share.hint}
        action={{ label: text.open.toSearch, onClick: () => void navigate('/search') }}
      />
    );
  }
  return <MessageScreen title={text.open.opening} body="" />;
}
