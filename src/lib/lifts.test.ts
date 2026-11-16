import { LIFTS, cleanName, matchLift } from './lifts';

const id = (t: string) => { const m = matchLift(t); return `${m.how}:${m.id}`; };

describe('lift library', () => {
  it('has unique ids and a healthy size', () => {
    expect(new Set(LIFTS.map((l) => l.id)).size).toBe(LIFTS.length);
    expect(LIFTS.length).toBeGreaterThan(100);
  });

  it('treats wording as the same lift', () => {
    for (const t of ['bench', 'Bench Press', 'barbell bench press', 'bb bench', 'flat bench', 'press bench']) expect(matchLift(t).id).toBe('bench-press');
    for (const t of ['squat', 'squats', 'back squat', 'Barbell Squats']) expect(matchLift(t).id).toBe('squat');
    expect(matchLift('ohp').id).toBe('overhead-press');
    expect(matchLift('rdl').id).toBe('romanian-deadlift');
    expect(matchLift('pullups').id).toBe('pull-up');
    expect(matchLift('db curls').id).toBe('bicep-curl');
    expect(matchLift('tricep pushdowns').id).toBe('tricep-pushdown');
    expect(matchLift('Leg extensions').id).toBe('leg-extension');
  });

  it('keeps equipment and angle apart', () => {
    expect(matchLift('incline bench').id).toBe('incline-bench-press');
    expect(matchLift('db bench').id).toBe('dumbbell-bench-press');
    expect(matchLift('incline db press').id).toBe('incline-dumbbell-press');
    expect(matchLift('front squat').id).toBe('front-squat');
    expect(matchLift('hack squat').id).toBe('hack-squat');
  });

  it('fixes misspellings', () => {
    expect(id('bech pres')).toBe('fuzzy:bench-press');
    expect(id('sqaut')).toBe('fuzzy:squat');
    expect(id('benchpress')).toBe('fuzzy:bench-press');
    expect(id('deadlfit')).toBe('fuzzy:deadlift');
    expect(id('lat puldown')).toBe('fuzzy:lat-pulldown');
    expect(id('romainian deadlift')).toBe('fuzzy:romanian-deadlift');
    expect(id('hak squat')).toBe('fuzzy:hack-squat');
    expect(id('incline bech')).toBe('fuzzy:incline-bench-press');
    expect(id('leg extention')).toBe('fuzzy:leg-extension');
  });

  it('asks instead of guessing when unsure', () => {
    const m = matchLift('dumbbell raise');
    expect(m.how).toBe('ask');
    expect(m.options.map((o) => o.id)).toContain('lateral-raise');
    expect(matchLift('decline cable press').how).not.toBe('fuzzy');
    expect(matchLift('zercher carry thing').how).toMatch(/ask|new/);
    expect(matchLift('sled push').how).toMatch(/ask|new/);
  });

  it('remembers choices and custom lifts', () => {
    expect(matchLift('dumbbell raise', { aliases: { 'dumbbell raise': 'lateral-raise' } })).toMatchObject({ id: 'lateral-raise', how: 'learned' });
    expect(matchLift('Sled Push', { custom: { 'sled-push': { name: 'Sled Push', group: 'legs' } } })).toMatchObject({ id: 'sled-push', how: 'custom' });
  });

  it('cleans names', () => {
    expect(cleanName('DB  Incline-Bench Presses')).toBe('dumbbell incline bench press');
  });
});
