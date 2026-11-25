/** Textos da revisão (iguais ao v3): motivo de "fora da divisão" e etiquetas de cada item. */
import { brDate, ddmm, ymToLabel } from '../../../lib/dates';
import { repeatGroup } from '../../../lib/memory';
import { fmtC } from '../../../lib/money';
import { PST, recOf } from '../../../lib/parcelas';
import type { Ctx, Tx } from '../../../lib/types';

export function reasonText(c: Ctx, t: Tx): string {
  const txs = c.inv.txs;
  switch (t.reason) {
    case 'pago': {
      const p = txs.find((x) => x.id === t.paidBy);
      return `Já pago: pagamento recebido de ${fmtC(Math.abs(t.cents))} em ${ddmm(p?.date)}.`;
    }
    case 'pagamento':
      if (t.payState === 'quitou') {
        const d = txs.find((x) => x.id === t.pays);
        return `Quitou a compra “${d?.memo || ''}” (${ddmm(d?.date)}).`;
      }
      if (t.payState === 'ambiguo')
        return `Mesmo valor de ${t.candidates?.length || 0} compras no mesmo período. Escolha qual foi paga:`;
      return 'Pagamento sem compra correspondente (provavelmente a fatura anterior). Só informativo.';
    case 'estorno':
      return 'Estorno: confira se deve abater de alguém. Por padrão fica fora.';
    case 'credito':
      return 'Crédito no cartão. Por padrão fica fora.';
    case 'suspeito':
      return 'Parece pagamento/ajuste, mesmo sendo cobrança. Confira.';
    case 'manual': {
      const r = recOf(c, t);
      return r?.status === PST.fora
        ? `Você tirou esta parcela da divisão em ${brDate(r.em)}. Fica guardado na memória de parcelas e vale em toda reimportação.`
        : 'Você tirou da divisão.';
    }
    case 'antecipado': {
      const r = recOf(c, t);
      const em = brDate(r?.em),
        fat = r?.comp ? ymToLabel(r.comp) : '?';
      const val =
        r?.valorPago != null
          ? ` Valor pago ${fmtC(r.valorPago)}${r.desconto ? `, desconto ${fmtC(r.desconto)}` : ''}.`
          : '';
      if (t.voltou === 'conferir')
        return `Parcela já marcada como paga, conferir no banco: foi paga antecipadamente em ${em} (fatura de ${fat}) e voltou cobrada nesta fatura. Fica fora da divisão até você decidir.`;
      if (t.voltou === 'fora')
        return `Paga antecipadamente em ${em} (fatura de ${fat}). Voltou cobrada nesta fatura e você decidiu manter fora em ${brDate(r?.voltas?.[c.inv.comp]?.em)}.`;
      return `Paga antecipadamente em ${em}.${val} Vale só para esta parcela e continua fora quando você importar de novo.`;
    }
    default:
      return '';
  }
}

export interface Badge {
  cls: string;
  text: string;
  title?: string;
}

/** Etiquetas da linha (data, parcela, memória, avisos), na ordem do v3. */
export function badgesOf(c: Ctx, t: Tx, eachBad: Set<string>): Badge[] {
  const b: Badge[] = [];
  const add = (cls: string, text: string, title?: string) => b.push({ cls, text, title });
  if (t.date) add('', ddmm(t.date));
  if (t.parcela) add('tag', `parcela ${t.parcela.cur}/${t.parcela.tot}`);
  if (t.charge) add('tag fix', 'cobrança fixa');
  if (t.auto && t.owners.length && !t.excluded) {
    if (t.memKind === 'nome')
      add(
        'tag warn',
        'memória · só pelo nome (valor novo)',
        'O valor não bate com nenhum já visto; a memória usou só o texto da compra. Confira o dono.',
      );
    else add('tag mem', 'memória');
  }
  if (t.memNote && !t.owners.length && !t.excluded)
    add(
      'tag warn',
      `⚠ memória não aplicada: ${t.memNote}`,
      'A memória não tinha certeza de quem paga. Escolha a pessoa.',
    );
  if (t.reason === 'pago') add('tag paid', 'já pago');
  const r = recOf(c, t);
  if (t.voltou === 'conferir') add('tag warn', '⚠ parcela já marcada como paga, conferir no banco');
  else if (t.voltou === 'incluir')
    add('tag warn', `paga antecipadamente em ${ddmm(r?.em)} · cobrada de novo, incluída por você`);
  else if (t.reason === 'antecipado') add('tag paid', `pago antecipadamente em ${ddmm(r?.em)}`);
  if (t.voltou === 'fora') add('tag', 'cobrada de novo · mantida fora');
  if (t.reason === 'manual' && r?.status === PST.fora)
    add('tag mem', `tirado da divisão em ${ddmm(r.em)} (memória)`);
  if (t.pconferir) add('tag warn', '⚠ conferir parcela');
  if (t.pvalorDif != null) add('tag warn', `valor diferente do registrado (${fmtC(t.pvalorDif)})`);
  if (t.paidBy && !t.excluded) add('tag paid', 'pago antes (incluído por você)');
  if (t.kind === 'pagamento')
    add(
      'tag paid',
      t.payState === 'quitou'
        ? 'pagamento de compra'
        : t.payState === 'ambiguo'
          ? 'pagamento a conferir'
          : 'fatura anterior',
    );
  if (t.kind === 'estorno') add('tag warn', 'estorno');
  if (t.fitidWarn) add('tag warn', `mesmo FITID — conferir: ${t.fitidWarn}`);
  if (!t.excluded && t.kind === 'compra' && !t.charge) {
    if (c.d.ruleEach[t.norm]) add('tag mem', 'uma para cada pessoa');
    else {
      const g = repeatGroup(c, t);
      if (g.length > 1) add('tag warn', `repetido ${g.length}× nesta fatura`);
    }
  }
  if (t.seqWarn && !t.excluded) add('tag warn', `parcela ${t.seqWarn}`);
  if (t.maybeDup) add('tag warn', 'possível cobrança duplicada');
  if (eachBad.has(t.id)) add('tag warn', '⚠ mesma pessoa em duas cobranças iguais');
  return b;
}
