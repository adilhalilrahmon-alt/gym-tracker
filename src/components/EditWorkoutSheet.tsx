import { useMemo, useState } from 'react';
import { actions, type Workout } from '../lib/store';
import { formatSet, parseWorkout } from '../lib/parser';
import { Sheet } from './ui';

export function EditWorkoutSheet({ w, onClose }: { w: Workout; onClose: () => void }) {
  const [text, setText] = useState(w.rawText);
  const parsed = useMemo(() => parseWorkout(text), [text]);
  const sets = parsed.exercises.reduce((n, e) => n + e.sets.length, 0);
  return (
    <Sheet title="Edit workout" onClose={onClose}>
      <textarea className="input" rows={6} value={text} onChange={(e) => setText(e.target.value)} aria-label="Workout text" />
      <div className="col" style={{ gap: 6, maxHeight: '28vh', overflowY: 'auto' }}>
        {parsed.exercises.map((ex, i) => (
          <div key={i} className="col">
            <span className="small" style={{ fontWeight: 800 }}>{ex.name}{ex.perHand ? ' (per hand)' : ''}</span>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{ex.sets.map((s, j) => <span key={j} className="chip">{formatSet(s)}</span>)}</div>
          </div>
        ))}
      </div>
      <button className="btn big-btn" disabled={!sets} onClick={() => { actions.editWorkout(w.id, text, parsed.label ?? w.label, parsed.exercises.map((e) => ({ ...e, flags: [] }))); onClose(); }}>Save changes</button>
      <span className="tiny muted">Start time, duration and heart rate stay as they were.</span>
    </Sheet>
  );
}
