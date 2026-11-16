import { useEffect, useMemo, useRef, useState } from 'react';
import { actions, getState, todayISO, useStore } from '../lib/store';
import { addJumpFlags, formatSet, parseWorkout, type ParsedExercise } from '../lib/parser';
import { lastSessionTop, parseDate } from '../lib/stats';
import { goalPace, liftSessions, setsLabel, setsText, suggestNext, workoutPRs, type PR } from '../lib/insights';
import { GROUPS, liftInfo } from '../lib/lifts';
import { Icon, Sheet } from '../components/ui';
import { LiftPicker } from '../components/LiftPicker';

function fmtTimer(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(s).padStart(2, '0')}`;
}
const short = (iso: string) => parseDate(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
const pad = (n: number) => String(n).padStart(2, '0');

/** Date, start time and length for a workout that already happened. */
function PastSheet({ onClose }: { onClose: () => void }) {
  const active = useStore((s) => s.active);
  const start = active ? new Date(active.startedAt) : new Date();
  const [date, setDate] = useState(todayISO(start));
  const [time, setTime] = useState(`${pad(start.getHours())}:${pad(start.getMinutes())}`);
  const [mins, setMins] = useState(String(active?.pastMinutes ?? 60));
  const m = parseInt(mins, 10);
  const when = new Date(`${date}T${time}`);
  const ok = m >= 5 && m <= 300 && !Number.isNaN(+when) && +when <= Date.now();
  return (
    <Sheet title="When was this workout?" onClose={onClose}>
      <div className="grid2">
        <div className="field"><label htmlFor="p-date">Date</label><input id="p-date" className="input" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="field"><label htmlFor="p-time">Started at</label><input id="p-time" className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
        <div className="field"><label htmlFor="p-min">Minutes it took</label><input id="p-min" className="input" inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value)} /></div>
      </div>
      <button className="btn big-btn" disabled={!ok} onClick={() => { actions.patchActive({ startedAt: when.toISOString(), pastMinutes: m }); onClose(); }}>Use this time</button>
      {active?.pastMinutes && <button className="btn ghost" onClick={() => { actions.patchActive({ startedAt: new Date().toISOString(), pastMinutes: undefined }); onClose(); }}>Switch back to a live workout</button>}
      <span className="tiny muted">Heart rate from your Fitbit is matched to this time window.</span>
    </Sheet>
  );
}

export function Logger({ onClose }: { onClose: () => void }) {
  const active = useStore((s) => s.active);
  const workouts = useStore((s) => s.workouts);
  const settings = useStore((s) => s.settings);
  const weighIns = useStore((s) => s.weighIns);
  const [now, setNow] = useState(Date.now());
  const [fixes, setFixes] = useState<Record<string, 'fix' | 'keep'>>({});
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saved, setSaved] = useState<{ line: string; prs: PR[] } | null>(null);
  const [past, setPast] = useState(false);
  const [picking, setPicking] = useState<ParsedExercise | null>(null);
  const [extras, setExtras] = useState(false);
  const [lastSetAt, setLastSetAt] = useState<number | null>(null);
  const setCountRef = useRef(0);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!active && !saved) actions.startWorkout();
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ctx = useMemo(() => ({ aliases: settings.liftAliases, custom: settings.customLifts }), [settings.liftAliases, settings.customLifts]);
  const text = active?.text ?? '';
  const parsed = useMemo(() => {
    const p = parseWorkout(text, ctx);
    p.exercises.forEach((ex) => addJumpFlags(ex, ex.sets[0]?.weight != null ? lastSessionTop(workouts, ex.key) : undefined));
    return p;
  }, [text, workouts, ctx]);
  const hold = useMemo(() => !!goalPace(weighIns, settings.goalWeight)?.tooFast, [weighIns, settings.goalWeight]);
  const advice = (key: string) => suggestNext(workouts, key, settings.customLifts, { hold });

  const final = parsed.exercises.map((ex, ei) => {
    const { match: _m, ...rest } = ex;
    return {
      ...rest,
      sets: ex.sets.map((s, i) => {
        const f = ex.flags.find((fl) => fl.kind === 'jump' && fl.setIndex === i);
        return f && fixes[`${ei}:${i}`] === 'fix' ? { ...s, weight: f.suggestion ?? s.weight } : s;
      }),
      flags: [],
    };
  });
  const open = parsed.exercises.flatMap((ex, ei) => ex.flags.filter((f) => f.kind === 'jump' && !fixes[`${ei}:${f.setIndex}`]).map((f) => `${ei}:${f.setIndex}`));
  const unresolved = open.length > 0;
  const totalSets = final.reduce((n, e) => n + e.sets.length, 0);

  // Rest clock: restarts each time a set is added.
  useEffect(() => {
    if (totalSets > setCountRef.current && setCountRef.current >= 0 && text) setLastSetAt(Date.now());
    setCountRef.current = totalSets;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalSets]);

  /** Put sets after a lift name that was typed without any. */
  const addSets = (ex: ParsedExercise, sets: string) => {
    const raw = ex.match?.raw ?? ex.name;
    const at = text.toLowerCase().lastIndexOf(raw.toLowerCase());
    if (at < 0) { actions.setActiveText(`${text.replace(/\s+$/, '')}\n${ex.name} ${sets}\n`); return; }
    let end = at + raw.length;
    if (text[end] === ':') end++;
    actions.setActiveText(`${text.slice(0, end)} ${sets}${text.slice(end)}`);
  };

  // "Repeat" chips: the latest workout for each label.
  const repeats = useMemo(() => {
    const seen = new Set<string>();
    return [...workouts].reverse().filter((w) => { const l = w.label ?? 'Workout'; if (seen.has(l) || !w.exercises.length) return false; seen.add(l); return true; }).slice(0, 3);
  }, [workouts]);

  if (saved) {
    return (
      <div className="overlay">
        <main className="screen" style={{ justifyContent: 'center' }}>
          <div className="card col" style={{ gap: 10 }}>
            <h2 style={{ color: 'var(--teal)', fontSize: 22 }}>Saved</h2>
            <p style={{ margin: 0 }}>{saved.line}</p>
            {saved.prs.length > 0 && (
              <div className="col" style={{ gap: 6, background: 'rgba(255,181,71,.12)', borderRadius: 14, padding: '10px 12px' }}>
                <strong style={{ color: 'var(--gold)' }}>{saved.prs.length === 1 ? 'New personal record' : `${saved.prs.length} personal records`}</strong>
                {saved.prs.map((p) => <span key={p.key}><strong>{p.name}</strong>: {p.text}</span>)}
              </div>
            )}
            <p className="muted small" style={{ margin: 0 }}>Heart rate from your Fitbit Air gets added once it syncs, and your coach note follows.</p>
            <button className="btn big-btn" onClick={onClose}>Back to Home</button>
          </div>
        </main>
      </div>
    );
  }

  const isPast = !!active?.pastMinutes;
  const showRest = settings.restTimer !== false && !isPast && lastSetAt != null;

  return (
    <div className="overlay">
      <main className="screen" style={{ gap: 12 }}>
        <div className="between">
          <button className="icon-btn" aria-label="Back (workout keeps running)" onClick={onClose}>{Icon.back}</button>
          <div className="col" style={{ alignItems: 'center' }}>
            <span className="display" style={{ fontSize: 22 }}>{parsed.label ?? 'Workout'}</span>
            <button className="row small muted" style={{ gap: 6, fontWeight: 700, background: 'none', border: 'none', padding: 0 }} onClick={() => setPast(true)} aria-label="Change when this workout happened">
              {isPast
                ? <>Past workout · {short(todayISO(new Date(active!.startedAt)))} · {active!.pastMinutes} min · <u>change</u></>
                : <>{Icon.dot} {active ? fmtTimer(now - +new Date(active.startedAt)) : '0:00'}{showRest ? ` · rest ${fmtTimer(now - lastSetAt!)}` : ''} · <u>not today?</u></>}
            </button>
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
            ref={box}
            className="input"
            rows={5}
            autoFocus
            placeholder={'Leg day: squat 225x5, 185x6\nHack squat 200x6, 185x6'}
            value={text}
            onChange={(e) => actions.setActiveText(e.target.value)}
            style={{ border: 'none', background: 'transparent', padding: 0, fontSize: 16 }}
          />
          <span className="tiny muted">One exercise per line or comma. Sets as weight x reps, 185x6x3 for three sets, x8 for bodyweight, 60s for holds. Type just a lift's name to see last time and what to try.</span>
          {!text.trim() && repeats.length > 0 && (
            <div className="col" style={{ gap: 6 }}>
              <span className="small" style={{ fontWeight: 800 }}>Start from a previous workout</span>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {repeats.map((w) => (
                  <button key={w.id} className="btn subtle" style={{ height: 40 }} onClick={() => { actions.setActiveText(`${w.label ?? 'Workout'}:\n${[...new Set(w.exercises.map((e) => e.name))].join('\n')}\n`); box.current?.focus(); }}>
                    {w.label ?? 'Workout'} <span className="muted small">· {short(todayISO(new Date(w.startedAt)))}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {parsed.pending.filter((ex) => ex.match && ex.match.how !== 'ask' && ex.match.how !== 'new').map((ex, i) => {
          const a = advice(ex.key);
          const info = liftInfo(ex.key, settings.customLifts);
          return (
            <div key={`p${i}`} className="card col" style={{ gap: 6, padding: '10px 14px', border: '1px dashed #2c3f7c' }}>
              <div className="between"><strong>{ex.name}</strong><span className="tiny muted">{GROUPS.find((g) => g.id === info.group)?.label}{info.muscle !== info.group ? ` · ${info.muscle}` : ''}</span></div>
              {a ? (
                <>
                  <span className="small"><span className="muted">Last ({short(a.lastDate)}):</span> <strong>{setsLabel(a.last)}</strong></span>
                  {a.next && <span className="small"><span className="warn">Try:</span> <strong>{setsLabel(a.next)}</strong> <span className="muted">· {a.reason}</span></span>}
                  <div className="row" style={{ flexWrap: 'wrap' }}>
                    {a.next && <button className="btn" style={{ height: 38, fontSize: 13 }} onClick={() => addSets(ex, setsText(a.next!))}>Fill in "Try"</button>}
                    <button className="btn subtle" style={{ height: 38, fontSize: 13 }} onClick={() => addSets(ex, setsText(a.last))}>Fill in last time</button>
                  </div>
                </>
              ) : <span className="small muted">First time logging this. Add your sets after the name.</span>}
            </div>
          );
        })}

        {parsed.exercises.length > 0 && (
          <div className="between">
            <span className="eyebrow">Here's what I read</span>
            {open.length > 1 && <button className="btn ghost" style={{ height: 34, fontSize: 12 }} onClick={() => setFixes({ ...fixes, ...Object.fromEntries(open.map((k) => [k, 'keep' as const])) })}>Keep all {open.length} flagged</button>}
          </div>
        )}
        {parsed.exercises.map((ex, ei) => {
          const hist = liftSessions(workouts, ex.key, settings.customLifts);
          const prev = hist[hist.length - 1];
          const a = prev ? advice(ex.key) : null;
          const m = ex.match;
          return (
            <div key={ei} className="card col" style={{ gap: 6, padding: '10px 14px' }}>
              <div className="between">
                <strong>{ex.name}</strong>
                <span className="small muted" style={{ fontWeight: 800 }}>{ex.perHand ? 'per hand' : !prev ? 'First time' : ''}</span>
              </div>
              {m?.how === 'fuzzy' && (
                <span className="tiny muted">Read "{m.raw}" as {ex.name}. <button style={{ background: 'none', border: 'none', color: 'var(--gold)', padding: 0, fontWeight: 800, fontSize: 11 }} onClick={() => setPicking(ex)}>Not right?</button></span>
              )}
              {(m?.how === 'ask' || m?.how === 'new') && (
                <div className="col" style={{ gap: 6, background: 'var(--warn-bg)', borderRadius: 12, padding: '8px 10px' }}>
                  <span className="small" style={{ color: 'var(--warn-text)' }}>{m.how === 'ask' ? `I don't know "${m.raw}". Did you mean one of these?` : `"${m.raw}" isn't in the lift library yet.`}</span>
                  <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                    {m.options.map((o) => <button key={o.id} className="btn" style={{ height: 36, fontSize: 13 }} onClick={() => actions.learnAlias(m.typed, o.id)}>{o.name}</button>)}
                    <button className="btn ghost" style={{ height: 36, fontSize: 13 }} onClick={() => setPicking(ex)}>{m.how === 'ask' ? 'Something else' : 'Pick or add it'}</button>
                  </div>
                  <span className="tiny muted">You only answer this once. It still saves if you skip it.</span>
                </div>
              )}
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {ex.sets.map((s, i) => {
                  const fl = ex.flags.find((f) => f.setIndex === i);
                  const fixed = fixes[`${ei}:${i}`] === 'fix' && fl?.suggestion != null;
                  return <span key={i} className={`chip ${fl?.kind === 'comma' ? 'flag' : fl?.kind === 'jump' && !fixes[`${ei}:${i}`] ? 'bad' : ''}`}>{fixed ? formatSet({ ...s, weight: fl!.suggestion! }) : formatSet(s)}</span>;
                })}
              </div>
              {a && <span className="tiny muted">Last ({short(a.lastDate)}): {setsLabel(a.last)}{a.next ? <> · <span className="warn">Try: {setsLabel(a.next)}</span></> : null}</span>}
              {ex.flags.map((f) =>
                f.kind === 'comma' ? (
                  <span key={f.setIndex} className="tiny muted">{f.message}</span>
                ) : !fixes[`${ei}:${f.setIndex}`] ? (
                  <div key={f.setIndex} className="row" style={{ background: 'var(--warn-bg)', borderRadius: 12, padding: '8px 10px' }}>
                    <span className="small" style={{ flex: 1, color: 'var(--warn-text)' }}>{f.message}</span>
                    <button className="btn" style={{ height: 36, fontSize: 13 }} onClick={() => setFixes({ ...fixes, [`${ei}:${f.setIndex}`]: 'fix' })}>{f.suggestion}×{ex.sets[f.setIndex].reps}</button>
                    <button className="btn ghost" style={{ height: 36, fontSize: 13 }} onClick={() => setFixes({ ...fixes, [`${ei}:${f.setIndex}`]: 'keep' })}>Keep</button>
                  </div>
                ) : null
              )}
            </div>
          );
        })}

        {totalSets > 0 && (
          <div className="card col" style={{ gap: 8, padding: '10px 14px' }}>
            <button className="between" style={{ background: 'none', border: 'none', padding: 0 }} aria-expanded={extras} onClick={() => setExtras(!extras)}>
              <strong>Note and effort</strong>
              <span className="small muted">{active?.rpe ? `Effort ${active.rpe}/10` : ''}{active?.note ? ' · note added' : ''}{!active?.rpe && !active?.note ? 'Optional' : ''}</span>
            </button>
            {extras && (
              <>
                <input className="input" aria-label="Workout note" placeholder="Anything worth remembering? (shoulder felt off)" value={active?.note ?? ''} onChange={(e) => actions.patchActive({ note: e.target.value })} />
                <span className="small muted" style={{ fontWeight: 800 }}>How hard was it? 10 is all-out</span>
                <div className="row" style={{ gap: 6 }}>
                  {[5, 6, 7, 8, 9, 10].map((n) => <button key={n} className={`btn ${active?.rpe === n ? '' : 'subtle'}`} style={{ height: 40, flex: 1, padding: 0 }} aria-pressed={active?.rpe === n} onClick={() => actions.patchActive({ rpe: active?.rpe === n ? undefined : n })}>{n}</button>)}
                </div>
              </>
            )}
          </div>
        )}

        <div style={{ flex: 1 }} />
        <button
          className="btn big-btn coral"
          disabled={totalSets === 0 || unresolved}
          onClick={() => {
            const id = actions.finishWorkout(parsed.label, final);
            const all = getState().workouts;
            const mine = all.find((w) => w.id === id);
            setSaved({ line: `${final.length} exercise${final.length > 1 ? 's' : ''}, ${totalSets} sets.`, prs: mine ? workoutPRs(all, mine, settings.customLifts) : [] });
          }}
        >
          {unresolved ? `Check the flagged set${open.length > 1 ? 's' : ''}` : isPast ? 'Save workout' : 'Finish workout'}
        </button>
      </main>
      {past && <PastSheet onClose={() => setPast(false)} />}
      {picking?.match && (
        <LiftPicker
          title={`What is "${picking.match.raw}"?`}
          hint="Pick the lift it belongs to. I'll remember it for next time."
          suggested={picking.match.options}
          newName={picking.match.raw}
          onPick={(id) => { actions.learnAlias(picking.match!.typed, id); setPicking(null); }}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}
