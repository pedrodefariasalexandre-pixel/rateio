/** Competência AAAA-MM, só meses 01 a 12. */
export const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];
const MES_CURTO = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

/** "2026-10" → "Outubro/2026". */
export const ymToLabel = (ym: string): string => {
  const [y, m] = String(ym ?? '').split('-');
  return MESES[+(m ?? 0) - 1] + '/' + y;
};

/** "2026-10" → "out/26". */
export const monthShort = (ym: string): string =>
  MES_CURTO[+String(ym).slice(5, 7) - 1] + '/' + String(ym).slice(2, 4);

/** Data que existe no calendário (2026-02-30 não). */
export const isRealDate = (iso: unknown): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof iso === 'string' ? iso : '');
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return (
    d.getUTCFullYear() === +m[1]! && d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]!
  );
};

/** "2026-10-15" → "15/10". */
export const ddmm = (iso?: string): string => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');

/** "2026-10-15" → "15/10/2026". */
export const brDate = (iso?: string | null): string =>
  iso ? String(iso).split('-').reverse().join('/') : '';

/** Data e hora ISO → dd/mm/aaaa. */
export const dateBR = (iso: string): string => new Date(iso).toLocaleDateString('pt-BR');

export function addMonths(ym: string, k: number): string {
  let [y, m] = ym.split('-').map(Number) as [number, number];
  m += k;
  y += Math.floor((m - 1) / 12);
  m = ((((m - 1) % 12) + 12) % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

export const monthsBetween = (a: string, b: string): number => {
  const [ya, ma] = a.split('-').map(Number) as [number, number];
  const [yb, mb] = b.split('-').map(Number) as [number, number];
  return (yb - ya) * 12 + (mb - ma);
};

export const dayDiff = (a: string, b: string): number =>
  Math.round(
    (Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)) -
      Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))) /
      864e5,
  );

/** Hoje no fuso local (AAAA-MM-DD). */
export const todayISO = (d = new Date()): string =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export const daysSince = (iso: string, now = Date.now()): number | null =>
  iso ? Math.floor((now - new Date(iso).getTime()) / 864e5) : null;
