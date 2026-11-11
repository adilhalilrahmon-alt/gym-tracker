import { useState } from 'react';
import { sendCode, signOut, syncNow, useSyncStatus, verifyCode } from '../lib/sync';

function ago(iso: string | null) {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

export function SyncCard() {
  const st = useSyncStatus();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr('');
    try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <section className="card col" style={{ gap: 10 }}>
      <h2>Cloud backup</h2>
      {!st.configured && <span className="small muted">Not connected yet. Your data is on this phone only.</span>}

      {st.configured && st.email && (
        <>
          <span className="small muted">Backed up as <strong style={{ color: 'var(--text)' }}>{st.email}</strong>. Last sync {st.phase === 'syncing' ? 'in progress…' : ago(st.lastSync)}.</span>
          {st.phase === 'error' && <span className="small warn">{st.error}</span>}
          <div className="row">
            <button className="btn subtle" disabled={st.phase === 'syncing'} onClick={() => void syncNow()}>Sync now</button>
            <button className="btn ghost" onClick={() => void signOut()}>Sign out</button>
          </div>
        </>
      )}

      {st.configured && !st.email && !sent && (
        <>
          <span className="small muted">Sign in once to back up and sync. We email you a code; no password.</span>
          <div className="field">
            <label htmlFor="sync-email">Email</label>
            <input id="sync-email" className="input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value.trim())} />
          </div>
          <button className="btn" disabled={busy || !/^\S+@\S+\.\S+$/.test(email)} onClick={() => run(async () => { await sendCode(email); setSent(true); })}>{busy ? 'Sending…' : 'Email me a code'}</button>
        </>
      )}

      {st.configured && !st.email && sent && (
        <>
          <span className="small muted">Enter the code we sent to {email}.</span>
          <div className="field">
            <label htmlFor="sync-code">Code</label>
            <input id="sync-code" className="input" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </div>
          <div className="row">
            <button className="btn" disabled={busy || code.length < 6} onClick={() => run(() => verifyCode(email, code))}>{busy ? 'Checking…' : 'Verify'}</button>
            <button className="btn ghost" onClick={() => { setSent(false); setCode(''); }}>Change email</button>
          </div>
        </>
      )}
      {err && <span className="small warn">{err}</span>}
    </section>
  );
}
