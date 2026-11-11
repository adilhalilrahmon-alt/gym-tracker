import { useStore, todayISO } from '../lib/store';
import { coachNote, liftSummary, navyBodyFat, parseDate, sevenDayAvg, weekCount, weekStart, addDays } from '../lib/stats';
import { FrontAvatar } from '../components/Avatar';
import { SAMPLE } from '../lib/avatar';
import { Icon, LineChart, Ring } from '../components/ui';

const dayNum = (iso: string) => Math.round(+parseDate(iso) / 864e5);

export function Home({ onWeight, onGo }: { onWeight: () => void; onGo: (t: 'progress' | 'me' | 'streak') => void }) {
  const s = useStore((x) => x);
  const today = todayISO();
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';
  const latest = s.weighIns[s.weighIns.length - 1];
  const first = s.weighIns[0];
  const goal = s.settings.goalWeight;
  const toGo = latest ? Math.round((latest.weight - goal) * 10) / 10 : null;
  const pct = latest && first && first.weight !== goal ? Math.max(3, Math.min(100, ((first.weight - latest.weight) / (first.weight - goal)) * 100)) : 3;
  const avg = sevenDayAvg(s.weighIns).filter((p) => p.date >= addDays(today, -30));
  const meas = s.measurements[s.measurements.length - 1];
  const m = meas ?? SAMPLE;
  const bf = navyBodyFat(m, s.settings.heightCm);
  const thisWeek = weekCount(s.workouts, weekStart(new Date()));
  const weighedToday = latest?.date === today;
  const recentNote = s.insights.find((i) => Date.now() - Date.parse(i.created_at) < 3 * 864e5);
  const latestNote = recentNote ? (recentNote.kind === 'weekly' ? `Week in review: ${recentNote.text.split('\n')[0]}` : recentNote.text) : null;

  return (
    <main className="screen">
      <div className="between">
        <div className="col">
          <span className="small muted" style={{ fontWeight: 700 }}>{new Date().toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          <h1>{greet}, Adil</h1>
        </div>
      </div>

      <div className="card row" style={{ alignItems: 'center', gap: 12 }}>
        <button onClick={() => onGo('me')} aria-label="Open your avatar" style={{ background: 'none', border: 'none', padding: 0 }}>
          <FrontAvatar m={m} bf={bf} height={150} id="home" look={s.settings.avatar} />
        </button>
        <div className="col" style={{ flex: 1, gap: 6 }}>
          <span className="eyebrow">{weighedToday ? 'This morning' : latest ? `Last: ${parseDate(latest.date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}` : 'Weight'}</span>
          <span className="big">{latest ? latest.weight : '—'} <span className="small muted">lb</span></span>
          <span className="small muted">Goal {goal} lb{toGo != null && toGo > 0 && <> · <strong className="warn">{toGo} lb to go</strong></>}{toGo != null && toGo <= 0 && <> · <strong className="up">Goal reached</strong></>}</span>
          <div className="bar"><div style={{ width: `${pct}%` }} /></div>
          {avg.length > 1 && <LineChart label="Weight, 7-day average, last 30 days" height={70} series={[{ values: avg.map((p) => ({ x: dayNum(p.date), y: p.avg })), color: '#36D6C3' }]} />}
          {!weighedToday && <button className="btn subtle" style={{ height: 40 }} onClick={onWeight}>Log today's weight</button>}
          {!meas && <span className="tiny muted">Sample body shape. Add your measurements in Me.</span>}
        </div>
      </div>

      <div className="grid3">
        <button className="card tight col" style={{ alignItems: 'center' }} onClick={() => onGo('streak')}>
          <Ring value={thisWeek} target={s.settings.weeklyTarget} />
          <span className="small muted" style={{ fontWeight: 700 }}>This week</span>
        </button>
        {s.settings.pinned.slice(0, 2).map((k) => {
          const l = liftSummary(s.workouts, k, today);
          return (
            <button key={k} className="card tight col" onClick={() => onGo('progress')}>
              <span className="eyebrow" style={{ fontSize: 11 }}>{l.name}</span>
              <span className="mid">{l.current ?? '—'}</span>
              <span className="tiny muted">est. 1RM, lb</span>
              {l.stalled ? <span className="small warn">Stalled</span> : l.change4w ? <span className={`small ${l.change4w > 0 ? 'up' : 'warn'}`}>{l.change4w > 0 ? '+' : ''}{l.change4w} in 4 wks</span> : <span className="tiny muted">{l.sessions ? `${l.sessions} session${l.sessions > 1 ? 's' : ''}` : 'No sessions yet'}</span>}
            </button>
          );
        })}
      </div>

      <div className="card row" style={{ alignItems: 'flex-start' }}>
        <span style={{ flexShrink: 0 }}>{Icon.star}</span>
        <div className="col">
          <span className="eyebrow" style={{ color: 'var(--gold)' }}>Coach</span>
          <p style={{ margin: 0, lineHeight: 1.4, whiteSpace: 'pre-line' }}>{latestNote ?? coachNote(s, today)}</p>
        </div>
      </div>
    </main>
  );
}
