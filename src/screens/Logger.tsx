import { useEffect, useMemo, useState } from 'react';
import { actions, useStore } from '../lib/store';
import { addJumpFlags, formatSet, parseWorkout, type ParsedExercise } from '../lib/parser';
import { e1rm, lastSessionTop, liftHistory } from '../lib/stats';
import { Icon } from '../components/ui';

function fmtTimer(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(s).padStart(2, '0')}`;
}

const best = (ex: ParsedExercise) => Math.max(0, ...ex.sets.filter((s) => s.weight != null && !s.addedWeight).map((s) => e1rm(s.weight!, s.reps)));

export function Logger({ onClose }: { onClose: () => void }) {
  const active = useStore((s) => s.active);
  const workouts = useStore((s) => s.workouts);
  const [now, setNow] = useState(Date.now());
  const [fixes, setFixes] = useState<Record<string, 'fix' | 'keep'>>({});
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!active && !saved) actions.startWorkout();
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const text = active?.text ?? '';
  const parsed = useMemo(() => {
    const p = parseWorkout(text);
    p.exercises.forEach((ex) => addJumpFlags(ex, ex.sets[0]?.weight != null ? lastSessionTop(workouts, ex.key) : undefined));
    return p;
  }, [text, workouts]);

  const final = parsed.exercises.map((ex) => ({
    ...ex,
    sets: ex.sets.map((s, i) => {
      const f = ex.flags.find((fl) => fl.kind === 'jump' && fl.setIndex === i);
      return f && fixes[`${ex.key}:${i}`] === 'fix' ? { ...s, weight: f.suggestion ?? s.weight } : s;
    }),
    flags: [],
  }));
  const unresolved = parsed.exercises.some((ex) => ex.flags.some((f) => f.kind === 'jump' && !fixes[`${ex.key}:${f.setIndex}`]));
  const totalSets = final.reduce((n, e) => n + e.sets.length, 0);

  if (saved) {
    return (
      <div className="overlay">
        <main className="screen" style={{ justifyContent: 'center' }}>
          <div className="card col" style={{ gap: 8 }}>
            <h2 style={{ color: 'var(--teal)', fontSize: 22 }}>Saved</h2>
            <p style={{ margin: 0 }}>{saved}</p>
            <p className="muted small" style={{ margin: 0 }}>Once Google Health is connected, heart rate from your Fitbit Air gets added here automatically.</p>
            <button className="btn big-btn" onClick={onClose}>Back to Home</button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="overlay">
      <main className="screen" style={{ gap: 12 }}>
        <div className="between">
          <button className="icon-btn" aria-label="Back (workout keeps running)" onClick={onClose}>{Icon.back}</button>
          <div className="col" style={{ alignItems: 'center' }}>
            <span className="display" style={{ fontSize: 22 }}>{parsed.label ?? 'Workout'}</span>
            <span className="row small muted" style={{ gap: 6, fontWeight: 700 }}>
              {Icon.dot} {active ? fmtTimer(now - +new Date(active.startedAt)) : '0:00'} · started {active ? new Date(active.startedAt).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }) : ''}
            </span>
          </div>
          <button className="btn ghost" style={{ height: 44, padding: '0 10px', fontSize: 13 }} onClick={() => {
            if (!confirmDiscard) { setConfirmDiscard(true); setTimeout(() => setConfirmDiscard(false), 3000); return; }
            actions.cancelWorkout(); onClose();
          }}>{confirmDiscard ? 'Sure?' : 'Discard'}</button>
        </div>

        <div className="card col" style={{ gap: 8 }}>
          <label className="eyebrow" htmlFor="logbox">What did you do?</label>
          <textarea
            id="logbox"
            className="input"
            rows={5}
            autoFocus
            placeholder={'Leg day: squat 225x5, 185x6\nHack squat 200x6, 185x6'}
            value={text}
            onChange={(e) => actions.setActiveText(e.target.value)}
            style={{ border: 'none', background: 'transparent', padding: 0, fontSize: 16 }}
          />
          <span className="tiny muted">One exercise per line or comma. Sets as weight x reps, or 185x6x3 for three sets. Tap the mic on your keyboard to dictate.</span>
        </div>

        {parsed.exercises.length > 0 && <span className="eyebrow">Here's what I read</span>}
        {parsed.exercises.map((ex, ei) => {
          const hist = liftHistory(workouts, ex.key);
          const prev = hist[hist.length - 1];
          const b = Math.round(best(ex));
          const delta = prev && b ? b - prev.e1rm : null;
          return (
            <div key={ei} className="card col" style={{ gap: 6, padding: '10px 14px' }}>
              <div className="between">
                <strong>{ex.name}</strong>
                <span className="small" style={{ fontWeight: 800 }}>
                  {ex.perHand ? <span className="muted">per hand</span> : !prev ? <span className="muted">First time</span> : delta! > 0 ? <span className="up">+{delta} lb est. 1RM</span> : delta === 0 ? <span className="muted">Same as last time</span> : <span className="muted">Last: {prev.top}</span>}
                </span>
              </div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {ex.sets.map((s, i) => {
                  const fl = ex.flags.find((f) => f.setIndex === i);
                  const fixed = fixes[`${ex.key}:${i}`] === 'fix' && fl?.suggestion != null;
                  return <span key={i} className={`chip ${fl?.kind === 'comma' ? 'flag' : fl?.kind === 'jump' && !fixes[`${ex.key}:${i}`] ? 'bad' : ''}`}>{fixed ? formatSet({ ...s, weight: fl!.suggestion! }) : formatSet(s)}</span>;
                })}
              </div>
              {ex.flags.map((f) =>
                f.kind === 'comma' ? (
                  <span key={f.setIndex} className="tiny muted">{f.message}</span>
                ) : !fixes[`${ex.key}:${f.setIndex}`] ? (
                  <div key={f.setIndex} className="row" style={{ background: 'var(--warn-bg)', borderRadius: 12, padding: '8px 10px' }}>
                    <span className="small" style={{ flex: 1, color: 'var(--warn-text)' }}>{f.message}</span>
                    <button className="btn" style={{ height: 36, fontSize: 13 }} onClick={() => setFixes({ ...fixes, [`${ex.key}:${f.setIndex}`]: 'fix' })}>{f.suggestion}×{ex.sets[f.setIndex].reps}</button>
                    <button className="btn ghost" style={{ height: 36, fontSize: 13 }} onClick={() => setFixes({ ...fixes, [`${ex.key}:${f.setIndex}`]: 'keep' })}>Keep</button>
                  </div>
                ) : null
              )}
            </div>
          );
        })}

        <div style={{ flex: 1 }} />
        <button
          className="btn big-btn coral"
          disabled={totalSets === 0 || unresolved}
          onClick={() => {
            actions.finishWorkout(parsed.label, final);
            setSaved(`${final.length} exercise${final.length > 1 ? 's' : ''}, ${totalSets} sets.`);
          }}
        >
          {unresolved ? 'Check the flagged set' : 'Finish workout'}
        </button>
      </main>
    </div>
  );
}
