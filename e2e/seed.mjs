// Fake data the tester starts with. Each task picks one seed by name.
// It's written into the app's localStorage before the page loads, exactly as real data would be.

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(19, 0, 0, 0);
  return d;
};
const iso = (d) => d.toISOString();
// Local calendar date (not UTC), so an evening session doesn't land on tomorrow.
const date = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function workout(offset, label, exercises, minutes = 65) {
  const start = day(offset);
  return {
    id: `seed-${offset}`,
    startedAt: iso(start),
    endedAt: iso(new Date(+start + minutes * 60000)),
    label,
    rawText: '',
    exercises,
    updatedAt: iso(start),
  };
}
const ex = (name, key, sets, perHand = false) => ({ name, key, perHand, bodyweight: false, sets: sets.map(([weight, reps]) => ({ weight, reps })), flags: [] });

const settings = { goalWeight: 160, weeklyTarget: 4, heightCm: 185, pinned: ['squat', 'bench-press'], reminderTime: '07:30', maxHr: 189 };
const base = { version: 1, measurements: [], settings, active: null, tombstones: [], insights: [] };

export const SEEDS = {
  // Brand-new user: one weigh-in, nothing else.
  empty: { ...base, workouts: [], weighIns: [{ date: date(day(0)), weight: 171.2, source: 'manual' }] },

  // Three weeks of training, with bench stuck at 185x6.
  'three-weeks': {
    ...base,
    measurements: [{ date: date(day(-14)), neck: 15.5, shoulders: 47, chest: 40, biceps: 14, waist: 34.5, hips: 39.5, thigh: 23, calf: 15 }],
    weighIns: Array.from({ length: 21 }, (_, i) => ({ date: date(day(-20 + i)), weight: Math.round((174.5 - i * 0.15 + (i % 3 ? 0 : 0.4)) * 10) / 10, source: 'scale' })),
    workouts: [
      workout(-20, 'Push Day', [ex('Bench Press', 'bench-press', [[180, 6], [180, 6]]), ex('Overhead Press', 'overhead-press', [[95, 8]])]),
      workout(-18, 'Leg Day', [ex('Squat', 'squat', [[205, 5], [185, 6]])]),
      workout(-15, 'Push Day', [ex('Bench Press', 'bench-press', [[190, 6], [185, 6]])]),
      workout(-13, 'Leg Day', [ex('Squat', 'squat', [[215, 5], [185, 6]])]),
      workout(-10, 'Push Day', [ex('Bench Press', 'bench-press', [[185, 6], [185, 5]])]),
      workout(-8, 'Leg Day', [ex('Squat', 'squat', [[220, 5], [185, 6]])]),
      workout(-5, 'Push Day', [ex('Bench Press', 'bench-press', [[185, 6], [185, 6]])]),
      workout(-3, 'Leg Day', [ex('Squat', 'squat', [[225, 5], [185, 6]])]),
      workout(-1, 'Push Day', [ex('Bench Press', 'bench-press', [[185, 6], [180, 6]]), ex('Dumbbell Raise', 'dumbbell-raise', [[30, 15], [30, 8]], true)]),
    ],
  },
};
