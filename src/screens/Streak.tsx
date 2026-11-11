import { useState } from 'react';
import { todayISO, useStore } from '../lib/store';
import { avgPerWeek, heatmap, monthGrid, streakWeeks, usualStart, weekCount, weekStart } from '../lib/stats';

const COLORS = ['#22346E', '#1F7A80', '#36D6C3'];

export function Streak() {
  const s = useStore((x) => x);
  const today = todayISO();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const streak = streakWeeks(s.workouts, s.settings.weeklyTarget, today);
  const avg = avgPerWeek(s.workouts, today);
  const usual = usualStart(s.workouts);
  const cells = heatmap(s.workouts, today);
  const grid = monthGrid(s.workouts, ym.y, ym.m, today);
  const thisWeek = weekCount(s.workouts, weekStart(now));
  const shift = (d: number) => setYm(({ y, m }) => { const x = new Date(y, m + d, 1); return { y: x.getFullYear(), m: x.getMonth() }; });
  const isCurrent = ym.y === now.getFullYear() && ym.m === now.getMonth();

  return (
    <main className="screen">
      <h1>Streak</h1>
      <div className="grid3">
        <div className="card tight col"><span className="mid" style={{ color: 'var(--gold)' }}>{streak} wk{streak === 1 ? '' : 's'}</span><span className="small muted" style={{ fontWeight: 700 }}>Current streak</span></div>
        <div className="card tight col"><span className="mid">{avg != null ? avg.toFixed(1) : '—'}</span><span className="small muted" style={{ fontWeight: 700 }}>Sessions / week</span></div>
        <div className="card tight col"><span className="mid">{usual ?? '—'}</span><span className="small muted" style={{ fontWeight: 700 }}>Usual start</span></div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>A week counts toward your streak when you hit {s.settings.weeklyTarget} sessions. Rest days never break it.</p>

      <section className="card col" style={{ gap: 10 }}>
        <div className="between"><strong>Last 6 months</strong><span className="small muted">Each square is a day</span></div>
        <div className="heat" role="img" aria-label="Heat map of workouts over the last 26 weeks">
          {cells.map((c) => <span key={c.date} title={c.date} style={{ background: c.level < 0 ? 'transparent' : COLORS[c.level] }} />)}
        </div>
        <div className="row small muted" style={{ gap: 6 }}>
          <span>Rest</span>
          {COLORS.map((c) => <span key={c} style={{ width: 10, height: 10, borderRadius: 3, background: c }} />)}
          <span>60+ min</span>
        </div>
      </section>

      <section className="card col" style={{ gap: 10 }}>
        <div className="between">
          <button className="icon-btn" style={{ background: 'var(--card-2)' }} aria-label="Previous month" onClick={() => shift(-1)}>‹</button>
          <div className="col" style={{ alignItems: 'center', gap: 0 }}>
            <strong>{new Date(ym.y, ym.m, 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })}</strong>
            {isCurrent && <span className="small warn">{thisWeek} of {s.settings.weeklyTarget} this week</span>}
          </div>
          <button className="icon-btn" style={{ background: 'var(--card-2)' }} aria-label="Next month" disabled={isCurrent} onClick={() => shift(1)}>›</button>
        </div>
        <div className="cal small muted" style={{ fontWeight: 800 }}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i}>{d}</span>)}</div>
        <div className="cal">
          {grid.map((d, i) => d ? <span key={i} className={`d ${d.trained ? 'on' : d.future ? 'future' : ''} ${d.today ? 'today' : ''}`}>{d.day}</span> : <span key={i} />)}
        </div>
      </section>
    </main>
  );
}
