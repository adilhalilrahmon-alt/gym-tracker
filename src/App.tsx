import { useState } from 'react';
import { useStore } from './lib/store';
import { setHeightCm } from './lib/avatar';
import { Home } from './screens/Home';
import { Logger } from './screens/Logger';
import { Progress } from './screens/Progress';
import { Streak } from './screens/Streak';
import { Me } from './screens/Me';
import { WeightSheet } from './components/WeightSheet';
import { Icon } from './components/ui';

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
    </div>
  );
}
