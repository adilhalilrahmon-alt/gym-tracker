import { useState } from 'react';
import { actions, todayISO, useStore } from '../lib/store';
import { showW, toLb } from '../lib/units';
import { Sheet } from './ui';

export function WeightSheet({ onClose }: { onClose: () => void }) {
  const last = useStore((s) => s.weighIns[s.weighIns.length - 1]);
  const u = useStore((s) => s.settings.weightUnit ?? 'lb');
  const [date, setDate] = useState(todayISO());
  const [val, setVal] = useState(last ? String(showW(last.weight, u)) : '');
  const lb = toLb(parseFloat(val), u);
  const ok = lb > 60 && lb < 500;
  return (
    <Sheet title="Log weight" onClose={onClose}>
      <p className="muted small" style={{ margin: 0 }}>Morning, after the bathroom, before eating. With Google Health connected, your Renpho fills this in on its own.</p>
      <div className="grid2">
        <div className="field">
          <label htmlFor="w-val">Weight ({u})</label>
          <input id="w-val" className="input" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="w-date">Date</label>
          <input id="w-date" className="input" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <button className="btn big-btn" disabled={!ok} onClick={() => { actions.logWeight(Math.round(lb * 10) / 10, date); onClose(); }}>Save</button>
    </Sheet>
  );
}
