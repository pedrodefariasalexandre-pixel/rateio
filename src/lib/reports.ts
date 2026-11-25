/** Relatórios dos meses fechados (por pessoa ou por tag). */
import { monthShort } from './dates';
import { sum } from './money';
import { seriesAcc, type ChartMonth, type Series } from './projection';
import { NEUTRAL, OTHER, personOrder, tagById, who } from './state';
import type { Ctx } from './types';

export type ReportMode = 'pessoa' | 'tag';
export type ReportPeriod = '3' | '6' | '12' | 'all';

export interface ReportData {
  months: ChartMonth[];
  series: Series[];
  value: (mk: string, sk: string) => number;
}

export function reportData(
  c: Ctx,
  mode: ReportMode,
  period: ReportPeriod,
  person = '',
): ReportData {
  const sel = c.d.history
    .slice()
    .sort((a, b) => a.comp.localeCompare(b.comp))
    .slice(period === 'all' ? 0 : -Number(period));
  const acc = seriesAcc();
  sel.forEach((h) =>
    (h.items || []).forEach((i) => {
      if (mode === 'pessoa') {
        (i.shares || []).forEach((s) => acc.add(h.comp, who(c, s, h), s.cents));
        return;
      }
      const amount = person ? (i.shares || []).find((s) => s.pid === person)?.cents || 0 : i.cents;
      const names = i.tags || [],
        ids = i.tagIds || [];
      const cats = names.map((n, k) => {
        const g = tagById(c, ids[k]) || c.d.tags.find((x) => x.nome === n);
        return g
          ? { key: 't:' + g.id, nome: g.nome, cor: g.cor }
          : { key: 'n:' + n, nome: n, cor: NEUTRAL };
      });
      (cats.length ? cats : [{ key: '__none', nome: 'Sem tag', cor: NEUTRAL }]).forEach((s) =>
        acc.add(h.comp, s, amount),
      );
    }),
  );
  let list = [...acc.series.values()];
  if (mode === 'pessoa') list.sort((a, b) => personOrder(c, a.key) - personOrder(c, b.key));
  else
    list.sort(
      (a, b) => Number(a.key === '__none') - Number(b.key === '__none') || b.total - a.total,
    );
  if (list.length > 7) {
    // nunca gerar uma 8ª cor: o resto vira "Outras"
    const keep = list.slice(0, 6),
      rest = list.slice(6),
      restKeys = new Set(rest.map((s) => s.key));
    Object.values(acc.val).forEach((m) => {
      let o = 0;
      restKeys.forEach((k) => {
        o += m[k] || 0;
        delete m[k];
      });
      if (o) m.__other = o;
    });
    list = [
      ...keep,
      {
        key: '__other',
        nome: `Outras (${rest.length})`,
        cor: OTHER,
        total: sum(rest.map((s) => s.total)),
      },
    ];
  }
  return {
    months: sel.map((h) => ({ key: h.comp, label: monthShort(h.comp), full: h.label })),
    series: list,
    value: acc.value,
  };
}

/** Topo "redondo" do eixo do gráfico. */
export function niceMax(v: number): number {
  if (v <= 0) return 10000;
  const p = Math.pow(10, Math.floor(Math.log10(v))),
    n = v / p;
  return [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => n <= s + 1e-9)! * p;
}

export const wholeBRL = (c: number): string => 'R$ ' + Math.round(c / 100).toLocaleString('pt-BR');
export const compactBRL = (c: number): string => {
  const v = c / 100;
  return v >= 1000
    ? 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil'
    : 'R$ ' + Math.round(v).toLocaleString('pt-BR');
};
