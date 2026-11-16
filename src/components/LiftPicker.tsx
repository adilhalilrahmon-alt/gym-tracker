import { useMemo, useState } from 'react';
import { actions, useStore } from '../lib/store';
import { GROUPS, LIFTS, cleanName, slug, type Group } from '../lib/lifts';
import { Sheet } from './ui';

/** Pick a lift from the library by typing a few letters, or keep the typed name as a new lift. */
export function LiftPicker({ title, hint, suggested = [], newName, exclude, onPick, onClose }: {
  title: string;
  hint?: string;
  suggested?: { id: string; name: string }[];
  /** When set, offers "keep as a new lift" filed under a muscle group. */
  newName?: string;
  exclude?: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const custom = useStore((s) => s.settings.customLifts);
  const [q, setQ] = useState('');
  const [asNew, setAsNew] = useState(false);
  const all = useMemo(() => [...LIFTS.map((l) => ({ id: l.id, name: l.name, group: l.group })), ...Object.entries(custom ?? {}).map(([id, c]) => ({ id, name: c.name, group: c.group }))].filter((l) => l.id !== exclude), [custom, exclude]);
  const words = cleanName(q).split(' ').filter(Boolean);
  const found = words.length ? all.filter((l) => words.every((w) => cleanName(l.name).includes(w))).slice(0, 8) : suggested;
  const pickNew = (g: Group) => {
    const id = slug(cleanName(newName!)) || slug(newName!);
    actions.addCustomLift(id, newName!.replace(/\b[a-z]/g, (c) => c.toUpperCase()), g);
    onPick(id);
  };
  return (
    <Sheet title={title} onClose={onClose}>
      {hint && <p className="muted small" style={{ margin: 0 }}>{hint}</p>}
      <input className="input" placeholder="Search the lift library" aria-label="Search lifts" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="col" style={{ gap: 6, maxHeight: '34vh', overflowY: 'auto' }}>
        {found.map((l) => <button key={l.id} className="btn subtle" style={{ textAlign: 'left' }} onClick={() => onPick(l.id)}>{l.name}</button>)}
        {words.length > 0 && found.length === 0 && <span className="small muted">Nothing in the library matches that.</span>}
      </div>
      {newName && !asNew && <button className="btn ghost" onClick={() => setAsNew(true)}>Keep "{newName}" as its own lift</button>}
      {newName && asNew && (
        <div className="col" style={{ gap: 6 }}>
          <span className="small" style={{ fontWeight: 800 }}>Which muscle group is it?</span>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {GROUPS.map((g) => <button key={g.id} className="btn subtle" style={{ height: 40 }} onClick={() => pickNew(g.id)}>{g.label}</button>)}
          </div>
        </div>
      )}
    </Sheet>
  );
}
