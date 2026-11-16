import { useMessages } from '@/ui/i18n/LanguageContext';
import { MessageScreen } from '@/ui/screens/message/MessageScreen';

/**
 * What the user sees when a screen fails to show (Fable review A3-02), instead of React
 * Router's developer page. "Back to Home" reloads the app from the start.
 */
export function ErrorScreen() {
  const text = useMessages().error;
  return (
    <MessageScreen title={text.title} body={text.body} action={{ label: text.home, href: '/' }} />
  );
}
