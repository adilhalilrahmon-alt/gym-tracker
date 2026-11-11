// Cloud sync with Supabase: email-code sign-in, full pull + incremental push.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { SUPABASE_KEY, SUPABASE_URL } from './config';
import { getState, onLocalChange, setState } from './store';
import { collectPush, mergeRemote, type Remote } from './merge';

export interface SyncStatus {
  configured: boolean;
  email: string | null;
  phase: 'idle' | 'syncing' | 'error';
  lastSync: string | null;
  error?: string;
}

const META = 'gym-tracker:sync';
const readMeta = (): { lastPushAt: string; lastSync: string | null } => {
  try { return { lastPushAt: '', lastSync: null, ...JSON.parse(localStorage.getItem(META) ?? '{}') }; } catch { return { lastPushAt: '', lastSync: null }; }
};
const writeMeta = (m: { lastPushAt: string; lastSync: string | null }) => { try { localStorage.setItem(META, JSON.stringify(m)); } catch { /* ignore */ } };

const client: SupabaseClient | null = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })
  : null;

let status: SyncStatus = { configured: !!client, email: null, phase: 'idle', lastSync: readMeta().lastSync };
const subs = new Set<() => void>();
const setStatus = (p: Partial<SyncStatus>) => { status = { ...status, ...p }; subs.forEach((f) => f()); };

export function useSyncStatus() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => status);
}

let running: Promise<void> | null = null;
let again = false;

export function syncNow(): Promise<void> {
  if (!client || !status.email) return Promise.resolve();
  if (running) { again = true; return running; }
  running = (async () => {
    setStatus({ phase: 'syncing', error: undefined });
    try {
      const { data: auth } = await client.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error('Signed out');
      const [w, wi, m, st] = await Promise.all([
        client.from('workouts').select('id,data,deleted,updated_at'),
        client.from('weigh_ins').select('date,weight,body_fat,source,deleted,updated_at'),
        client.from('measurements').select('date,data,deleted,updated_at'),
        client.from('settings').select('data,updated_at').maybeSingle(),
      ]);
      const err = w.error || wi.error || m.error || st.error;
      if (err) throw err;
      const remote: Remote = { workouts: w.data ?? [], weigh_ins: wi.data ?? [], measurements: m.data ?? [], settings: st.data ?? null };
      setState((s) => mergeRemote(s, remote), { remote: true });

      const meta = readMeta();
      const pushStart = new Date().toISOString();
      const p = collectPush(getState(), meta.lastPushAt, pushStart);
      const withUser = <T extends object>(rows: T[]) => rows.map((r) => ({ ...r, user_id: uid }));
      const ops = [];
      if (p.workouts.length) ops.push(client.from('workouts').upsert(withUser(p.workouts), { onConflict: 'user_id,id' }));
      if (p.weigh_ins.length) ops.push(client.from('weigh_ins').upsert(withUser(p.weigh_ins), { onConflict: 'user_id,date' }));
      if (p.measurements.length) ops.push(client.from('measurements').upsert(withUser(p.measurements), { onConflict: 'user_id,date' }));
      if (p.settings) ops.push(client.from('settings').upsert({ ...p.settings, user_id: uid }, { onConflict: 'user_id' }));
      for (const r of await Promise.all(ops)) if (r.error) throw r.error;

      const done = new Date().toISOString();
      writeMeta({ lastPushAt: pushStart, lastSync: done });
      setStatus({ phase: 'idle', lastSync: done });
    } catch (e) {
      setStatus({ phase: 'error', error: navigator.onLine === false ? 'Offline. Will sync when you reconnect.' : (e as Error).message });
    } finally {
      running = null;
      if (again) { again = false; void syncNow(); }
    }
  })();
  return running;
}

export async function sendCode(email: string) {
  if (!client) throw new Error('Cloud sync is not set up yet');
  const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw error;
}

export async function verifyCode(email: string, token: string) {
  if (!client) throw new Error('Cloud sync is not set up yet');
  const { error } = await client.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  writeMeta({ ...readMeta(), lastPushAt: '' }); // first sign-in on this device: upload everything
}

export async function signOut() {
  await client?.auth.signOut();
  setStatus({ email: null });
}

let timer: ReturnType<typeof setTimeout> | undefined;
export function startSync() {
  if (!client) return;
  client.auth.onAuthStateChange((_e, session) => {
    const email = session?.user.email ?? null;
    const was = status.email;
    setStatus({ email });
    if (email && !was) void syncNow();
  });
  onLocalChange(() => { clearTimeout(timer); timer = setTimeout(() => void syncNow(), 2500); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void syncNow(); });
  window.addEventListener('online', () => void syncNow());
}
