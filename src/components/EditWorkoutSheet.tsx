import { useMemo, useState } from 'react';
import { actions, todayISO, useStore, type Workout } from '../lib/store';
import { formatSet, parseWorkout } from '../lib/parser';
import { durationMin } from '../lib/stats';
import { setsText } from '../lib/insights';
import { Sheet } from './ui';

const pad = (n: number) => String(n).padStart(2, '0');

export function EditWorkoutSheet({ w, onClose }: { w: Workout; onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const ctx = useMemo(() => ({ aliases: settings.liftAliases, custom: settings.customLifts }), [settings.liftAliases, settings.customLifts]);
  // Workouts saved before text was kept get rebuilt from their sets.
  const [text, setText] = useState(w.rawText || `${w.label ? `${w.label}:\n` : ''}${w.exercises.map((e) => `${e.name} ${setsText(e.sets)}`).join('\n')}`);
  const start = new Date(w.startedAt);
  const [date, setDate] = useState(todayISO(start));
  const [time, setTime] = useState(`${pad(start.getHours())}:${pad(start.getMinutes())}`);
  const [mins, setMins] = useState(String(durationMin(w)));
  const [note, setNote] = useState(w.note ?? '');
  const parsed = useMemo(() => parseWorkout(text, ctx), [text, ctx]);
  const sets = parsed.exercises.reduce((n, e) => n + e.sets.length, 0);
  const when = new Date(`${date}T${time}`);
  const m = parseInt(mins, 10);
  const ok = sets > 0 && !Number.isNaN(+when) && m >= 1 && m <= 600;
  return (
    <Sheet title="Edit workout" onClose={onClose}>
      <textarea className="input" rows={5} value={text} onChange={(e) => setText(e.target.value)} aria-label="Workout text" />
      <div className="col" style={{ gap: 6, maxHeight: '18vh', overflowY: 'auto' }}>
        {parsed.exercises.map((ex, i) => (
          <div key={i} className="col">
            <span className="small" style={{ fontWeight: 800 }}>{ex.name}{ex.perHand ? ' (per hand)' : ''}</span>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{ex.sets.map((s, j) => <span key={j} className="chip">{formatSet(s)}</span>)}</div>
          </div>
        ))}
      </div>
      <div className="grid3">
        <div className="field"><label htmlFor="e-date">Date</label><input id="e-date" className="input" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="field"><label htmlFor="e-time">Start</label><input id="e-time" className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
        <div className="field"><label htmlFor="e-min">Minutes</label><input id="e-min" className="input" inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value)} /></div>
      </div>
      <input className="input" aria-label="Workout note" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn big-btn" disabled={!ok} onClick={() => {
        const moved = +when !== +start || m !== durationMin(w);
        actions.editWorkout(w.id, text, parsed.label ?? w.label, parsed.exercises.map(({ match: _m, ...e }) => ({ ...e, flags: [] })), {
          note: note.trim() || undefined,
          ...(moved ? { startedAt: when.toISOString(), endedAt: new Date(+when + m * 60000).toISOString() } : {}),
        });
        onClose();
      }}>Save changes</button>
    </Sheet>
  );
}
