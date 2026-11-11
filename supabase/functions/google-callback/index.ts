// Gym Tracker ↔ Google Health, as one Supabase Edge Function.
//   GET  ?code=…&state=…            Google's OAuth redirect: store tokens, send the user back to the app
//   POST {action:"start"}           → { url } to open Google's consent screen   (needs the user's session)
//   POST {action:"sync"}            pull weigh-ins + workout heart rate into the user's tables
//   POST {action:"disconnect"}      forget the Google tokens
// Deploy with JWT verification OFF (Google's redirect carries no Supabase token); POST actions verify the user here.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CLIENT_ID = '658463936124-m49do2s4ha8012iao5k5vj64nrjvgt9h.apps.googleusercontent.com';
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
function serverKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    const k = keys.default ?? Object.values(keys)[0];
    if (k) return k as string;
  } catch { /* fall back */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
}
const SERVICE_KEY = serverKey();
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/google-callback`;
const APP_URL = 'https://adilhalilrahmon-alt.github.io/gym-tracker/';
const SCOPE = 'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly';
const API = 'https://health.googleapis.com/v4/users/me/dataTypes';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function userFrom(req: Request): Promise<string | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  return data.user?.id ?? null;
}

async function setStatus(userId: string, patch: Record<string, unknown>) {
  await admin.from('integrations').upsert({ user_id: userId, provider: 'google', ...patch }, { onConflict: 'user_id,provider' });
}

// ---------- OAuth ----------
async function start(userId: string) {
  const state = crypto.randomUUID() + crypto.randomUUID().slice(0, 8);
  await admin.from('oauth_states').delete().lt('created_at', new Date(Date.now() - 3600e3).toISOString());
  await admin.from('oauth_states').insert({ state, user_id: userId });
  const p = new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code', scope: SCOPE,
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
  });
  return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${p}` });
}

function backToApp(result: string) {
  return new Response(null, { status: 302, headers: { Location: `${APP_URL}#google-${result}` } });
}

async function callback(url: URL) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state') ?? '';
  if (url.searchParams.get('error') || !code) return backToApp('cancelled');
  const { data: st } = await admin.from('oauth_states').select('user_id,created_at').eq('state', state).maybeSingle();
  await admin.from('oauth_states').delete().eq('state', state);
  if (!st || Date.now() - Date.parse(st.created_at) > 3600e3) return backToApp('expired');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }),
  });
  const tok = await res.json();
  if (!res.ok || !tok.refresh_token) {
    await setStatus(st.user_id, { last_error: `Token exchange failed: ${tok.error_description ?? tok.error ?? res.status}` });
    return backToApp('failed');
  }
  await admin.from('google_tokens').upsert({
    user_id: st.user_id, refresh_token: tok.refresh_token, access_token: tok.access_token,
    expires_at: new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString(), scope: tok.scope, updated_at: new Date().toISOString(),
  });
  await setStatus(st.user_id, { connected_at: new Date().toISOString(), last_error: null });
  return backToApp('connected');
}

async function accessToken(userId: string): Promise<string> {
  const { data: t } = await admin.from('google_tokens').select('*').eq('user_id', userId).maybeSingle();
  if (!t) throw new Error('not_connected');
  if (t.access_token && t.expires_at && Date.parse(t.expires_at) > Date.now()) return t.access_token;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: t.refresh_token, grant_type: 'refresh_token' }),
  });
  const tok = await res.json();
  if (!res.ok) {
    if (tok.error === 'invalid_grant') {
      await admin.from('google_tokens').delete().eq('user_id', userId);
      await setStatus(userId, { connected_at: null, last_error: 'Google access expired. Tap Connect again.' });
      throw new Error('reconnect');
    }
    throw new Error(`refresh failed: ${tok.error ?? res.status}`);
  }
  await admin.from('google_tokens').update({ access_token: tok.access_token, expires_at: new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString(), updated_at: new Date().toISOString() }).eq('user_id', userId);
  return tok.access_token;
}

// ---------- Google Health reads ----------
type DP = Record<string, any>;
let diag: Record<string, unknown> = {};
async function listPoints(token: string, type: string, filter: string): Promise<DP[]> {
  const out: DP[] = [];
  let pageToken = '';
  for (let i = 0; i < 20; i++) {
    const p = new URLSearchParams({ filter, pageSize: '10000' });
    if (pageToken) p.set('pageToken', pageToken);
    const res = await fetch(`${API}/${type}/dataPoints?${p}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    const body = await res.json();
    if (!res.ok) throw new Error(`${type}: ${body.error?.message ?? res.status}`);
    out.push(...(body.dataPoints ?? []));
    pageToken = body.nextPageToken ?? '';
    if (!pageToken) break;
  }
  return out;
}

const offsetSec = (o?: string) => (o ? parseFloat(o) : 0) || 0;
function localDate(sample: { physicalTime: string; utcOffset?: string }) {
  const t = Date.parse(sample.physicalTime) + offsetSec(sample.utcOffset) * 1000;
  return new Date(t).toISOString().slice(0, 10);
}
function firstNumber(o: DP | undefined, prefer: string[]): number | null {
  if (!o) return null;
  for (const k of prefer) if (o[k] != null && !isNaN(Number(o[k]))) return Number(o[k]);
  for (const [k, v] of Object.entries(o)) if (k !== 'sampleTime' && v != null && typeof v !== 'object' && !isNaN(Number(v))) return Number(v);
  return null;
}

async function syncWeights(userId: string, token: string, since: string) {
  const f = (t: string) => `${t}.sample_time.physical_time >= "${since}"`;
  const [w, bf] = await Promise.all([listPoints(token, 'weight', f('weight')), listPoints(token, 'body-fat', f('body_fat')).catch((e) => { diag.bodyFatError = String(e.message); return [] as DP[]; })]);
  diag.weightPoints = w.length; diag.bodyFatPoints = bf.length;
  diag.weightSample = w[0] ? JSON.stringify(w[w.length - 1]).slice(0, 600) : null;
  diag.bodyFatSample = bf[0] ? JSON.stringify(bf[bf.length - 1]).slice(0, 600) : null;
  // Earliest reading of each local day = the morning weigh-in.
  const days = new Map<string, { t: number; weight?: number; bodyFat?: number }>();
  for (const p of w) {
    const s = p.weight?.sampleTime; const g = firstNumber(p.weight, ['weightGrams']);
    if (!s || g == null) continue;
    const d = localDate(s); const t = Date.parse(s.physicalTime);
    const cur = days.get(d);
    if (!cur || cur.weight == null || t < cur.t) days.set(d, { ...cur, t, weight: Math.round((g / 453.59237) * 10) / 10 });
  }
  for (const p of bf) {
    const s = p.bodyFat?.sampleTime; const v = firstNumber(p.bodyFat, ['percentage', 'bodyFatPercentage']);
    if (!s || v == null) continue;
    const d = localDate(s);
    const cur = days.get(d) ?? { t: Date.parse(s.physicalTime) };
    if (cur.bodyFat == null) days.set(d, { ...cur, bodyFat: Math.round(v * 10) / 10 });
  }
  if (!days.size) return 0;
  const { data: existing } = await admin.from('weigh_ins').select('date,weight,body_fat,source,updated_at').eq('user_id', userId).in('date', [...days.keys()]);
  const byDate = new Map((existing ?? []).map((r: DP) => [r.date, r]));
  const now = new Date().toISOString();
  const rows = [];
  for (const [date, v] of days) {
    if (v.weight == null) continue;
    const ex = byDate.get(date);
    const same = ex && ex.source === 'scale' && Number(ex.weight) === v.weight && (ex.body_fat == null ? v.bodyFat == null : Number(ex.body_fat) === v.bodyFat);
    // The scale is the source of truth: it replaces a typed-in weight for the same day.
    if (same) continue;
    rows.push({ user_id: userId, date, weight: v.weight, body_fat: v.bodyFat ?? null, source: 'scale', deleted: false, updated_at: now });
  }
  if (rows.length) {
    const { error } = await admin.from('weigh_ins').upsert(rows, { onConflict: 'user_id,date' });
    if (error) throw error;
  }
  return rows.length;
}

async function syncHeartRate(userId: string, token: string) {
  const since = new Date(Date.now() - 4 * 864e5).toISOString();
  const { data: ws } = await admin.from('workouts').select('id,data').eq('user_id', userId).eq('deleted', false).gte('data->>startedAt', since);
  let n = 0;
  for (const w of ws ?? []) {
    const d = w.data as DP;
    if (d.hr || !d.startedAt || !d.endedAt) continue;
    const start = new Date(Date.parse(d.startedAt) - 60e3).toISOString();
    const end = new Date(Date.parse(d.endedAt) + 60e3).toISOString();
    const pts = await listPoints(token, 'heart-rate', `heart_rate.sample_time.physical_time >= "${start}" AND heart_rate.sample_time.physical_time < "${end}"`);
    const samples = pts
      .map((p) => ({ t: Date.parse(p.heartRate?.sampleTime?.physicalTime), bpm: Number(p.heartRate?.beatsPerMinute) }))
      .filter((s) => s.t && s.bpm > 30 && s.bpm < 230)
      .sort((a, b) => a.t - b.t);
    // Wait for the Air to sync a reasonable amount of the session before saving.
    const minutes = (Date.parse(d.endedAt) - Date.parse(d.startedAt)) / 60e3;
    if (samples.length < Math.max(10, minutes * 0.5)) continue;
    const t0 = Date.parse(d.startedAt);
    const buckets: number[][] = [];
    for (const s of samples) {
      const i = Math.max(0, Math.floor((s.t - t0) / 60e3));
      (buckets[i] ??= []).push(s.bpm);
    }
    const series = Array.from(buckets, (b) => (b && b.length ? Math.round(b.reduce((a, x) => a + x, 0) / b.length) : null));
    const avg = Math.round(samples.reduce((a, s) => a + s.bpm, 0) / samples.length);
    const max = Math.max(...samples.map((s) => s.bpm));
    const hr = { avg, max, series, samples: samples.length };
    const { error } = await admin.from('workouts').update({ data: { ...d, hr }, updated_at: new Date().toISOString() }).eq('user_id', userId).eq('id', w.id);
    if (error) throw error;
    n++;
  }
  return n;
}

async function sync(userId: string) {
  const { data: st } = await admin.from('integrations').select('last_sync_at').eq('user_id', userId).eq('provider', 'google').maybeSingle();
  const since = st?.last_sync_at ? new Date(Date.parse(st.last_sync_at) - 3 * 864e5).toISOString() : new Date(Date.now() - 120 * 864e5).toISOString();
  diag = { since };
  try {
    const token = await accessToken(userId);
    // 24 h of heart rate, to confirm the watch data is reachable.
    try {
      const hr = await listPoints(token, 'heart-rate', `heart_rate.sample_time.physical_time >= "${new Date(Date.now() - 864e5).toISOString()}"`);
      diag.heartRate24h = hr.length;
      diag.heartRateSample = hr[0] ? JSON.stringify(hr[hr.length - 1]).slice(0, 400) : null;
    } catch (e) { diag.heartRateError = String((e as Error).message); }
    const weighIns = await syncWeights(userId, token, since);
    const workouts = await syncHeartRate(userId, token);
    diag.weighInsWritten = weighIns; diag.workoutsWithHr = workouts;
    await setStatus(userId, { last_sync_at: new Date().toISOString(), last_error: null, debug: diag });
    return json({ ok: true, weighIns, workouts });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg !== 'not_connected' && msg !== 'reconnect') await setStatus(userId, { last_error: msg.slice(0, 300), debug: { ...diag, error: msg } });
    return json({ ok: false, error: msg }, msg === 'not_connected' ? 409 : 500);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  if (req.method === 'GET') return callback(url);
  const userId = await userFrom(req);
  if (!userId) return json({ error: 'unauthorized' }, 401);
  const { action } = await req.json().catch(() => ({ action: '' }));
  if (action === 'start') return start(userId);
  if (action === 'sync') return sync(userId);
  if (action === 'disconnect') {
    await admin.from('google_tokens').delete().eq('user_id', userId);
    await admin.from('integrations').delete().eq('user_id', userId).eq('provider', 'google');
    return json({ ok: true });
  }
  return json({ error: 'unknown action' }, 400);
});
