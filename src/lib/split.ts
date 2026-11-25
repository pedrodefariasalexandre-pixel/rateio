import { fmtC, fracLabel, splitEqual, splitWeighted, sum } from './money';
import { personOrder } from './state';
import type { Ctx, Tx } from './types';

export const sortedOwners = (c: Ctx, t: Pick<Tx, 'owners'>): string[] =>
  t.owners.slice().sort((a, b) => personOrder(c, a) - personOrder(c, b));

export interface Shares {
  shares: Record<string, number>;
  ok: boolean;
  msg?: string;
}

/** Parte de cada dono. Quando ok, a soma fecha com o valor do item. */
export function sharesOf(c: Ctx, t: Tx): Shares {
  const owners = sortedOwners(c, t),
    total = t.cents,
    res: Record<string, number> = {};
  if (!owners.length) return { shares: res, ok: false, msg: 'sem dono' };
  const mode = owners.length === 1 ? 'igual' : t.split?.mode || 'igual';
  let parts: number[] | null;
  if (mode === 'partes') {
    parts = splitWeighted(
      total,
      owners.map((id) => Number(t.split.w?.[id] ?? 1)),
    );
    if (!parts) return { shares: res, ok: false, msg: 'partes inválidas' };
  } else if (mode === 'valor') {
    const vals = owners.map((id) => t.split.v?.[id]);
    if (vals.some((v) => v == null)) return { shares: res, ok: false, msg: 'preencha os valores' };
    const diff = total - sum(vals as number[]);
    owners.forEach((id, i) => (res[id] = vals[i]!));
    if (diff !== 0)
      return {
        shares: res,
        ok: false,
        msg: diff > 0 ? `faltam ${fmtC(diff)}` : `sobram ${fmtC(-diff)}`,
      };
    return { shares: res, ok: true };
  } else parts = splitEqual(total, owners.length);
  owners.forEach((id, i) => (res[id] = parts![i]!));
  return { shares: res, ok: true };
}

export function splitSummary(c: Ctx, t: Tx): string {
  const owners = sortedOwners(c, t);
  if (owners.length < 2) return '';
  const mode = t.split?.mode || 'igual';
  if (mode === 'igual') return '÷ igual';
  if (mode === 'valor') return '÷ por valor';
  const ws = owners.map((id) => Number(t.split.w?.[id] ?? 1)),
    W = sum(ws);
  return '÷ ' + ws.map((w) => fracLabel(w, W)).join(' · ');
}

export const included = (c: Ctx): Tx[] => c.inv.txs.filter((t) => !t.excluded);

export function computeTotals(c: Ctx) {
  const tot: Record<string, number> = {};
  c.d.people.forEach((p) => (tot[p.id] = 0));
  let assigned = 0,
    bad = 0;
  included(c).forEach((t) => {
    if (!t.owners.length) return;
    const r = sharesOf(c, t);
    if (!r.ok) {
      bad++;
      return;
    }
    assigned += t.cents;
    Object.entries(r.shares).forEach(([id, v]) => {
      if (id in tot) tot[id]! += v;
    });
  });
  return { tot, assigned, bad, check: sum(Object.values(tot)) === assigned };
}

/** Itens de um grupo "uma para cada" em que a mesma pessoa aparece em mais de uma cobrança. */
export function eachViolations(c: Ctx): Set<string> {
  const bad = new Set<string>();
  Object.keys(c.d.ruleEach).forEach((norm) => {
    const seen = new Map<string, string>();
    c.inv.txs
      .filter((t) => t.norm === norm && t.kind === 'compra' && !t.charge && !t.excluded)
      .forEach((t) => {
        t.owners.forEach((pid) => {
          if (seen.has(pid)) {
            bad.add(t.id);
            bad.add(seen.get(pid)!);
          } else seen.set(pid, t.id);
        });
      });
  });
  return bad;
}

/** O que trava "Gerar mensagens" e "Fechar mês". */
export function stateOf(c: Ctx) {
  const inc = included(c);
  const todo = inc.filter((t) => !t.owners.length).length;
  const invalid = inc.filter((t) => t.owners.length && !sharesOf(c, t).ok).length;
  const ambig = c.inv.txs.filter(
    (t) => t.kind === 'pagamento' && t.payState === 'ambiguo' && t.excluded,
  ).length;
  const viol = eachViolations(c).size;
  return { inc, todo, invalid, ambig, viol };
}
