import type { Measurement, State, WeighIn, Workout } from './store';
import { todayISO } from './store';

export const e1rm = (w: number, r: number) => (r <= 1 ? w : w * (1 + r / 30));

export function parseDate(iso: string): Date {
  return iso.length === 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
}

/** Monday of the week containing d, as YYYY-MM-DD. */
export function weekStart(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // Mon=0
  x.setDate(x.getDate() - dow);
  return todayISO(x);
}

export function addDays(iso: string, n: number): string {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return todayISO(d);
}

export function workoutDay(w: Workout): string {
  return todayISO(new Date(w.startedAt));
}

export function durationMin(w: Workout): number {
  return Math.max(0, Math.round((+new Date(w.endedAt) - +new Date(w.startedAt)) / 60000));
}

export function setCount(w: Workout): number {
  return w.exercises.reduce((n, e) => n + e.sets.length, 0);
}

// ---- lifts ----
export interface LiftPoint {
  date: string;
  e1rm: number;
  top: string;
}

export function liftHistory(workouts: Workout[], key: string): LiftPoint[] {
  const out: LiftPoint[] = [];
  for (const w of workouts) {
    for (const ex of w.exercises) {
      if (ex.key !== key) continue;
      let best = 0;
      let top = '';
      for (const s of ex.sets) {
        if (s.weight == null || s.addedWeight) continue;
        const v = e1rm(s.weight, s.reps);
        if (v > best) {
          best = v;
          top = `${s.weight}×${s.reps}`;
        }
      }
      if (best > 0) out.push({ date: workoutDay(w), e1rm: Math.round(best), top });
    }
  }
  return out;
}

export interface LiftSummary {
  key: string;
  name: string;
  current: number | null;
  change4w: number | null;
  stalled: boolean;
  sessions: number;
}

export function liftSummary(workouts: Workout[], key: string, today = todayISO()): LiftSummary {
  const h = liftHistory(workouts, key);
  const name = workouts.flatMap((w) => w.exercises).find((e) => e.key === key)?.name ?? prettyKey(key);
  if (!h.length) return { key, name, current: null, change4w: null, stalled: false, sessions: 0 };
  const current = h[h.length - 1].e1rm;
  const cutoff = addDays(today, -28);
  const before = h.filter((p) => p.date <= cutoff);
  const base = before.length ? before[before.length - 1].e1rm : h[0].e1rm;
  return { key, name, current, change4w: h.length > 1 ? current - base : null, stalled: isStalled(h), sessions: h.length };
}

/** Stalled = the last 3 sessions never beat the best from before them. */
export function isStalled(h: LiftPoint[]): boolean {
  if (h.length < 4) return false;
  const prevBest = Math.max(...h.slice(0, -3).map((p) => p.e1rm));
  return h.slice(-3).every((p) => p.e1rm <= prevBest);
}

export function prettyKey(key: string): string {
  return key.replace(/-/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export function allLiftKeys(workouts: Workout[]): { key: string; name: string; count: number }[] {
  const m = new Map<string, { key: string; name: string; count: number }>();
  for (const w of workouts)
    for (const e of w.exercises) {
      const cur = m.get(e.key) ?? { key: e.key, name: e.name, count: 0 };
      cur.count++;
      m.set(e.key, cur);
    }
  return [...m.values()].sort((a, b) => b.count - a.count);
}

export function lastSessionTop(workouts: Workout[], key: string): number | undefined {
  const h = liftHistory(workouts, key);
  if (!h.length) return undefined;
  return parseFloat(h[h.length - 1].top);
}

// ---- consistency ----
export function sessionsByDay(workouts: Workout[]): Map<string, Workout[]> {
  const m = new Map<string, Workout[]>();
  for (const w of workouts) {
    const d = workoutDay(w);
    m.set(d, [...(m.get(d) ?? []), w]);
  }
  return m;
}

export function weekCount(workouts: Workout[], week: string): number {
  const days = new Set(workouts.filter((w) => weekStart(new Date(w.startedAt)) === week).map(workoutDay));
  return days.size;
}

/** Consecutive weeks hitting the target, counting this week only once it is hit. */
export function streakWeeks(workouts: Workout[], target: number, today = todayISO()): number {
  let wk = weekStart(parseDate(today));
  let n = 0;
  if (weekCount(workouts, wk) >= target) n++;
  wk = addDays(wk, -7);
  while (weekCount(workouts, wk) >= target) {
    n++;
    wk = addDays(wk, -7);
  }
  return n;
}

export function avgPerWeek(workouts: Workout[], today = todayISO()): number | null {
  if (!workouts.length) return null;
  const first = weekStart(new Date(workouts[0].startedAt));
  const thisWk = weekStart(parseDate(today));
  let weeks = 0;
  let total = 0;
  for (let wk = thisWk, i = 0; i < 12 && wk >= first; i++, wk = addDays(wk, -7)) {
    weeks++;
    total += weekCount(workouts, wk);
  }
  return weeks ? total / weeks : null;
}

export function usualStart(workouts: Workout[]): string | null {
  if (!workouts.length) return null;
  const hours = workouts.slice(-20).map((w) => new Date(w.startedAt).getHours()).sort((a, b) => a - b);
  const h = hours[Math.floor(hours.length / 2)];
  const suffix = h >= 12 ? 'pm' : 'am';
  return `${h % 12 === 0 ? 12 : h % 12} ${suffix}`;
}

export interface HeatCell {
  date: string;
  level: -1 | 0 | 1 | 2;
}

/** 26 weeks of days, Monday-first columns, ending this Sunday. */
export function heatmap(workouts: Workout[], today = todayISO(), weeks = 26): HeatCell[] {
  const byDay = sessionsByDay(workouts);
  const start = addDays(weekStart(parseDate(today)), -7 * (weeks - 1));
  const cells: HeatCell[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i);
    if (d > today) {
      cells.push({ date: d, level: -1 });
      continue;
    }
    const ws = byDay.get(d);
    if (!ws) cells.push({ date: d, level: 0 });
    else cells.push({ date: d, level: ws.reduce((m, w) => m + durationMin(w), 0) >= 60 ? 2 : 1 });
  }
  return cells;
}

export interface CalDay {
  date: string;
  day: number;
  trained: boolean;
  future: boolean;
  today: boolean;
}

/** Month grid starting on Sunday; nulls pad the first week. */
export function monthGrid(workouts: Workout[], year: number, month: number, today = todayISO()): (CalDay | null)[] {
  const byDay = sessionsByDay(workouts);
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const out: (CalDay | null)[] = Array(first.getDay()).fill(null);
  for (let d = 1; d <= days; d++) {
    const iso = todayISO(new Date(year, month, d));
    out.push({ date: iso, day: d, trained: byDay.has(iso), future: iso > today, today: iso === today });
  }
  return out;
}

// ---- weight ----
export function sevenDayAvg(weighIns: WeighIn[]): { date: string; avg: number }[] {
  return weighIns.map((w) => {
    const from = addDays(w.date, -6);
    const win = weighIns.filter((x) => x.date >= from && x.date <= w.date);
    return { date: w.date, avg: win.reduce((s, x) => s + x.weight, 0) / win.length };
  });
}

export function weeklyRate(weighIns: WeighIn[]): number | null {
  const a = sevenDayAvg(weighIns);
  if (a.length < 2) return null;
  const last = a[a.length - 1];
  const prior = a.filter((x) => x.date <= addDays(last.date, -7));
  if (!prior.length) return null;
  return last.avg - prior[prior.length - 1].avg;
}

// ---- body ----
export function navyBodyFat(m: Pick<Measurement, 'waist' | 'neck'>, heightCm: number): number {
  const hIn = heightCm / 2.54;
  return 86.01 * Math.log10(Math.max(1, m.waist - m.neck)) - 70.041 * Math.log10(hIn) + 36.76;
}

// ---- rule-based coach note (AI version comes in Phase 3) ----
export function coachNote(s: State, today = todayISO()): string {
  const { workouts, settings } = s;
  if (!workouts.length) return 'Tap the gold + when you start your next workout. Type sets the way you would in Notes.';
  const stalled = allLiftKeys(workouts)
    .map((l) => liftSummary(workouts, l.key, today))
    .find((l) => l.stalled);
  if (stalled) {
    const h = liftHistory(workouts, stalled.key);
    return `${stalled.name} hasn't beaten ${Math.max(...h.slice(0, -3).map((p) => p.e1rm))} lb (est. 1RM) in 3 sessions. Try a lighter week, or switch the rep range for a few sessions.`;
  }
  const left = settings.weeklyTarget - weekCount(workouts, weekStart(parseDate(today)));
  if (left > 0) return `${left} more session${left > 1 ? 's' : ''} this week to hit your target of ${settings.weeklyTarget}.`;
  const up = allLiftKeys(workouts)
    .map((l) => liftSummary(workouts, l.key, today))
    .filter((l) => (l.change4w ?? 0) > 0)
    .sort((a, b) => (b.change4w ?? 0) - (a.change4w ?? 0))[0];
  if (up) return `${up.name} is up ${up.change4w} lb (est. 1RM) over 4 weeks. Weekly target hit, nice work.`;
  return 'Weekly target hit. Keep the streak going next week.';
}
