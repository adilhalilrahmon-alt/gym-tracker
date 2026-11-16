import { FRONT_W, front, side, setHeightCm } from '../lib/avatar';
import type { AvatarFeatures, MeasureKey } from '../lib/store';

type M = Record<MeasureKey, number>;

/** Darken (negative) or lighten (positive) a #rrggbb colour by a fraction. */
function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return '#' + [n >> 16, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, '0')).join('');
}

const DEFAULT_LOOK: AvatarFeatures = { skin: '#E7A97A', hair: '#2A1B14', eyebrows: '#2A1B14', hairStyle: 'short', facialHair: 'none', glasses: false };

function HairBack({ look }: { look: AvatarFeatures }) {
  if (look.hairStyle !== 'long') return null;
  return <path d="M83 22 C82 6 92 0 100 0 C110 0 118 6 117 22 L118 48 C114 50 111 46 111 42 L89 42 C89 46 86 50 82 48 Z" fill={look.hair} />;
}

function Hair({ look }: { look: AvatarFeatures }) {
  const c = look.hair;
  switch (look.hairStyle) {
    case 'bald': return null;
    case 'buzz': return <path d="M86 19 C86 9 93 4 100 4 C108 4 114 9 114 19 C110 14 105 12 100 12 C95 12 90 14 86 19 Z" fill={c} opacity="0.85" />;
    case 'curly': return <g fill={c}>{[[87, 15, 5], [92, 9, 5.5], [99, 6, 6], [106, 8, 5.5], [112, 14, 5], [90, 20, 3.5], [110, 20, 3.5]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} />)}</g>;
    case 'medium': return <path d="M84 25 C82 8 92 1 101 1 C112 1 118 9 116 26 C114 20 112 17 109 15 C104 12 96 12 91 15 C88 17 86 20 84 25 Z" fill={c} />;
    default: return <path d="M85 22 C84 8 92 2 101 2 C111 2 117 9 115 22 C111 14 104 12 98 13 C92 14 88 17 85 22 Z" fill={c} />;
  }
}

function FacialHair({ look }: { look: AvatarFeatures }) {
  const c = look.hair;
  const mous = <path d="M95 33 C97 31 103 31 105 33 C103 34.6 97 34.6 95 33 Z" fill={c} />;
  if (look.facialHair === 'stubble') return <path d="M88 30 C89 42 95 47 100 47 C105 47 111 42 112 30 C108 39 92 39 88 30 Z" fill={c} opacity="0.3" />;
  if (look.facialHair === 'moustache') return mous;
  if (look.facialHair === 'beard') return <g><path d="M87 28 C88 43 95 48 100 48 C105 48 112 43 113 28 C109 39 103 36 100 36 C97 36 91 39 87 28 Z" fill={c} />{mous}</g>;
  return null;
}

function Face({ look }: { look: AvatarFeatures }) {
  const ear = shade(look.skin, -0.08);
  return (
    <>
      <HairBack look={look} />
      <ellipse cx="85" cy="25" rx="3" ry="5" fill={ear} />
      <ellipse cx="115" cy="25" rx="3" ry="5" fill={ear} />
      <ellipse cx="100" cy="25" rx="15" ry="22" fill={look.skin} />
      <Hair look={look} />
      <path d="M91 21 L97 22" stroke={look.eyebrows} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M103 22 L109 20" stroke={look.eyebrows} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="94" cy="26" r="2.6" fill="#FFFFFF" />
      <circle cx="106" cy="26" r="2.6" fill="#FFFFFF" />
      <circle cx="94.8" cy="26.4" r="1.4" fill="#0B1530" />
      <circle cx="106.8" cy="26.4" r="1.4" fill="#0B1530" />
      <FacialHair look={look} />
      <path d="M95 36 C98 38.5 103 38.5 106 34.5" stroke={shade(look.skin, -0.45)} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {look.glasses && (
        <g fill="none" stroke="#0B1530" strokeWidth="1.3">
          <circle cx="94" cy="26" r="4.4" /><circle cx="106" cy="26" r="4.4" /><path d="M98.4 26 L101.6 26 M89.6 25 L86 24 M110.4 25 L114 24" />
        </g>
      )}
    </>
  );
}

/** A body part: skin fill, a soft shadow just inside its edge, then a cartoon outline. */
function Part({ d, id, skin, dark, line, rim = 7 }: { d: string; id: string; skin: string; dark: string; line: string; rim?: number }) {
  return (
    <>
      <clipPath id={id}><path d={d} /></clipPath>
      <path d={d} fill={skin} />
      <path d={d} fill="none" stroke={dark} strokeWidth={rim} opacity="0.32" clipPath={`url(#${id})`} />
      <path d={d} fill="none" stroke={line} strokeWidth="1.5" strokeLinejoin="round" />
    </>
  );
}

/** A muscle: lit from the top left, so each one reads as its own rounded shape. */
function Muscle({ d, grad, line, o }: { d: string; grad: string; line: string; o: number }) {
  return <path d={d} fill={`url(#${grad})`} stroke={line} strokeWidth="1.2" strokeOpacity={o} strokeLinejoin="round" />;
}

export function FrontAvatar({ m, bf, ghost, height = 300, id = 'f', look = DEFAULT_LOOK }: { m: M; bf: number; ghost?: M | null; height?: number; id?: string; look?: AvatarFeatures }) {
  const fr = front(m, bf);
  const skin = look.skin;
  const light = shade(skin, 0.16), dark = shade(skin, -0.3), line = shade(skin, -0.55);
  const gf = ghost ? front(ghost, bf) : null;
  const g = `${id}-mus`, ga = `${id}-abs`;
  const mus = (ds: string[], k: string) => ds.map((d, i) => <Muscle key={k + i} d={d} grad={g} line={line} o={fr.majorO} />);
  const parts = (ds: string[], k: string) => ds.map((d, i) => <Part key={k + i} d={d} id={`${id}-${k}${i}`} skin={skin} dark={dark} line={line} />);
  const offset = (FRONT_W - 200) / 2; // the face is drawn for a 200-wide box
  return (
    <svg role="img" aria-label="Front view of your avatar, drawn to scale from your measurements" height={height} width={(height * FRONT_W) / 372} viewBox={`0 0 ${FRONT_W} 372`}>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor={light} /><stop offset="0.5" stopColor={skin} /><stop offset="1" stopColor={shade(skin, -0.16)} />
        </linearGradient>
        <linearGradient id={ga} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor={light} stopOpacity={fr.absFill} /><stop offset="1" stopColor={shade(skin, -0.14)} stopOpacity={fr.absFill} />
        </linearGradient>
        <clipPath id={`${id}-trunkclip`}><path d={fr.torso} />{fr.legs.map((d, i) => <path key={i} d={d} />)}</clipPath>
      </defs>
      <ellipse cx={fr.c} cy="368" rx="48" ry="4" fill="#0B1530" />

      {parts(fr.legs, 'leg')}
      {[...fr.muscles.vmo, ...fr.muscles.calfIn, ...fr.muscles.calfOut].map((d, i) => <Muscle key={'lm' + i} d={d} grad={g} line={line} o={fr.legO} />)}
      <path d={fr.lines.legs} fill="none" stroke={line} strokeWidth="1.1" strokeLinecap="round" opacity={fr.legO} />

      <Part d={fr.torso} id={`${id}-torso`} skin={skin} dark={dark} line={line} rim={9} />
      {fr.abs.map((d, i) => <path key={'ab' + i} d={d} fill={`url(#${ga})`} stroke={line} strokeWidth="1.1" strokeOpacity={fr.absO} />)}
      {mus(fr.muscles.pec, 'pec')}
      <path d={fr.lines.fine} fill="none" stroke={line} strokeWidth="1.1" strokeLinecap="round" opacity={fr.fineO} />

      <path d={fr.trunks} fill="#2B4285" clipPath={`url(#${id}-trunkclip)`} />
      <path d={fr.trunks} fill="none" stroke="#1B2A5C" strokeWidth="1.2" clipPath={`url(#${id}-trunkclip)`} />

      {parts(fr.fore, 'fore')}
      {parts(fr.hand, 'hand')}
      {parts(fr.upper, 'up')}
      {mus(fr.muscles.biceps, 'bi')}
      {mus(fr.muscles.delt, 'delt')}
      <path d={fr.lines.major} fill="none" stroke={line} strokeWidth="1.2" strokeLinecap="round" opacity={fr.majorO} />

      <g transform={`translate(${offset} 0)`}><Face look={look} /></g>
      {gf && (
        <g fill="none" stroke="#36D6C3" strokeWidth="1.6" strokeDasharray="4 4" opacity="0.8">
          <path d={gf.torso} />{[...gf.legs, ...gf.upper, ...gf.fore, ...gf.muscles.delt].map((d, i) => <path key={i} d={d} />)}
        </g>
      )}
    </svg>
  );
}

export function SideAvatar({ m, bf, ghost, height = 300, id = 's', look = DEFAULT_LOOK }: { m: M; bf: number; ghost?: M | null; height?: number; id?: string; look?: AvatarFeatures }) {
  const sd = side(m, bf);
  const gs = ghost ? side(ghost, bf) : null;
  const fr = front(m, bf);
  const arm = shade(look.skin, -0.04);
  const dark = shade(look.skin, -0.3), line = shade(look.skin, -0.55), light = shade(look.skin, 0.16);
  return (
    <svg role="img" aria-label="Side view of your avatar, drawn to scale from your measurements" height={height} width={(height * 140) / 372} viewBox="0 0 140 372">
      <defs>
        <clipPath id={`clip-${id}`}><path d={sd.body} /></clipPath>
        <linearGradient id={`${id}-mus`} x1="0" y1="0" x2="0.9" y2="1"><stop offset="0" stopColor={light} /><stop offset="0.5" stopColor={look.skin} /><stop offset="1" stopColor={shade(look.skin, -0.16)} /></linearGradient>
      </defs>
      <ellipse cx="66" cy="368" rx="34" ry="4" fill="#0B1530" />
      {look.hairStyle === 'long' && <path d="M44 22 C44 8 54 2 64 2 C74 2 80 8 81 16 L60 18 C56 30 52 40 50 48 C44 46 42 34 44 22 Z" fill={look.hair} />}
      <path d={sd.body} fill={look.skin} />
      <path d={sd.body} fill="none" stroke={dark} strokeWidth="9" opacity="0.32" clipPath={`url(#clip-${id})`} />
      <path d={sd.lines} fill="none" stroke={line} strokeWidth="1.2" strokeLinecap="round" opacity={sd.lineO} />
      <rect x="0" y={fr.shortsY} width="140" height={fr.shortsH} fill="#2B4285" clipPath={`url(#clip-${id})`} />
      <path d={sd.body} fill="none" stroke={line} strokeWidth="1.5" strokeLinejoin="round" />
      <Part d={sd.arm} id={`${id}-arm`} skin={arm} dark={dark} line={line} />
      <path d={sd.biceps} fill={`url(#${id}-mus)`} stroke={line} strokeWidth="1.2" strokeOpacity={sd.lineO} />
      <path d={sd.delt} fill={`url(#${id}-mus)`} stroke={line} strokeWidth="1.2" strokeOpacity={sd.lineO} />
      <ellipse cx="63" cy="25" rx="19" ry="22" fill={look.skin} />
      <path d="M81 24 L86 30 L81 31 Z" fill={look.skin} />
      {look.hairStyle !== 'bald' && <path d={look.hairStyle === 'buzz' ? 'M46 20 C46 8 55 4 64 4 C73 4 79 9 80 15 C72 12 62 13 56 18 C52 21 49 24 47 27 C46 25 46 22 46 20 Z' : 'M44 24 C44 8 54 2 64 2 C74 2 80 8 81 16 C72 12 62 14 56 20 C52 24 50 30 48 34 C45 31 44 28 44 24 Z'} fill={look.hair} opacity={look.hairStyle === 'buzz' ? 0.85 : 1} />}
      <ellipse cx="58" cy="26" rx="3.5" ry="5" fill={shade(look.skin, -0.08)} />
      <path d="M71 21 L77 20" stroke={look.eyebrows} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="74" cy="24" r="1.8" fill="#0B1530" />
      {look.glasses && <path d="M69 24 L79 24 M69 24 L58 23" stroke="#0B1530" strokeWidth="1.3" fill="none" />}
      {look.facialHair === 'beard' && <path d="M60 32 C62 42 70 47 77 46 C81 45 83 41 82 36 C78 40 72 40 68 37 C65 35 62 33 60 32 Z" fill={look.hair} />}
      {look.facialHair === 'stubble' && <path d="M60 32 C62 42 70 47 77 46 C81 45 83 41 82 36 C78 40 72 40 68 37 C65 35 62 33 60 32 Z" fill={look.hair} opacity="0.3" />}
      {(look.facialHair === 'moustache' || look.facialHair === 'beard') && <path d="M76 33 C78 32 81 32 82 33.5 C80 34.5 78 34.5 76 33 Z" fill={look.hair} />}
      <path d="M74 36 C76 37 78 37 80 35" stroke={shade(look.skin, -0.45)} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {gs && <path d={gs.body} fill="none" stroke="#36D6C3" strokeWidth="1.6" strokeDasharray="4 4" opacity="0.75" />}
    </svg>
  );
}

export { setHeightCm };
