import { fmtC, parseCents, parseOfxCents, splitEqual, splitWeighted, sum } from './money';

describe('parseCents (valor digitado)', () => {
  it.each([
    ['1.500', 150000],
    ['12.345.678', 1234567800],
    ['1.5', 150],
    ['50.00', 5000],
    ['1.234,56', 123456],
    ['R$ 10,5', 1050],
    ['-3,00', -300],
    ['0,015', 2],
  ])('%s → %i', (raw, cents) => expect(parseCents(raw)).toBe(cents));

  it.each(['', 'abc', '1,2,3', null, undefined])('inválido: %s', (raw) =>
    expect(parseCents(raw)).toBeNull(),
  );
});

describe('parseOfxCents (ponto sempre decimal)', () => {
  it('trata "1.500" como R$ 1,50', () => expect(parseOfxCents('1.500')).toBe(150));
  it('lê negativos do OFX', () => expect(parseOfxCents('-89.90')).toBe(-8990));
});

describe('fmtC', () => {
  it('formata positivo e negativo', () => {
    expect(fmtC(123456)).toBe('R$ 1.234,56');
    expect(fmtC(-5)).toBe('−R$ 0,05');
  });
});

describe('splitEqual', () => {
  it('fecha a soma e dá o resto às primeiras pessoas', () => {
    expect(splitEqual(100, 3)).toEqual([34, 33, 33]);
    expect(splitEqual(-100, 3)).toEqual([-34, -33, -33]);
  });
  it('soma sempre igual ao total', () => {
    for (const [t, n] of [
      [1, 7],
      [99999, 4],
      [-12345, 6],
    ] as const)
      expect(sum(splitEqual(t, n))).toBe(t);
  });
});

describe('splitWeighted', () => {
  it('divide 1:2 e fecha no centavo', () => {
    expect(splitWeighted(100, [1, 2])).toEqual([33, 67]);
    expect(sum(splitWeighted(1001, [1, 1, 1])!)).toBe(1001);
  });
  it('recusa pesos inválidos', () => {
    expect(splitWeighted(100, [0, 0])).toBeNull();
    expect(splitWeighted(100, [1, -1])).toBeNull();
    expect(splitWeighted(100, [1, Infinity])).toBeNull();
  });
});
