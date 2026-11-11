// Gym Tracker ↔ Google Health, as one Supabase Edge Function.
//   GET  ?code=…&state=…            Google's OAuth redirect: store tokens, send the user back to the app
//   POST {action:"start"}           → { url } to open Google's consent screen   (needs the user's session)
//   POST {action:"sync"}            pull weigh-ins + workout heart rate into the user's tables
//   POST {action:"disconnect"}      forget the Google tokens
//   POST {action:"coach", workoutId} write (or return) the coach note for one workout
//   POST {action:"weekly"}          write this week's review now
//   POST {action:"vapid"}           → { publicKey } for push subscriptions
//   POST {action:"subscribe"|"unsubscribe", subscription}   manage this device's push subscription
//   POST {action:"test-push"}       send a test notification to the user's devices
//   POST {action:"avatar", image}   read face/hair features from a photo (photo is not stored)
//   POST {action:"cron"} + x-cron-secret header   15-minute tick: syncs, reminders, coach notes
// Deploy with JWT verification OFF (Google's redirect carries no Supabase token); POST actions verify the user here.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

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
  diag.weightAll = w.map((p) => ({
    t: p.weight?.sampleTime?.physicalTime, off: p.weight?.sampleTime?.utcOffset, g: p.weight?.weightGrams,
    lb: Math.round((Number(p.weight?.weightGrams) / 453.59237) * 10) / 10,
    src: [p.dataSource?.platform, p.dataSource?.application?.packageName ?? p.dataSource?.application?.name, p.dataSource?.device?.manufacturer].filter(Boolean).join(' / '),
  }));
  diag.bodyFatAll = bf.map((p) => ({ t: p.bodyFat?.sampleTime?.physicalTime, pct: p.bodyFat?.percentage, src: p.dataSource?.application?.packageName ?? p.dataSource?.platform }));
  diag.weightSample = w[0] ? JSON.stringify(w[w.length - 1]).slice(0, 600) : null;
  diag.bodyFatSample = bf[0] ? JSON.stringify(bf[bf.length - 1]).slice(0, 600) : null;
  // Morning session = readings within 30 min of the day's first one; use the LAST of those
  // (scales often log a few readings while settling or when re-weighing).
  const SESSION = 30 * 60e3;
  function pick<T>(pts: { d: string; t: number; v: T }[]) {
    const byDay = new Map<string, { d: string; t: number; v: T }[]>();
    for (const p of pts) byDay.set(p.d, [...(byDay.get(p.d) ?? []), p]);
    const out = new Map<string, { t: number; v: T }>();
    for (const [d, list] of byDay) {
      list.sort((a, b) => a.t - b.t);
      const session = list.filter((p) => p.t - list[0].t <= SESSION);
      const last = session[session.length - 1];
      out.set(d, { t: last.t, v: last.v });
    }
    return out;
  }
  const wPts = w.flatMap((p) => {
    const s = p.weight?.sampleTime; const g = firstNumber(p.weight, ['weightGrams']);
    return s && g != null ? [{ d: localDate(s), t: Date.parse(s.physicalTime), v: Math.round((g / 453.59237) * 10) / 10 }] : [];
  });
  const bfPts = bf.flatMap((p) => {
    const s = p.bodyFat?.sampleTime; const v = firstNumber(p.bodyFat, ['percentage', 'bodyFatPercentage']);
    return s && v != null ? [{ d: localDate(s), t: Date.parse(s.physicalTime), v: Math.round(v * 10) / 10 }] : [];
  });
  const wDay = pick(wPts);
  const bfDay = pick(bfPts);
  const days = new Map<string, { t: number; weight?: number; bodyFat?: number }>();
  for (const [d, x] of wDay) days.set(d, { t: x.t, weight: x.v, bodyFat: bfDay.get(d)?.v });
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

async function syncCore(userId: string) {
  const { data: st } = await admin.from('integrations').select('last_sync_at').eq('user_id', userId).eq('provider', 'google').maybeSingle();
  const since = st?.last_sync_at ? new Date(Date.parse(st.last_sync_at) - 3 * 864e5).toISOString() : new Date(Date.now() - 120 * 864e5).toISOString();
  diag = { since };
  try {
    const token = await accessToken(userId);
    const weighIns = await syncWeights(userId, token, since);
    const workouts = await syncHeartRate(userId, token);
    diag.weighInsWritten = weighIns; diag.workoutsWithHr = workouts;
    await setStatus(userId, { last_sync_at: new Date().toISOString(), last_error: null, debug: diag });
    return { ok: true, weighIns, workouts };
  } catch (e) {
    const msg = (e as Error).message;
    if (msg !== 'not_connected' && msg !== 'reconnect') await setStatus(userId, { last_error: msg.slice(0, 300), debug: { ...diag, error: msg } });
    return { ok: false, error: msg };
  }
}

async function sync(userId: string) {
  const r = await syncCore(userId);
  return json(r, r.ok ? 200 : r.error === 'not_connected' ? 409 : 500);
}

// ======================= Coach, push, scheduler =======================
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const MODEL = 'claude-sonnet-5-5';

interface Settings { goalWeight?: number; weeklyTarget?: number; heightCm?: number; reminderTime?: string; maxHr?: number; tz?: string; notify?: Record<string, boolean>; }
async function settingsOf(userId: string): Promise<Settings> {
  const { data } = await admin.from('settings').select('data').eq('user_id', userId).maybeSingle();
  return (data?.data ?? {}) as Settings;
}
const notifyOn = (s: Settings, k: string) => s.notify?.[k] !== false;

async function claude(system: string, content: unknown[], maxTokens = 400): Promise<string> {
  if (!ANTHROPIC_KEY) throw new Error('no_ai_key');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`AI: ${body.error?.message ?? res.status}`);
  return (body.content ?? []).filter((b: DP) => b.type === 'text').map((b: DP) => b.text).join('').trim();
}

const e1rm = (w: number, r: number) => (r <= 1 ? w : w * (1 + r / 30));
function bestSet(ex: DP) {
  let best = 0, top = '';
  for (const s of ex.sets ?? []) {
    if (s.weight == null || s.addedWeight) continue;
    const v = e1rm(s.weight, s.reps);
    if (v > best) { best = v; top = `${s.weight}x${s.reps}`; }
  }
  return { e1rm: Math.round(best), top };
}
function zones(series: (number | null)[] | undefined, maxHr: number) {
  const z = [0, 0, 0, 0, 0];
  for (const b of series ?? []) {
    if (b == null) continue;
    const p = b / maxHr;
    if (p >= 0.9) z[4]++; else if (p >= 0.8) z[3]++; else if (p >= 0.7) z[2]++; else if (p >= 0.6) z[1]++; else if (p >= 0.5) z[0]++;
  }
  return z;
}

async function userData(userId: string) {
  const since = new Date(Date.now() - 70 * 864e5).toISOString();
  const [{ data: ws }, { data: wi }, s] = await Promise.all([
    admin.from('workouts').select('id,data').eq('user_id', userId).eq('deleted', false).gte('data->>startedAt', since),
    admin.from('weigh_ins').select('date,weight,body_fat').eq('user_id', userId).eq('deleted', false).gte('date', since.slice(0, 10)).order('date'),
    settingsOf(userId),
  ]);
  const workouts = (ws ?? []).map((w: DP) => w.data as DP).sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
  return { workouts, weighIns: wi ?? [], settings: s };
}

function weekKey(iso: string, tz: string) {
  const d = new Date(new Date(iso).toLocaleString('en-US', { timeZone: tz }));
  const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow);
  return d.toISOString().slice(0, 10);
}

const COACH_RULES = `You are a direct, encouraging strength coach texting your athlete after a session.
Rules: plain text only, no markdown, no lists, no emoji. 3 to 5 short sentences, under 90 words.
Use the numbers given. Mention one thing that went well, one thing to watch, and ONE concrete target for next time (exercise, weight x reps).
Estimated 1RM uses Epley. Heart-rate minutes are per zone (% of max HR). Never give medical advice; if something looks like pain or injury, suggest checking with a physio.`;

async function workoutNote(userId: string, workoutId: string, force = false): Promise<string | null> {
  const id = `w-${workoutId}`;
  if (!force) {
    const { data: ex } = await admin.from('insights').select('text').eq('user_id', userId).eq('id', id).maybeSingle();
    if (ex) return ex.text;
  }
  const { workouts, weighIns, settings } = await userData(userId);
  const w = workouts.find((x) => x.id === workoutId);
  if (!w) return null;
  const tz = settings.tz ?? 'America/Toronto';
  const prior = workouts.filter((x) => x.startedAt < w.startedAt);
  const exercises = (w.exercises ?? []).map((ex: DP) => {
    const hist = prior.flatMap((p) => (p.exercises ?? []).filter((e: DP) => e.key === ex.key).map((e: DP) => ({ date: String(p.startedAt).slice(0, 10), ...bestSet(e) }))).slice(-5);
    return { name: ex.name, perHand: ex.perHand, sets: (ex.sets ?? []).map((s: DP) => (s.weight == null ? `${s.reps} reps` : `${s.addedWeight ? '+' : ''}${s.weight}x${s.reps}`)), today: bestSet(ex), previous: hist };
  });
  const wk = weekKey(w.startedAt, tz);
  const sessionsThisWeek = new Set(workouts.filter((x) => weekKey(x.startedAt, tz) === wk).map((x) => String(x.startedAt).slice(0, 10))).size;
  const maxHr = settings.maxHr ?? 190;
  const data = {
    workout: { label: w.label, date: String(w.startedAt).slice(0, 10), minutes: Math.round((Date.parse(w.endedAt) - Date.parse(w.startedAt)) / 60e3), exercises },
    heartRate: w.hr ? { avg: w.hr.avg, max: w.hr.max, maxHrSetting: maxHr, minutesInZones_50_60_70_80_90pct: zones(w.hr.series, maxHr) } : 'not available',
    week: { sessions: sessionsThisWeek, target: settings.weeklyTarget ?? 4 },
    bodyweight: { goalLb: settings.goalWeight ?? 160, last14Days: weighIns.slice(-14).map((x: DP) => `${x.date}: ${x.weight}`) },
  };
  const text = await claude(COACH_RULES, [{ type: 'text', text: JSON.stringify(data) }]);
  await admin.from('insights').upsert({ user_id: userId, id, kind: 'workout', ref: workoutId, text }, { onConflict: 'user_id,id' });
  return text;
}

const WEEKLY_RULES = `You are a strength coach writing your athlete's Sunday review from their training log.
Plain text, no markdown or emoji, under 150 words, in this order on separate lines:
1) One-line verdict on the week (sessions vs target, consistency).
2) Bodyweight trend toward the goal, in lb per week, and whether that pace is sensible (0.5 to 1% of bodyweight per week is a healthy cut).
3) Lifts: name the best progress, and any lift that has stalled (no estimated-1RM gain in 3+ sessions) with one specific fix (deload 10%, change rep range, add a set, or swap variation).
4) One focus for next week.
Use only the numbers given; say so if data is thin. No medical advice.`;

async function weeklyReview(userId: string, force = false): Promise<string | null> {
  const { workouts, weighIns, settings } = await userData(userId);
  const tz = settings.tz ?? 'America/Toronto';
  const wk = weekKey(new Date().toISOString(), tz);
  const id = `wk-${wk}`;
  if (!force) {
    const { data: ex } = await admin.from('insights').select('text').eq('user_id', userId).eq('id', id).maybeSingle();
    if (ex) return ex.text;
  }
  const weeks: Record<string, number> = {};
  for (const w of workouts) weeks[weekKey(w.startedAt, tz)] = (weeks[weekKey(w.startedAt, tz)] ?? 0) + 1;
  const lifts: Record<string, { date: string; e1rm: number; top: string }[]> = {};
  for (const w of workouts) for (const ex of w.exercises ?? []) {
    const b = bestSet(ex);
    if (b.e1rm) (lifts[ex.name] ??= []).push({ date: String(w.startedAt).slice(0, 10), ...b });
  }
  const data = {
    weekStarting: wk,
    sessionsPerWeek: weeks,
    target: settings.weeklyTarget ?? 4,
    lifts: Object.fromEntries(Object.entries(lifts).map(([k, v]) => [k, v.slice(-6)])),
    bodyweight: { goalLb: settings.goalWeight ?? 160, readings: weighIns.slice(-28).map((x: DP) => `${x.date}: ${x.weight}${x.body_fat ? ` (${x.body_fat}% fat)` : ''}`) },
  };
  const text = await claude(WEEKLY_RULES, [{ type: 'text', text: JSON.stringify(data) }], 500);
  await admin.from('insights').upsert({ user_id: userId, id, kind: 'weekly', ref: wk, text }, { onConflict: 'user_id,id' });
  return text;
}

// ---- photo → avatar features (the photo is never stored) ----
async function avatarFromPhoto(image: string) {
  const m = image.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) throw new Error('bad image');
  const out = await claude(
    'You describe a person in a photo for a cartoon avatar. Reply with JSON only, no prose, exactly these keys: ' +
      '{"skin":"#hex skin tone","hair":"#hex hair colour","hairStyle":"bald|buzz|short|medium|long|curly","facialHair":"none|stubble|moustache|beard","glasses":true|false,"eyebrows":"#hex"}. ' +
      'Do not identify the person or comment on body or attractiveness.',
    [{ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } }, { type: 'text', text: 'Describe this person for the avatar.' }],
    200,
  );
  const j = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
  const hex = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
  return {
    skin: hex(j.skin, '#E7A97A'), hair: hex(j.hair, '#2A1B14'), eyebrows: hex(j.eyebrows, hex(j.hair, '#2A1B14')),
    hairStyle: ['bald', 'buzz', 'short', 'medium', 'long', 'curly'].includes(j.hairStyle) ? j.hairStyle : 'short',
    facialHair: ['none', 'stubble', 'moustache', 'beard'].includes(j.facialHair) ? j.facialHair : 'none',
    glasses: j.glasses === true,
  };
}

// ---- web push ----
async function secret(name: string) {
  const { data } = await admin.from('app_secrets').select('value').eq('name', name).maybeSingle();
  return data?.value as string | undefined;
}
async function vapid() {
  let pub = await secret('vapid_public');
  let priv = await secret('vapid_private');
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    await admin.from('app_secrets').upsert([{ name: 'vapid_public', value: k.publicKey }, { name: 'vapid_private', value: k.privateKey }]);
    pub = (await secret('vapid_public'))!; priv = (await secret('vapid_private'))!;
  }
  webpush.setVapidDetails('mailto:adilhalilrahmon1@gmail.com', pub, priv);
  return pub;
}

async function push(userId: string, title: string, body: string, url = APP_URL) {
  await vapid();
  const { data: subs } = await admin.from('push_subscriptions').select('endpoint,subscription').eq('user_id', userId);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(s.subscription, JSON.stringify({ title, body, url }), { TTL: 6 * 3600 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
    }
  }
  return sent;
}

async function once(userId: string, kind: string, day: string) {
  const { error } = await admin.from('notification_log').insert({ user_id: userId, kind, day });
  return !error; // false = already sent
}

function localParts(tz: string) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false });
  const p = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: (parseInt(p.hour) % 24) * 60 + parseInt(p.minute), weekday: p.weekday };
}
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); };
const firstSentence = (t: string) => (t.match(/^.*?[.!?](\s|$)/)?.[0] ?? t).trim().slice(0, 140);

async function tickUser(userId: string) {
  const s = await settingsOf(userId);
  const tz = s.tz ?? 'America/Toronto';
  const now = localParts(tz);
  const log: string[] = [];

  // Keep Google data fresh (weigh-ins, workout heart rate).
  const { data: integ } = await admin.from('integrations').select('connected_at,last_sync_at').eq('user_id', userId).eq('provider', 'google').maybeSingle();
  if (integ?.connected_at && (!integ.last_sync_at || Date.now() - Date.parse(integ.last_sync_at) > 25 * 60e3)) {
    const r = await syncCore(userId); log.push(`sync ${r.ok ? 'ok' : r.error}`);
  }

  // Morning weigh-in reminder: only if the scale hasn't reported yet today.
  const rem = toMin(s.reminderTime ?? '07:30');
  if (notifyOn(s, 'weighIn') && now.minutes >= rem && now.minutes < rem + 180) {
    const { data: today } = await admin.from('weigh_ins').select('date').eq('user_id', userId).eq('date', now.date).eq('deleted', false).maybeSingle();
    if (!today && (await once(userId, 'weighin', now.date))) {
      await push(userId, 'Morning weigh-in', 'Step on the Renpho before breakfast. It syncs to the app on its own.'); log.push('weighin');
    }
  }

  // Coach note for each recent workout, once heart rate is in (or 45 min after finishing).
  if (ANTHROPIC_KEY) {
    const { data: recent } = await admin.from('workouts').select('id,data').eq('user_id', userId).eq('deleted', false).gte('data->>endedAt', new Date(Date.now() - 864e5).toISOString());
    for (const w of recent ?? []) {
      const d = w.data as DP;
      const ready = d.hr || Date.now() - Date.parse(d.endedAt) > 45 * 60e3;
      if (!ready) continue;
      const { data: has } = await admin.from('insights').select('id').eq('user_id', userId).eq('id', `w-${w.id}`).maybeSingle();
      if (has) continue;
      const text = await workoutNote(userId, w.id, true);
      if (text && notifyOn(s, 'coach') && (await once(userId, `coach-${w.id}`, now.date))) await push(userId, `Coach: ${d.label ?? 'workout'}`, firstSentence(text));
      log.push(`coach ${w.id}`);
      break; // one per tick
    }
    // Sunday review at 6 pm.
    if (now.weekday === 'Sun' && now.minutes >= 18 * 60 && (await once(userId, 'weekly', now.date))) {
      const text = await weeklyReview(userId, true);
      if (text && notifyOn(s, 'weekly')) await push(userId, 'Your week in review', firstSentence(text));
      log.push('weekly');
    }
  }

  // Measurement day every 14 days, 8–10 am.
  if (notifyOn(s, 'measure') && now.minutes >= 8 * 60 && now.minutes < 10 * 60) {
    const { data: last } = await admin.from('measurements').select('date').eq('user_id', userId).eq('deleted', false).order('date', { ascending: false }).limit(1).maybeSingle();
    const due = !last || Date.parse(now.date) - Date.parse(last.date) >= 14 * 864e5;
    const key = last ? now.date : 'first';
    if (due && (await once(userId, 'measure', key))) {
      await push(userId, 'Measurement day', 'Tape out neck, shoulders, chest, biceps, waist, hips, thigh and calf in Me. Your avatar updates.'); log.push('measure');
    }
  }
  return log;
}

async function cron(req: Request) {
  const expected = await secret('cron');
  if (!expected || req.headers.get('x-cron-secret') !== expected) return json({ error: 'unauthorized' }, 401);
  const { data: users } = await admin.from('settings').select('user_id');
  const out: Record<string, unknown> = {};
  for (const u of users ?? []) {
    try { out[u.user_id] = await tickUser(u.user_id); } catch (e) { out[u.user_id] = String((e as Error).message); }
  }
  return json(out);
}

const aiError = (e: unknown) => {
  const m = (e as Error).message;
  return json({ error: m === 'no_ai_key' ? 'The AI coach is not set up yet (ANTHROPIC_API_KEY missing in Supabase).' : m }, m === 'no_ai_key' ? 409 : 500);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  if (req.method === 'GET') return callback(url);
  const body = await req.json().catch(() => ({} as DP));
  if (body.action === 'cron') return cron(req);
  const userId = await userFrom(req);
  if (!userId) return json({ error: 'unauthorized' }, 401);
  switch (body.action) {
    case 'start': return start(userId);
    case 'sync': return sync(userId);
    case 'disconnect':
      await admin.from('google_tokens').delete().eq('user_id', userId);
      await admin.from('integrations').delete().eq('user_id', userId).eq('provider', 'google');
      return json({ ok: true });
    case 'coach':
      try { return json({ text: await workoutNote(userId, String(body.workoutId), !!body.force) }); } catch (e) { return aiError(e); }
    case 'weekly':
      try { return json({ text: await weeklyReview(userId, true) }); } catch (e) { return aiError(e); }
    case 'avatar':
      try { return json({ features: await avatarFromPhoto(String(body.image ?? '')) }); } catch (e) { return aiError(e); }
    case 'vapid': return json({ publicKey: await vapid() });
    case 'subscribe': {
      const sub = body.subscription;
      if (!sub?.endpoint) return json({ error: 'bad subscription' }, 400);
      await admin.from('push_subscriptions').upsert({ endpoint: sub.endpoint, user_id: userId, subscription: sub });
      return json({ ok: true });
    }
    case 'unsubscribe':
      if (body.endpoint) await admin.from('push_subscriptions').delete().eq('endpoint', body.endpoint).eq('user_id', userId);
      return json({ ok: true });
    case 'test-push': return json({ sent: await push(userId, 'Gym Tracker', 'Notifications are working. See you at the gym.') });
  }
  return json({ error: 'unknown action' }, 400);
});
