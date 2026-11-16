import { useState } from 'react';
import { actions, todayISO, useStore } from '../lib/store';
import { STALL_ADVICE, parseDate, dayNumber } from '../lib/stats';
import { liftInsight, setsLabel, suggestNext, goalPace } from '../lib/insights';
import { GROUPS, isLibraryLift, type Group } from '../lib/lifts';
import { Icon, LineChart, dayLabel } from './ui';
import { LiftPicker } from './LiftPicker';

const short = (iso: string) => parseDate(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
const signed = (n: number, d = 0) => `${n > 0 ? '+' : ''}${n.toFixed(d)}`;

/** Everything about one lift: where it stands, how fast it's moving, records, and what to try next. */
export function LiftDetail({ liftKey, onClose }: { liftKey: string; onClose: () => void }) {
  const workouts = useStore((s) => s.workouts);
  const weighIns = useStore((s) => s.weighIns);
  const settings = useStore((s) => s.settings);
  const [merging, setMerging] = useState(false);
  const [chart, setChart] = useState<'score' | 'volume'>('score');
  const today = todayISO();
  const i = liftInsight(workouts, liftKey, weighIns, settings.customLifts, today);
  const { info, metric, sessions: h, all, latest, best } = i;
  const pinned = settings.pinned.includes(liftKey);
  const advice = suggestNext(workouts, liftKey, settings.customLifts, { hold: !!goalPace(weighIns, settings.goalWeight)?.tooFast });
  const unit = metric === 'e1rm' ? 'lb' : metric === 'time' ? 's' : metric === 'reps' ? 'reps' : '';
  const scoreName = metric === 'e1rm' ? 'Est. 1RM' : metric === 'time' ? 'Longest hold' : metric === 'reps' ? 'Most reps' : 'Best set';
  const group = GROUPS.find((g) => g.id === info.group)?.label ?? 'Other';
  const togglePin = () => actions.updateSettings({ pinned: pinned ? settings.pinned.filter((k) => k !== liftKey) : [liftKey, ...settings.pinned].slice(0, 2) });
  const stat = (label: string, value: string, sub?: string) => (
    <div className="col" style={{ gap: 0 }}><span className="tiny muted" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</span><strong style={{ fontSize: 17 }}>{value}</strong>{sub && <span className="tiny muted">{sub}</span>}</div>
  );

  return (
    <div className="overlay">
      <main className="screen">
        <div className="between">
          <div className="row" style={{ minWidth: 0 }}>
            <button className="icon-btn" aria-label="Back" onClick={onClose}>{Icon.back}</button>
            <div className="col" style={{ gap: 0, minWidth: 0 }}>
              <h1 style={{ fontSize: 24 }}>{info.name}</h1>
              <span className="small muted">{group}{info.muscle !== info.group ? ` · ${info.muscle}` : ''}{info.equip !== 'other' ? ` · ${info.equip}` : ''}</span>
            </div>
          </div>
          <button className="icon-btn" aria-label={pinned ? 'Unpin from Home' : 'Pin to Home'} aria-pressed={pinned} onClick={togglePin}>{Icon.pin(pinned)}</button>
        </div>

        {advice && (
          <section className="card col" style={{ gap: 4, border: '1px solid rgba(255,181,71,.35)' }}>
            <span className="eyebrow" style={{ color: 'var(--gold)' }}>Next time</span>
            <span><span className="muted">Last ({short(advice.lastDate)}):</span> <strong>{setsLabel(advice.last)}</strong></span>
            {advice.next && <span><span className="warn">Try:</span> <strong>{setsLabel(advice.next)}</strong></span>}
            <span className="small muted">{advice.reason}</span>
          </section>
        )}

        <section className="card col" style={{ gap: 10 }}>
          <div className="grid2">
            <div className="col">
              <span className="eyebrow">Latest {metric === 'e1rm' ? 'est. 1RM' : ''}</span>
              <span className="big">{metric === 'e1rm' ? latest?.score ?? '—' : latest?.top ?? '—'} {metric === 'e1rm' && <span className="small muted">lb</span>}</span>
              {latest && <span className="tiny muted">{short(latest.date)}{metric === 'e1rm' ? ` · top set ${latest.top}` : ''}</span>}
            </div>
            <div className="col">
              <span className="eyebrow">Best {metric === 'e1rm' ? 'est. 1RM' : ''}</span>
              <span className="big">{metric === 'e1rm' ? best?.score ?? '—' : best?.top ?? '—'} {metric === 'e1rm' && <span className="small muted">lb</span>}</span>
              {best && <span className="tiny muted">{short(best.date)}{i.sinceBest ? ` · ${i.sinceBest} session${i.sinceBest > 1 ? 's' : ''} ago` : ' · latest session'}</span>}
            </div>
          </div>
          {i.stalled ? (
            <div className="col" style={{ gap: 4, background: 'var(--warn-bg)', borderRadius: 14, padding: '10px 12px' }}>
              <strong className="warn">Stalled {i.sinceBest} sessions</strong>
              <span style={{ lineHeight: 1.4 }}>No session has beaten your best since {best ? short(best.date) : 'then'}. {STALL_ADVICE}</span>
            </div>
          ) : null}
          {h.length > 1 ? (
            <>
              <div className="between">
                <span className="small" style={{ fontWeight: 800 }}>{chart === 'score' ? `${scoreName}${unit ? `, ${unit}` : metric === 'set' ? ' (est. 1RM, lb)' : ''}` : 'Volume per session, lb'}</span>
                {metric !== 'time' && metric !== 'reps' && (
                  <div className="seg" role="group" aria-label="Chart">
                    <button aria-pressed={chart === 'score'} onClick={() => setChart('score')}>Strength</button>
                    <button aria-pressed={chart === 'volume'} onClick={() => setChart('volume')}>Volume</button>
                  </div>
                )}
              </div>
              <LineChart label={`${info.name} by date`} height={150} xLabel={dayLabel} goal={chart === 'score' && metric !== 'set' ? best?.score : undefined}
                series={[{ values: h.map((p) => ({ x: dayNumber(p.date), y: chart === 'volume' ? p.volume : metric === 'set' ? p.e1rm : p.score })), color: chart === 'volume' ? '#36D6C3' : '#FFB547', dots: true }]} />
              <span className="tiny muted">Dots are sessions{all.length > h.length ? ', easy days left out' : ''}.{chart === 'score' && metric !== 'set' ? ' The dashed line is your best.' : ''}{metric === 'set' && chart === 'score' ? ' Accessory lifts are judged on best set and volume, so treat this line as a rough guide.' : ''}</span>
            </>
          ) : <span className="tiny muted">A chart appears after your second session.</span>}
        </section>

        {h.length > 0 && (
          <section className="card col" style={{ gap: 10 }}>
            <h2>Insights</h2>
            <div className="grid2" style={{ rowGap: 12 }}>
              {stat('Sessions', String(all.length), `${i.perWeek.toFixed(1)} per week lately`)}
              {i.perMonth != null && stat('Pace', `${signed(i.perMonth, 1)} ${unit || 'lb'}/month`, 'last 8 weeks')}
              {i.change4w != null && stat('Last 4 weeks', `${signed(i.change4w)} ${unit || 'lb'}`)}
              {latest && latest.volume > 0 && stat('Volume', `${latest.volume.toLocaleString()} lb`, 'last session')}
              {i.relative != null && stat('Vs body weight', `${i.relative.toFixed(2)}×`, i.relativeStart != null && i.relativeStart !== i.relative ? `was ${i.relativeStart.toFixed(2)}× at the start` : 'est. 1RM ÷ body weight')}
            </div>
            {i.relative != null && <span className="tiny muted">"Vs body weight" is the number to watch while you lose weight: if it holds or rises, you're keeping your strength.</span>}
            {i.records.length > 0 && (
              <div className="col" style={{ gap: 6 }}>
                <span className="eyebrow">Rep records</span>
                <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                  {i.records.map((r) => <span key={r.reps} className="chip">{r.reps}+ reps: {r.weight} lb <span className="muted tiny">{short(r.date)}</span></span>)}
                </div>
              </div>
            )}
          </section>
        )}

        {h.length > 0 && (
          <section className="card" style={{ padding: '4px 16px' }}>
            {[...all].reverse().slice(0, 15).map((p, j) => (
              <div key={j} className="list-item" style={{ alignItems: 'flex-start' }}>
                <span style={{ flexShrink: 0 }}>{short(p.date)}</span>
                <span className="muted small" style={{ flex: 1, textAlign: 'right' }}>{setsLabel(p.sets)}</span>
                <strong style={{ flexShrink: 0, minWidth: 44, textAlign: 'right' }}>{p.light ? <span className="tiny muted">easy day</span> : <>{metric === 'e1rm' ? p.score : ''}{best && p.score === best.score ? ' ★' : ''}</>}</strong>
              </div>
            ))}
          </section>
        )}

        <section className="card col" style={{ gap: 8 }}>
          <h2>Fix this lift</h2>
          {!isLibraryLift(liftKey) && (
            <div className="col" style={{ gap: 6 }}>
              <span className="small muted">This lift isn't in the library. Choose its muscle group:</span>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {GROUPS.map((g) => <button key={g.id} className={`btn ${info.group === g.id ? '' : 'subtle'}`} style={{ height: 38 }} aria-pressed={info.group === g.id} onClick={() => actions.addCustomLift(liftKey, info.name, g.id as Group)}>{g.label}</button>)}
              </div>
            </div>
          )}
          <button className="btn subtle" onClick={() => setMerging(true)}>This is the same as another lift</button>
          <span className="tiny muted">Merging moves every session here into the lift you pick, and remembers the name for next time.</span>
        </section>
      </main>
      {merging && (
        <LiftPicker title={`Merge ${info.name} into…`} hint="All its sessions move to the lift you pick." exclude={liftKey}
          onPick={(id) => { actions.mergeLift(liftKey, id); setMerging(false); onClose(); }} onClose={() => setMerging(false)} />
      )}
    </div>
  );
}
