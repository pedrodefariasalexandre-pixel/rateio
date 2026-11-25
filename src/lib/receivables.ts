/** Recebimentos: quanto cada pessoa ainda deve dos meses fechados. O dono do cartão nunca fica "em aberto". */
import { isRealDate } from './dates';
import { fmtC, sum } from './money';
import { personOrder, who } from './state';
import type { Ctx, HistPerson } from './types';

export const dueOf = (hp: HistPerson): number => Math.max(0, hp.total || 0);
export const paidOf = (hp: HistPerson): number => sum((hp.payments || []).map((x) => x.cents));
export const isReceivable = (c: Ctx, hp: HistPerson): boolean =>
  dueOf(hp) > 0 && !(hp.pid && hp.pid === c.d.settings.pixOwner);
export const remainingOf = (c: Ctx, hp: HistPerson): number =>
  isReceivable(c, hp) ? Math.max(0, dueOf(hp) - paidOf(hp)) : 0;

export interface OpenBalance {
  key: string;
  nome: string;
  cor: string;
  pid?: string;
  months: { comp: string; label: string; hid: string | number; remaining: number }[];
  total: number;
}

/** Saldos em aberto por pessoa (mais antigo primeiro). untilComp: só meses ANTERIORES a ele. */
export function openBalances(c: Ctx, untilComp?: string): OpenBalance[] {
  const map = new Map<string, OpenBalance>();
  c.d.history
    .filter((h) => !untilComp || h.comp < untilComp)
    .sort((a, b) => a.comp.localeCompare(b.comp))
    .forEach((h) =>
      (h.people || []).forEach((hp) => {
        const rem = remainingOf(c, hp);
        if (rem <= 0) return;
        const id = who(c, hp, h),
          e = map.get(id.key) || { ...id, pid: hp.pid, months: [], total: 0 };
        e.months.push({ comp: h.comp, label: h.label, hid: h.id, remaining: rem });
        e.total += rem;
        map.set(id.key, e);
      }),
    );
  return [...map.values()].sort((a, b) => personOrder(c, a.pid) - personOrder(c, b.pid));
}

export function payStatus(c: Ctx, hp: HistPerson): { cls: string; txt: string } {
  if (hp.pid && hp.pid === c.d.settings.pixOwner) return { cls: '', txt: 'dono do cartão' };
  if (dueOf(hp) <= 0)
    return { cls: '', txt: (hp.total || 0) < 0 ? 'tem a receber' : 'nada a cobrar' };
  const rem = remainingOf(c, hp);
  if (rem <= 0) return { cls: 'mem', txt: 'pago ✓' };
  return paidOf(hp) > 0
    ? { cls: 'warn', txt: `parcial · falta ${fmtC(rem)}` }
    : { cls: 'warn', txt: 'em aberto' };
}

/**
 * Registra um pagamento. key = "sum:<pessoa>" distribui do mês mais antigo para o mais novo;
 * key = "<idDoMês>:<posição>" vale só para aquele mês. Devolve a mensagem de erro, ou "" se gravou.
 */
export function savePayment(c: Ctx, key: string, cents: number | null, date: string): string {
  if (!(cents! > 0)) return 'Informe um valor maior que zero';
  if (!isRealDate(date)) return 'Informe uma data válida';
  const stamp = Date.now();
  if (key.startsWith('sum:')) {
    const e = openBalances(c).find((x) => x.key === key.slice(4));
    if (!e) return 'Nada em aberto para esta pessoa';
    if (cents! > e.total) return `Maior que o total em aberto (${fmtC(e.total)})`;
    let left = cents!;
    for (const m of e.months) {
      if (!left) break;
      const h = c.d.history.find((x) => x.id === m.hid)!,
        hp = h.people.find((p) => who(c, p, h).key === e.key)!;
      const take = Math.min(left, m.remaining);
      hp.payments = hp.payments || [];
      hp.payments.push({ id: stamp + '-' + m.hid, cents: take, date });
      left -= take;
    }
    return '';
  }
  const [hid, i] = key.split(':');
  const h = c.d.history.find((x) => String(x.id) === hid),
    hp = h?.people[+i!];
  if (!hp) return 'Mês não encontrado';
  const rem = remainingOf(c, hp);
  if (cents! > rem) return `Maior que o valor em aberto (${fmtC(rem)})`;
  hp.payments = hp.payments || [];
  hp.payments.push({ id: String(stamp), cents: cents!, date });
  return '';
}

export function deletePayment(c: Ctx, hid: string, pos: number, j: number): void {
  const hp = c.d.history.find((x) => String(x.id) === hid)?.people[pos];
  hp?.payments.splice(j, 1);
}
