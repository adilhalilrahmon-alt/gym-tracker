// Cloud sync with Supabase: email-code sign-in, full pull + incremental push.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { APP_URL, SUPABASE_KEY, SUPABASE_URL } from './config';
import { actions, getState, onLocalChange, setState } from './store';
import { collectPush, mergeRemote, type Remote } from './merge';

export interface GoogleStatus {
  connected: boolean;
  lastSync: string | null;
  error: string | null;
}

export interface SyncStatus {
  configured: boolean;
  email: string | null;
  google: GoogleStatus | null;
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

let status: SyncStatus = { configured: !!client, email: null, google: null, phase: 'idle', lastSync: readMeta().lastSync };
let lastGoogle = 0;
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
      await refreshGoogle(false);
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
      const ins = await client.from('insights').select('id,kind,ref,text,created_at').order('created_at', { ascending: false }).limit(200);
      if (!ins.error) actions.setInsights(ins.data ?? []);

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

export async function signIn(email: string, password: string) {
  if (!client) throw new Error('Cloud sync is not set up yet');
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message === 'Email not confirmed' ? 'Confirm your email first: tap the link we sent, then sign in here.' : error.message);
  writeMeta({ ...readMeta(), lastPushAt: '' }); // first sign-in on this device: upload everything
}

/** Returns true when an email confirmation is needed before signing in. */
export async function signUp(email: string, password: string): Promise<boolean> {
  if (!client) throw new Error('Cloud sync is not set up yet');
  const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: APP_URL } });
  if (error) throw error;
  if (data.session) writeMeta({ ...readMeta(), lastPushAt: '' });
  return !data.session;
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

// ---------- Google Health ----------
async function callGoogle(action: string) {
  if (!client) throw new Error('Cloud sync is not set up yet');
  const { data, error } = await client.functions.invoke('google-callback', { body: { action } });
  if (error) {
    let msg = error.message;
    try { const b = await (error as { context?: Response }).context?.json(); if (b?.error) msg = b.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return data;
}

async function loadGoogleStatus() {
  if (!client) return;
  const { data } = await client.from('integrations').select('connected_at,last_sync_at,last_error').eq('provider', 'google').maybeSingle();
  setStatus({ google: { connected: !!data?.connected_at, lastSync: data?.last_sync_at ?? null, error: data?.last_error ?? null } });
}

/** Ask the server to pull new Renpho weigh-ins and workout heart rate from Google Health (at most every 10 min unless forced). */
export async function refreshGoogle(force: boolean) {
  if (!client || !status.email) return;
  if (!status.google) await loadGoogleStatus();
  if (!status.google?.connected) return;
  if (!force && Date.now() - lastGoogle < 10 * 60e3) return;
  lastGoogle = Date.now();
  try { await callGoogle('sync'); } catch { /* status row carries the error */ }
  await loadGoogleStatus();
}

export async function connectGoogle() {
  const { url } = await callGoogle('start');
  window.location.href = url;
}

export async function disconnectGoogle() {
  await callGoogle('disconnect');
  await loadGoogleStatus();
}

/** Handle the #google-connected style hash the server redirects back with. */
export function googleRedirectResult(): string | null {
  const m = location.hash.match(/^#google-(\w+)/);
  if (!m) return null;
  history.replaceState(null, '', location.pathname + location.search);
  return m[1];
}

export async function syncAllNow() {
  lastGoogle = 0;
  await syncNow();
}

// ---------- Coach, notifications, avatar ----------
export async function coachNote(workoutId: string, force = false): Promise<string> {
  const { text } = await callGoogle2({ action: 'coach', workoutId, force });
  await syncNow();
  return text;
}
export async function weeklyNow(): Promise<string> {
  const { text } = await callGoogle2({ action: 'weekly' });
  await syncNow();
  return text;
}
export async function avatarFromPhoto(image: string) {
  const { features } = await callGoogle2({ action: 'avatar', image });
  return features;
}
async function callGoogle2(body: Record<string, unknown>) {
  if (!client) throw new Error('Cloud sync is not set up yet');
  const { data, error } = await client.functions.invoke('google-callback', { body });
  if (error) {
    let msg = error.message;
    try { const b = await (error as { context?: Response }).context?.json(); if (b?.error) msg = b.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return data;
}

const b64ToBytes = (b64: string) => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

export function pushSupport(): 'ok' | 'install' | 'unsupported' {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return standalone ? 'unsupported' : 'install';
  return 'ok';
}

export async function pushState(): Promise<'on' | 'off' | 'denied'> {
  if (pushSupport() !== 'ok') return 'off';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

export async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications were not allowed. You can turn them on in iPhone Settings → Notifications → Gym Tracker.');
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('./sw.js'));
  await navigator.serviceWorker.ready;
  const { publicKey } = await callGoogle2({ action: 'vapid' });
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) }));
  await callGoogle2({ action: 'subscribe', subscription: sub.toJSON() });
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await callGoogle2({ action: 'unsubscribe', endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  }
}

export async function testPush(): Promise<number> {
  const { sent } = await callGoogle2({ action: 'test-push' });
  return sent;
}
