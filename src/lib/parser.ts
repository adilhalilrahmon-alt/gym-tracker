// Turns free text like "Leg day: squat 225x5, 185x6, 185,4" into exercises and sets.
import { liftInfo, matchLift, type LiftMatch, type MatchContext } from './lifts';

export interface ParsedSet {
  weight: number | null; // lb; null = bodyweight
  reps: number;
  addedWeight?: boolean; // "+25x8" on a bodyweight move
  secs?: number; // timed hold ("plank 60s"); reps is 0
}

export type FlagKind = 'comma' | 'jump';

export interface SetFlag {
  kind: FlagKind;
  setIndex: number;
  message: string;
  suggestion?: number; // suggested weight for a 'jump' flag
}

export interface ParsedExercise {
  name: string;
  key: string; // normalized id
  perHand: boolean;
  bodyweight: boolean;
  sets: ParsedSet[];
  flags: SetFlag[];
  /** How the typed name was matched to the lift library. Only present while logging. */
  match?: LiftMatch & { raw: string };
}

export interface ParsedWorkout {
  label: string | null;
  exercises: ParsedExercise[];
  /** Lifts typed without sets yet. The logger shows "last time" and a suggestion for these. */
  pending: ParsedExercise[];
}

const SPLIT_WORDS = ['day', 'push', 'pull', 'legs', 'upper', 'lower', 'arms', 'full body', 'chest', 'back', 'shoulders'];

const NUM = String.raw`\d+(?:\.\d+)?`;
const SET_RE = new RegExp(String.raw`^(\+)?(${NUM}|bw)\s*[x×*]\s*(\d+)(?:\s*[x×*]\s*(\d+))?$`, 'i');

function titleCase(s: string): string {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export function normalizeName(raw: string, ctx?: MatchContext): { name: string; key: string; perHand: boolean; bodyweight: boolean; match: LiftMatch & { raw: string } } {
  const typedRaw = raw.replace(/[:\-–]+$/, '').replace(/\s+/g, ' ').trim();
  const m = matchLift(typedRaw, ctx);
  const info = liftInfo(m.id, ctx?.custom);
  const perHand = info.equip === 'dumbbell' || /\b(dumbbell|dumbbells|db|dbs)\b/i.test(typedRaw);
  return { name: m.name, key: m.id, perHand, bodyweight: info.equip === 'bodyweight', match: { ...m, raw: typedRaw } };
}

function isLabel(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (!t || /\d/.test(t)) return false;
  return SPLIT_WORDS.some((w) => t === w || t.endsWith(' ' + w) || t.startsWith(w + ' ') || t.endsWith('day'));
}

/** Split text into tokens: commas and new lines separate; "Name: sets" colons separate name from sets. */
function tokenize(text: string): { tokens: string[]; label: string | null } {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  let label: string | null = null;
  const tokens: string[] = [];
  lines.forEach((line, li) => {
    let rest = line;
    const colon = rest.indexOf(':');
    if (li === 0 && colon > 0 && isLabel(rest.slice(0, colon))) {
      label = titleCase(rest.slice(0, colon).trim().toLowerCase());
      rest = rest.slice(colon + 1);
    }
    rest = rest.replace(/:(?!\d{2}\b)/g, ' '); // keep the colon in times like 1:30
    const parts = rest.split(',').map((p) => p.trim()).filter(Boolean);
    parts.forEach((p, pi) => {
      if (li === 0 && pi === 0 && label === null && isLabel(p)) {
        label = titleCase(p.toLowerCase());
        return;
      }
      tokens.push(p);
    });
    tokens.push('\n');
  });
  return { tokens, label };
}

export function parseWorkout(text: string, ctx?: MatchContext): ParsedWorkout {
  const { tokens, label } = tokenize(text);
  const exercises: ParsedExercise[] = [];
  let cur: ParsedExercise | null = null;

  const pushSet = (set: ParsedSet, count = 1) => {
    if (!cur) return;
    for (let i = 0; i < count; i++) cur.sets.push({ ...set });
  };

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok === '\n') continue;
    // Separate a leading name from trailing set text: "squat 225x5" → name "squat", set "225x5"
    const m = tok.match(/^([a-zA-Z][a-zA-Z\s'\-–/&]*?)\s*((?:\+?\d|bw\b|[x×]\s*\d).*)?$/i);
    let setText = tok;
    if (m && m[1] && !/^bw\b/i.test(tok) && !/^[x×*]\s*\d+$/i.test(tok)) {
      const n = normalizeName(m[1], ctx);
      cur = { name: n.name, key: n.key, perHand: n.perHand, bodyweight: n.bodyweight, sets: [], flags: [], match: n.match };
      exercises.push(cur);
      setText = (m[2] ?? '').trim();
      if (!setText) continue;
    }
    if (!cur) continue;
    const t = setText.replace(/\s+/g, ' ').trim();
    // Timed holds: "60s", "1:30", "2 min", "3x45s"
    const tm = t.match(/^(?:(\d+)\s*[x×*]\s*)?(?:(\d+):(\d{2})|(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds|m|min|mins|minutes))$/i);
    if (tm) {
      const secs = tm[2] != null ? parseInt(tm[2], 10) * 60 + parseInt(tm[3], 10) : Math.round(parseFloat(tm[4]) * (/^m/i.test(tm[5]) ? 60 : 1));
      if (secs > 0 && secs <= 3600) pushSet({ weight: null, reps: 0, secs }, Math.min(tm[1] ? parseInt(tm[1], 10) : 1, 20));
      continue;
    }
    // Bodyweight reps written as "x8" or "3x8" after a bodyweight move
    const bm = t.match(/^(?:(\d+)\s*)?[x×*]\s*(\d+)$/i);
    if (bm && (bm[1] == null || cur.bodyweight) && !(bm[1] != null && parseInt(bm[1], 10) > 10)) {
      cur.bodyweight = true;
      pushSet({ weight: null, reps: parseInt(bm[2], 10) }, Math.min(bm[1] ? parseInt(bm[1], 10) : 1, 20));
      continue;
    }
    const sm = t.replace(/\s*([x×*])\s*/gi, 'x').match(SET_RE);
    if (sm) {
      const plus = !!sm[1];
      const isBw = /bw/i.test(sm[2]);
      const w = isBw ? null : parseFloat(sm[2]);
      const reps = parseInt(sm[3], 10);
      const count = sm[4] ? parseInt(sm[4], 10) : 1;
      pushSet({ weight: w, reps, ...(plus ? { addedWeight: true } : {}) }, Math.min(count, 20));
      continue;
    }
    if (/^\d+(\.\d+)?$/.test(t)) {
      const n = parseFloat(t);
      const next = tokens[i + 1];
      // "185,4": a weight then reps split by a comma typo.
      if (!cur.bodyweight && n >= 20 && next && /^\d{1,2}$/.test(next.trim()) && parseInt(next, 10) <= 30) {
        pushSet({ weight: n, reps: parseInt(next, 10) });
        cur.flags.push({ kind: 'comma', setIndex: cur.sets.length - 1, message: `Read "${t},${next.trim()}" as ${n}×${next.trim()}` });
        i++;
        continue;
      }
      // Bodyweight reps: "pull-ups 10, 8"
      if (n <= 100 && Number.isInteger(n)) {
        cur.bodyweight = cur.bodyweight || n <= 30;
        pushSet({ weight: null, reps: n });
      }
    }
  }

  for (const ex of exercises) addJumpFlags(ex);
  return { label, exercises: exercises.filter((e) => e.sets.length > 0), pending: exercises.filter((e) => e.sets.length === 0) };
}

/** Flag a set whose weight is more than 50% above or below the previous set. */
export function addJumpFlags(ex: ParsedExercise, lastSessionTop?: number) {
  ex.flags = ex.flags.filter((f) => f.kind !== 'jump');
  ex.sets.forEach((s, idx) => {
    if (s.weight == null || s.addedWeight) return;
    const prev = idx > 0 ? ex.sets[idx - 1].weight : lastSessionTop ?? null;
    if (prev == null || prev <= 0) return;
    const ratio = s.weight / prev;
    if (ratio >= 1.5 || ratio <= 0.5) {
      ex.flags.push({
        kind: 'jump',
        setIndex: idx,
        suggestion: prev,
        message: `${s.weight} is ${ratio >= 1.5 ? 'much heavier' : 'much lighter'} than ${prev}. Typo?`,
      });
    }
  });
}

export function formatSet(s: ParsedSet): string {
  if (s.secs) return s.secs >= 90 ? `${Math.floor(s.secs / 60)}:${String(s.secs % 60).padStart(2, '0')}` : `${s.secs}s`;
  if (s.weight == null) return `${s.reps} reps`;
  return `${s.addedWeight ? '+' : ''}${s.weight}×${s.reps}`;
}
