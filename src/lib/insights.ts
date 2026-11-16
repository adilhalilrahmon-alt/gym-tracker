// Per-lift insights, muscle-group totals, PRs and the "try this next" suggestion.
// Everything here is plain arithmetic on the workout log: instant, offline, explainable.
import type { ParsedSet } from './parser';
import { GROUPS, liftInfo, stepFor, type CustomLift, type Group, type Lift } from './lifts';
import type { WeighIn, Workout } from './store';
import { todayISO } from './store';
import { STALL_ADVICE, addDays, dayNumber, e1rm, parseDate, sevenDayAvg, weekCount, weekStart, workoutDay } from './stats';
import type { State } from './store';

/** How a lift is judged: est. 1RM (heavy compounds), best set (accessories), reps (bodyweight) or time (holds). */
export type Metric = 'e1rm' | 'set' | 'reps' | 'time';

export interface LiftSession {
  date: string;
  workoutId: string;
  sets: ParsedSet[];
  /** The number progress is judged on for this lift's metric. */
  score: number;
  e1rm: number;
  topWeight: number;
  /** Best set as text, e.g. "185×6". */
  top: string;
  /** Total lb moved (weight × reps), 0 for bodyweight. */
  volume: number;
  /** A deliberately easy day (well under recent bests). Shown in history but left out of trends, stalls and suggestions. */
  light?: boolean;
}

const weighted = (s: ParsedSet) => s.weight != null && !s.addedWeight && !s.secs;
const fmt = (s: ParsedSet) => (s.secs ? `${s.secs}s` : s.weight == null ? `${s.reps} reps` : `${s.addedWeight ? '+' : ''}${s.weight}×${s.reps}`);

export function metricFor(info: Lift, sessions: { sets: ParsedSet[] }[]): Metric {
  const all = sessions.flatMap((s) => s.sets);
  if (info.timed || (all.length > 0 && all.every((s) => s.secs))) return 'time';
  if (all.length > 0 && !all.some(weighted)) return 'reps';
  return info.compound ? 'e1rm' : 'set';
}

export function liftSessions(workouts: Workout[], key: string, custom?: Record<string, CustomLift>): LiftSession[] {
  const info = liftInfo(key, custom);
  const raw: { date: string; workoutId: string; sets: ParsedSet[] }[] = [];
  for (const w of workouts) {
    const sets = w.exercises.filter((e) => e.key === key).flatMap((e) => e.sets);
    if (sets.length) raw.push({ date: workoutDay(w), workoutId: w.id, sets });
  }
  const metric = metricFor(info, raw);
  const out = raw.map((r): LiftSession => {
    let best = 0, top = '', topWeight = 0, volume = 0, maxReps = 0, maxSecs = 0;
    for (const s of r.sets) {
      maxReps = Math.max(maxReps, s.reps);
      maxSecs = Math.max(maxSecs, s.secs ?? 0);
      if (!weighted(s)) continue;
      volume += s.weight! * s.reps;
      topWeight = Math.max(topWeight, s.weight!);
      const v = e1rm(s.weight!, s.reps);
      if (v > best) { best = v; top = fmt(s); }
    }
    if (!top) top = metric === 'time' ? `${maxSecs}s` : `${maxReps} reps`;
    const score = metric === 'time' ? maxSecs : metric === 'reps' ? maxReps : Math.round(best);
    return { ...r, score, e1rm: Math.round(best), topWeight, top, volume: Math.round(volume) };
  });
  // Mark easy days: more than 15% under the best of the three working sessions before.
  if (metric === 'e1rm' || metric === 'set') {
    const working: number[] = [];
    for (const s of out) {
      const ref = Math.max(0, ...working.slice(-3));
      if (ref && s.score < ref * 0.85) s.light = true;
      else working.push(s.score);
    }
  }
  return out;
}

/** Sessions that count for trends (easy days removed). */
export const workingSessions = (ss: LiftSession[]) => ss.filter((s) => !s.light);

/** Stalled = the last 3 sessions never beat the best from before them. */
export const stalledSessions = (ss: LiftSession[]) => ss.length >= 4 && ss.slice(-3).every((p) => p.score <= Math.max(...ss.slice(0, -3).map((x) => x.score)));

export interface RepRecord { reps: number; weight: number; date: string }
/** Heaviest weight ever done for at least N reps. */
export function repRecords(ss: LiftSession[], marks = [3, 5, 8, 10]): RepRecord[] {
  const out: RepRecord[] = [];
  for (const n of marks) {
    let best: RepRecord | null = null;
    for (const s of ss) for (const set of s.sets) if (weighted(set) && set.reps >= n && (!best || set.weight! > best.weight)) best = { reps: n, weight: set.weight!, date: s.date };
    if (best) out.push(best);
  }
  return out;
}

/** Change in score per 30 days, from a straight-line fit over the last 8 weeks. */
export function monthlyRate(ss: LiftSession[], today = todayISO()): number | null {
  const pts = ss.filter((s) => s.date >= addDays(today, -56)).map((s) => ({ x: dayNumber(s.date), y: s.score }));
  if (pts.length < 3) return null;
  const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length, my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  const den = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  if (!den) return null;
  return (pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / den) * 30;
}

/** Sessions per week over the last 4 weeks. */
export const frequency = (ss: LiftSession[], today = todayISO()) => ss.filter((s) => s.date > addDays(today, -28)).length / 4;

/** Body weight on or just before a date (falls back to the first weigh-in). */
export function bodyweightOn(weighIns: WeighIn[], date: string): number | null {
  if (!weighIns.length) return null;
  const prior = weighIns.filter((w) => w.date <= date);
  return (prior.length ? prior[prior.length - 1] : weighIns[0]).weight;
}

export interface LiftInsight {
  info: Lift;
  metric: Metric;
  /** Working sessions (easy days removed). */
  sessions: LiftSession[];
  /** Every session, easy days included. */
  all: LiftSession[];
  /** Headline value as text, e.g. "222" (est. 1RM) or "30×15" (best set). */
  headline: string;
  unit: string;
  latest: LiftSession | null;
  best: LiftSession | null;
  sinceBest: number;
  stalled: boolean;
  change4w: number | null;
  perMonth: number | null;
  perWeek: number;
  records: RepRecord[];
  /** Est. 1RM ÷ body weight now, and at the first session. */
  relative: number | null;
  relativeStart: number | null;
}

export function liftInsight(workouts: Workout[], key: string, weighIns: WeighIn[], custom?: Record<string, CustomLift>, today = todayISO()): LiftInsight {
  const info = liftInfo(key, custom);
  const all = liftSessions(workouts, key, custom);
  const metric = metricFor(info, all);
  const sessions = workingSessions(all);
  const latest = sessions[sessions.length - 1] ?? null;
  const best = sessions.reduce<LiftSession | null>((a, s) => (!a || s.score >= a.score ? s : a), null);
  const cutoff = addDays(today, -28);
  const before = sessions.filter((s) => s.date <= cutoff);
  const base = before.length ? before[before.length - 1] : sessions[0];
  const rel = (s: LiftSession | null | undefined) => {
    const bw = s ? bodyweightOn(weighIns, s.date) : null;
    return s && bw && s.e1rm ? Math.round((s.e1rm / bw) * 100) / 100 : null;
  };
  return {
    info, metric, sessions, all, latest, best,
    headline: !latest ? '—' : metric === 'e1rm' ? String(latest.score) : latest.top,
    unit: metric === 'e1rm' ? 'lb est. 1RM' : metric === 'set' ? 'best set' : metric === 'reps' ? 'best set' : 'longest hold',
    sinceBest: best ? sessions.filter((s) => s.date > best.date).length : 0,
    stalled: stalledSessions(sessions),
    change4w: sessions.length > 1 && latest && base ? latest.score - base.score : null,
    perMonth: monthlyRate(sessions, today),
    perWeek: frequency(sessions, today),
    records: repRecords(sessions),
    relative: metric === 'e1rm' ? rel(latest) : null,
    relativeStart: metric === 'e1rm' && sessions.length > 1 ? rel(sessions[0]) : null,
  };
}

// ---------- muscle groups ----------
export interface GroupWeek { group: Group; label: string; sets: number; usual: number; lifts: string[] }

/** Sets per muscle group this week, the usual weekly sets over the 4 weeks before, and the lifts in each group. */
export function groupSummary(workouts: Workout[], custom?: Record<string, CustomLift>, today = todayISO()): GroupWeek[] {
  const wk = weekStart(parseDate(today));
  const from = addDays(wk, -28);
  const out = new Map<Group, GroupWeek>(GROUPS.map((g) => [g.id, { group: g.id, label: g.label, sets: 0, usual: 0, lifts: [] }]));
  const count = new Map<string, number>();
  for (const w of workouts) {
    const d = workoutDay(w);
    for (const ex of w.exercises) {
      const g = out.get(liftInfo(ex.key, custom).group)!;
      count.set(ex.key, (count.get(ex.key) ?? 0) + 1);
      if (!g.lifts.includes(ex.key)) g.lifts.push(ex.key);
      if (d >= wk) g.sets += ex.sets.length;
      else if (d >= from) g.usual += ex.sets.length / 4;
    }
  }
  for (const g of out.values()) g.lifts.sort((a, b) => (count.get(b) ?? 0) - (count.get(a) ?? 0));
  return [...out.values()].filter((g) => g.lifts.length > 0);
}

// ---------- PRs ----------
export interface PR { key: string; name: string; text: string }

/** Records set in one workout, compared with everything logged before it. One line per lift. */
export function workoutPRs(workouts: Workout[], w: Workout, custom?: Record<string, CustomLift>): PR[] {
  const earlier = workouts.filter((x) => x.id !== w.id && x.startedAt < w.startedAt);
  const out: PR[] = [];
  for (const key of [...new Set(w.exercises.map((e) => e.key))]) {
    const prior = liftSessions(earlier, key, custom);
    if (!prior.length) continue;
    const now = liftSessions([w], key, custom)[0];
    if (!now) continue;
    const info = liftInfo(key, custom);
    const metric = metricFor(info, [...prior, now]);
    const prevBest = Math.max(...prior.map((s) => s.score));
    const prevTop = Math.max(...prior.map((s) => s.topWeight));
    if (metric === 'time' || metric === 'reps') {
      if (now.score > prevBest) out.push({ key, name: info.name, text: metric === 'time' ? `longest hold, ${now.score}s (was ${prevBest}s)` : `most reps, ${now.score} (was ${prevBest})` });
      continue;
    }
    if (now.topWeight > prevTop) out.push({ key, name: info.name, text: `heaviest yet, ${now.topWeight}×${Math.max(...now.sets.filter((x) => x.weight === now.topWeight).map((x) => x.reps))} (was ${prevTop})` });
    else if (now.e1rm > Math.max(...prior.map((s) => s.e1rm))) out.push({ key, name: info.name, text: `${now.top}, ${metric === 'e1rm' ? `est. 1RM ${now.e1rm} (+${now.e1rm - Math.max(...prior.map((s) => s.e1rm))})` : 'most reps at this weight'}` });
  }
  return out;
}

// ---------- "try this" ----------
export interface Suggestion {
  last: ParsedSet[];
  lastDate: string;
  next: ParsedSet[] | null;
  /** One short sentence saying why. */
  reason: string;
}

const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; };

/** The rep range this lift is usually trained in, learned from the top sets of recent sessions. */
export function repRange(ss: LiftSession[], info: Lift): { lo: number; hi: number } {
  const reps = ss.slice(-6).flatMap((s) => s.sets.filter((x) => weighted(x) && x.weight === s.topWeight).map((x) => x.reps));
  const def = info.compound ? { lo: 5, hi: 8 } : { lo: 8, hi: 12 };
  if (!reps.length) return def;
  // Not much history yet: start from what was actually done, with the usual ceiling.
  if (reps.length < 3) { const lo = Math.min(...reps); return { lo, hi: Math.max(def.hi, lo + 2, ...reps) }; }
  const lo = pct(reps, 0.2);
  return { lo, hi: Math.max(lo + 2, pct(reps, 0.8)) };
}

/**
 * What to try next for a lift, from simple double progression:
 * top of the rep range on every top set → add weight; otherwise one more rep;
 * stalled or back after a break → about 10% lighter. Never picks exercises or plans a program.
 */
export function suggestNext(workouts: Workout[], key: string, custom?: Record<string, CustomLift>, opts: { today?: string; hold?: boolean } = {}): Suggestion | null {
  const today = opts.today ?? todayISO();
  const info = liftInfo(key, custom);
  const every = liftSessions(workouts, key, custom);
  const ss = workingSessions(every);
  const last = ss[ss.length - 1];
  if (!last) return null;
  const base = { last: last.sets, lastDate: last.date };
  const metric = metricFor(info, every);
  const away = Math.round(dayNumber(today) - dayNumber(last.date));
  const bump = (pick: (s: ParsedSet) => number, apply: (s: ParsedSet) => ParsedSet) => {
    const low = Math.min(...last.sets.map(pick));
    const i = last.sets.findIndex((s) => pick(s) === low);
    return last.sets.map((s, j) => (j === i ? apply(s) : { ...s }));
  };
  if (metric === 'time') return { ...base, next: bump((s) => s.secs ?? 0, (s) => ({ ...s, secs: (s.secs ?? 0) + 5 })), reason: 'Hold 5 seconds longer on your shortest set.' };
  if (metric === 'reps') return { ...base, next: bump((s) => s.reps, (s) => ({ ...s, reps: s.reps + 1 })), reason: 'One more rep on your lowest set.' };

  const step = stepFor(info, last.topWeight);
  const lighter = (w: number) => Math.max(step, Math.round((w * 0.9) / step) * step);
  const deload = () => last.sets.map((s) => (weighted(s) ? { ...s, weight: lighter(s.weight!) } : { ...s }));
  if (away >= 14) return { ...base, next: deload(), reason: `${away} days since your last one. Start about 10% lighter.` };
  if (stalledSessions(ss)) {
    const top = Math.max(...ss.map((x) => x.score));
    const since = ss.length - 1 - ss.map((x) => x.score).lastIndexOf(top);
    return { ...base, next: deload(), reason: `No new best in ${Math.max(3, since)} sessions. Go about 10% lighter and build back up.` };
  }
  if (opts.hold) return { ...base, next: last.sets.map((s) => ({ ...s })), reason: "You're losing weight quickly, so matching last time is a win." };

  const { lo, hi } = repRange(ss, info);
  const isTop = (s: ParsedSet) => weighted(s) && s.weight === last.topWeight;
  const tops = last.sets.filter(isTop);
  if (tops.every((s) => s.reps >= hi)) {
    return { ...base, next: last.sets.map((s) => (isTop(s) ? { ...s, weight: s.weight! + step, reps: Math.max(lo, s.reps - 2) } : { ...s })), reason: `You got ${hi}+ reps on every top set. Add ${step} lb${info.equip === 'dumbbell' ? ' per hand' : ''}.` };
  }
  const low = Math.min(...tops.map((s) => s.reps));
  let done = false;
  const next = last.sets.map((s) => { if (!done && isTop(s) && s.reps === low) { done = true; return { ...s, reps: s.reps + 1 }; } return { ...s }; });
  return { ...base, next, reason: 'Same weight, one more rep.' };
}

/** Sets as the text you'd type: "185x6, 185x6". */
export const setsText = (sets: ParsedSet[]) => sets.map((s) => (s.secs ? `${s.secs}s` : s.weight == null ? `x${s.reps}` : `${s.addedWeight ? '+' : ''}${s.weight}x${s.reps}`)).join(', ');
export const setsLabel = (sets: ParsedSet[]) => sets.map(fmt).join(', ');

// ---------- weight goal ----------
/** lb per week from a straight-line fit of the 7-day average over the last 3 weeks. */
export function trendRate(weighIns: WeighIn[], today = todayISO()): number | null {
  const pts = sevenDayAvg(weighIns).filter((p) => p.date >= addDays(today, -21)).map((p) => ({ x: dayNumber(p.date), y: p.avg }));
  if (pts.length < 5 || pts[pts.length - 1].x - pts[0].x < 7) return null;
  const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length, my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  const den = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  return den ? (pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / den) * 7 : null;
}

export interface GoalPace { rate: number; date: string | null; tooFast: boolean; away: boolean }
/** When the goal weight arrives at the current pace. */
export function goalPace(weighIns: WeighIn[], goal: number, today = todayISO()): GoalPace | null {
  const rate = trendRate(weighIns, today);
  const avg = sevenDayAvg(weighIns);
  if (rate == null || !avg.length) return null;
  const cur = avg[avg.length - 1].avg;
  const toGo = goal - cur; // negative when cutting
  const toward = Math.abs(toGo) > 0.2 && Math.sign(rate) === Math.sign(toGo) && Math.abs(rate) >= 0.1;
  const weeks = toward ? toGo / rate : null;
  return {
    rate,
    date: weeks != null && weeks < 104 ? addDays(today, Math.round(weeks * 7)) : null,
    tooFast: rate < 0 && Math.abs(rate) > cur * 0.01,
    away: Math.abs(toGo) > 0.2 && !toward && Math.abs(rate) >= 0.1,
  };
}

// ---------- week pace ----------
/** "On track" / "1 behind" for the weekly ring. Days are Monday-first. */
export function weekPace(done: number, target: number, trainedToday: boolean, today = todayISO()): { left: number; daysLeft: number; status: 'done' | 'on track' | 'tight' | 'behind' } {
  const dow = (parseDate(today).getDay() + 6) % 7; // Mon=0
  const daysLeft = 7 - dow - (trainedToday ? 1 : 0);
  const left = Math.max(0, target - done);
  return { left, daysLeft, status: left === 0 ? 'done' : left > daysLeft ? 'behind' : left === daysLeft ? 'tight' : 'on track' };
}

// ---------- strength vs body weight ----------
/** % change since the first point, for body weight (7-day avg) and the average est. 1RM of the given lifts. */
export function strengthVsWeight(workouts: Workout[], weighIns: WeighIn[], keys: string[], custom?: Record<string, CustomLift>, today = todayISO()) {
  const from = addDays(today, -90);
  const avg = sevenDayAvg(weighIns).filter((p) => p.date >= from);
  const weight = avg.length > 1 ? avg.map((p) => ({ x: dayNumber(p.date), y: (p.avg / avg[0].avg - 1) * 100 })) : [];
  // Each lift's % change since its first session; on any day, average the latest value of every lift.
  const series = keys.map((k) => workingSessions(liftSessions(workouts, k, custom)).filter((x) => x.date >= from && x.e1rm > 0)).filter((ss) => ss.length >= 2)
    .map((ss) => ss.map((x) => ({ date: x.date, pct: (x.e1rm / ss[0].e1rm - 1) * 100 })));
  const days = [...new Set(series.flatMap((ss) => ss.map((x) => x.date)))].sort();
  const strength = days.map((d) => {
    const vals = series.map((ss) => ss.filter((x) => x.date <= d).pop()?.pct).filter((v): v is number => v != null);
    return { x: dayNumber(d), y: vals.reduce((a, b) => a + b, 0) / vals.length };
  });
  return { weight, strength };
}

// ---------- the built-in (non-AI) coach line on Home ----------
export function homeNote(s: State, today = todayISO()): string {
  const { workouts, settings } = s;
  if (!workouts.length) return 'Tap the gold + when you start your next workout. Type sets the way you would in Notes.';
  const keys = [...new Set(workouts.flatMap((w) => w.exercises.map((e) => e.key)))];
  const all = keys.map((k) => liftInsight(workouts, k, s.weighIns, settings.customLifts, today));
  const stalled = all.find((l) => l.stalled && l.metric === 'e1rm') ?? all.find((l) => l.stalled);
  if (stalled && stalled.latest && stalled.best) {
    const num = (x: LiftSession) => (stalled.metric === 'e1rm' ? `${x.score} lb est. 1RM` : x.top);
    const same = stalled.latest.score === stalled.best.score;
    return `${stalled.info.name} has ${same ? 'matched but not beaten' : 'not beaten'} your best of ${num(stalled.best)} in ${Math.max(3, stalled.sinceBest)} sessions${same ? '' : ` (latest ${num(stalled.latest)})`}. ${STALL_ADVICE}`;
  }
  const left = settings.weeklyTarget - weekCount(workouts, weekStart(parseDate(today)));
  if (left > 0) return `${left} more session${left > 1 ? 's' : ''} this week to hit your target of ${settings.weeklyTarget}.`;
  const up = all.filter((l) => l.metric === 'e1rm' && (l.change4w ?? 0) > 0).sort((a, b) => (b.change4w ?? 0) - (a.change4w ?? 0))[0];
  if (up) return `${up.info.name} is up ${up.change4w} lb (est. 1RM) over 4 weeks. Weekly target hit, nice work.`;
  return 'Weekly target hit. Keep the streak going next week.';
}
