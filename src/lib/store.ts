// Local-first data store. Everything lives on the phone in localStorage;
// cloud sync (Supabase) plugs in later behind the same API.
import { useSyncExternalStore } from 'react';
import type { ParsedExercise } from './parser';

export interface Workout {
  id: string;
  startedAt: string; // ISO
  endedAt: string; // ISO
  label: string | null;
  rawText: string;
  exercises: ParsedExercise[];
}

export interface WeighIn {
  date: string; // YYYY-MM-DD
  weight: number; // lb
  bodyFat?: number;
  source: 'manual' | 'scale';
}

export const MEASURE_KEYS = ['neck', 'shoulders', 'chest', 'biceps', 'waist', 'hips', 'thigh', 'calf'] as const;
export type MeasureKey = (typeof MEASURE_KEYS)[number];
export type Measurement = { date: string } & Record<MeasureKey, number>;

export interface Settings {
  goalWeight: number;
  weeklyTarget: number;
  heightCm: number;
  pinned: string[]; // exercise keys
  reminderTime: string;
}

export interface ActiveWorkout {
  startedAt: string;
  text: string;
}

export interface State {
  version: 1;
  workouts: Workout[];
  weighIns: WeighIn[];
  measurements: Measurement[];
  settings: Settings;
  active: ActiveWorkout | null;
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
  };
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as State;
      return { ...initial(), ...s, settings: { ...DEFAULT_SETTINGS, ...s.settings } };
    }
  } catch {
    /* storage unavailable: run in memory */
  }
  return initial();
}

let state: State = load();
const listeners = new Set<() => void>();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function setState(update: (s: State) => State) {
  state = update(state);
  save();
  listeners.forEach((l) => l());
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
  finishWorkout(label: string | null, exercises: ParsedExercise[]) {
    setState((s) => {
      if (!s.active) return s;
      const w: Workout = {
        id: uid(),
        startedAt: s.active.startedAt,
        endedAt: new Date().toISOString(),
        label,
        rawText: s.active.text,
        exercises,
      };
      return { ...s, active: null, workouts: [...s.workouts, w].sort((a, b) => a.startedAt.localeCompare(b.startedAt)) };
    });
  },
  deleteWorkout(id: string) {
    setState((s) => ({ ...s, workouts: s.workouts.filter((w) => w.id !== id) }));
  },
  logWeight(weight: number, date = todayISO()) {
    setState((s) => ({
      ...s,
      weighIns: [...s.weighIns.filter((w) => w.date !== date), { date, weight, source: 'manual' as const }].sort((a, b) =>
        a.date.localeCompare(b.date)
      ),
    }));
  },
  logMeasurement(m: Measurement) {
    setState((s) => ({
      ...s,
      measurements: [...s.measurements.filter((x) => x.date !== m.date), m].sort((a, b) => a.date.localeCompare(b.date)),
    }));
  },
  updateSettings(p: Partial<Settings>) {
    setState((s) => ({ ...s, settings: { ...s.settings, ...p } }));
  },
  importData(json: string) {
    const s = JSON.parse(json) as State;
    if (!s || s.version !== 1 || !Array.isArray(s.workouts)) throw new Error('Not a Gym Tracker export');
    setState(() => ({ ...initial(), ...s, settings: { ...DEFAULT_SETTINGS, ...s.settings } }));
  },
};
