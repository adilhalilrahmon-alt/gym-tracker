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
