import { useState } from 'react';
import { signIn, signOut, signUp, syncNow, useSyncStatus } from '../lib/sync';

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
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(''); setMsg('');
    try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const valid = /^\S+@\S+\.\S+$/.test(email) && pw.length >= 8;

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

      {st.configured && !st.email && (
        <form className="col" style={{ gap: 10 }} onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          void run(async () => {
            if (mode === 'in') await signIn(email, pw);
            else if (await signUp(email, pw)) { setMode('in'); setMsg('Check your email and tap the confirmation link, then come back and sign in here.'); }
          });
        }}>
          <span className="small muted">{mode === 'in' ? 'Sign in to back up and sync across devices.' : 'Create your account. You only do this once.'}</span>
          <div className="field">
            <label htmlFor="sync-email">Email</label>
            <input id="sync-email" className="input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value.trim())} />
          </div>
          <div className="field">
            <label htmlFor="sync-pw">Password{mode === 'up' ? ' (8+ characters)' : ''}</label>
            <input id="sync-pw" className="input" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          <div className="row">
            <button className="btn" type="submit" disabled={busy || !valid}>{busy ? 'One sec…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
            <button className="btn ghost" type="button" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setErr(''); setMsg(''); }}>{mode === 'in' ? 'New here?' : 'Have an account?'}</button>
          </div>
        </form>
      )}
      {msg && <span className="small up">{msg}</span>}
      {err && <span className="small warn">{err}</span>}
    </section>
  );
}
