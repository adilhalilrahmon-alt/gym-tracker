import type { State } from './store';
import { durationMin, workoutDay } from './stats';

const cell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = (rows: unknown[][]) => rows.map((r) => r.map(cell).join(',')).join('\n');

/** One row per set, ready for a spreadsheet. */
export function setsCsv(s: State): string {
  const rows: unknown[][] = [['date', 'workout', 'minutes', 'lift', 'set', 'weight_lb', 'reps', 'seconds', 'per_hand', 'avg_hr', 'effort', 'note']];
  for (const w of s.workouts) for (const ex of w.exercises) ex.sets.forEach((st, i) => rows.push([workoutDay(w), w.label ?? '', durationMin(w), ex.name, i + 1, st.weight ?? '', st.secs ? '' : st.reps, st.secs ?? '', ex.perHand ? 'yes' : '', w.hr?.avg ?? '', w.rpe ?? '', w.note ?? '']));
  return csv(rows);
}

/** Weigh-ins and tape measurements by date. */
export function bodyCsv(s: State): string {
  const keys = ['neck', 'shoulders', 'chest', 'biceps', 'waist', 'hips', 'thigh', 'calf'] as const;
  const dates = [...new Set([...s.weighIns.map((w) => w.date), ...s.measurements.map((m) => m.date)])].sort();
  const rows: unknown[][] = [['date', 'weight_lb', 'body_fat_pct', 'source', ...keys.map((k) => `${k}_in`)]];
  for (const d of dates) {
    const w = s.weighIns.find((x) => x.date === d);
    const m = s.measurements.find((x) => x.date === d);
    rows.push([d, w?.weight ?? '', w?.bodyFat ?? '', w?.source ?? '', ...keys.map((k) => m?.[k] ?? '')]);
  }
  return csv(rows);
}

export function download(name: string, text: string, type = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
}
