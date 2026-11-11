import { useState } from 'react';
import { connectGoogle, disconnectGoogle, syncAllNow, useSyncStatus } from '../lib/sync';

function ago(iso: string | null) {
  if (!iso) return 'not yet';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

export function GoogleCard() {
  const st = useSyncStatus();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirmOff, setConfirmOff] = useState(false);
  if (!st.configured || !st.email) return null;
  const g = st.google;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr('');
    try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <section className="card col" style={{ gap: 10 }}>
      <h2>Google Health</h2>
      {!g?.connected ? (
        <>
          <span className="small muted">Pull in your Renpho weigh-ins and your Fitbit Air heart rate for each workout. Read-only: the app can't change anything in Google Health.</span>
          {g?.error && <span className="small warn">{g.error}</span>}
          <button className="btn" disabled={busy} onClick={() => run(connectGoogle)}>{busy ? 'Opening Google…' : 'Connect Google Health'}</button>
          <span className="tiny muted">Sign in with your main Google account. Google will warn that the app isn't verified; that's expected for your own private app. Tap Continue.</span>
        </>
      ) : (
        <>
          <span className="small muted">Connected. Last pulled {ago(g.lastSync)}. Weigh-ins and workout heart rate update when you open the app.</span>
          {g.error && <span className="small warn">{g.error}</span>}
          <div className="row">
            <button className="btn subtle" disabled={busy || st.phase === 'syncing'} onClick={() => run(syncAllNow)}>{st.phase === 'syncing' ? 'Syncing…' : 'Sync now'}</button>
            <button className="btn ghost" disabled={busy} onClick={() => {
              if (!confirmOff) { setConfirmOff(true); setTimeout(() => setConfirmOff(false), 3000); return; }
              void run(disconnectGoogle);
            }}>{confirmOff ? 'Tap again' : 'Disconnect'}</button>
          </div>
        </>
      )}
      {err && <span className="small warn">{err}</span>}
    </section>
  );
}
