// The lift library: one canonical entry per lift, with the names people actually type.
// Rule: wording never makes a new lift ("bench", "bench press", "barbell bench press" are one),
// but equipment and angle do (incline bench and dumbbell bench are their own lifts).

export type Group = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'abs' | 'other';
export type Equip = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell' | 'other';

export const GROUPS: { id: Group; label: string }[] = [
  { id: 'chest', label: 'Chest' },
  { id: 'back', label: 'Back' },
  { id: 'shoulders', label: 'Shoulders' },
  { id: 'arms', label: 'Arms' },
  { id: 'legs', label: 'Legs' },
  { id: 'abs', label: 'Abs' },
  { id: 'other', label: 'Other' },
];

export interface Lift {
  id: string;
  name: string;
  group: Group;
  /** The specific muscle, e.g. "quads" inside legs. */
  muscle: string;
  equip: Equip;
  /** Heavy multi-joint lift (judged on est. 1RM) or accessory (judged on best set and volume). */
  compound: boolean;
  /** Counted in seconds, not reps (plank). */
  timed?: boolean;
}

export interface CustomLift { name: string; group: Group }

// name | group | muscle | equipment | C(ompound) or A(ccessory) | extra names
const RAW = `
Bench Press|chest|chest|barbell|C|bench;flat bench;flat bench press;bp;barbell bench
Incline Bench Press|chest|upper chest|barbell|C|incline bench;incline press;incline barbell press
Decline Bench Press|chest|lower chest|barbell|C|decline bench;decline press
Close Grip Bench Press|arms|triceps|barbell|C|close grip bench;cgbp;narrow grip bench
Dumbbell Bench Press|chest|chest|dumbbell|C|dumbbell bench;dumbbell press;dumbbell chest press;flat dumbbell press;flat dumbbell bench
Incline Dumbbell Press|chest|upper chest|dumbbell|C|incline dumbbell bench;incline dumbbell bench press;dumbbell incline press;dumbbell incline bench
Decline Dumbbell Press|chest|lower chest|dumbbell|C|decline dumbbell bench;decline dumbbell bench press
Smith Machine Bench Press|chest|chest|machine|C|smith bench;smith bench press;smith press
Smith Machine Incline Press|chest|upper chest|machine|C|smith incline;smith incline bench;smith incline press
Machine Chest Press|chest|chest|machine|C|chest press;chest press machine;seated chest press;hammer strength chest press
Incline Machine Press|chest|upper chest|machine|C|incline chest press;incline machine chest press;machine incline press
Pec Deck|chest|chest|machine|A|pec fly;pec deck fly;machine fly;chest fly machine;butterfly;pec dec
Cable Fly|chest|chest|cable|A|cable crossover;cable chest fly;cable flye;crossover
Low Cable Fly|chest|upper chest|cable|A|low to high cable fly;low to high fly
High Cable Fly|chest|lower chest|cable|A|high to low cable fly;high to low fly
Dumbbell Fly|chest|chest|dumbbell|A|chest fly;dumbbell chest fly;flat fly
Incline Dumbbell Fly|chest|upper chest|dumbbell|A|incline fly
Push-up|chest|chest|bodyweight|C|pushup;press up
Dip|chest|chest|bodyweight|C|chest dip;parallel bar dip;tricep dip
Machine Dip|arms|triceps|machine|A|assisted dip;seated dip;dip machine
Deadlift|back|lower back|barbell|C|dl;conventional deadlift;barbell deadlift
Sumo Deadlift|legs|glutes|barbell|C|sumo;sumo dl
Trap Bar Deadlift|legs|quads|barbell|C|hex bar deadlift;trap bar;hex bar
Rack Pull|back|lower back|barbell|C|rack pulls
Barbell Row|back|lats|barbell|C|row;bent over row;bent row;bb row;bent over barbell row
Pendlay Row|back|lats|barbell|C|pendlay
T-Bar Row|back|lats|barbell|C|t bar;tbar row;t bar row;landmine row
Dumbbell Row|back|lats|dumbbell|C|one arm row;single arm row;one arm dumbbell row;single arm dumbbell row;dumbbell bent over row
Chest Supported Row|back|upper back|machine|C|chest supported dumbbell row;incline row;seal row;chest supported t bar row
Seated Cable Row|back|lats|cable|C|cable row;seated row;low row;seated cable rows
Machine Row|back|lats|machine|C|row machine;seated machine row;hammer strength row;iso row;machine high row;high row
Lat Pulldown|back|lats|cable|C|pulldown;lat pull down;wide grip pulldown;wide grip lat pulldown;lat pull;cable pulldown
Close Grip Lat Pulldown|back|lats|cable|C|close grip pulldown;neutral grip pulldown;v bar pulldown;narrow grip pulldown
Straight Arm Pulldown|back|lats|cable|A|straight arm pushdown;lat pushdown;straight arm lat pulldown;cable pullover
Pull-up|back|lats|bodyweight|C|pullup;wide grip pull up
Chin-up|back|lats|bodyweight|C|chinup;chin
Assisted Pull-up|back|lats|machine|C|assisted pullup;assisted chin up;machine pull up
Inverted Row|back|upper back|bodyweight|C|body row;australian pull up
Face Pull|shoulders|rear delts|cable|A|face pulls;rope face pull;cable face pull
Back Extension|back|lower back|bodyweight|A|hyperextension;back raise;45 degree back extension;hyper
Good Morning|back|lower back|barbell|C|good mornings
Shrug|back|traps|barbell|A|barbell shrug;shrugs;trap shrug
Dumbbell Shrug|back|traps|dumbbell|A|dumbbell shrugs
Dumbbell Pullover|back|lats|dumbbell|A|pullover
Overhead Press|shoulders|front delts|barbell|C|ohp;shoulder press;military press;standing press;press;barbell shoulder press;strict press;barbell overhead press
Push Press|shoulders|front delts|barbell|C|
Dumbbell Shoulder Press|shoulders|front delts|dumbbell|C|dumbbell overhead press;seated dumbbell press;dumbbell military press;seated dumbbell shoulder press;dumbbell ohp
Arnold Press|shoulders|front delts|dumbbell|C|arnold;arnolds
Machine Shoulder Press|shoulders|front delts|machine|C|shoulder press machine;seated shoulder press machine;smith shoulder press;smith machine shoulder press
Lateral Raise|shoulders|side delts|dumbbell|A|lat raise;side raise;dumbbell lateral raise;side lateral raise;lateral;side delt raise;dumbbell side raise
Cable Lateral Raise|shoulders|side delts|cable|A|cable lat raise;cable side raise
Machine Lateral Raise|shoulders|side delts|machine|A|lateral raise machine;machine lat raise
Front Raise|shoulders|front delts|dumbbell|A|dumbbell front raise;front delt raise;plate front raise
Rear Delt Fly|shoulders|rear delts|dumbbell|A|reverse fly;rear delt raise;bent over fly;rear fly;dumbbell rear delt fly;bent over lateral raise;dumbbell reverse fly
Reverse Pec Deck|shoulders|rear delts|machine|A|rear delt machine;reverse pec fly;rear delt pec deck;machine rear delt fly;machine reverse fly
Upright Row|shoulders|side delts|barbell|A|upright rows;barbell upright row;cable upright row
Bicep Curl|arms|biceps|dumbbell|A|curl;dumbbell curl;dumbbell bicep curl;arm curl;standing dumbbell curl
Barbell Curl|arms|biceps|barbell|A|barbell bicep curl;straight bar curl
EZ Bar Curl|arms|biceps|barbell|A|ez curl;ez bar bicep curl;easy bar curl
Hammer Curl|arms|biceps|dumbbell|A|hammer;dumbbell hammer curl;neutral grip curl
Preacher Curl|arms|biceps|machine|A|preacher;machine preacher curl;ez preacher curl;machine curl;bicep curl machine
Incline Dumbbell Curl|arms|biceps|dumbbell|A|incline curl
Concentration Curl|arms|biceps|dumbbell|A|
Cable Curl|arms|biceps|cable|A|cable bicep curl;rope curl;bayesian curl
Spider Curl|arms|biceps|dumbbell|A|
Reverse Curl|arms|forearms|barbell|A|
Wrist Curl|arms|forearms|dumbbell|A|forearm curl
Tricep Pushdown|arms|triceps|cable|A|pushdown;tricep push down;rope pushdown;cable pushdown;tricep rope pushdown;tricep extension cable;tricep pressdown;rope tricep pushdown;straight bar pushdown
Overhead Tricep Extension|arms|triceps|cable|A|overhead extension;cable overhead tricep extension;overhead cable extension;rope overhead extension;overhead tricep
Dumbbell Tricep Extension|arms|triceps|dumbbell|A|dumbbell overhead extension;dumbbell overhead tricep extension;french press
Skull Crusher|arms|triceps|barbell|A|skullcrusher;lying tricep extension;ez skull crusher;nose breaker
Tricep Kickback|arms|triceps|dumbbell|A|kickback;dumbbell kickback
Tricep Extension|arms|triceps|machine|A|tricep extension machine;machine tricep extension;seated tricep extension
Squat|legs|quads|barbell|C|back squat;barbell squat;bb squat;high bar squat;low bar squat
Front Squat|legs|quads|barbell|C|barbell front squat
Hack Squat|legs|quads|machine|C|hack;hack squat machine
Smith Machine Squat|legs|quads|machine|C|smith squat
Goblet Squat|legs|quads|dumbbell|C|goblet
Leg Press|legs|quads|machine|C|leg press machine;seated leg press;45 degree leg press
Bulgarian Split Squat|legs|quads|dumbbell|C|bulgarian;split squat;bss;rear foot elevated split squat
Lunge|legs|quads|dumbbell|C|dumbbell lunge;walking lunge;reverse lunge;forward lunge
Step-up|legs|quads|dumbbell|C|step up;box step up
Leg Extension|legs|quads|machine|A|leg ext;quad extension;quad leg extension;knee extension
Romanian Deadlift|legs|hamstrings|barbell|C|rdl;romanian;barbell rdl;stiff leg deadlift;sldl;straight leg deadlift
Dumbbell Romanian Deadlift|legs|hamstrings|dumbbell|C|dumbbell rdl;dumbbell stiff leg deadlift
Leg Curl|legs|hamstrings|machine|A|hamstring curl;lying leg curl;seated leg curl;prone leg curl;ham curl
Nordic Curl|legs|hamstrings|bodyweight|A|nordic;nordic hamstring curl
Hip Thrust|legs|glutes|barbell|C|barbell hip thrust;hip thrusts;machine hip thrust
Glute Bridge|legs|glutes|barbell|A|bridge
Cable Kickback|legs|glutes|cable|A|glute kickback;cable glute kickback
Hip Abduction|legs|glutes|machine|A|abductor;abduction;hip abductor;abductor machine
Hip Adduction|legs|adductors|machine|A|adductor;adduction;hip adductor;adductor machine
Calf Raise|legs|calves|machine|A|standing calf raise;calf raises;calf press;leg press calf raise
Seated Calf Raise|legs|calves|machine|A|seated calf
Crunch|abs|abs|bodyweight|A|crunches;ab crunch
Cable Crunch|abs|abs|cable|A|kneeling cable crunch;rope crunch
Machine Crunch|abs|abs|machine|A|ab machine;ab crunch machine;crunch machine
Sit-up|abs|abs|bodyweight|A|situp;decline sit up
Leg Raise|abs|abs|bodyweight|A|lying leg raise;leg raises
Hanging Leg Raise|abs|abs|bodyweight|A|hanging knee raise;hanging raise;captain chair leg raise;knee raise
Ab Wheel|abs|abs|bodyweight|A|ab rollout;ab roller;rollout;ab wheel rollout
Russian Twist|abs|obliques|bodyweight|A|russian twists
Plank|abs|abs|bodyweight|A|planks;front plank
Side Plank|abs|obliques|bodyweight|A|
Woodchopper|abs|obliques|cable|A|cable woodchop;wood chop;woodchop
Pallof Press|abs|obliques|cable|A|pallof
Farmer Carry|other|grip|dumbbell|C|farmer walk;farmers walk;farmers carry
Kettlebell Swing|other|glutes|kettlebell|C|kb swing;swing
Clean|other|full body|barbell|C|power clean
Clean and Press|other|full body|barbell|C|clean press;clean and jerk
Snatch|other|full body|barbell|C|power snatch
Thruster|other|full body|barbell|C|thrusters
Burpee|other|full body|bodyweight|A|burpees
Box Jump|other|legs|bodyweight|A|box jumps
`;

const TIMED = new Set(['plank', 'side-plank', 'farmer-carry']);
export const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const rows = RAW.trim().split('\n').map((line) => {
  const [name, group, muscle, equip, kind, extra] = line.split('|');
  const lift: Lift = { id: slug(name), name, group: group as Group, muscle, equip: equip as Equip, compound: kind === 'C' };
  if (TIMED.has(lift.id)) lift.timed = true;
  return { lift, extra: extra ? extra.split(';').filter(Boolean) : [] };
});

export const LIFTS: Lift[] = rows.map((r) => r.lift);
const BY_ID = new Map(LIFTS.map((l) => [l.id, l]));

// ---------- cleaning up typed names ----------
const WORDS: Record<string, string> = {
  bb: 'barbell', db: 'dumbbell', dbs: 'dumbbell', dumbell: 'dumbbell', dumbel: 'dumbbell', kb: 'kettlebell',
  ohp: 'overhead press', rdl: 'romanian deadlift', sldl: 'stiff leg deadlift', dl: 'deadlift', cgbp: 'close grip bench press',
  tri: 'tricep', tris: 'tricep', triceps: 'tricep', bi: 'bicep', bis: 'bicep', biceps: 'bicep',
  ext: 'extension', exts: 'extension', flies: 'fly', flyes: 'fly', flye: 'fly', flys: 'fly',
  pushup: 'push up', pushups: 'push up', pullup: 'pull up', pullups: 'pull up', chinup: 'chin up', chinups: 'chin up', situp: 'sit up', situps: 'sit up',
  skullcrusher: 'skull crusher', skullcrushers: 'skull crusher', calves: 'calf', abs: 'ab', delts: 'delt', glutes: 'glute', hams: 'hamstring', hammy: 'hamstring',
  ez: 'ez', pulldowns: 'pulldown', pushdowns: 'pushdown', pressdown: 'pushdown', lats: 'lat', quads: 'quad', smith: 'smith',
  dips: 'dip', rows: 'row', sets: 'set', ups: 'up',
  bodyweight: '', bw: '', weighted: '', the: '', a: '', with: '', on: '', of: '', and: '', machine: 'machine',
};

function singular(t: string): string {
  if (t.length <= 4) return t;
  if (/(ches|shes|sses|xes)$/.test(t)) return t.slice(0, -2);
  if (t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us')) return t.slice(0, -1);
  return t;
}

/** "DB  Incline-Bench Presses" → "dumbbell incline bench press" */
export function cleanName(raw: string): string {
  return raw.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
    .map((t) => (t in WORDS ? WORDS[t] : singular(t)))
    .join(' ').split(' ').map((t) => (t in WORDS ? WORDS[t] : t)).filter(Boolean).join(' ');
}

const sortKey = (clean: string) => clean.split(' ').sort().join(' ');

// Index of every known spelling → lift id.
const EXACT = new Map<string, string>();
const SORTED = new Map<string, string>();
const SPELLINGS: { clean: string; tokens: string[]; id: string }[] = [];
function addSpelling(text: string, id: string) {
  const c = cleanName(text);
  if (!c || EXACT.has(c)) return;
  EXACT.set(c, id);
  if (!SORTED.has(sortKey(c))) SORTED.set(sortKey(c), id);
  SPELLINGS.push({ clean: c, tokens: c.split(' '), id });
}
// Canonical names first, so they win ties. Then extras, then "barbell squat"-style equipment prefixes.
for (const { lift } of rows) addSpelling(lift.name, lift.id);
for (const { lift, extra } of rows) for (const e of extra) addSpelling(e, lift.id);
for (const { lift } of rows) {
  if (['barbell', 'dumbbell', 'cable', 'machine'].includes(lift.equip) && !cleanName(lift.name).includes(lift.equip)) {
    addSpelling(`${lift.equip} ${lift.name}`, lift.id);
    if (lift.equip === 'machine') addSpelling(`${lift.name} machine`, lift.id);
  }
}

// Words that change which lift it is. A typed qualifier the candidate lacks blocks an automatic match.
const QUALIFIERS = new Set(['incline', 'decline', 'dumbbell', 'barbell', 'machine', 'cable', 'smith', 'kettlebell', 'front', 'rear', 'reverse', 'seated', 'standing',
  'single', 'one', 'close', 'wide', 'hammer', 'sumo', 'romanian', 'stiff', 'overhead', 'hack', 'goblet', 'bulgarian', 'hanging', 'side', 'assisted', 'trap', 'ez',
  'preacher', 'lateral', 'upright', 'low', 'high', 'straight', 'leg', 'hip', 'calf', 'chest', 'tricep', 'bicep', 'lat', 'ab']);

/** Edit distance where swapped neighbours ("sqaut") count as one slip. */
function lev(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}
const sim = (a: string, b: string) => 1 - lev(a, b) / Math.max(a.length, b.length);

/** How close a typed name is to one known spelling, 0–1, and whether every word found a partner. */
function closeness(q: string[], a: string[]): { score: number; full: boolean } {
  const used = new Set<number>();
  let total = 0, matched = 0;
  for (const t of q) {
    let best = 0, bi = -1;
    a.forEach((u, i) => { if (!used.has(i)) { const s = sim(t, u); if (s > best) { best = s; bi = i; } } });
    const ok = best >= (t.length <= 4 ? 0.74 : 0.7) && !(QUALIFIERS.has(t) && best < 1 && QUALIFIERS.has(a[bi]) && t[0] !== a[bi][0]);
    if (ok) { used.add(bi); total += best; matched++; }
  }
  const tokenScore = total / Math.max(q.length, a.length);
  const joined = sim(q.join(''), a.join(''));
  const full = matched === q.length && matched === a.length;
  return { score: Math.max(tokenScore, joined >= 0.8 ? joined : 0), full: full || joined >= 0.86 };
}

export type MatchHow = 'exact' | 'learned' | 'custom' | 'fuzzy' | 'ask' | 'new';
export interface LiftMatch {
  id: string;
  name: string;
  how: MatchHow;
  /** What was typed, cleaned up. The key used to remember a choice. */
  typed: string;
  /** For 'ask': the closest library lifts. */
  options: { id: string; name: string }[];
}

export interface MatchContext {
  /** Spellings the user has confirmed: cleaned text → lift id. */
  aliases?: Record<string, string>;
  /** Lifts the user created. */
  custom?: Record<string, CustomLift>;
}

const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

export function liftInfo(id: string, custom?: Record<string, CustomLift>): Lift {
  const known = BY_ID.get(id);
  if (known) return known;
  const c = custom?.[id];
  const name = c?.name ?? titleCase(id.replace(/-/g, ' '));
  const equip: Equip = /dumbbell/.test(id) ? 'dumbbell' : /cable/.test(id) ? 'cable' : /machine/.test(id) ? 'machine' : 'other';
  return { id, name, group: c?.group ?? 'other', muscle: c?.group ?? 'other', equip, compound: false };
}

export const isLibraryLift = (id: string) => BY_ID.has(id);

/** Find the lift a typed name means. Never asks the network; instant and offline. */
export function matchLift(raw: string, ctx: MatchContext = {}): LiftMatch {
  const typed = cleanName(raw);
  const none: LiftMatch = { id: slug(typed || raw), name: titleCase((typed || raw).trim()), how: 'new', typed, options: [] };
  if (!typed) return none;
  const hit = (id: string, how: MatchHow): LiftMatch => ({ id, name: liftInfo(id, ctx.custom).name, how, typed, options: [] });

  const learned = ctx.aliases?.[typed];
  if (learned) return hit(learned, 'learned');
  const exact = EXACT.get(typed) ?? SORTED.get(sortKey(typed));
  if (exact) return hit(exact, 'exact');
  if (ctx.custom?.[none.id]) return hit(none.id, 'custom');
  for (const [id, c] of Object.entries(ctx.custom ?? {})) if (cleanName(c.name) === typed) return hit(id, 'custom');

  // Closest spellings, best one per lift.
  const q = typed.split(' ');
  const best = new Map<string, { score: number; full: boolean }>();
  for (const s of SPELLINGS) {
    const c = closeness(q, s.tokens);
    const missingQualifier = q.some((t) => QUALIFIERS.has(t) && !s.tokens.some((u) => sim(t, u) >= 0.8)) || s.tokens.some((u) => QUALIFIERS.has(u) && !q.some((t) => sim(t, u) >= 0.7));
    const score = missingQualifier ? c.score * 0.85 : c.score;
    const full = c.full && !missingQualifier;
    const cur = best.get(s.id);
    if (!cur || score > cur.score || (score === cur.score && full && !cur.full)) best.set(s.id, { score, full });
  }
  const ranked = [...best.entries()].sort((a, b) => b[1].score - a[1].score);
  const [top, second] = ranked;
  if (top && top[1].full && top[1].score >= 0.74 && (!second || top[1].score - second[1].score >= 0.06 || !second[1].full)) return hit(top[0], 'fuzzy');
  const options = ranked.filter(([, v]) => v.score >= Math.max(0.45, (top?.[1].score ?? 0) - 0.2)).slice(0, 3).map(([id]) => ({ id, name: liftInfo(id).name }));
  return options.length ? { ...none, how: 'ask', options } : none;
}

/** Typical loading jump for a lift, in lb (per hand for dumbbells). */
export function stepFor(l: Lift, weight: number): number {
  if (l.equip === 'dumbbell') return weight < 25 ? 2.5 : 5;
  if (l.equip === 'barbell') return l.compound ? 5 : 5;
  if (l.equip === 'machine' || l.equip === 'cable') return weight < 50 ? 2.5 : 5;
  return 5;
}
