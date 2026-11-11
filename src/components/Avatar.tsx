import { front, side, setHeightCm } from '../lib/avatar';
import type { MeasureKey } from '../lib/store';

type M = Record<MeasureKey, number>;

function Face() {
  return (
    <>
      <ellipse cx="85" cy="25" rx="3" ry="5" fill="#D9966A" />
      <ellipse cx="115" cy="25" rx="3" ry="5" fill="#D9966A" />
      <ellipse cx="100" cy="25" rx="15" ry="22" fill="#E7A97A" />
      <path d="M85 22 C84 8 92 2 101 2 C111 2 117 9 115 22 C111 14 104 12 98 13 C92 14 88 17 85 22 Z" fill="#2A1B14" />
      <path d="M91 21 L97 22" stroke="#2A1B14" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M103 22 L109 20" stroke="#2A1B14" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="94" cy="26" r="2.6" fill="#FFFFFF" />
      <circle cx="106" cy="26" r="2.6" fill="#FFFFFF" />
      <circle cx="94.8" cy="26.4" r="1.4" fill="#0B1530" />
      <circle cx="106.8" cy="26.4" r="1.4" fill="#0B1530" />
      <path d="M95 36 C98 38.5 103 38.5 106 34.5" stroke="#7A3B2A" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </>
  );
}

export function FrontAvatar({ m, bf, ghost, height = 300, id = 'f' }: { m: M; bf: number; ghost?: M | null; height?: number; id?: string }) {
  const fr = front(m, bf);
  const gf = ghost ? front(ghost, bf) : null;
  return (
    <svg role="img" aria-label="Front view of your avatar, drawn to scale from your measurements" height={height} width={(height * 200) / 372} viewBox="0 0 200 372">
      <defs><clipPath id={`clip-${id}`}><path d={fr.body} /></clipPath></defs>
      <ellipse cx="100" cy="368" rx="44" ry="4" fill="#0B1530" />
      <path d={fr.body} fill="#E7A97A" />
      <rect x="0" y={fr.shortsY} width="200" height={fr.shortsH} fill="#2B4285" clipPath={`url(#clip-${id})`} />
      <g fill="none" stroke="#B9764B" strokeWidth="1.6" strokeLinecap="round">
        <path d={fr.pec} opacity={fr.pecO} />
        <path d={fr.midline} opacity={fr.absO} />
        <path d={fr.abs} opacity={fr.absO} />
        <path d={fr.vline} opacity={fr.vO} />
        <path d={fr.quads} opacity={fr.quadO} />
      </g>
      <path d={fr.armR} fill="#DDA070" />
      <path d={fr.armL} fill="#DDA070" />
      <path d={fr.delts} fill="none" stroke="#B9764B" strokeWidth="1.4" strokeLinecap="round" opacity={fr.deltO} />
      <Face />
      {gf && (
        <g fill="none" stroke="#36D6C3" strokeWidth="1.6" strokeDasharray="4 4" opacity="0.75">
          <path d={gf.body} /><path d={gf.armR} /><path d={gf.armL} />
        </g>
      )}
    </svg>
  );
}

export function SideAvatar({ m, bf, ghost, height = 300, id = 's' }: { m: M; bf: number; ghost?: M | null; height?: number; id?: string }) {
  const sd = side(m, bf);
  const gs = ghost ? side(ghost, bf) : null;
  return (
    <svg role="img" aria-label="Side view of your avatar, drawn to scale from your measurements" height={height} width={(height * 140) / 372} viewBox="0 0 140 372">
      <defs><clipPath id={`clip-${id}`}><path d={sd.body} /></clipPath></defs>
      <ellipse cx="66" cy="368" rx="34" ry="4" fill="#0B1530" />
      <path d={sd.body} fill="#E7A97A" />
      <rect x="0" y={front(m, bf).shortsY} width="140" height={front(m, bf).shortsH} fill="#2B4285" clipPath={`url(#clip-${id})`} />
      <path d={sd.arm} fill="#D9966A" />
      <ellipse cx="63" cy="25" rx="19" ry="22" fill="#E7A97A" />
      <path d="M81 24 L86 30 L81 31 Z" fill="#E7A97A" />
      <path d="M44 24 C44 8 54 2 64 2 C74 2 80 8 81 16 C72 12 62 14 56 20 C52 24 50 30 48 34 C45 31 44 28 44 24 Z" fill="#2A1B14" />
      <ellipse cx="58" cy="26" rx="3.5" ry="5" fill="#D9966A" />
      <circle cx="74" cy="24" r="1.8" fill="#0B1530" />
      <path d="M74 36 C76 37 78 37 80 35" stroke="#7A3B2A" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {gs && <path d={gs.body} fill="none" stroke="#36D6C3" strokeWidth="1.6" strokeDasharray="4 4" opacity="0.75" />}
    </svg>
  );
}

export { setHeightCm };
