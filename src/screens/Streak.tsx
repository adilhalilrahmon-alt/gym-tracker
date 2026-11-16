import { useState } from 'react';
import { actions, todayISO, useStore } from '../lib/store';
import { addDays, avgPerWeek, durationMin, heatmap, monthGrid, parseDate, perfectWeeks, sessionsByDay, setCount, streakBar, streakWeeks, usualStart, weekCount, weekStart, weeksTrained } from '../lib/stats';
import { Sheet } from '../components/ui';

const COLORS = ['#22346E', '#1F7A80', '#36D6C3'];

export function Streak() {
  const s = useStore((x) => x);
  const today = todayISO();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [day, setDay] = useState<string | null>(null);
  const target = s.settings.weeklyTarget;
  const frozen = s.settings.frozenWeeks ?? [];
  const bar = streakBar(target);
  const streak = streakWeeks(s.workouts, target, today, frozen);
  const perfect = perfectWeeks(s.workouts, target, today, frozen);
  const trained = weeksTrained(s.workouts, today, frozen);
  const avg = avgPerWeek(s.workouts, today);
  const usual = usualStart(s.workouts);
  const cells = heatmap(s.workouts, today);
  const grid = monthGrid(s.workouts, ym.y, ym.m, today);
  const byDay = sessionsByDay(s.workouts);
  const wk = weekStart(now);
  const lastWk = addDays(wk, -7);
  const thisWeek = weekCount(s.workouts, wk);
  const shift = (d: number) => setYm(({ y, m }) => { const x = new Date(y, m + d, 1); return { y: x.getFullYear(), m: x.getMonth() }; });
  const isCurrent = ym.y === now.getFullYear() && ym.m === now.getMonth();
  const toggleFreeze = (w: string) => actions.updateSettings({ frozenWeeks: frozen.includes(w) ? frozen.filter((x) => x !== w) : [...frozen, w].slice(-26) });
  const wkLabel = (w: string) => parseDate(w).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });

  return (
    <main className="screen">
      <h1>Streak</h1>
      <div className="grid3">
        <div className="card tight col"><span className="mid" style={{ color: 'var(--gold)' }}>{streak} wk{streak === 1 ? '' : 's'}</span><span className="small muted" style={{ fontWeight: 700 }}>Streak</span><span className="tiny muted">{perfect} perfect</span></div>
        <div className="card tight col"><span className="mid">{trained} wk{trained === 1 ? '' : 's'}</span><span className="small muted" style={{ fontWeight: 700 }}>Trained in a row</span></div>
        <div className="card tight col"><span className="mid">{avg != null ? avg.toFixed(1) : '—'}</span><span className="small muted" style={{ fontWeight: 700 }}>Sessions / week</span>{usual && <span className="tiny muted">usually {usual}</span>}</div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        A week keeps your streak at <strong style={{ color: 'var(--text)' }}>{bar} session{bar > 1 ? 's' : ''}</strong>{bar < target ? <>, one short of your target of {target}. Hitting all {target} makes it a perfect week.</> : '.'} Rest days never break it.
      </p>

      <section className="card col" style={{ gap: 8 }}>
        <strong>Away or sick?</strong>
        <span className="small muted">Freeze a week and it won't count for or against your streak.</span>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className={`btn ${frozen.includes(wk) ? '' : 'subtle'}`} style={{ height: 40 }} aria-pressed={frozen.includes(wk)} onClick={() => toggleFreeze(wk)}>{frozen.includes(wk) ? 'This week is frozen' : 'Freeze this week'}</button>
          <button className={`btn ${frozen.includes(lastWk) ? '' : 'subtle'}`} style={{ height: 40 }} aria-pressed={frozen.includes(lastWk)} onClick={() => toggleFreeze(lastWk)}>{frozen.includes(lastWk) ? `Week of ${wkLabel(lastWk)} is frozen` : `Freeze last week (${wkLabel(lastWk)})`}</button>
        </div>
      </section>

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
            {isCurrent && <span className="small warn">{thisWeek} of {target} this week</span>}
          </div>
          <button className="icon-btn" style={{ background: 'var(--card-2)' }} aria-label="Next month" disabled={isCurrent} onClick={() => shift(1)}>›</button>
        </div>
        <div className="cal small muted" style={{ fontWeight: 800 }}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i}>{d}</span>)}</div>
        <div className="cal">
          {grid.map((d, i) => d
            ? d.trained
              ? <button key={i} className={`d on ${d.today ? 'today' : ''}`} style={{ border: 'none' }} aria-label={`Workout on ${d.date}`} onClick={() => setDay(d.date)}>{d.day}</button>
              : <span key={i} className={`d ${d.future ? 'future' : ''} ${d.today ? 'today' : ''}`}>{d.day}</span>
            : <span key={i} />)}
        </div>
        <span className="tiny muted">Tap a teal day to see what you did.</span>
      </section>

      {day && (
        <Sheet title={parseDate(day).toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric' })} onClose={() => setDay(null)}>
          <div className="col" style={{ gap: 12, maxHeight: '50vh', overflowY: 'auto' }}>
            {(byDay.get(day) ?? []).map((w) => (
              <div key={w.id} className="col" style={{ gap: 4 }}>
                <strong>{w.label ?? 'Workout'} <span className="small muted" style={{ fontWeight: 600 }}>· {durationMin(w)} min · {setCount(w)} sets{w.hr ? ` · HR ${w.hr.avg}` : ''}</span></strong>
                {w.exercises.map((ex, i) => <span key={i} className="small"><span className="muted">{ex.name}:</span> {ex.sets.map((x) => (x.secs ? `${x.secs}s` : x.weight == null ? `${x.reps}` : `${x.weight}×${x.reps}`)).join(', ')}</span>)}
                {w.note && <span className="small muted">Note: {w.note}</span>}
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </main>
  );
}
