// Turns free text like "Leg day: squat 225x5, 185x6, 185,4" into exercises and sets.

export interface ParsedSet {
  weight: number | null; // lb; null = bodyweight
  reps: number;
  addedWeight?: boolean; // "+25x8" on a bodyweight move
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
}

export interface ParsedWorkout {
  label: string | null;
  exercises: ParsedExercise[];
}

const SPLIT_WORDS = ['day', 'push', 'pull', 'legs', 'upper', 'lower', 'arms', 'full body', 'chest', 'back', 'shoulders'];

const ALIASES: Record<string, string> = {
  squat: 'Squat', squats: 'Squat', 'back squat': 'Squat',
  'front squat': 'Front Squat',
  bench: 'Bench Press', 'bench press': 'Bench Press', 'flat bench': 'Bench Press',
  'incline bench': 'Incline Bench Press', 'incline bench press': 'Incline Bench Press',
  deadlift: 'Deadlift', deadlifts: 'Deadlift', dl: 'Deadlift',
  rdl: 'Romanian Deadlift', 'romanian deadlift': 'Romanian Deadlift',
  ohp: 'Overhead Press', 'overhead press': 'Overhead Press', 'shoulder press': 'Overhead Press',
  'hack squat': 'Hack Squat',
  'leg ext': 'Leg Extension', 'leg extension': 'Leg Extension', 'leg extensions': 'Leg Extension',
  'quad leg extension': 'Leg Extension', 'quad extension': 'Leg Extension',
  'leg curl': 'Leg Curl', 'hamstring curl': 'Leg Curl',
  'leg press': 'Leg Press',
  'glute bridge': 'Glute Bridge', 'glute bridges': 'Glute Bridge',
  'hip thrust': 'Hip Thrust', 'hip thrusts': 'Hip Thrust',
  'pull up': 'Pull-up', 'pull ups': 'Pull-up', 'pullup': 'Pull-up', 'pullups': 'Pull-up', 'pull-up': 'Pull-up', 'pull-ups': 'Pull-up',
  'chin up': 'Chin-up', 'chin ups': 'Chin-up', 'chin-up': 'Chin-up', 'chin-ups': 'Chin-up',
  'push up': 'Push-up', 'push ups': 'Push-up', 'push-up': 'Push-up', 'push-ups': 'Push-up', pushups: 'Push-up',
  dips: 'Dip', dip: 'Dip',
  row: 'Barbell Row', 'barbell row': 'Barbell Row', 'bent over row': 'Barbell Row',
  'lat pulldown': 'Lat Pulldown', pulldown: 'Lat Pulldown',
  'calf raise': 'Calf Raise', 'calf raises': 'Calf Raise',
  'lateral raise': 'Lateral Raise', 'lateral raises': 'Lateral Raise', 'lat raise': 'Lateral Raise',
  'bicep curl': 'Bicep Curl', 'bicep curls': 'Bicep Curl', curls: 'Bicep Curl', curl: 'Bicep Curl',
};

const BODYWEIGHT = ['Pull-up', 'Chin-up', 'Push-up', 'Dip'];

const NUM = String.raw`\d+(?:\.\d+)?`;
const SET_RE = new RegExp(String.raw`^(\+)?(${NUM}|bw)\s*[x×*]\s*(\d+)(?:\s*[x×*]\s*(\d+))?$`, 'i');

function titleCase(s: string): string {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export function normalizeName(raw: string): { name: string; key: string; perHand: boolean; bodyweight: boolean } {
  let s = raw.toLowerCase().replace(/[:\-–]+$/, '').replace(/\s+/g, ' ').trim();
  let perHand = false;
  if (/\b(dumbbell|dumbbells|db)\b/.test(s)) perHand = true;
  const name = ALIASES[s] ?? titleCase(s.replace(/\bdb\b/, 'dumbbell'));
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return { name, key, perHand, bodyweight: BODYWEIGHT.includes(name) };
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
    rest = rest.replace(/:/g, ' ');
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

export function parseWorkout(text: string): ParsedWorkout {
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
    const m = tok.match(/^([a-zA-Z][a-zA-Z\s'\-–/&]*?)\s*((?:\+?\d|bw\b).*)?$/i);
    let setText = tok;
    if (m && m[1] && !/^bw\b/i.test(tok)) {
      const n = normalizeName(m[1]);
      cur = { name: n.name, key: n.key, perHand: n.perHand, bodyweight: n.bodyweight, sets: [], flags: [] };
      exercises.push(cur);
      setText = (m[2] ?? '').trim();
      if (!setText) continue;
    }
    if (!cur) continue;
    const t = setText.replace(/\s+/g, ' ').trim();
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
  return { label, exercises: exercises.filter((e) => e.sets.length > 0) };
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
  if (s.weight == null) return `${s.reps} reps`;
  return `${s.addedWeight ? '+' : ''}${s.weight}×${s.reps}`;
}
