// Body sizes are stored in inches (measurements) and cm (height) so the avatar and
// body-fat maths never change. These helpers convert only for showing and typing.
export type BodyUnit = 'in' | 'cm';

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Stored inches → number in the chosen unit. */
export const showLen = (inches: number, u: BodyUnit) => r1(u === 'cm' ? inches * 2.54 : inches);
/** Typed number in the chosen unit → inches for storage. */
export const toInches = (n: number, u: BodyUnit) => (u === 'cm' ? n / 2.54 : n);
/** Stored height (cm) → chosen unit. */
export const showHeight = (cm: number, u: BodyUnit) => r1(u === 'in' ? cm / 2.54 : cm);
/** Typed height in the chosen unit → cm for storage. */
export const toCm = (n: number, u: BodyUnit) => (u === 'in' ? n * 2.54 : n);

// Body weight is stored in lb; kg is for showing and typing only. Lifts stay in lb.
export type WeightUnit = 'lb' | 'kg';
export const showW = (lb: number, u: WeightUnit) => r1(u === 'kg' ? lb / 2.2046226 : lb);
export const toLb = (n: number, u: WeightUnit) => (u === 'kg' ? n * 2.2046226 : n);
/** Stored height (cm) → feet and inches. */
export const feetInches = (cm: number) => { const total = Math.round(cm / 2.54); return { ft: Math.floor(total / 12), inch: total % 12 }; };
