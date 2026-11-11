import { useState } from 'react';
import { actions, todayISO, useStore } from '../lib/store';
import { Sheet } from './ui';

export function WeightSheet({ onClose }: { onClose: () => void }) {
  const last = useStore((s) => s.weighIns[s.weighIns.length - 1]);
  const [date, setDate] = useState(todayISO());
  const [val, setVal] = useState(last ? String(last.weight) : '');
  const n = parseFloat(val);
  const ok = n > 60 && n < 500;
  return (
    <Sheet title="Log weight" onClose={onClose}>
      <p className="muted small" style={{ margin: 0 }}>Morning, after the bathroom, before eating. With Google Health connected, your Renpho fills this in on its own.</p>
      <div className="grid2">
        <div className="field">
          <label htmlFor="w-val">Weight (lb)</label>
          <input id="w-val" className="input" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="w-date">Date</label>
          <input id="w-date" className="input" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <button className="btn big-btn" disabled={!ok} onClick={() => { actions.logWeight(Math.round(n * 10) / 10, date); onClose(); }}>Save</button>
    </Sheet>
  );
}
