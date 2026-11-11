import { parseWorkout, formatSet } from './parser';

const sets = (txt: string, i = 0) => parseWorkout(txt).exercises[i].sets.map(formatSet);

describe('parseWorkout', () => {
  it("reads Adil's leg day exactly", () => {
    const w = parseWorkout(`Leg day: squat 225x5, 185x6, 185,4
Hack squat 200x6, 185x6
Leg extension: 100x8, 200x9
Dumbbell raise 30x15, 30x8`);
    expect(w.label).toBe('Leg Day');
    expect(w.exercises.map((e) => e.name)).toEqual(['Squat', 'Hack Squat', 'Leg Extension', 'Dumbbell Raise']);
    expect(w.exercises[0].sets.map(formatSet)).toEqual(['225×5', '185×6', '185×4']);
    expect(w.exercises[0].flags[0].kind).toBe('comma');
    expect(w.exercises[2].flags).toEqual([expect.objectContaining({ kind: 'jump', setIndex: 1, suggestion: 100 })]);
    expect(w.exercises[3].perHand).toBe(true);
  });

  it('reads the one-line comma style', () => {
    const w = parseWorkout('leg day, squat 185x5, 225x2, quad leg extension 95x10, 100 x 15, glute bridges 225x5');
    expect(w.label).toBe('Leg Day');
    expect(w.exercises.map((e) => e.name)).toEqual(['Squat', 'Leg Extension', 'Glute Bridge']);
    expect(w.exercises[1].sets.map(formatSet)).toEqual(['95×10', '100×15']);
  });

  it('expands weight x reps x sets', () => {
    expect(sets('bench 185x6x3')).toEqual(['185×6', '185×6', '185×6']);
  });

  it('handles bodyweight reps and added weight', () => {
    expect(sets('pull-ups 10, 8')).toEqual(['10 reps', '8 reps']);
    expect(sets('dips +25x8, bw x 12')).toEqual(['+25×8', '12 reps']);
  });

  it('allows no label and decimals', () => {
    const w = parseWorkout('OHP 102.5x5');
    expect(w.label).toBeNull();
    expect(w.exercises[0].name).toBe('Overhead Press');
    expect(w.exercises[0].sets[0].weight).toBe(102.5);
  });
});
