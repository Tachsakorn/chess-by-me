import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router';
import { LanguageProvider } from '@/ui/i18n/LanguageContext';
import { useApp } from './appStore';
import { createAppRouter } from './routes';
import { SaveFailedNote, StorageScreen } from './StorageScreen';

export function App() {
  const [router] = useState(createAppRouter);
  const unavailable = useApp((s) => s.storage === 'unavailable');
  useEffect(() => {
    void useApp.getState().load();
  }, []);
  return (
    <LanguageProvider>
      {unavailable ? <StorageScreen /> : <RouterProvider router={router} />}
      <SaveFailedNote />
    </LanguageProvider>
  );
}
