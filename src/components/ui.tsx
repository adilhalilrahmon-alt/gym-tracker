import type { ReactNode } from 'react';

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const Icon = {
  home: <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" {...P}><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /></svg>,
  progress: <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" {...P}><path d="M4 19l5-6 4 3 7-9" /></svg>,
  streak: <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" {...P}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>,
  me: <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" {...P}><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></svg>,
  plus: <svg aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#0B1530" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
  back: <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" {...P} strokeWidth={2.4}><path d="M15 5l-7 7 7 7" /></svg>,
  star: <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" {...P} stroke="#FFB547"><path d="M12 3l1.9 5.8H20l-4.9 3.6 1.9 5.8-5-3.6-5 3.6 1.9-5.8L4 8.8h6.1z" /></svg>,
  pin: (on: boolean) => <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" {...P} fill={on ? '#FFB547' : 'none'} stroke={on ? '#FFB547' : 'currentColor'}><path d="M12 3l1.9 5.8H20l-4.9 3.6 1.9 5.8-5-3.6-5 3.6 1.9-5.8L4 8.8h6.1z" /></svg>,
  dot: <svg aria-hidden="true" width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="#FF6B5E" /></svg>,
};

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="between">
          <h2>{title}</h2>
          <button className="btn ghost" style={{ height: 40 }} onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Ring({ value, target }: { value: number; target: number }) {
  const c = 2 * Math.PI * 32;
  const frac = Math.min(1, value / Math.max(1, target));
  return (
    <svg role="img" aria-label={`${value} of ${target} workouts this week`} width="72" height="72" viewBox="0 0 80 80">
      <circle cx="40" cy="40" r="32" fill="none" stroke="#0B1530" strokeWidth="10" />
      {value > 0 && <circle cx="40" cy="40" r="32" fill="none" stroke={value >= target ? '#36D6C3' : '#FF6B5E'} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${frac * c} ${c}`} transform="rotate(-90 40 40)" />}
      <text x="40" y="47" textAnchor="middle" fontFamily="Fredoka, sans-serif" fontSize="22" fontWeight="600" fill="#F3F5FF">{value}/{target}</text>
    </svg>
  );
}

export interface Series { values: { x: number; y: number }[]; color: string; dots?: boolean; width?: number }

/** Day number (days since 1970, as the charts use) → "Nov 11". */
export const dayLabel = (x: number) => new Date(x * 864e5).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Small line chart; x values are day numbers, y in lb. Pass xLabel to print dates under the chart. */
export function LineChart({ series, goal, height = 140, label, xLabel }: { series: Series[]; goal?: number; height?: number; label: string; xLabel?: (x: number) => string }) {
  const W = 320, H = height + (xLabel ? 14 : 0), pad = { l: 34, r: 12, t: 10, b: xLabel ? 32 : 18 };
  const all = series.flatMap((s) => s.values);
  if (all.length === 0) return <p className="muted small">No data yet.</p>;
  const ys = all.map((p) => p.y).concat(goal != null ? [goal] : []);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (y1 - y0 < 4) { y0 -= 2; y1 += 2; }
  const x0 = Math.min(...all.map((p) => p.x)), x1 = Math.max(...all.map((p) => p.x), x0 + 1);
  const sx = (x: number) => pad.l + ((x - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const sy = (y: number) => pad.t + (1 - (y - y0) / (y1 - y0)) * (H - pad.t - pad.b);
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      {[y0, (y0 + y1) / 2, y1].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={sy(v)} y2={sy(v)} stroke="#22346E" strokeWidth="1" />
          <text x={pad.l - 6} y={sy(v) + 4} textAnchor="end" fontSize="10" fill="#A9B3D6">{Math.round(v)}</text>
        </g>
      ))}
      {xLabel && [...new Set([x0, Math.round((x0 + x1) / 2), x1])].filter((x) => x1 > x0 || x === x0).map((x, i, arr) => (
        <text key={x} x={sx(x)} y={H - 6} textAnchor={arr.length > 1 && i === 0 ? 'start' : i === arr.length - 1 && arr.length > 1 ? 'end' : 'middle'} fontSize="10" fill="#A9B3D6">{xLabel(x)}</text>
      ))}
      {goal != null && <line x1={pad.l} x2={W - pad.r} y1={sy(goal)} y2={sy(goal)} stroke="#FFB547" strokeWidth="1.5" strokeDasharray="5 5" />}
      {series.map((s, i) => (
        <g key={i}>
          {s.values.length > 1 && (
            <polyline fill="none" stroke={s.color} strokeWidth={s.width ?? 2.5} strokeLinecap="round" strokeLinejoin="round" points={s.values.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')} />
          )}
          {(s.dots || s.values.length === 1) && s.values.map((p, j) => <circle key={j} cx={sx(p.x)} cy={sy(p.y)} r="3" fill={s.color} />)}
        </g>
      ))}
    </svg>
  );
}
