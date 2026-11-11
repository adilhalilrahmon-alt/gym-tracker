import { useEffect, useState } from 'react';
import { googleRedirectResult, syncAllNow } from './lib/sync';
import { actions, useStore } from './lib/store';
import { setHeightCm } from './lib/avatar';
import { Home } from './screens/Home';
import { Logger } from './screens/Logger';
import { Progress } from './screens/Progress';
import { Streak } from './screens/Streak';
import { Me } from './screens/Me';
import { WeightSheet } from './components/WeightSheet';
import { Icon, Sheet } from './components/ui';

type Tab = 'home' | 'progress' | 'streak' | 'me';
const TABS: { id: Tab; label: string; icon: JSX.Element }[] = [
  { id: 'home', label: 'Home', icon: Icon.home },
  { id: 'progress', label: 'Progress', icon: Icon.progress },
  { id: 'streak', label: 'Streak', icon: Icon.streak },
  { id: 'me', label: 'Me', icon: Icon.me },
];

export function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [logging, setLogging] = useState(false);
  const [weight, setWeight] = useState(false);
  const active = useStore((s) => s.active);
  const [notice, setNotice] = useState<string | null>(null);
  const tz = useStore((s) => s.settings.tz);
  useEffect(() => {
    const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (here && here !== tz) actions.updateSettings({ tz: here });
  }, [tz]);
  useEffect(() => {
    const r = googleRedirectResult();
    if (!r) return;
    setTab('me');
    const msgs: Record<string, string> = {
      connected: 'Google Health is connected. Your recent weigh-ins are being pulled in now.',
      cancelled: 'Google connection was cancelled. Nothing changed.',
      expired: 'That connection attempt expired. Tap Connect Google Health again.',
      failed: 'Google sign-in went through, but saving the connection failed. Try again in a minute.',
    };
    setNotice(msgs[r] ?? 'Google connection finished.');
    if (r === 'connected') void syncAllNow();
  }, []);
  setHeightCm(useStore((s) => s.settings.heightCm));

  return (
    <div className="app">
      {tab === 'home' && <Home onWeight={() => setWeight(true)} onGo={setTab} />}
      {tab === 'progress' && <Progress onWeight={() => setWeight(true)} />}
      {tab === 'streak' && <Streak />}
      {tab === 'me' && <Me />}

      <button className={`fab ${active ? 'live' : ''}`} aria-label={active ? 'Resume workout' : 'Log a workout'} onClick={() => setLogging(true)}>{Icon.plus}</button>

      <nav className="nav" aria-label="Main">
        {TABS.map((t) => (
          <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>{t.icon}{t.label}</button>
        ))}
      </nav>

      {logging && <Logger onClose={() => setLogging(false)} />}
      {weight && <WeightSheet onClose={() => setWeight(false)} />}
      {notice && (
        <Sheet title="Google Health" onClose={() => setNotice(null)}>
          <p style={{ margin: 0 }}>{notice}</p>
          <button className="btn big-btn" onClick={() => setNotice(null)}>OK</button>
        </Sheet>
      )}
    </div>
  );
}
