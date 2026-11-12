import { useState } from 'react';
import { actions, todayISO, useStore } from '../lib/store';
import { addDays, allLiftKeys, durationMin, liftHistory, liftSummary, parseDate, setCount, sevenDayAvg, weeklyRate } from '../lib/stats';
import { formatSet } from '../lib/parser';
import { Icon, LineChart, dayLabel } from '../components/ui';
import { HrZones } from '../components/HrZones';
import { EditWorkoutSheet } from '../components/EditWorkoutSheet';
import { coachNote, weeklyNow } from '../lib/sync';
import type { Workout } from '../lib/store';

const dayNum = (iso: string) => Math.round(+parseDate(iso) / 864e5);

export function Progress({ onWeight, onLift }: { onWeight: () => void; onLift: (key: string) => void }) {
  const s = useStore((x) => x);
  const today = todayISO();
  const [del, setDel] = useState<string | null>(null);
  const [editing, setEditing] = useState<Workout | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const weekly = s.insights.find((i) => i.kind === 'weekly');
  const noteFor = (id: string) => s.insights.find((i) => i.id === `w-${id}`);
  const maxHr = s.settings.maxHr ?? 190;
  const ask = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setErr('');
    try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const recentW = s.weighIns.filter((w) => w.date >= addDays(today, -90));
  const avg = sevenDayAvg(s.weighIns).filter((p) => p.date >= addDays(today, -90));
  const rate = weeklyRate(s.weighIns);
  const lifts = allLiftKeys(s.workouts);
  const pinned = new Set(s.settings.pinned);

  const togglePin = (k: string) => {
    const next = pinned.has(k) ? s.settings.pinned.filter((x) => x !== k) : [k, ...s.settings.pinned].slice(0, 2);
    actions.updateSettings({ pinned: next });
  };

  return (
    <main className="screen">
      <h1>Progress</h1>

      <section className="card col" style={{ gap: 8 }}>
        <div className="between">
          <h2>Weekly review</h2>
          <button className="btn subtle" style={{ height: 38 }} disabled={busy === 'weekly'} onClick={() => ask('weekly', weeklyNow)}>{busy === 'weekly' ? 'Writing…' : weekly ? 'Refresh' : 'Write now'}</button>
        </div>
        {weekly ? <p style={{ margin: 0, lineHeight: 1.45, whiteSpace: 'pre-line' }}>{weekly.text}</p> : <span className="small muted">Your coach writes this every Sunday at 6 pm. Tap Write now for one today.</span>}
        {err && <span className="small warn">{err}</span>}
      </section>

      <section className="card col" style={{ gap: 8 }}>
        <div className="between">
          <h2>Weight</h2>
          <button className="btn subtle" style={{ height: 38 }} onClick={onWeight}>Log weight</button>
        </div>
        <span className="small muted">
          Dots are weigh-ins, the line is the 7-day average, dashes are your {s.settings.goalWeight} lb goal.
          {rate != null && <> Trend: <strong className={rate <= 0 ? 'up' : 'warn'}>{rate > 0 ? '+' : ''}{rate.toFixed(1)} lb/week</strong>.</>}
        </span>
        <LineChart
          label="Weight over the last 90 days"
          xLabel={dayLabel}
          goal={s.settings.goalWeight}
          series={[
            { values: recentW.map((w) => ({ x: dayNum(w.date), y: w.weight })), color: '#A9B3D6', dots: true, width: 0 },
            { values: avg.map((p) => ({ x: dayNum(p.date), y: p.avg })), color: '#36D6C3' },
          ]}
        />
      </section>

      <h2>Lifts</h2>
      {lifts.length === 0 && <p className="muted small" style={{ margin: 0 }}>Log a workout with the gold + and your lifts show up here.</p>}
      {lifts.map((l) => {
        const sum = liftSummary(s.workouts, l.key, today);
        const h = liftHistory(s.workouts, l.key);
        return (
          <section key={l.key} className="card col" style={{ gap: 6 }}>
            <div className="between">
              <strong>{l.name}</strong>
              <button className="icon-btn" style={{ width: 40, height: 40, background: 'transparent' }} aria-label={pinned.has(l.key) ? `Unpin ${l.name} from Home` : `Pin ${l.name} to Home`} aria-pressed={pinned.has(l.key)} onClick={() => togglePin(l.key)}>{Icon.pin(pinned.has(l.key))}</button>
            </div>
            <button className="col" style={{ gap: 6, background: 'none', border: 'none', padding: 0, textAlign: 'left' }} onClick={() => onLift(l.key)} aria-label={`${l.name} details`}>
              <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
                <span className="mid">{sum.current ?? '—'}<span className="small muted"> lb latest</span></span>
                {sum.best != null && sum.best !== sum.current && <span className="small muted">best {sum.best}</span>}
                {sum.stalled ? <span className="small warn">Stalled</span> : sum.change4w ? <span className={`small ${sum.change4w > 0 ? 'up' : 'warn'}`}>{sum.change4w > 0 ? '+' : ''}{sum.change4w} in 4 wks</span> : null}
              </div>
              {h.length > 1 ? <LineChart label={`${l.name} estimated 1RM by date`} height={100} xLabel={dayLabel} series={[{ values: h.map((p) => ({ x: dayNum(p.date), y: p.e1rm })), color: '#FFB547', dots: true }]} /> : <span className="tiny muted">{h.length ? `Best set ${h[0].top}. A chart appears after your second session.` : 'Bodyweight only so far.'}</span>}
              <span className="tiny muted">Est. 1RM in lb. Tap for details.</span>
            </button>
          </section>
        );
      })}

      <h2>Workouts</h2>
      {s.workouts.length === 0 && <p className="muted small" style={{ margin: 0 }}>No workouts yet.</p>}
      <section className="card" style={{ padding: '4px 16px', display: s.workouts.length ? 'block' : 'none' }}>
        {[...s.workouts].reverse().map((w) => (
          <details key={w.id} className="list-item" style={{ display: 'block' }}>
            <summary className="between">
              <span className="col" style={{ gap: 0 }}>
                <strong>{w.label ?? 'Workout'}</strong>
                <span className="small muted">{new Date(w.startedAt).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })} · {durationMin(w)} min · {setCount(w)} sets{w.hr ? ` · avg HR ${w.hr.avg}` : ''}</span>
              </span>
              <span className="muted small">Details</span>
            </summary>
            <div className="col" style={{ gap: 8, paddingTop: 8 }}>
              <div className="col" style={{ gap: 4 }}>
                <span className="eyebrow" style={{ color: 'var(--gold)' }}>Coach</span>
                {noteFor(w.id) ? <p style={{ margin: 0, lineHeight: 1.45 }}>{noteFor(w.id)!.text}</p> : <span className="small muted">{w.hr ? 'No note yet.' : 'Your note arrives once heart rate syncs, or 45 min after you finish.'}</span>}
                <button className="btn subtle" style={{ height: 38, alignSelf: 'flex-start' }} disabled={busy === w.id} onClick={() => ask(w.id, () => coachNote(w.id, !!noteFor(w.id)))}>{busy === w.id ? 'Thinking…' : noteFor(w.id) ? 'Rewrite note' : 'Get coach note now'}</button>
              </div>
              {w.hr && (
                <div className="col" style={{ gap: 4 }}>
                  <span className="small" style={{ fontWeight: 800 }}>Heart rate <span className="muted">avg {w.hr.avg} · max {w.hr.max} bpm</span></span>
                  <HrZones series={w.hr.series} maxHr={maxHr} guessed={s.settings.maxHr == null} />
                  <LineChart label={`Heart rate during ${w.label ?? 'workout'}`} height={90} series={[{ values: w.hr.series.map((y, x) => (y == null ? null : { x, y })).filter((p): p is { x: number; y: number } => p !== null), color: '#FF6B5E' }]} />
                </div>
              )}
              {w.exercises.map((ex, i) => (
                <div key={i} className="col">
                  <span className="small" style={{ fontWeight: 800 }}>{ex.name}{ex.perHand ? ' (per hand)' : ''}</span>
                  <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{ex.sets.map((st, j) => <span key={j} className="chip">{formatSet(st)}</span>)}</div>
                </div>
              ))}
              <div className="row">
              <button className="btn subtle" style={{ height: 40 }} onClick={() => setEditing(w)}>Edit</button>
              <button className="btn ghost" style={{ height: 40 }} onClick={() => { if (del === w.id) actions.deleteWorkout(w.id); else { setDel(w.id); setTimeout(() => setDel(null), 3000); } }}>{del === w.id ? 'Tap again to delete' : 'Delete workout'}</button>
              </div>
            </div>
          </details>
        ))}
      </section>
      {editing && <EditWorkoutSheet w={editing} onClose={() => setEditing(null)} />}
    </main>
  );
}
