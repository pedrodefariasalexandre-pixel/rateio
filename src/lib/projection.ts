/** Projeção de parcelas futuras e acumulador de séries para os gráficos. */
import { addMonths, monthShort, ymToLabel } from './dates';
import { fmtV, sum } from './money';
import { skippedFutureParcels } from './parcelas';
import { personById, personOrder, who } from './state';
import { sharesOf, sortedOwners } from './split';
import type { Ctx, Month, Parcela } from './types';

export interface Series {
  key: string;
  nome: string;
  cor: string;
  total: number;
}

export interface ChartMonth {
  key: string;
  label: string;
  full: string;
}

/** Soma por mês e por série (pessoa ou tag). */
export function seriesAcc() {
  const series = new Map<string, Series>(),
    val: Record<string, Record<string, number>> = {};
  return {
    series,
    val,
    add(mk: string, s: { key: string; nome: string; cor?: string }, c: number) {
      if (!c) return;
      if (!series.has(s.key))
        series.set(s.key, { key: s.key, nome: s.nome, cor: s.cor || '', total: 0 });
      series.get(s.key)!.total += c;
      const m = (val[mk] ||= {});
      m[s.key] = (m[s.key] || 0) + c;
    },
    value: (mk: string, sk: string): number => val[mk]?.[sk] || 0,
  };
}

export interface ProjItem {
  memo: string;
  cents: number;
  parcela: Parcela | null;
  fixa: boolean;
  /** Números das parcelas futuras que a memória já tirou. */
  skip?: number[];
  shares: { key: string; nome: string; cor?: string; cents: number }[];
}

export interface ProjListItem extends ProjItem {
  parcela: Parcela;
  remaining: number;
  remainingCents: number;
  endComp: string;
  skipped: number;
}

export interface Projection {
  months: ChartMonth[];
  series: Series[];
  value: (mk: string, sk: string) => number;
  list: ProjListItem[];
  rec: ProjItem[];
  totalOf: (sk: string) => number;
  lastMonthOf: (sk: string) => string;
}

/** Repete a parcela atual nos meses seguintes (estimativa pelo valor da parcela atual). */
export function buildProjection(
  c: Ctx,
  items: ProjItem[],
  baseComp: string,
  opts: { recurring?: boolean } = {},
): Projection {
  const futureKs = (i: ProjItem) => {
    const s = new Set(i.skip || []),
      ks: number[] = [];
    for (let k = 1; k <= i.parcela!.tot - i.parcela!.cur; k++)
      if (!s.has(i.parcela!.cur + k)) ks.push(k);
    return ks;
  };
  const parc = items.filter(
    (i) => i.parcela && i.parcela.cur < i.parcela.tot && i.shares.length && futureKs(i).length,
  );
  const rec = opts.recurring ? items.filter((i) => i.fixa && !i.parcela && i.shares.length) : [];
  const horizon = Math.max(0, ...parc.map((i) => Math.max(...futureKs(i))));
  const months = Array.from({ length: horizon || (rec.length ? 6 : 0) }, (_, k) => {
    const key = addMonths(baseComp, k + 1);
    return { key, label: monthShort(key), full: ymToLabel(key) };
  });
  const acc = seriesAcc();
  parc.forEach((i) =>
    futureKs(i).forEach((k) => i.shares.forEach((s) => acc.add(months[k - 1]!.key, s, s.cents))),
  );
  rec.forEach((i) => months.forEach((m) => i.shares.forEach((s) => acc.add(m.key, s, s.cents))));
  const list = parc
    .map((i) => {
      const ks = futureKs(i),
        n = ks.length;
      return {
        ...i,
        parcela: i.parcela!,
        remaining: n,
        remainingCents: n * i.cents,
        endComp: addMonths(baseComp, Math.max(...ks)),
        skipped: (i.skip || []).length,
      };
    })
    .sort((a, b) => b.remainingCents - a.remainingCents || a.memo.localeCompare(b.memo));
  const value = acc.value;
  return {
    months,
    series: [...acc.series.values()].sort((a, b) => personOrder(c, a.key) - personOrder(c, b.key)),
    value,
    list,
    rec,
    totalOf: (sk) => sum(months.map((m) => value(m.key, sk))),
    lastMonthOf: (sk) => [...months].reverse().find((m) => value(m.key, sk) > 0)?.key || '',
  };
}

/** Itens da fatura aberta que entram na projeção (inclui parcela já paga neste mês). */
export function currentProjItems(c: Ctx): ProjItem[] {
  return c.inv.txs
    .filter((t) => t.owners.length && (!t.excluded || (t.reason === 'pago' && t.parcela)))
    .map((t): ProjItem | null => {
      const r = sharesOf(c, t);
      if (!r.ok) return null;
      return {
        memo: t.memo,
        cents: t.cents,
        parcela: t.parcela,
        fixa: !!t.charge,
        skip: skippedFutureParcels(c, t),
        shares: sortedOwners(c, t).map((id) => ({
          key: id,
          nome: personById(c, id)?.nome || '?',
          cor: personById(c, id)?.cor,
          cents: r.shares[id]!,
        })),
      };
    })
    .filter((x): x is ProjItem => !!x);
}

export const curProjection = (c: Ctx): Projection =>
  buildProjection(c, currentProjItems(c), c.inv.comp, { recurring: c.d.settings.projRecurring });

export function historyProjItems(c: Ctx, h: Month): ProjItem[] {
  return (h.items || []).map((i) => ({
    memo: i.memo,
    cents: i.cents,
    parcela: i.parcela,
    fixa: i.fixa,
    shares: (i.shares || []).map((s) => ({ ...who(c, s, h), cents: s.cents })),
  }));
}

/** Linha da mensagem: "nov/26 R$ 120,00 · dez/26 R$ 80,00 (até jan/27, total ...)". */
export function projectionLine(pr: Projection, pid: string): string {
  const ms = pr.months.filter((m) => pr.value(m.key, pid) > 0);
  if (!ms.length) return '';
  const shown = ms
    .slice(0, 4)
    .map((m) => `${m.label} R$ ${fmtV(pr.value(m.key, pid))}`)
    .join(' · ');
  return `Parcelas já comprometidas nos próximos meses: ${shown}${ms.length > 4 ? ' · …' : ''} (até ${monthShort(pr.lastMonthOf(pid))}, total R$ ${fmtV(pr.totalOf(pid))})`;
}
