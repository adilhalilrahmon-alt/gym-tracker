import { useMemo, useState } from 'react';
import { actions, todayISO, useStore } from '../lib/store';
import { addDays, durationMin, parseDate, setCount, sevenDayAvg, dayNumber } from '../lib/stats';
import { goalPace, groupSummary, liftInsight, strengthVsWeight, workoutPRs } from '../lib/insights';
import { formatSet } from '../lib/parser';
import { cleanName } from '../lib/lifts';
import { showW } from '../lib/units';
import { LineChart, Spark, dayLabel } from '../components/ui';
import { HrZones } from '../components/HrZones';
import { EditWorkoutSheet } from '../components/EditWorkoutSheet';
import { askCoach, coachNote, weeklyNow, useSyncStatus } from '../lib/sync';
import type { Workout } from '../lib/store';

const dayNum = dayNumber;
const longDate = (iso: string) => parseDate(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });

export function Progress({ onWeight, onLift }: { onWeight: () => void; onLift: (key: string) => void }) {
  const s = useStore((x) => x);
  const sync = useSyncStatus();
  const today = todayISO();
  const u = s.settings.weightUnit ?? 'lb';
  const custom = s.settings.customLifts;
  const [del, setDel] = useState<string | null>(null);
  const [editing, setEditing] = useState<Workout | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(8);
  const [question, setQuestion] = useState('');
  const weeklies = s.insights.filter((i) => i.kind === 'weekly');
  const weekly = weeklies[0];
  const asks = s.insights.filter((i) => i.kind === 'ask');
  const noteFor = (id: string) => s.insights.find((i) => i.id === `w-${id}`);
  const maxHr = s.settings.maxHr ?? 190;
  const ask = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setErr('');
    try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const recentW = s.weighIns.filter((w) => w.date >= addDays(today, -90));
  const avg = sevenDayAvg(s.weighIns).filter((p) => p.date >= addDays(today, -90));
  const pace = goalPace(s.weighIns, s.settings.goalWeight, today);
  const groups = useMemo(() => groupSummary(s.workouts, custom, today), [s.workouts, custom, today]);
  const pinned = new Set(s.settings.pinned);
  const compoundKeys = useMemo(() => groups.flatMap((g) => g.lifts).filter((k) => liftInsight(s.workouts, k, [], custom, today).metric === 'e1rm'), [groups, s.workouts, custom, today]);
  const svw = useMemo(() => strengthVsWeight(s.workouts, s.weighIns, compoundKeys, custom, today), [s.workouts, s.weighIns, compoundKeys, custom, today]);

  const words = cleanName(q).split(' ').filter(Boolean);
  const list = [...s.workouts].reverse().filter((w) => !words.length || words.every((x) => cleanName(`${w.label ?? ''} ${w.exercises.map((e) => e.name).join(' ')} ${w.note ?? ''}`).includes(x)));

  return (
    <main className="screen">
      <h1>Progress</h1>

      <section className="card col" style={{ gap: 8 }}>
        <div className="between">
          <h2>Weekly review</h2>
          <button className="btn subtle" style={{ height: 38 }} disabled={busy === 'weekly'} onClick={() => ask('weekly', weeklyNow)}>{busy === 'weekly' ? 'Writing…' : weekly ? 'Refresh' : 'Write now'}</button>
        </div>
        {weekly ? <p style={{ margin: 0, lineHeight: 1.45, whiteSpace: 'pre-line' }}>{weekly.text}</p> : <span className="small muted">Your coach writes this every Sunday at 6 pm. Tap Write now for one today.</span>}
        {weeklies.length > 1 && (
          <details>
            <summary className="small" style={{ fontWeight: 800, color: 'var(--gold)' }}>Past reviews ({weeklies.length - 1})</summary>
            <div className="col" style={{ gap: 10, paddingTop: 8 }}>
              {weeklies.slice(1, 9).map((w) => (
                <div key={w.id} className="col" style={{ gap: 2 }}>
                  <span className="eyebrow">Week of {w.ref ? longDate(w.ref) : longDate(w.created_at.slice(0, 10))}</span>
                  <p className="small" style={{ margin: 0, lineHeight: 1.45, whiteSpace: 'pre-line' }}>{w.text}</p>
                </div>
              ))}
            </div>
          </details>
        )}
        {sync.email && (
          <form className="col" style={{ gap: 6, borderTop: '1px solid #22346e', paddingTop: 10 }} onSubmit={(e) => { e.preventDefault(); if (question.trim().length > 3) void ask('ask', async () => { await askCoach(question.trim()); setQuestion(''); }); }}>
            <label className="small" style={{ fontWeight: 800 }} htmlFor="ask">Ask your coach about your data</label>
            <div className="row">
              <input id="ask" className="input" placeholder="Why is squat up but bench flat?" value={question} maxLength={300} onChange={(e) => setQuestion(e.target.value)} />
              <button className="btn" type="submit" disabled={busy === 'ask' || question.trim().length < 4}>{busy === 'ask' ? '…' : 'Ask'}</button>
            </div>
            {asks.slice(0, 3).map((a) => (
              <div key={a.id} className="col" style={{ gap: 2 }}>
                <span className="small muted" style={{ fontWeight: 800 }}>{a.ref}</span>
                <p className="small" style={{ margin: 0, lineHeight: 1.45, whiteSpace: 'pre-line' }}>{a.text}</p>
              </div>
            ))}
          </form>
        )}
        {err && <span className="small warn">{err}</span>}
      </section>

      <section className="card col" style={{ gap: 8 }}>
        <div className="between">
          <h2>Weight</h2>
          <button className="btn subtle" style={{ height: 38 }} onClick={onWeight}>Log weight</button>
        </div>
        <span className="small muted">
          Dots are weigh-ins, the line is the 7-day average.
          {pace && <> Trend: <strong className={pace.away ? 'warn' : 'up'}>{pace.rate > 0 ? '+' : ''}{showW(pace.rate, u).toFixed(1)} {u}/week</strong>.</>}
          {pace?.date && <> At this pace you reach {showW(s.settings.goalWeight, u)} {u} around <strong style={{ color: 'var(--text)' }}>{parseDate(pace.date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: pace.date.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric' })}</strong>.</>}
          {pace?.away && <> That's moving away from your goal.</>}
        </span>
        {pace?.tooFast && <span className="small warn">That's faster than 1% of your body weight a week. Slower usually keeps more strength.</span>}
        <LineChart
          label="Weight over the last 90 days"
          xLabel={dayLabel}
          goal={showW(s.settings.goalWeight, u)}
          goalEdge
          goalLabel={`goal ${showW(s.settings.goalWeight, u)}`}
          yFmt={(v) => v.toFixed(u === 'kg' ? 1 : 0)}
          series={[
            { values: recentW.map((w) => ({ x: dayNum(w.date), y: showW(w.weight, u) })), color: '#A9B3D6', dots: true, width: 0 },
            { values: avg.map((p) => ({ x: dayNum(p.date), y: showW(p.avg, u) })), color: '#36D6C3' },
          ]}
        />
      </section>

      {svw.weight.length > 1 && svw.strength.length > 1 && (
        <section className="card col" style={{ gap: 8 }}>
          <h2>Strength vs body weight</h2>
          <span className="small muted">Change since 90 days ago. <strong style={{ color: '#FFB547' }}>Gold</strong> is your main lifts (average est. 1RM), <strong style={{ color: '#36D6C3' }}>teal</strong> is body weight. Gold holding while teal falls means you're keeping strength as you cut.</span>
          <LineChart label="Percent change in strength and body weight" xLabel={dayLabel} zero yFmt={(v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`}
            series={[{ values: svw.weight, color: '#36D6C3' }, { values: svw.strength, color: '#FFB547', dots: true }]} />
        </section>
      )}

      <h2>Lifts</h2>
      {groups.length === 0 && <p className="muted small" style={{ margin: 0 }}>Log a workout with the gold + and your lifts show up here, grouped by muscle.</p>}
      {groups.map((g) => (
        <section key={g.group} className="card col" style={{ gap: 2 }}>
          <div className="between" style={{ paddingBottom: 4 }}>
            <strong style={{ fontFamily: 'Fredoka, sans-serif', fontSize: 17 }}>{g.label}</strong>
            <span className="small muted"><strong style={{ color: 'var(--text)' }}>{g.sets}</strong> sets this week{g.usual >= 0.5 ? ` · usually ${Math.round(g.usual)}` : ''}</span>
          </div>
          {g.group === 'other' && <span className="tiny muted" style={{ paddingBottom: 4 }}>Lifts I couldn't place. Open one to set its muscle group or merge it into another lift.</span>}
          {g.lifts.map((k) => {
            const i = liftInsight(s.workouts, k, s.weighIns, custom, today);
            return (
              <button key={k} className="list-item" style={{ background: 'none', border: 'none', borderTop: '1px solid #22346e', width: '100%', textAlign: 'left', color: 'inherit' }} onClick={() => onLift(k)} aria-label={`${i.info.name} details`}>
                <span className="col" style={{ gap: 0, flex: 1, minWidth: 0 }}>
                  <strong>{pinned.has(k) ? '★ ' : ''}{i.info.name}</strong>
                  <span className="tiny muted">{i.info.muscle !== g.group ? `${i.info.muscle} · ` : ''}{i.all.length} session{i.all.length === 1 ? '' : 's'}</span>
                </span>
                <Spark values={i.sessions.map((x) => (i.metric === 'e1rm' || i.metric === 'set' ? x.e1rm : x.score))} />
                <span className="col" style={{ gap: 0, alignItems: 'flex-end', minWidth: 78 }}>
                  <strong>{i.headline}</strong>
                  {i.stalled ? <span className="tiny warn">Stalled</span> : i.change4w ? <span className={`tiny ${i.change4w > 0 ? 'up' : 'warn'}`}>{i.change4w > 0 ? '+' : ''}{i.change4w} in 4 wks</span> : <span className="tiny muted">{i.metric === 'e1rm' ? 'est. 1RM' : i.unit}</span>}
                </span>
              </button>
            );
          })}
        </section>
      ))}

      <h2>Workouts</h2>
      {s.workouts.length === 0 && <p className="muted small" style={{ margin: 0 }}>No workouts yet.</p>}
      {s.workouts.length > 5 && <input className="input" placeholder="Search by day, lift or note" aria-label="Search workouts" value={q} onChange={(e) => { setQ(e.target.value); setShown(8); }} />}
      {words.length > 0 && list.length === 0 && <p className="muted small" style={{ margin: 0 }}>No workouts match "{q}".</p>}
      <section className="card" style={{ padding: '4px 16px', display: list.length ? 'block' : 'none' }}>
        {list.slice(0, shown).map((w) => {
          const prs = workoutPRs(s.workouts, w, custom);
          return (
            <details key={w.id} className="list-item" style={{ display: 'block' }}>
              <summary className="between">
                <span className="col" style={{ gap: 0 }}>
                  <strong>{w.label ?? 'Workout'}{prs.length ? <span className="warn"> ★ {prs.length} PR{prs.length > 1 ? 's' : ''}</span> : null}</strong>
                  <span className="small muted">{new Date(w.startedAt).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })} · {durationMin(w)} min · {setCount(w)} sets{w.hr ? ` · HR ${w.hr.avg} avg, ${w.hr.max} max` : ''}{w.rpe ? ` · effort ${w.rpe}` : ''}</span>
                </span>
                <span className="muted small">Details</span>
              </summary>
              <div className="col" style={{ gap: 8, paddingTop: 8 }}>
                {prs.length > 0 && <div className="col" style={{ gap: 2 }}>{prs.map((p) => <span key={p.key} className="small"><strong className="warn">PR</strong> <strong>{p.name}</strong>: {p.text}</span>)}</div>}
                {w.note && <span className="small"><span className="muted">Note:</span> {w.note}</span>}
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
                    <button className="small" style={{ fontWeight: 800, background: 'none', border: 'none', padding: 0, textAlign: 'left', color: 'inherit' }} onClick={() => onLift(ex.key)}>{ex.name}{ex.perHand ? ' (per hand)' : ''} <span className="muted">›</span></button>
                    <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{ex.sets.map((st, j) => <span key={j} className="chip">{formatSet(st)}</span>)}</div>
                  </div>
                ))}
                <div className="row">
                  <button className="btn subtle" style={{ height: 40 }} onClick={() => setEditing(w)}>Edit</button>
                  <button className="btn ghost" style={{ height: 40 }} onClick={() => { if (del === w.id) actions.deleteWorkout(w.id); else { setDel(w.id); setTimeout(() => setDel(null), 3000); } }}>{del === w.id ? 'Tap again to delete' : 'Delete workout'}</button>
                </div>
              </div>
            </details>
          );
        })}
      </section>
      {list.length > shown && <button className="btn subtle" onClick={() => setShown(shown + 20)}>Show more ({list.length - shown} older)</button>}
      {editing && <EditWorkoutSheet w={editing} onClose={() => setEditing(null)} />}
    </main>
  );
}
