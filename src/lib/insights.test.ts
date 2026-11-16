import type { Workout } from './store';
import { goalPace, groupSummary, liftInsight, repRange, suggestNext, weekPace, workoutPRs, liftSessions } from './insights';
import { streakWeeks, weeksTrained } from './stats';

const w = (date: string, key: string, name: string, sets: [number | null, number][], id = date + key): Workout => ({
  id, startedAt: `${date}T19:00:00`, endedAt: `${date}T20:00:00`, label: null, rawText: '',
  exercises: [{ key, name, perHand: false, bodyweight: false, flags: [], sets: sets.map(([weight, reps]) => ({ weight, reps })) }],
});
const bench = (date: string, sets: [number, number][]) => w(date, 'bench-press', 'Bench Press', sets);

describe('suggestNext', () => {
  it('adds a rep below the top of the range', () => {
    const s = suggestNext([bench('2026-11-01', [[185, 6], [185, 6]]), bench('2026-11-04', [[185, 6], [185, 5]])], 'bench-press', undefined, { today: '2026-11-07' })!;
    expect(s.next!.map((x) => `${x.weight}x${x.reps}`)).toEqual(['185x6', '185x6']);
    expect(s.reason).toMatch(/one more rep/);
  });
  it('adds weight at the top of the range', () => {
    const s = suggestNext([bench('2026-11-01', [[185, 6], [185, 6]]), bench('2026-11-04', [[185, 8], [185, 8]])], 'bench-press', undefined, { today: '2026-11-07' })!;
    expect(s.next!.map((x) => `${x.weight}x${x.reps}`)).toEqual(['190x6', '190x6']);
  });
  it('keeps back-off sets and only pushes the top set', () => {
    const s = suggestNext([w('2026-11-04', 'squat', 'Squat', [[225, 5], [185, 6]])], 'squat', undefined, { today: '2026-11-07' })!;
    expect(s.next!.map((x) => `${x.weight}x${x.reps}`)).toEqual(['225x6', '185x6']);
  });
  it('goes lighter after a stall or a long break', () => {
    const stalled = [bench('2026-10-20', [[190, 6]]), bench('2026-10-24', [[185, 6]]), bench('2026-10-28', [[185, 6]]), bench('2026-11-01', [[185, 6]])];
    expect(suggestNext(stalled, 'bench-press', undefined, { today: '2026-11-03' })!.next![0].weight).toBe(165);
    expect(suggestNext([bench('2026-10-01', [[185, 6]])], 'bench-press', undefined, { today: '2026-11-03' })!.reason).toMatch(/days since/);
  });
  it('handles bodyweight lifts and unknown lifts', () => {
    const s = suggestNext([w('2026-11-01', 'pull-up', 'Pull-up', [[null, 8], [null, 6]])], 'pull-up', undefined, { today: '2026-11-03' })!;
    expect(s.next!.map((x) => x.reps)).toEqual([8, 7]);
    expect(suggestNext([], 'squat')).toBeNull();
  });
  it('learns the rep range', () => {
    const ss = liftSessions([bench('2026-11-01', [[185, 10]]), bench('2026-11-03', [[185, 12]]), bench('2026-11-05', [[185, 11]])], 'bench-press');
    expect(repRange(ss, { compound: true } as never)).toEqual({ lo: 10, hi: 12 });
  });
});

describe('insights', () => {
  const log = [bench('2026-10-20', [[180, 6]]), bench('2026-10-27', [[185, 6]]), bench('2026-11-03', [[190, 6], [185, 8]]), w('2026-11-03', 'lateral-raise', 'Lateral Raise', [[20, 15]])];
  it('summarises a lift', () => {
    const i = liftInsight(log, 'bench-press', [{ date: '2026-10-20', weight: 175, source: 'manual' }, { date: '2026-11-03', weight: 172, source: 'manual' }], undefined, '2026-11-04');
    expect(i.metric).toBe('e1rm');
    expect(i.headline).toBe('234');
    expect(i.records.find((r) => r.reps === 8)?.weight).toBe(185);
    expect(i.relative).toBeCloseTo(1.36, 2);
    expect(i.perMonth).toBeGreaterThan(0);
    expect(liftInsight(log, 'lateral-raise', []).headline).toBe('20×15');
  });
  it('groups by muscle and counts this week', () => {
    const g = groupSummary(log, undefined, '2026-11-04');
    expect(g.map((x) => x.group)).toEqual(['chest', 'shoulders']);
    expect(g[0].sets).toBe(2);
  });
  it('finds PRs', () => {
    expect(workoutPRs(log, log[2])[0].text).toMatch(/heaviest yet, 190×6/);
    expect(workoutPRs(log, log[0])).toEqual([]);
  });
  it('projects the goal date and week pace', () => {
    const weighIns = Array.from({ length: 21 }, (_, i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, weight: 175 - i * 0.15, source: 'scale' as const }));
    const p = goalPace(weighIns, 160, '2026-11-21')!;
    expect(p.rate).toBeCloseTo(-0.93, 1);
    expect(p.date! > '2027-01-15' && p.date! < '2027-03-15').toBe(true);
    expect(weekPace(0, 4, false, '2026-11-16').status).toBe('on track'); // Monday
    expect(weekPace(1, 4, true, '2026-11-21').status).toBe('behind'); // Saturday
  });
  it('counts streaks with one session of grace and frozen weeks', () => {
    const d = (date: string) => w(date, 'squat', 'Squat', [[200, 5]]);
    const ws = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'].map(d);
    expect(streakWeeks(ws, 4, '2026-11-13')).toBe(1);
    expect(streakWeeks(ws, 4, '2026-11-13', ['2026-11-02'])).toBe(2);
    expect(weeksTrained(ws, '2026-11-13')).toBe(1);
  });
});
