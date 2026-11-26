import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router';
import { LanguageProvider } from '@/ui/i18n/LanguageContext';
import { useApp } from './appStore';
import { createAppRouter } from './routes';
import { SaveFailedNote, StorageScreen, UpdateNote } from './StorageScreen';

export function App() {
  const [router] = useState(createAppRouter);
  const unavailable = useApp((s) => s.storage === 'unavailable');
  useEffect(() => {
    void useApp.getState().load();
    // Back on the screen (an installed app brought back, a tab shown again): new games come in
    // (Fable review 1.1 B5-04).
    const onVisible = () => {
      if (document.visibilityState === 'visible') useApp.getState().refreshOnReturn();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  return (
    <LanguageProvider>
      {unavailable ? <StorageScreen /> : <RouterProvider router={router} />}
      <SaveFailedNote />
      <UpdateNote />
    </LanguageProvider>
  );
}
