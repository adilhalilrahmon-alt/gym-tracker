// Local-first data store. Everything lives on the phone in localStorage;
// cloud sync (Supabase) plugs in later behind the same API.
import { useSyncExternalStore } from 'react';
import type { ParsedExercise } from './parser';
import { cleanName, liftInfo, matchLift, type CustomLift, type Group } from './lifts';

export interface Workout {
  id: string;
  startedAt: string; // ISO
  endedAt: string; // ISO
  label: string | null;
  rawText: string;
  exercises: ParsedExercise[];
  /** Heart rate from Google Health, filled in by the server after the watch syncs. */
  hr?: { avg: number; max: number; series: (number | null)[]; samples: number };
  /** Free-text note ("shoulder felt off"). */
  note?: string;
  /** How hard the session felt, 1–10. */
  rpe?: number;
  updatedAt?: string;
}

export interface WeighIn {
  date: string; // YYYY-MM-DD
  weight: number; // lb
  bodyFat?: number;
  source: 'manual' | 'scale';
  updatedAt?: string;
}

export const MEASURE_KEYS = ['neck', 'shoulders', 'chest', 'biceps', 'waist', 'hips', 'thigh', 'calf'] as const;
export type MeasureKey = (typeof MEASURE_KEYS)[number];
export type Measurement = { date: string; updatedAt?: string } & Record<MeasureKey, number>;

export type SyncTable = 'workouts' | 'weigh_ins' | 'measurements';
export interface Tombstone {
  table: SyncTable;
  key: string; // workout id or date
  at: string;
}

export interface AvatarFeatures {
  skin: string;
  hair: string;
  eyebrows: string;
  hairStyle: 'bald' | 'buzz' | 'short' | 'medium' | 'long' | 'curly';
  facialHair: 'none' | 'stubble' | 'moustache' | 'beard';
  glasses: boolean;
}

export type NotifyKind = 'weighIn' | 'coach' | 'weekly' | 'measure';

export interface Settings {
  goalWeight: number;
  weeklyTarget: number;
  heightCm: number;
  pinned: string[]; // exercise keys
  reminderTime: string;
  maxHr?: number;
  age?: number;
  /** How body measurements and height are shown and typed. Stored values don't change. */
  bodyUnit?: 'in' | 'cm';
  /** How body weight is shown and typed. Stored values stay in lb. */
  weightUnit?: 'lb' | 'kg';
  /** Spellings the user confirmed: cleaned text → lift id. */
  liftAliases?: Record<string, string>;
  /** Lifts the user added that aren't in the library. */
  customLifts?: Record<string, CustomLift>;
  /** Week-start dates (Mondays) that don't count for or against the streak. */
  frozenWeeks?: string[];
  restTimer?: boolean;
  tz?: string;
  notify?: Partial<Record<NotifyKind, boolean>>;
  avatar?: AvatarFeatures;
}

export interface Insight {
  id: string;
  kind: 'workout' | 'weekly' | 'ask' | 'recovery';
  ref: string | null;
  text: string;
  created_at: string;
}

export interface ActiveWorkout {
  startedAt: string;
  text: string;
  /** Set when logging a past workout: minutes it lasted. */
  pastMinutes?: number;
  note?: string;
  rpe?: number;
}

export interface State {
  version: 1;
  workouts: Workout[];
  weighIns: WeighIn[];
  measurements: Measurement[];
  settings: Settings;
  settingsUpdatedAt?: string;
  active: ActiveWorkout | null;
  tombstones: Tombstone[];
  /** Coach notes written by the server (read-only here). */
  insights: Insight[];
}

const KEY = 'gym-tracker:v1';

export const DEFAULT_SETTINGS: Settings = {
  goalWeight: 160,
  weeklyTarget: 4,
  heightCm: 185,
  pinned: ['squat', 'bench-press'],
  reminderTime: '07:30',
};

function initial(): State {
  return {
    version: 1,
    workouts: [],
    weighIns: [{ date: '2026-11-11', weight: 171.2, source: 'manual' }],
    measurements: [],
    settings: { ...DEFAULT_SETTINGS },
    active: null,
    tombstones: [],
    insights: [],
  };
}

/**
 * Point every logged exercise at its library lift. Runs on load and after sync, so old
 * entries ("Bench", "Barbell Bench Press") land under one lift. Only touches what changed.
 */
export function rematch(s: State): State {
  const ctx = { aliases: s.settings.liftAliases, custom: s.settings.customLifts };
  const stamp = new Date().toISOString();
  let changed = false;
  const fix = (key: string, name: string) => {
    const m = matchLift(name, ctx);
    if (m.how === 'ask' || m.how === 'new') return null;
    return m.id !== key || m.name !== name ? m : null;
  };
  const workouts = s.workouts.map((w) => {
    let touched = false;
    const exercises = w.exercises.map((ex) => {
      const m = fix(ex.key, ex.name);
      if (!m) return ex;
      touched = true;
      const info = liftInfo(m.id, ctx.custom);
      return { ...ex, key: m.id, name: m.name, perHand: ex.perHand || info.equip === 'dumbbell', bodyweight: ex.bodyweight || info.equip === 'bodyweight' };
    });
    if (!touched) return w;
    changed = true;
    return { ...w, exercises, updatedAt: stamp };
  });
  if (!changed) return s;
  // Pinned lifts follow their history to the new id.
  const moved = new Map<string, string>();
  s.workouts.forEach((w, i) => w.exercises.forEach((ex, j) => { const k = workouts[i].exercises[j].key; if (k !== ex.key) moved.set(ex.key, k); }));
  const pinned = [...new Set(s.settings.pinned.map((k) => moved.get(k) ?? k))];
  const pinChanged = pinned.join() !== s.settings.pinned.join();
  return { ...s, workouts, settings: pinChanged ? { ...s.settings, pinned } : s.settings, settingsUpdatedAt: pinChanged ? stamp : s.settingsUpdatedAt };
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as State;
      return rematch({ ...initial(), ...s, settings: { ...DEFAULT_SETTINGS, ...s.settings }, tombstones: s.tombstones ?? [], insights: s.insights ?? [] });
    }
  } catch {
    /* storage unavailable: run in memory */
  }
  return initial();
}

let state: State = load();
const listeners = new Set<() => void>();
const changeHooks = new Set<() => void>();

/** Called after every local change (not after applying remote data). Used by sync. */
export function onLocalChange(fn: () => void) {
  changeHooks.add(fn);
  return () => changeHooks.delete(fn);
}

const now = () => new Date().toISOString();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function setState(update: (s: State) => State, opts: { remote?: boolean } = {}) {
  state = update(state);
  save();
  listeners.forEach((l) => l());
  if (!opts.remote) changeHooks.forEach((h) => h());
}

export function getState() {
  return state;
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => select(state)
  );
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function todayISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---- actions ----
export const actions = {
  startWorkout() {
    setState((s) => (s.active ? s : { ...s, active: { startedAt: new Date().toISOString(), text: '' } }));
  },
  setActiveText(text: string) {
    setState((s) => (s.active ? { ...s, active: { ...s.active, text } } : s));
  },
  cancelWorkout() {
    setState((s) => ({ ...s, active: null }));
  },
  /** Change the running workout: start time, past-workout length, note, effort. */
  patchActive(p: Partial<ActiveWorkout>) {
    setState((s) => (s.active ? { ...s, active: { ...s.active, ...p } } : s));
  },
  /** Saves the running workout and returns its id. */
  finishWorkout(label: string | null, exercises: ParsedExercise[]): string {
    const id = uid();
    setState((s) => {
      if (!s.active) return s;
      const a = s.active;
      const w: Workout = {
        id,
        startedAt: a.startedAt,
        endedAt: a.pastMinutes ? new Date(+new Date(a.startedAt) + a.pastMinutes * 60000).toISOString() : new Date().toISOString(),
        label,
        rawText: a.text,
        exercises,
        ...(a.note?.trim() ? { note: a.note.trim() } : {}),
        ...(a.rpe ? { rpe: a.rpe } : {}),
        updatedAt: now(),
      };
      return { ...s, active: null, workouts: [...s.workouts, w].sort((a, b) => a.startedAt.localeCompare(b.startedAt)) };
    });
    return id;
  },
  editWorkout(id: string, rawText: string, label: string | null, exercises: ParsedExercise[], extra: { note?: string; rpe?: number; startedAt?: string; endedAt?: string } = {}) {
    setState((s) => ({
      ...s,
      workouts: s.workouts.map((w) => (w.id === id ? { ...w, rawText, label, exercises, ...extra, ...(extra.startedAt ? { hr: undefined } : {}), updatedAt: now() } : w)).sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    }));
  },
  /** Remember that a typed name means a lift, and move any history logged under that name. */
  learnAlias(typed: string, id: string) {
    setState((s) => rematch({ ...s, settings: { ...s.settings, liftAliases: { ...s.settings.liftAliases, [cleanName(typed)]: id } }, settingsUpdatedAt: now() }));
  },
  /** Keep a lift that isn't in the library, filed under a muscle group. */
  addCustomLift(id: string, name: string, group: Group) {
    setState((s) => ({ ...s, settings: { ...s.settings, customLifts: { ...s.settings.customLifts, [id]: { name, group } } }, settingsUpdatedAt: now() }));
  },
  /** Fold one lift's history into another (for near-duplicates that slipped through). */
  mergeLift(from: string, to: string) {
    setState((s) => {
      const t = now();
      const info = liftInfo(to, s.settings.customLifts);
      const names = new Set<string>();
      const workouts = s.workouts.map((w) => {
        if (!w.exercises.some((e) => e.key === from)) return w;
        return { ...w, updatedAt: t, exercises: w.exercises.map((e) => { if (e.key !== from) return e; names.add(cleanName(e.name)); return { ...e, key: to, name: info.name }; }) };
      });
      const liftAliases = { ...s.settings.liftAliases };
      names.forEach((n) => { if (n) liftAliases[n] = to; });
      liftAliases[cleanName(from.replace(/-/g, ' '))] = to;
      const customLifts = { ...s.settings.customLifts };
      delete customLifts[from];
      const pinned = [...new Set(s.settings.pinned.map((k) => (k === from ? to : k)))];
      return { ...s, workouts, settings: { ...s.settings, liftAliases, customLifts, pinned }, settingsUpdatedAt: t };
    });
  },
  setInsights(insights: Insight[]) {
    setState((s) => ({ ...s, insights }), { remote: true });
  },
  deleteWorkout(id: string) {
    setState((s) => ({
      ...s,
      workouts: s.workouts.filter((w) => w.id !== id),
      tombstones: [...s.tombstones, { table: 'workouts' as const, key: id, at: now() }],
    }));
  },
  logWeight(weight: number, date = todayISO()) {
    setState((s) => ({
      ...s,
      weighIns: [...s.weighIns.filter((w) => w.date !== date), { date, weight, source: 'manual' as const, updatedAt: now() }].sort((a, b) =>
        a.date.localeCompare(b.date)
      ),
    }));
  },
  logMeasurement(m: Measurement) {
    setState((s) => ({
      ...s,
      measurements: [...s.measurements.filter((x) => x.date !== m.date), { ...m, updatedAt: now() }].sort((a, b) => a.date.localeCompare(b.date)),
    }));
  },
  updateSettings(p: Partial<Settings>) {
    setState((s) => ({ ...s, settings: { ...s.settings, ...p }, settingsUpdatedAt: now() }));
  },
  importData(json: string) {
    const s = JSON.parse(json) as State;
    if (!s || s.version !== 1 || !Array.isArray(s.workouts)) throw new Error('Not a Gym Tracker export');
    const t = now();
    setState(() => rematch({
      ...initial(),
      ...s,
      settings: { ...DEFAULT_SETTINGS, ...s.settings },
      settingsUpdatedAt: t,
      tombstones: s.tombstones ?? [],
      insights: s.insights ?? [],
      workouts: s.workouts.map((w) => ({ ...w, updatedAt: w.updatedAt ?? t })),
      weighIns: s.weighIns.map((w) => ({ ...w, updatedAt: w.updatedAt ?? t })),
      measurements: s.measurements.map((m) => ({ ...m, updatedAt: m.updatedAt ?? t })),
    }));
  },
};
