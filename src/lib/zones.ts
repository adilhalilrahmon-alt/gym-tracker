// Heart-rate zones from per-minute averages, as % of max heart rate.
export const ZONES = [
  { name: 'Warm-up', lo: 0.5, color: '#7C8BC4' },
  { name: 'Easy', lo: 0.6, color: '#36D6C3' },
  { name: 'Aerobic', lo: 0.7, color: '#FFB547' },
  { name: 'Hard', lo: 0.8, color: '#FF8A5E' },
  { name: 'Max', lo: 0.9, color: '#FF6B5E' },
];

export function zoneMinutes(series: (number | null)[], maxHr: number): number[] {
  const z = [0, 0, 0, 0, 0];
  for (const b of series) {
    if (b == null) continue;
    const p = b / maxHr;
    for (let i = ZONES.length - 1; i >= 0; i--) if (p >= ZONES[i].lo) { z[i]++; break; }
  }
  return z;
}

/** Tanaka formula, more accurate than 220 − age for adults. */
export const maxHrFromAge = (age: number) => Math.round(208 - 0.7 * age);
