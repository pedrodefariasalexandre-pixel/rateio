/** Texto da mensagem de cada pessoa (WhatsApp). A chave PIX vem das configurações, nunca do código. */
import { ymToLabel } from './dates';
import { fmtV, fracLabel, sum } from './money';
import { curProjection, projectionLine, type Projection } from './projection';
import { openBalances, type OpenBalance } from './receivables';
import { personById, tagById } from './state';
import { included, sharesOf, sortedOwners } from './split';
import { pixLabel } from './text';
import type { Ctx, Person, Tx } from './types';

export interface MsgContext {
  proj: Projection | null;
  open: OpenBalance[];
}

export const msgContext = (c: Ctx): MsgContext => ({
  proj: c.d.settings.msgProjection ? curProjection(c) : null,
  open: c.d.settings.msgPending ? openBalances(c, c.inv.comp) : [],
});

export const monthLabel = (c: Ctx): string => (c.inv.comp ? ymToLabel(c.inv.comp) : '');

export interface Message {
  p: Person;
  text: string;
  total: number;
  items: number;
}

export function buildMessage(c: Ctx, pid: string, ctx: MsgContext = msgContext(c)): Message | null {
  const p = personById(c, pid);
  const mine = included(c).filter((t) => t.owners.includes(pid));
  if (!p || !mine.length) return null;
  const s = c.d.settings;
  const lines = [`Resumo ${monthLabel(c)} — sua parte`.trim()];
  let total = 0;
  const push = (t: Tx) => {
    const share = sharesOf(c, t).shares[pid]!;
    total += share;
    let line = share < 0 ? `crédito ${fmtV(share)} — ${t.memo}` : `${fmtV(share)} — ${t.memo}`;
    if (t.parcela) line += ` (parc. ${t.parcela.cur}/${t.parcela.tot})`;
    if (t.owners.length > 1) {
      const owners = sortedOwners(c, t);
      const others = owners
        .filter((id) => id !== pid)
        .map((id) => personById(c, id)?.nome)
        .filter(Boolean)
        .join(', ');
      const part =
        (t.split?.mode || 'igual') === 'partes'
          ? fracLabel(
              Number(t.split.w?.[pid] ?? 1),
              sum(owners.map((id) => Number(t.split.w?.[id] ?? 1))),
            ) + ' '
          : '';
      line += ` [${part}de ${fmtV(Math.abs(t.cents))}, div. com ${others}]`;
    }
    const tn = (t.tags || []).map((id) => tagById(c, id)?.nome).filter(Boolean);
    if (tn.length) line += ` · tags: ${tn.join(', ')}`;
    lines.push(line);
  };
  const card = mine.filter((t) => !t.charge),
    fixed = mine.filter((t) => t.charge);
  if (card.length) {
    lines.push('', 'Cartão:');
    card.forEach(push);
  }
  if (fixed.length) {
    lines.push('', 'Outras cobranças:');
    fixed.forEach(push);
  }
  lines.push('', total < 0 ? `Total: a receber R$ ${fmtV(total)}` : `Total: R$ ${fmtV(total)}`);
  const pend = pid !== s.pixOwner ? ctx.open.find((e) => e.pid === pid) : null;
  if (pend) {
    lines.push('', 'Em aberto de meses anteriores:');
    pend.months.forEach((m) => lines.push(`${fmtV(m.remaining)} — ${m.label}`));
    lines.push(`Total com pendências: R$ ${fmtV(total + pend.total)}`);
  }
  if (ctx.proj) {
    const pl = projectionLine(ctx.proj, pid);
    if (pl) lines.push('', pl);
  }
  if (s.pix && pid !== s.pixOwner && total + (pend?.total || 0) > 0)
    lines.push('', `PIX (${pixLabel(s.pix)}): ${s.pix}`);
  return { p, text: lines.join('\n'), total, items: mine.length };
}

export const allMessages = (c: Ctx, ctx = msgContext(c)): Message[] =>
  c.d.people.map((p) => buildMessage(c, p.id, ctx)).filter((m): m is Message => !!m);

/** Link do WhatsApp com o texto (com o número, abre a conversa direto). */
export const waLink = (phone: string, text: string): string => {
  const d = (phone || '').replace(/\D/g, '');
  return (d ? `https://wa.me/${d}?text=` : 'https://wa.me/?text=') + encodeURIComponent(text);
};
