import { useStore, todayISO } from '../lib/store';
import { durationMin, navyBodyFat, parseDate, setCount, sevenDayAvg, weekCount, weekStart, addDays, dayNumber, workoutDay } from '../lib/stats';
import { goalPace, homeNote, liftInsight, weekPace, workoutPRs } from '../lib/insights';
import { showW } from '../lib/units';
import { FrontAvatar } from '../components/Avatar';
import { SAMPLE } from '../lib/avatar';
import { Icon, LineChart, Ring } from '../components/ui';
import { useSyncStatus } from '../lib/sync';

const dayNum = dayNumber;
const fmtDay = (iso: string, year = false) => parseDate(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) });

export function Home({ onWeight, onGo, onLift }: { onWeight: () => void; onGo: (t: 'progress' | 'me' | 'streak') => void; onLift: (key: string) => void }) {
  const s = useStore((x) => x);
  const sync = useSyncStatus();
  const today = todayISO();
  const u = s.settings.weightUnit ?? 'lb';
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';
  const latest = s.weighIns[s.weighIns.length - 1];
  const first = s.weighIns[0];
  const goal = s.settings.goalWeight;
  const toGo = latest ? Math.round(showW(Math.abs(latest.weight - goal), u) * 10) / 10 : null;
  const reached = latest && first ? (first.weight >= goal ? latest.weight <= goal : latest.weight >= goal) : false;
  const pct = latest && first && first.weight !== goal ? Math.max(3, Math.min(100, ((first.weight - latest.weight) / (first.weight - goal)) * 100)) : 3;
  const avg = sevenDayAvg(s.weighIns).filter((p) => p.date >= addDays(today, -30));
  const pace = goalPace(s.weighIns, goal, today);
  const meas = s.measurements[s.measurements.length - 1];
  const m = meas ?? SAMPLE;
  const bf = navyBodyFat(m, s.settings.heightCm);
  const thisWeek = weekCount(s.workouts, weekStart(new Date()));
  const lastW = s.workouts[s.workouts.length - 1];
  const wp = weekPace(thisWeek, s.settings.weeklyTarget, !!lastW && workoutDay(lastW) === today, today);
  const weighedToday = latest?.date === today;
  const recentNote = s.insights.find((i) => (i.kind === 'workout' || i.kind === 'weekly') && Date.now() - Date.parse(i.created_at) < 3 * 864e5);
  // The AI often opens with "Verdict:"; the "Week in review" label already says that.
  const firstLine = (t: string) => t.split('\n')[0].replace(/^\W*verdict\W*:?\s*/i, '');
  const latestNote = recentNote ? (recentNote.kind === 'weekly' ? `Week in review: ${firstLine(recentNote.text)}` : recentNote.text) : null;
  const daysAgo = lastW ? Math.round(dayNumber(today) - dayNumber(workoutDay(lastW))) : null;
  const lastPRs = lastW ? workoutPRs(s.workouts, lastW, s.settings.customLifts) : [];
  const measureDue = meas ? Math.round(dayNumber(today) - dayNumber(meas.date)) >= 14 : false;
  const unsynced = sync.email && sync.phase === 'error';
  // Resting heart rate from the Fitbit (the server refreshes it with each Google Health sync).
  let rest: { date: string; bpm: number }[] = [];
  try { rest = JSON.parse(s.insights.find((i) => i.id === 'recovery')?.text ?? '{}').restingHr ?? []; } catch { /* ignore */ }
  const restNow = rest[rest.length - 1];
  const restBase = rest.length >= 5 ? Math.round(rest.slice(-8, -1).reduce((a, x) => a + x.bpm, 0) / rest.slice(-8, -1).length) : null;

  return (
    <main className="screen">
      <div className="between">
        <div className="col">
          <span className="small muted" style={{ fontWeight: 700 }}>{new Date().toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          <h1>{greet}, Adil</h1>
        </div>
        {unsynced && <button className="pill" style={{ background: 'var(--gold)', border: 'none' }} onClick={() => onGo('me')} aria-label="Backup problem. Open settings">Not backed up</button>}
      </div>

      <div className="card row" style={{ alignItems: 'center', gap: 12 }}>
        <button onClick={() => onGo('me')} aria-label="Open your avatar" style={{ background: 'none', border: 'none', padding: 0 }}>
          <FrontAvatar m={m} bf={bf} height={150} id="home" look={s.settings.avatar} />
        </button>
        <div className="col" style={{ flex: 1, gap: 6, minWidth: 0 }}>
          <span className="eyebrow">{weighedToday ? 'This morning' : latest ? `Last: ${fmtDay(latest.date)}` : 'Weight'}</span>
          <span className="big">{latest ? showW(latest.weight, u) : '—'} <span className="small muted">{u}</span></span>
          <span className="small muted">Goal {showW(goal, u)} {u}{toGo != null && !reached && <> · <strong className="warn">{toGo} {u} to go</strong></>}{reached && <> · <strong className="up">Goal reached</strong></>}</span>
          <div className="bar"><div style={{ width: `${pct}%` }} /></div>
          {!reached && pace?.date && <span className="small">On pace for <strong>{fmtDay(pace.date, pace.date.slice(0, 4) !== today.slice(0, 4))}</strong> <span className="muted">at {showW(Math.abs(pace.rate), u).toFixed(1)} {u}/week</span></span>}
          {!reached && pace?.away && <span className="small warn">Trending away from your goal this month.</span>}
          {pace?.tooFast && <span className="tiny warn">Losing faster than 1% a week. Slower keeps more strength.</span>}
          {avg.length > 1 && <LineChart label="Weight, 7-day average, last 30 days" height={64} goalEdge yFmt={(v) => v.toFixed(u === 'kg' ? 1 : 0)} series={[{ values: avg.map((p) => ({ x: dayNum(p.date), y: showW(p.avg, u) })), color: '#36D6C3' }]} />}
          {!weighedToday && <button className="btn subtle" style={{ height: 40 }} onClick={onWeight}>Log today's weight</button>}
          {!meas && <span className="tiny muted">Sample body shape. Add your measurements in Me.</span>}
        </div>
      </div>

      <div className="grid3">
        <button className="card tight col" style={{ alignItems: 'center', gap: 2 }} onClick={() => onGo('streak')}>
          <Ring value={thisWeek} target={s.settings.weeklyTarget} />
          <span className="small muted" style={{ fontWeight: 700 }}>This week</span>
          <span className={`tiny ${wp.status === 'done' ? 'up' : wp.status === 'behind' ? 'warn' : 'muted'}`} style={{ fontWeight: 800, textAlign: 'center' }}>
            {wp.status === 'done' ? 'Target hit' : wp.status === 'behind' ? `${wp.left - wp.daysLeft} behind` : wp.status === 'tight' ? 'Every day left' : 'On track'}
          </span>
        </button>
        {s.settings.pinned.slice(0, 2).map((k) => {
          const l = liftInsight(s.workouts, k, s.weighIns, s.settings.customLifts, today);
          const n = l.sessions.length;
          return (
            <button key={k} className="card tight col" style={{ gap: 2 }} onClick={() => (n ? onLift(k) : onGo('progress'))} aria-label={`${l.info.name} details`}>
              <span className="eyebrow" style={{ fontSize: 11 }}>{l.info.name}</span>
              <span className="mid">{l.headline}</span>
              <span className="tiny muted">{l.metric === 'e1rm' ? (n ? 'latest est. 1RM, lb' : 'est. 1RM, lb') : l.unit}</span>
              {l.metric === 'e1rm' && l.best && l.latest && l.best.score !== l.latest.score && <span className="tiny muted">best {l.best.score}</span>}
              {l.stalled ? <span className="small warn">Stalled</span> : l.change4w ? <span className={`small ${l.change4w > 0 ? 'up' : 'warn'}`}>{l.change4w > 0 ? '+' : ''}{l.change4w} in 4 wks</span> : <span className="tiny muted">{n ? `${n} session${n > 1 ? 's' : ''}` : 'No sessions yet'}</span>}
            </button>
          );
        })}
      </div>

      {s.workouts.length > 0 && (
        <div className="card col" style={{ gap: 6 }}>
          <span className="eyebrow">This week</span>
          <span>
            {wp.status === 'done'
              ? <>Target hit: <strong>{thisWeek} of {s.settings.weeklyTarget}</strong> sessions.</>
              : <><strong>{wp.left} more session{wp.left > 1 ? 's' : ''}</strong> to hit {s.settings.weeklyTarget}, with {wp.daysLeft} day{wp.daysLeft === 1 ? '' : 's'} left{wp.status === 'behind' ? `. ${s.settings.weeklyTarget - 1} still keeps your streak.` : '.'}</>}
          </span>
          {lastW && (
            <button className="between" style={{ background: 'none', border: 'none', borderTop: '1px solid #22346e', padding: '8px 0 0', color: 'inherit', textAlign: 'left' }} onClick={() => onGo('progress')} aria-label="Open your last workout in Progress">
              <span className="col" style={{ gap: 0 }}>
                <span className="small muted">Last workout · {daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`}</span>
                <strong>{lastW.label ?? 'Workout'} <span className="muted small" style={{ fontWeight: 600 }}>· {durationMin(lastW)} min · {setCount(lastW)} sets{lastW.hr ? ` · HR ${lastW.hr.avg}` : ''}</span></strong>
                {lastPRs.length > 0 && <span className="small warn">★ {lastPRs.map((p) => p.name).join(', ')} PR{lastPRs.length > 1 ? 's' : ''}</span>}
              </span>
              <span className="muted">›</span>
            </button>
          )}
        </div>
      )}

      {restNow && dayNumber(today) - dayNumber(restNow.date) <= 2 && (
        <div className="card between">
          <span className="col" style={{ gap: 0 }}>
            <span className="eyebrow">Resting heart rate</span>
            <span className="small muted">{restBase == null ? 'From your Fitbit' : restNow.bpm - restBase >= 4 ? 'Higher than your usual. Could be poor sleep, stress or a hard week.' : restNow.bpm - restBase <= -3 ? 'Lower than your usual. Well recovered.' : 'In line with your usual.'}</span>
          </span>
          <span className="col" style={{ gap: 0, alignItems: 'flex-end' }}><span className="mid">{restNow.bpm}</span>{restBase != null && <span className="tiny muted">usual {restBase}</span>}</span>
        </div>
      )}

      <div className="card row" style={{ alignItems: 'flex-start' }}>
        <span style={{ flexShrink: 0 }}>{Icon.star}</span>
        <div className="col">
          <span className="eyebrow" style={{ color: 'var(--gold)' }}>Coach</span>
          <p style={{ margin: 0, lineHeight: 1.4, whiteSpace: 'pre-line' }}>{latestNote ?? homeNote(s, today)}</p>
        </div>
      </div>

      {measureDue && (
        <button className="card between" onClick={() => onGo('me')}>
          <span className="col" style={{ gap: 0 }}><strong>Measurement day</strong><span className="small muted">Last taped {fmtDay(meas!.date)}. Two weeks are up.</span></span>
          <span className="muted">›</span>
        </button>
      )}
    </main>
  );
}
