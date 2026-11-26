import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { GamesScreen } from '@/ui/screens/games/GamesScreen';
import { HomeScreen } from '@/ui/screens/home/HomeScreen';
import { ReviewScreen } from '@/ui/review/ReviewScreen';
import { ConnectScreen } from '@/ui/screens/connect/ConnectScreen';
import { CoursesScreen } from '@/ui/screens/courses/CoursesScreen';
import { SearchScreen } from '@/ui/screens/search/SearchScreen';
import { LicensesScreen } from '@/ui/screens/settings/LicensesScreen';
import { PrivacyScreen } from '@/ui/screens/settings/PrivacyScreen';
import { SettingsScreen } from '@/ui/screens/settings/SettingsScreen';
import { ErrorScreen } from './ErrorScreen';
import { RequireAccount } from './RequireAccount';

/**
 * Every screen has a real address (BRIEF-UI section 1) so the system back button and shared
 * links work.
 */
const screens: RouteObject[] = [
  {
    path: '/',
    element: (
      <RequireAccount>
        <HomeScreen />
      </RequireAccount>
    ),
  },
  // Without an account, My Games shows the games opened from elsewhere (Fable review 1.1 B4-03).
  { path: '/games', element: <GamesScreen /> },
  { path: '/review/:gameId', element: <ReviewScreen /> },
  { path: '/courses', element: <CoursesScreen /> },
  { path: '/search', element: <SearchScreen /> },
  { path: '/settings', element: <SettingsScreen /> },
  { path: '/settings/licenses', element: <LicensesScreen /> },
  { path: '/settings/privacy', element: <PrivacyScreen /> },
  { path: '/connect', element: <ConnectScreen /> },
  { path: '*', element: <Navigate to="/" replace /> },
];

/** One parent without an address catches an error in any screen (Fable review A3-02). */
export const routes: RouteObject[] = [{ errorElement: <ErrorScreen />, children: screens }];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
