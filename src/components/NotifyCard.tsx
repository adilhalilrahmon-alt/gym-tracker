import { useEffect, useState } from 'react';
import { disablePush, enablePush, pushState, pushSupport, testPush, useSyncStatus } from '../lib/sync';
import { actions, useStore, type NotifyKind } from '../lib/store';

const KINDS: { k: NotifyKind; label: string; hint: string }[] = [
  { k: 'weighIn', label: 'Morning weigh-in', hint: 'Only if the scale has not synced by your reminder time' },
  { k: 'coach', label: 'Coach note after workouts', hint: 'Once heart rate is in, or 45 min after you finish' },
  { k: 'weekly', label: 'Sunday review', hint: 'Sundays at 6 pm' },
  { k: 'measure', label: 'Measurement day', hint: 'Every 2 weeks, in the morning' },
];

export function NotifyCard() {
  const st = useSyncStatus();
  const notifyRaw = useStore((s) => s.settings.notify);
  const notify = notifyRaw ?? {};
  const [state, setState] = useState<'on' | 'off' | 'denied' | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const support = pushSupport();

  useEffect(() => { void pushState().then(setState); }, []);
  if (!st.email) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(''); setMsg('');
    try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); setState(await pushState()); }
  };

  return (
    <section className="card col" style={{ gap: 10 }}>
      <h2>Notifications</h2>
      {support === 'install' && <span className="small muted">Open Gym Tracker from your Home Screen icon to turn on notifications. iPhone only allows them for Home Screen apps.</span>}
      {support === 'unsupported' && <span className="small muted">This device doesn't support web notifications. iPhones need iOS 16.4 or newer.</span>}
      {support === 'ok' && state === 'denied' && <span className="small warn">Notifications are blocked. Turn them on in iPhone Settings → Notifications → Gym Tracker.</span>}
      {support === 'ok' && state === 'off' && (
        <>
          <span className="small muted">A few useful nudges, never more than one or two a day.</span>
          <button className="btn" disabled={busy} onClick={() => run(enablePush)}>{busy ? 'Turning on…' : 'Turn on notifications'}</button>
        </>
      )}
      {support === 'ok' && state === 'on' && (
        <>
          {KINDS.map(({ k, label, hint }) => (
            <label key={k} className="between" style={{ gap: 12 }}>
              <span className="col" style={{ gap: 0 }}><span style={{ fontWeight: 700 }}>{label}</span><span className="tiny muted">{hint}</span></span>
              <input type="checkbox" checked={notify[k] !== false} onChange={(e) => actions.updateSettings({ notify: { ...notify, [k]: e.target.checked } })} style={{ width: 24, height: 24, accentColor: '#FFB547' }} />
            </label>
          ))}
          <div className="row">
            <button className="btn subtle" disabled={busy} onClick={() => run(async () => { const n = await testPush(); setMsg(n ? 'Test sent. It should arrive in a few seconds.' : 'No device subscribed yet. Turn notifications off and on again.'); })}>Send a test</button>
            <button className="btn ghost" disabled={busy} onClick={() => run(disablePush)}>Turn off</button>
          </div>
        </>
      )}
      {msg && <span className="small up">{msg}</span>}
      {err && <span className="small warn">{err}</span>}
    </section>
  );
}
