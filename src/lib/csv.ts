/** CSV para o Excel pt-BR (ponto e vírgula, vírgula decimal), protegido contra fórmula. */
import { brDate, dateBR } from './dates';
import { monthLabel } from './message';
import { fmtV } from './money';
import { personById, tagById } from './state';
import { sharesOf, sortedOwners } from './split';
import type { Ctx } from './types';

/** Texto que começa com = + - @ vira texto (nunca fórmula). */
export const csvText = (v: unknown): string => {
  const s = String(v ?? '');
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
};
const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvNum = (c: number) => (c < 0 ? '-' : '') + fmtV(c).replace(/\./g, '');
const toCsv = (rows: unknown[][]) =>
  '\uFEFF' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');

export const REASON: Record<string, string> = {
  pago: 'já pago',
  pagamento: 'pagamento',
  estorno: 'estorno',
  credito: 'crédito',
  suspeito: 'conferir',
  manual: 'fora (manual)',
  antecipado: 'pago antecipadamente',
};

export function csvMonth(c: Ctx): string {
  const rows: unknown[][] = [
    ['Competência', 'Data', 'Descrição', 'Valor', 'Parcela', 'Tags', 'Situação', 'Pessoa', 'Parte'],
  ];
  c.inv.txs.forEach((t) => {
    const base = [
      monthLabel(c),
      brDate(t.date),
      csvText(t.memo),
      csvNum(t.cents),
      t.parcela ? `${t.parcela.cur}/${t.parcela.tot}` : '',
      csvText(
        (t.tags || [])
          .map((id) => tagById(c, id)?.nome)
          .filter(Boolean)
          .join(', '),
      ),
    ];
    // pago antecipadamente nunca entra na coluna Pessoa/Parte
    if (t.excluded) {
      rows.push([
        ...base,
        (REASON[t.reason] || 'fora') +
          (t.voltou === 'conferir' ? ' (cobrada de novo, conferir no banco)' : ''),
        '',
        '',
      ]);
      return;
    }
    if (!t.owners.length) {
      rows.push([...base, 'sem dono', '', '']);
      return;
    }
    const r = sharesOf(c, t);
    sortedOwners(c, t).forEach((id) =>
      rows.push([
        ...base,
        t.charge ? 'cobrança fixa' : 'dividido',
        csvText(personById(c, id)?.nome || '?'),
        r.ok ? csvNum(r.shares[id]!) : '',
      ]),
    );
  });
  return toCsv(rows);
}

export function csvHistory(c: Ctx): string {
  const rows: unknown[][] = [
    [
      'Competência',
      'Fechado em',
      'Descrição',
      'Valor',
      'Parcela',
      'Tags',
      'Tipo',
      'Pessoa',
      'Parte',
    ],
  ];
  c.d.history
    .slice()
    .sort((a, b) => a.comp.localeCompare(b.comp))
    .forEach((h) =>
      (h.items || []).forEach((i) =>
        (i.shares || []).forEach((s) =>
          rows.push([
            h.label,
            dateBR(h.closedAt),
            csvText(i.memo),
            csvNum(i.cents),
            i.parcela ? `${i.parcela.cur}/${i.parcela.tot}` : '',
            csvText((i.tags || []).join(', ')),
            i.fixa ? 'cobrança fixa' : 'cartão',
            csvText(s.nome),
            csvNum(s.cents),
          ]),
        ),
      ),
    );
  return toCsv(rows);
}
