// Avatar geometry: draws a front and side silhouette to scale from height and tape measurements.
// Ported from the design canvas. All widths come from circumferences (ellipse model).
/* eslint-disable */
import type { MeasureKey } from './store';
type M = Record<MeasureKey, number>;
type Pt = [number, number];
var H = 360, TOP = 4, PI = Math.PI;
let IN = H / 72.8;
/** Scale the figure so the full height maps to the person's height. */
export function setHeightCm(cm: number) { IN = H / (cm / 2.54); }
function r1(n: number) { return Math.round(n * 10) / 10; }
function Y(fr: number) { return TOP + fr * H; }
function cw(C: number) { return C / PI * IN; }
function ew(C: number, r: number) { return 2 * r * C / (PI * (1 + r)) * IN; }
function ed(C: number, r: number) { return 2 * C / (PI * (1 + r)) * IN; }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
function smooth(pts: Pt[], closed: boolean) {
  var n = pts.length, d = 'M' + r1(pts[0][0]) + ' ' + r1(pts[0][1]);
  var last = closed ? n : n - 1;
  for (var i = 0; i < last; i++) {
    var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    if (!closed) { if (i === 0) p0 = p1; if (i + 2 >= n) p3 = p2; }
    d += ' C' + r1(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + r1(p1[1] + (p2[1] - p0[1]) / 6) + ' ' + r1(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + r1(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + r1(p2[0]) + ' ' + r1(p2[1]);
  }
  return d + (closed ? ' Z' : '');
}
/** Width of the front drawing's viewBox. The figure is centred at FC. */
export const FRONT_W = 230;
const FC = FRONT_W / 2;

/**
 * Front view as a cartoon muscle figure. The arms hang a little away from the body so the
 * shoulders and arms read clearly. Every width comes from a tape measurement; body fat only
 * changes how sharply the muscles are outlined.
 */
export function front(m: M, bf: number) {
  var c = FC;
  var nW = cw(m.neck), shW = ew(m.shoulders, 1.6), chW = ew(m.chest, 1.35), waW = ew(m.waist, 1.3), hiW = ew(m.hips, 1.2);
  var thW = cw(m.thigh), caW = cw(m.calf), knW = cw(14.5 + (m.thigh - 23) * 0.2), ankW = cw(9);
  var bW = cw(m.biceps) * 1.02, eW = cw(m.biceps * 0.74), fW = cw(m.biceps * 0.86), wW = cw(6.8);
  // How sharply muscles show: fully at ~13% body fat and below, gone by ~22%.
  var def = clamp((22 - bf) / 9, 0, 1);
  var legC = Math.max(hiW / 2 - thW / 2, thW * 0.42), lk = legC * 0.84, la = legC * 0.9;
  var P = function (px: number, fr: number): Pt { return [c + px, Y(fr)]; };
  var mirror = function (pts: Pt[]): Pt[] { return pts.map(function (p: Pt): Pt { return [2 * c - p[0], p[1]]; }); };
  var both = function (pts: Pt[], closed: boolean) { return [smooth(pts, closed), smooth(mirror(pts), closed)]; };
  var line = function (a: Pt, q: Pt, b: Pt) { return 'M' + r1(a[0]) + ' ' + r1(a[1]) + ' Q' + r1(q[0]) + ' ' + r1(q[1]) + ' ' + r1(b[0]) + ' ' + r1(b[1]); };
  var lines2 = function (a: Pt, q: Pt, b: Pt) { var mm = mirror([a, q, b]); return line(a, q, b) + ' ' + line(mm[0], mm[1], mm[2]); };

  // ---- torso (neck to crotch), mirrored ----
  var T: Pt[] = [
    P(nW * 0.46, .105), P(nW * 0.5, .14), P(nW / 2 + (shW / 2 - nW / 2) * 0.42, .16), P(shW / 2 * 0.8, .177), P(shW / 2 * 0.86, .2),
    P(chW / 2, .245), P(chW / 2 * 0.99, .28), P(lerp(chW, waW, .55) / 2, .34), P(waW / 2, .40), P(lerp(waW, hiW, .55) / 2, .44),
    P(hiW / 2, .48), P(hiW / 2 * 0.97, .515), P(hiW * 0.1, .54), P(0, .545)
  ];
  var torso = smooth(T.concat(mirror(T.slice(0, -1)).reverse()), true);

  // ---- legs ----
  var LG: Pt[] = [
    P(legC + thW * 0.5, .49), P(legC + thW * 0.53, .56), P(legC * 0.96 + thW * 0.46, .63), P(lk + knW * 0.5, .715),
    P(lk + caW * 0.5, .775), P(lk + caW * 0.42, .83), P(la + ankW * 0.48, .925), P(la + ankW * 0.58, .968), P(la + ankW * 0.62 + IN * 0.6, .99),
    P(la - ankW * 0.55, .992), P(la - ankW * 0.52, .955), P(la - ankW * 0.48, .925), P(lk - caW * 0.57, .80), P(lk - caW * 0.5, .762),
    P(lk - knW * 0.5, .72), P(legC * 0.95 - thW * 0.47, .64), P(legC - thW * 0.5, .55), P(legC - thW * 0.42, .5)
  ];
  var legs = both(LG, true);
  var vmo = both([P(lk - knW * 0.12, .655), P(lk - knW * 0.46, .682), P(lk - knW * 0.22, .708), P(lk + knW * 0.02, .69)], true);
  var calfIn = both([P(lk - caW * 0.1, .752), P(lk - caW * 0.52, .79), P(lk - caW * 0.3, .835), P(lk - caW * 0.06, .8)], true);
  var calfOut = both([P(lk + caW * 0.16, .756), P(lk + caW * 0.45, .786), P(lk + caW * 0.3, .826), P(lk + caW * 0.14, .795)], true);
  var legLines =
    lines2(P(legC + thW * 0.16, .555), P(legC + thW * 0.42, .63), P(lk + knW * 0.3, .70)) + ' ' +
    lines2(P(legC - thW * 0.12, .56), P(legC * 0.95 - thW * 0.05, .64), P(lk + knW * 0.02, .695)) + ' ' +
    lines2(P(lk - knW * 0.28, .727), P(lk, .742), P(lk + knW * 0.28, .727)) + ' ' +
    lines2(P(lk + caW * 0.06, .76), P(lk + caW * 0.1, .84), P(la + ankW * 0.12, .905));

  // ---- chest and abs ----
  var pec = both([P(IN * 0.3, .196), P(nW * 0.62, .19), P(shW / 2 * 0.62, .2), P(shW / 2 * 0.7, .226), P(chW / 2 * 0.9, .262), P(chW * 0.32, .29), P(chW * 0.14, .298), P(IN * 0.3, .288)], true);
  var aw = lerp(waW, chW, .3) * 0.19, g = IN * 0.28;
  var abs: string[] = [];
  [[.302, .334, .95], [.339, .371, 1], [.376, .406, 1]].forEach(function (r: number[]) {
    var w = aw * r[2];
    abs = abs.concat(both([P(g, r[0] + .003), P(w, r[0]), P(w * 1.03, (r[0] + r[1]) / 2), P(w * 0.95, r[1]), P(g, r[1] + .002)], true));
  });
  abs = abs.concat(both([P(g, .411), P(aw * 0.92, .411), P(aw * 0.8, .44), P(aw * 0.45, .462), P(g, .468)], true));
  var torsoLines =
    lines2(P(IN * 0.4, .188), P(shW / 2 * 0.4, .181), P(shW / 2 * 0.7, .179)) + ' ' + // collarbones
    lines2(P(nW * 0.42, .115), P(nW * 0.3, .15), P(IN * 0.45, .185)); // neck
  var fine =
    lines2(P(chW / 2 * 0.93, .282), P(chW / 2 * 0.86, .287), P(chW / 2 * 0.8, .296)) + ' ' +
    lines2(P(chW / 2 * 0.94, .3), P(chW / 2 * 0.87, .305), P(chW / 2 * 0.81, .314)) + ' ' +
    lines2(P(chW / 2 * 0.93, .318), P(chW / 2 * 0.87, .323), P(chW / 2 * 0.82, .332)) + ' ' + // serratus
    lines2(P(waW * 0.43, .43), P(waW * 0.3, .47), P(waW * 0.13, .5)); // V lines

  // ---- arms (built for the right side, then mirrored) ----
  var a1 = 19 * PI / 180, a2 = 11 * PI / 180, L1 = 0.17 * H, L2 = 0.14 * H, h = 0.072 * H;
  var S: Pt = [c + shW / 2 - bW * 0.52, Y(.192)];
  var up = function (v: number, u: number): Pt { return [S[0] + v * Math.sin(a1) + u * Math.cos(a1), S[1] + v * Math.cos(a1) - u * Math.sin(a1)]; };
  var E = up(L1, 0);
  var fo = function (v: number, u: number): Pt { return [E[0] + v * Math.sin(a2) + u * Math.cos(a2), E[1] + v * Math.cos(a2) - u * Math.sin(a2)]; };
  var upper = both([up(0.02 * L1, bW * 0.5), up(0.4 * L1, bW * 0.54), up(0.75 * L1, bW * 0.47), up(L1, eW * 0.52), up(L1 * 1.04, 0), up(L1, -eW * 0.52), up(0.62 * L1, -bW * 0.5), up(0.3 * L1, -bW * 0.44), up(0.02 * L1, -bW * 0.38)], true);
  var fore = both([fo(-0.06 * L2, eW * 0.5), fo(0.2 * L2, fW * 0.55), fo(0.6 * L2, fW * 0.42), fo(L2, wW * 0.5), fo(L2, -wW * 0.5), fo(0.55 * L2, -fW * 0.4), fo(0.18 * L2, -fW * 0.5), fo(-0.06 * L2, -eW * 0.5)], true);
  var hand = both([fo(L2 - 1, wW * 0.52), fo(L2 + 0.45 * h, wW * 0.66), fo(L2 + 0.85 * h, wW * 0.5), fo(L2 + h, 0), fo(L2 + 0.85 * h, -wW * 0.42), fo(L2 + 0.5 * h, -wW * 0.72), fo(L2 + 0.22 * h, -wW * 0.62), fo(L2 - 1, -wW * 0.52)], true);
  var biceps = both([up(0.26 * L1, -bW * 0.36), up(0.55 * L1, -bW * 0.48), up(0.86 * L1, -bW * 0.2), up(0.62 * L1, bW * 0.14), up(0.34 * L1, bW * 0.06)], true);
  var delt = both([[c + shW / 2 * 0.64, Y(.18)], [c + shW / 2 * 0.9, Y(.176)], [c + shW / 2 + IN * 0.15, Y(.205)], up(0.33 * L1, bW * 0.58), up(0.48 * L1, bW * 0.12), up(0.22 * L1, -bW * 0.42), [c + shW / 2 * 0.66, Y(.226)]], true);
  var armLines =
    lines2(up(0.36 * L1, bW * 0.3), up(0.6 * L1, bW * 0.33), up(0.86 * L1, bW * 0.24)) + ' ' + // triceps
    lines2(fo(0.02 * L2, eW * 0.1), fo(0.25 * L2, fW * 0.3), fo(0.58 * L2, fW * 0.28)) + ' ' + // forearm
    lines2([c + shW / 2 * 0.86, Y(.19)], up(0.2 * L1, bW * 0.25), up(0.46 * L1, bW * 0.14)); // delt heads

  var majorO = r1(0.45 + 0.5 * def);
  return {
    W: FRONT_W, c: c, torso: torso, legs: legs, upper: upper, fore: fore, hand: hand,
    muscles: { pec: pec, delt: delt, biceps: biceps, vmo: vmo, calfIn: calfIn, calfOut: calfOut },
    abs: abs, absFill: r1(def), absO: r1(0.85 * def),
    lines: { major: armLines + ' ' + torsoLines, legs: legLines, fine: fine },
    majorO: majorO, legO: r1(0.15 + 0.7 * def), fineO: r1(0.7 * def),
    trunks: smooth([P(-hiW / 2 - 1, .485), P(hiW / 2 + 1, .485), P(legC + thW * 0.6, .557), P(legC - thW * 0.55, .562), P(0, .55), P(-(legC - thW * 0.55), .562), P(-(legC + thW * 0.6), .557)], true),
    shortsY: r1(Y(.485)), shortsH: r1(Y(.557) - Y(.485))
  };
}
export function side(m: M, bf: number) {
  var c = 62;
  var nD = cw(m.neck), chD = ed(m.chest, 1.35), waD = ed(m.waist, 1.3), hiD = ed(m.hips, 1.35);
  var thD = cw(m.thigh), caD = cw(m.calf), knD = cw(14.5 + (m.thigh - 23) * 0.2), ankD = cw(9);
  var fwd = 0.55 + clamp((bf - 12) / 40, 0, 0.15);
  var P: Pt[] = [
    [c - nD * 0.45, Y(.10)], [c - nD * 0.5, Y(.16)], [c - chD * 0.48, Y(.22)], [c - chD * 0.5, Y(.28)],
    [c - waD * (1 - fwd), Y(.40)], [c - hiD * 0.52, Y(.485)], [c - hiD * 0.42, Y(.545)], [c - thD * 0.5 + 1, Y(.62)],
    [c - knD * 0.45, Y(.72)], [c - caD * 0.62, Y(.79)], [c - ankD * 0.45, Y(.93)], [c - ankD * 0.6, Y(.99)],
    [c + 7.5 * IN, Y(.995)], [c + 3 * IN, Y(.965)], [c + ankD * 0.4, Y(.93)], [c + caD * 0.38, Y(.80)],
    [c + knD * 0.5, Y(.72)], [c + thD * 0.55, Y(.62)], [c + hiD * 0.42, Y(.52)], [c + waD * fwd, Y(.42)],
    [c + lerp(chD * 0.5, waD * fwd, .5), Y(.34)], [c + chD * 0.52, Y(.27)], [c + chD * 0.4, Y(.20)],
    [c + nD * 0.45, Y(.16)], [c + nD * 0.4, Y(.10)]
  ];
  var bD = cw(m.biceps) * 0.95, eD = cw(m.biceps * 0.78), fD = cw(m.biceps * 0.86), wD = cw(6.8), ax = c - 2;
  var A: Pt[] = [
    [ax - bD * 0.3, Y(.178)], [ax + bD * 0.3, Y(.18)], [ax + bD * 0.5, Y(.24)], [ax + bD * 0.56, Y(.295)], [ax + eD * 0.5, Y(.37)],
    [ax + fD * 0.58 + 1, Y(.41)], [ax + fD * 0.42 + 1, Y(.46)], [ax + wD * 0.5 + 1.5, Y(.5)], [ax + wD * 0.62 + 1.5, Y(.53)],
    [ax + wD * 0.3 + 1, Y(.565)], [ax - wD * 0.35, Y(.56)], [ax - wD * 0.55, Y(.525)], [ax - wD * 0.5, Y(.49)],
    [ax - fD * 0.48, Y(.425)], [ax - eD * 0.55, Y(.37)], [ax - bD * 0.56, Y(.29)], [ax - bD * 0.52, Y(.22)]
  ];
  var dD = bD * 1.05;
  var delt = smooth([[ax - dD * 0.5, Y(.19)], [ax - dD * 0.1, Y(.172)], [ax + dD * 0.45, Y(.185)], [ax + dD * 0.5, Y(.225)], [ax + bD * 0.1, Y(.262)], [ax - dD * 0.45, Y(.235)]], true);
  var biceps = smooth([[ax + bD * 0.1, Y(.24)], [ax + bD * 0.55, Y(.29)], [ax + eD * 0.3, Y(.36)], [ax + bD * 0.05, Y(.3)]], true);
  var def = clamp((22 - bf) / 9, 0, 1);
  var lines = 'M' + r1(c + chD * 0.3) + ' ' + r1(Y(.21)) + ' Q' + r1(c + chD * 0.56) + ' ' + r1(Y(.25)) + ' ' + r1(c + chD * 0.42) + ' ' + r1(Y(.29)) + // pec
    ' M' + r1(c - hiD * 0.5) + ' ' + r1(Y(.5)) + ' Q' + r1(c - hiD * 0.35) + ' ' + r1(Y(.55)) + ' ' + r1(c - thD * 0.3) + ' ' + r1(Y(.56)) + // glute
    ' M' + r1(c - caD * 0.2) + ' ' + r1(Y(.75)) + ' Q' + r1(c - caD * 0.62) + ' ' + r1(Y(.79)) + ' ' + r1(c - caD * 0.3) + ' ' + r1(Y(.85)) + // calf
    ' M' + r1(c + thD * 0.35) + ' ' + r1(Y(.58)) + ' Q' + r1(c + thD * 0.5) + ' ' + r1(Y(.65)) + ' ' + r1(c + knD * 0.3) + ' ' + r1(Y(.70)); // quad
  return { body: smooth(P, true), arm: smooth(A, true), delt: delt, biceps: biceps, lines: lines, lineO: r1(0.45 + 0.5 * def) };
}

export const SAMPLE: M = { neck: 15.5, shoulders: 47, chest: 40, biceps: 14, waist: 34, hips: 39, thigh: 23, calf: 15 };
