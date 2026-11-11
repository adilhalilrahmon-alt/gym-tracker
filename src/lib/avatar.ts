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
export function front(m: M, bf: number) {
  var c = 100;
  var nW = cw(m.neck), shW = ew(m.shoulders, 1.6), chW = ew(m.chest, 1.35), waW = ew(m.waist, 1.3), hiW = ew(m.hips, 1.2);
  var thW = cw(m.thigh), caW = cw(m.calf), knW = cw(14.5 + (m.thigh - 23) * 0.2), ankW = cw(9);
  var legC = hiW / 2 - thW / 2, lc = legC * 0.85;
  var R: Pt[] = [
    [nW / 2, Y(.10)], [nW / 2 * 1.02, Y(.14)], [nW / 2 * 1.3, Y(.158)], [shW * 0.3, Y(.178)], [shW / 2 * 0.84, Y(.197)],
    [chW / 2, Y(.25)], [chW / 2 * 0.98, Y(.30)], [lerp(chW, waW, .6) / 2, Y(.35)], [waW / 2, Y(.40)],
    [hiW / 2 * 0.97, Y(.46)], [hiW / 2, Y(.50)], [legC + thW / 2, Y(.56)], [legC * 0.95 + thW / 2 * 0.88, Y(.64)],
    [lc + knW / 2, Y(.72)], [lc + caW / 2 + 1, Y(.79)], [lc + ankW / 2 + 1, Y(.93)], [lc + ankW / 2 + 5, Y(.985)],
    [lc - ankW / 2, Y(.99)], [lc - ankW / 2 + 1, Y(.93)], [lc - caW / 2 * 0.85, Y(.80)], [lc - knW / 2, Y(.72)],
    [Math.max(legC * 0.95 - thW / 2 * 0.88, 1.5), Y(.62)], [Math.max(legC - thW / 2, 1), Y(.56)], [0, Y(.535)]
  ];
  var pts = R.map(function (p: Pt): Pt { return [c + p[0], p[1]]; });
  var L = R.slice(0, R.length - 1).reverse().map(function (p: Pt): Pt { return [c - p[0], p[1]]; });
  var body = smooth(pts.concat(L), true);
  var bicW = cw(m.biceps) * 1.05, foreW = cw(m.biceps * 0.86), wrW = cw(6.8), elbW = cw(m.biceps * 0.78);
  var ex = shW / 2 - bicW * 0.42, wx = ex + 2;
  var A: Pt[] = [
    [shW / 2 * 0.66, Y(.19)], [shW / 2 * 0.9, Y(.192)], [shW / 2 + bicW * 0.06, Y(.212)], [shW / 2 + bicW * 0.08, Y(.24)], [ex + bicW / 2 + 1, Y(.29)],
    [ex + elbW / 2, Y(.38)], [wx + foreW / 2, Y(.42)], [wx + wrW / 2, Y(.50)], [wx + wrW / 2 + 1, Y(.545)],
    [wx, Y(.578)], [wx - wrW / 2 - 1, Y(.545)], [wx - wrW / 2, Y(.50)], [wx - foreW / 2 + 1, Y(.42)],
    [ex - elbW / 2, Y(.38)], [ex - bicW / 2, Y(.29)], [ex - bicW * 0.4, Y(.235)]
  ];
  var armR = smooth(A.map(function (p: Pt): Pt { return [c + p[0], p[1]]; }), true);
  var armL = smooth(A.map(function (p: Pt): Pt { return [c - p[0], p[1]]; }), true);
  var def = clamp((20 - bf) / 8, 0, 1);
  var pec = 'M' + r1(c + 2) + ' ' + r1(Y(.288)) + ' Q' + r1(c + chW * 0.3) + ' ' + r1(Y(.31)) + ' ' + r1(c + chW * 0.43) + ' ' + r1(Y(.255)) +
    ' M' + r1(c - 2) + ' ' + r1(Y(.288)) + ' Q' + r1(c - chW * 0.3) + ' ' + r1(Y(.31)) + ' ' + r1(c - chW * 0.43) + ' ' + r1(Y(.255));
  var midline = 'M' + c + ' ' + r1(Y(.305)) + ' L' + c + ' ' + r1(Y(.43));
  var abs = '';
  [.335, .365, .395].forEach(function (fy: number) {
    var hw = waW * 0.19;
    abs += ' M' + r1(c - hw) + ' ' + r1(Y(fy) + 1) + ' Q' + c + ' ' + r1(Y(fy) - 1.5) + ' ' + r1(c + hw) + ' ' + r1(Y(fy) + 1);
  });
  var vline = 'M' + r1(c + waW * 0.42) + ' ' + r1(Y(.41)) + ' Q' + r1(c + waW * 0.32) + ' ' + r1(Y(.45)) + ' ' + r1(c + waW * 0.16) + ' ' + r1(Y(.475)) +
    ' M' + r1(c - waW * 0.42) + ' ' + r1(Y(.41)) + ' Q' + r1(c - waW * 0.32) + ' ' + r1(Y(.45)) + ' ' + r1(c - waW * 0.16) + ' ' + r1(Y(.475));
  var quads = '';
  [1, -1].forEach(function (s: number) {
    quads += ' M' + r1(c + s * (legC - thW * 0.05)) + ' ' + r1(Y(.61)) + ' Q' + r1(c + s * (legC - thW * 0.32)) + ' ' + r1(Y(.68)) + ' ' + r1(c + s * (lc - knW * 0.12)) + ' ' + r1(Y(.705));
  });
  var delts = '';
  [1, -1].forEach(function (s: number) {
    delts += ' M' + r1(c + s * (shW / 2 * 0.8)) + ' ' + r1(Y(.2)) + ' Q' + r1(c + s * (ex - bicW * 0.1)) + ' ' + r1(Y(.23)) + ' ' + r1(c + s * (ex + bicW * 0.35)) + ' ' + r1(Y(.26));
  });
  return {
    body: body, armR: armR, armL: armL, pec: pec, midline: midline, abs: abs, vline: vline, quads: quads, delts: delts,
    pecO: r1(0.3 + 0.5 * def), absO: r1(0.75 * def), vO: r1(0.8 * def), quadO: r1(0.6 * def), deltO: r1(0.2 + 0.5 * def),
    shortsY: r1(Y(.465)), shortsH: r1(Y(.6) - Y(.465))
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
    [ax, Y(.175)], [ax + bD * 0.42, Y(.21)], [ax + bD * 0.55, Y(.29)], [ax + eD * 0.5, Y(.38)], [ax + fD * 0.5 + 1, Y(.42)],
    [ax + wD * 0.5 + 2, Y(.50)], [ax + 2, Y(.578)], [ax - wD * 0.5, Y(.50)], [ax - fD * 0.45, Y(.43)],
    [ax - eD * 0.5, Y(.38)], [ax - bD * 0.5, Y(.29)], [ax - bD * 0.45, Y(.20)]
  ];
  return { body: smooth(P, true), arm: smooth(A, true) };
}

export const SAMPLE: M = { neck: 15.5, shoulders: 47, chest: 40, biceps: 14, waist: 34, hips: 39, thigh: 23, calf: 15 };
