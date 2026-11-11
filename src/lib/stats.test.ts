import { e1rm, streakWeeks, weekStart, liftSummary, heatmap, monthGrid, navyBodyFat, sevenDayAvg } from './stats';
import { parseWorkout } from './parser';
import type { Workout } from './store';

function wk(date: string, text: string, mins = 60): Workout {
  const start = new Date(date + 'T19:00:00');
  return {
    id: date,
    startedAt: start.toISOString(),
    endedAt: new Date(+start + mins * 60000).toISOString(),
    label: null,
    rawText: text,
    exercises: parseWorkout(text).exercises,
  };
}

describe('stats', () => {
  it('estimates 1RM with Epley', () => {
    expect(Math.round(e1rm(225, 5))).toBe(263);
    expect(e1rm(300, 1)).toBe(300);
  });

  it('weeks start on Monday', () => {
    expect(weekStart(new Date('2026-11-11T12:00:00'))).toBe('2026-11-09');
    expect(weekStart(new Date('2026-11-15T12:00:00'))).toBe('2026-11-09');
  });

  it('counts week streaks against the target', () => {
    const days = ['2026-10-26', '2026-10-27', '2026-10-29', '2026-10-30', '2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06', '2026-11-09'];
    const ws = days.map((d) => wk(d, 'squat 225x5'));
    expect(streakWeeks(ws, 4, '2026-11-11')).toBe(2); // this week not hit yet, 2 prior weeks hit
  });

  it('flags a stalled lift', () => {
    const ws = ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'].map((d, i) => wk(d, `bench ${i === 0 ? 190 : 185}x6`));
    expect(liftSummary(ws, 'bench-press', '2026-10-23').stalled).toBe(true);
  });

  it('builds heat map and month grid', () => {
    const ws = [wk('2026-11-10', 'squat 225x5', 75)];
    const h = heatmap(ws, '2026-11-11');
    expect(h).toHaveLength(182);
    expect(h.find((c) => c.date === '2026-11-10')?.level).toBe(2);
    expect(h[h.length - 1].level).toBe(-1);
    const g = monthGrid(ws, 2026, 10, '2026-11-11');
    expect(g[0]?.day).toBe(1); // Nov 1, 2026 is a Sunday
    expect(g.find((d) => d?.day === 10)?.trained).toBe(true);
  });

  it('computes body fat and weight averages', () => {
    expect(navyBodyFat({ waist: 34, neck: 15.5 }, 185).toFixed(1)).toBe('15.3');
    const a = sevenDayAvg([
      { date: '2026-11-10', weight: 172, source: 'manual' },
      { date: '2026-11-11', weight: 171.2, source: 'manual' },
    ]);
    expect(a[1].avg).toBeCloseTo(171.6);
  });
});
