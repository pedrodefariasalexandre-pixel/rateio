/**
 * Dinheiro sempre em centavos inteiros. Portado do rateio-v3.html (v3.4) sem mudar regra.
 * Regra do Pedro: as divisões sempre fecham a soma no centavo.
 */

/** Valor DIGITADO (padrão brasileiro): "1.500" = mil e quinhentos; "1.5" e "50.00" = decimal. */
export const parseCents = (raw: unknown): number | null => centsOf(raw, true);

/** Valor do OFX: o ponto é sempre decimal ("1.500" = R$ 1,50). */
export const parseOfxCents = (raw: unknown): number | null => centsOf(raw, false);

function centsOf(raw: unknown, typed: boolean): number | null {
  let s = String(raw ?? '')
    .trim()
    .replace(/\s|R\$|\u00a0/gi, '');
  if (!s) return null;
  let sign = 1;
  if (s[0] === '-') {
    sign = -1;
    s = s.slice(1);
  } else if (s[0] === '+') {
    s = s.slice(1);
  }
  if (s.includes(',') && s.includes('.')) {
    s =
      s.lastIndexOf(',') > s.lastIndexOf('.')
        ? s.replace(/\./g, '').replace(',', '.')
        : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  } else if (typed && /^[1-9]\d{0,2}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return null;
  const frac = m[2] ?? '';
  let cents = Number(m[1]) * 100 + Number((frac + '00').slice(0, 2));
  if (frac.length > 2 && Number(frac[2]) >= 5) cents += 1; // arredonda a 3ª casa
  return Number.isSafeInteger(cents) ? sign * cents : null;
}

/** "1.234,56" (sem sinal). */
export const fmtV = (c: number): string => {
  const a = Math.abs(c);
  return Math.floor(a / 100).toLocaleString('pt-BR') + ',' + String(a % 100).padStart(2, '0');
};

/** "R$ 1.234,56" / "−R$ 1.234,56". */
export const fmtC = (c: number): string => (c < 0 ? '−' : '') + 'R$ ' + fmtV(c);

export const sum = (arr: readonly number[]): number => arr.reduce((a, b) => a + b, 0);

/** Divide em partes iguais sem perder centavo; o resto vai para as primeiras pessoas. */
export function splitEqual(total: number, n: number): number[] {
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const base = Math.floor(abs / n);
  const rem = abs - base * n;
  return Array.from({ length: n }, (_, i) => sign * (base + (i < rem ? 1 : 0)));
}

/** Divide proporcional aos pesos (maior resto); soma fecha no centavo. Pesos inválidos = null. */
export function splitWeighted(total: number, weights: readonly number[]): number[] | null {
  const W = sum(weights);
  if (!(W > 0) || !Number.isFinite(W) || weights.some((w) => !(w >= 0) || !Number.isFinite(w)))
    return null;
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const raw = weights.map((w) => Math.round(((abs * w) / W) * 1e6) / 1e6);
  const base = raw.map(Math.floor);
  let rem = abs - sum(base);
  const order = raw
    .map((r, i) => ({ i, f: r - (base[i] ?? 0) }))
    .sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; k < order.length && rem > 0; k++) {
    base[order[k]!.i]!++;
    rem--;
  }
  return base.map((v) => sign * v);
}
