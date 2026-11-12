import { todayISO, useStore } from '../lib/store';
import { STALL_ADVICE, liftHistory, liftSummary, parseDate } from '../lib/stats';
import { Icon, LineChart, dayLabel } from './ui';

const dayNum = (iso: string) => Math.round(+parseDate(iso) / 864e5);
const short = (iso: string) => parseDate(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });

/** Full-screen view of one lift: latest vs best, trend with dates, stall status and what to try. */
export function LiftDetail({ liftKey, onClose }: { liftKey: string; onClose: () => void }) {
  const workouts = useStore((s) => s.workouts);
  const l = liftSummary(workouts, liftKey, todayISO());
  const h = liftHistory(workouts, liftKey);
  const sinceBest = l.bestDate ? h.filter((p) => p.date > l.bestDate!).length : 0;

  return (
    <div className="overlay">
      <main className="screen">
        <div className="row">
          <button className="icon-btn" aria-label="Back" onClick={onClose}>{Icon.back}</button>
          <h1>{l.name}</h1>
        </div>

        <section className="card col" style={{ gap: 10 }}>
          <div className="grid2">
            <div className="col">
              <span className="eyebrow">Latest est. 1RM</span>
              <span className="big">{l.current ?? '—'} <span className="small muted">lb</span></span>
              {h.length > 0 && <span className="tiny muted">{short(h[h.length - 1].date)} · top set {h[h.length - 1].top}</span>}
            </div>
            <div className="col">
              <span className="eyebrow">Best est. 1RM</span>
              <span className="big">{l.best ?? '—'} <span className="small muted">lb</span></span>
              {l.bestDate && <span className="tiny muted">{short(l.bestDate)}{sinceBest ? ` · ${sinceBest} session${sinceBest > 1 ? 's' : ''} ago` : ' · latest session'}</span>}
            </div>
          </div>
          {l.stalled ? (
            <div className="col" style={{ gap: 4, background: 'var(--warn-bg)', borderRadius: 14, padding: '10px 12px' }}>
              <strong className="warn">Stalled {sinceBest} sessions</strong>
              <span style={{ lineHeight: 1.4 }}>No session has beaten your best of {l.best} lb since {l.bestDate ? short(l.bestDate) : 'then'}. {STALL_ADVICE}</span>
            </div>
          ) : l.change4w ? (
            <span className={`small ${l.change4w > 0 ? 'up' : 'warn'}`}>{l.change4w > 0 ? '+' : ''}{l.change4w} lb in 4 weeks</span>
          ) : null}
          {h.length > 1 ? (
            <LineChart label={`${l.name} estimated 1RM by date`} height={150} xLabel={dayLabel} goal={l.best ?? undefined}
              series={[{ values: h.map((p) => ({ x: dayNum(p.date), y: p.e1rm })), color: '#FFB547', dots: true }]} />
          ) : <span className="tiny muted">A chart appears after your second session.</span>}
          {h.length > 1 && <span className="tiny muted">Dots are sessions. The dashed line is your best.</span>}
        </section>

        <section className="card" style={{ padding: '4px 16px' }}>
          {[...h].reverse().slice(0, 12).map((p, i) => (
            <div key={i} className="list-item">
              <span>{short(p.date)}</span>
              <span className="muted small">top set {p.top}</span>
              <strong>{p.e1rm}{p.e1rm === l.best ? ' ★' : ''}</strong>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
