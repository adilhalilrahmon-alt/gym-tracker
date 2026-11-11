import { ZONES, zoneMinutes } from '../lib/zones';

export function HrZones({ series, maxHr, guessed }: { series: (number | null)[]; maxHr: number; guessed: boolean }) {
  const z = zoneMinutes(series, maxHr);
  const total = z.reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="col" style={{ gap: 4 }}>
      <div role="img" aria-label={`Minutes per heart-rate zone: ${ZONES.map((x, i) => `${x.name} ${z[i]}`).join(', ')}`} style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', background: 'var(--bg)' }}>
        {z.map((m, i) => (m ? <span key={i} style={{ width: `${(m / total) * 100}%`, background: ZONES[i].color }} /> : null))}
      </div>
      <div className="row tiny muted" style={{ flexWrap: 'wrap', gap: '2px 10px' }}>
        {ZONES.map((x, i) => (
          <span key={x.name} className="row" style={{ gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: x.color }} />{x.name} {z[i]}m
          </span>
        ))}
      </div>
      {guessed && <span className="tiny muted">Zones assume a max heart rate of {maxHr}. Set your age in Me for accurate zones.</span>}
    </div>
  );
}
