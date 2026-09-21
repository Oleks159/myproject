import { useEffect, useState } from 'react';
import { AppHeader } from './components/AppHeader';
import { BottomNavigation } from './components/BottomNavigation';
import { DesignNote, DesktopNavigation } from './components/DesktopChrome';
import { FriendsPage } from './pages/FriendsPage';
import { HomePage } from './pages/HomePage';
import { PlayPage } from './pages/PlayPage';
import { RewardsPage } from './pages/RewardsPage';
import { UtilityPage } from './pages/UtilityPage';

const knownRoutes = new Set(['home', 'earn', 'play', 'table', 'bots', 'missions', 'friends', 'referrals', 'rules', 'profile', 'history']);

function currentRoute() {
  const requested = window.location.hash.slice(1).split('?')[0] || 'home';
  return knownRoutes.has(requested) ? requested : 'home';
}

function ActivePage({ route }: { route: string }) {
  if (route === 'home' || route === 'earn') return <HomePage />;
  if (route === 'play' || route === 'table' || route === 'bots') return <PlayPage route={route} />;
  if (route === 'missions') return <RewardsPage />;
  if (route === 'friends' || route === 'referrals') return <FriendsPage route={route} />;
  return <UtilityPage route={route} />;
}

export function App() {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHashChange);

    void import('./runtime/controller').catch((error: unknown) => {
      const view = document.getElementById('view');
      if (view) view.innerHTML = `<div class="error-state"><h2>App konnte nicht gestartet werden</h2><p>${String(error)}</p></div>`;
    });

    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <>
      <div className="workspace">
        <DesktopNavigation />
        <main className="phone" id="phone" aria-label="TokenPokerFarm Mini App">
          <AppHeader />
          <ActivePage route={route} />
          <BottomNavigation />
        </main>
        <DesignNote />
      </div>
      <div id="toast" role="status" aria-live="polite" />
      <dialog id="modal" />
    </>
  );
}
