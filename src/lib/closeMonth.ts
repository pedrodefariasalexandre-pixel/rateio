/** Fechar o mês: foto no histórico, avanço das cobranças fixas e decisões de parcela gravadas. Tudo ou nada. */
import { advanceCharges } from './charges';
import { allMessages, monthLabel, msgContext } from './message';
import { PST, isOutStatus, recOf, setParcel } from './parcelas';
import { personById, tagById } from './state';
import { computeTotals, included, sharesOf, sortedOwners, stateOf } from './split';
import type { Ctx, HistFora, Month } from './types';

export const canClose = (c: Ctx): boolean => {
  const st = stateOf(c);
  return !!st.inc.length && !st.todo && !st.invalid && !st.viol && computeTotals(c).check;
};

/** Fecha (ou refecha) a competência aberta. msgEdits: textos editados à mão na tela de mensagens. */
export function closeMonth(c: Ctx, msgEdits: Map<string, string>, now = new Date()): Month {
  const comp = c.inv.comp,
    label = monthLabel(c),
    d = c.d;
  const prev = d.history.find((h) => h.comp === comp);
  const chargesBefore = prev?.chargesBefore || structuredClone(d.charges);
  d.charges = advanceCharges(d.charges, comp, label);

  const cards = allMessages(c, msgContext(c));
  const fi = c.inv.fileInfo;
  const entry: Month = {
    id: now.getTime(),
    comp,
    label,
    closedAt: now.toISOString(),
    signature: fi?.signature || '',
    keys: fi?.keys || [],
    file: fi?.name || '',
    chargesBefore,
    totalCents: computeTotals(c).assigned,
    people: cards.map((m) => ({
      pid: m.p.id,
      nome: m.p.nome,
      cor: m.p.cor,
      total: m.total,
      text: msgEdits.get(m.p.id) ?? m.text,
      payments: (prev?.people || []).find((x) => x.pid === m.p.id)?.payments || [], // refechar mantém os pagamentos
    })),
    items: included(c)
      .filter((t) => t.owners.length)
      .map((t) => {
        const r = sharesOf(c, t);
        return {
          memo: t.memo,
          cents: t.cents,
          parcela: t.parcela,
          fixa: !!t.charge,
          tags: (t.tags || []).map((id) => tagById(c, id)?.nome).filter((n): n is string => !!n),
          tagIds: (t.tags || []).filter((id) => tagById(c, id)),
          shares: sortedOwners(c, t).map((id) => ({
            pid: id,
            nome: personById(c, id)?.nome || '?',
            cor: personById(c, id)?.cor,
            cents: r.shares[id]!,
          })),
        };
      }),
    fora: c.inv.txs
      .filter((t) => t.excluded)
      .map((t) => {
        const r = recOf(c, t),
          o: HistFora = { memo: t.memo, cents: t.cents, motivo: t.reason, parcela: t.parcela };
        if (t.pkey && isOutStatus(r))
          Object.assign(o, {
            status: r!.status,
            chave: t.pkey,
            em: r!.em,
            valorPago: r!.valorPago,
            desconto: r!.desconto,
          });
        return o;
      }),
  };
  // se a memória de parcelas foi apagada com a fatura aberta, o fechamento grava de novo o que está fora
  c.inv.txs
    .filter(
      (t) =>
        t.pkey &&
        t.excluded &&
        (t.reason === 'antecipado' || t.reason === 'manual') &&
        !isOutStatus(recOf(c, t)),
    )
    .forEach((t) => {
      const o = entry.fora.find((f) => f.memo === t.memo && f.cents === t.cents && !f.status);
      const r = setParcel(c, t, t.reason === 'antecipado' ? PST.pago : PST.fora, {
        origem: 'fechamento',
      });
      if (o && r) Object.assign(o, { status: r.status, chave: t.pkey, em: r.em });
    });
  d.history = [entry, ...d.history.filter((h) => h.comp !== comp)].sort((a, b) =>
    b.comp.localeCompare(a.comp),
  );
  c.hIdx = null;
  return entry;
}

/** O mais recente fechado (só ele pode ser desfeito). */
export const latestClosed = (c: Ctx): Month | null =>
  c.d.history.reduce<Month | null>((a, b) => (!a || b.closedAt > a.closedAt ? b : a), null);

/** "Desfazer fechamento": cobranças voltam a como estavam e o mês sai do histórico. */
export function undoClose(c: Ctx, h: Month): void {
  if (h.chargesBefore) c.d.charges = structuredClone(h.chargesBefore);
  removeMonth(c, h);
}

export function removeMonth(c: Ctx, h: Month): void {
  c.d.history = c.d.history.filter((x) => x !== h);
  c.hIdx = null;
}
