import { showHeight, showLen, toCm, toInches } from './units';

describe('body units', () => {
  it('round-trips inches and cm', () => {
    expect(showLen(34.5, 'cm')).toBe(87.6);
    expect(showLen(34.5, 'in')).toBe(34.5);
    expect(toInches(87.63, 'cm')).toBeCloseTo(34.5, 2);
    expect(showHeight(185, 'in')).toBe(72.8);
    expect(toCm(72.8, 'in')).toBeCloseTo(184.9, 1);
  });
});
