/** Montar a fatura a partir do OFX (importStatement) e os avisos derivados dela. */
import { YM_RE, monthsBetween, ymToLabel } from './dates';
import { chargesForComp, chargeToTx, hasCharges } from './charges';
import { applyEachRules, byDate, historyIndex, memoryFor } from './memory';
import { buySignOf, detectPaid, itemKey, mergeByFitid, type ParsedOfx } from './ofx';
import { applyParcelMemory, assignParcelKeys } from './parcelas';
import { personById } from './state';
import { memTags, tagKey } from './tags';
import { cyrb53, normalize, parseParcela, purchaseDateOf } from './text';
import type { Ctx, Kind, Tx } from './types';

export type ImportResult = { ok: true } | { ok: false; msg: string };

/**
 * Lê a fatura para a revisão. Ordem obrigatória: competência → itens → memória de donos → chaves de parcela →
 * tags lembradas → memória de parcelas → pagamentos que quitaram compras → "uma para cada" → cobranças fixas.
 * parsed = null: só cobranças fixas (sem OFX).
 */
export function importStatement(c: Ctx, parsed: ParsedOfx | null, name = ''): ImportResult {
  const lines = parsed ? parsed.lines : [];
  const skipped = parsed?.skipped || [];
  if (!lines.length && !hasCharges(c.d.charges))
    return {
      ok: false,
      msg: skipped.length
        ? `Nenhum lançamento lido: ${skipped.length} linha(s) com valor que o app não entende (ex.: “${skipped[0]!.raw}”). Confira o arquivo.`
        : 'Nenhum lançamento encontrado. Confira se é o OFX da fatura do cartão.',
    };
  const merged = mergeByFitid(lines);
  const buySign = buySignOf(lines);
  const acct = parsed?.acct || '';

  // competência: mês de fechamento do arquivo (DTEND); senão, o mês mais frequente; senão, hoje
  let ym =
    parsed && (parsed.dtEnd || parsed.dtStart) ? (parsed.dtEnd || parsed.dtStart).slice(0, 7) : '';
  if (!YM_RE.test(ym)) ym = '';
  if (!ym) {
    const f: Record<string, number> = {};
    lines.forEach((l) => {
      if (l.date) {
        const k = l.date.slice(0, 7);
        f[k] = (f[k] || 0) + 1;
      }
    });
    ym =
      (Object.entries(f).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || [])[0] || '';
  }
  if (!ym) ym = c.today.slice(0, 7);
  if (!lines.length && !chargesForComp(c.d.charges, ym).length)
    return {
      ok: false,
      msg: `Nenhuma cobrança fixa vale para ${ymToLabel(ym)}. Confira as parcelas em Cobranças fixas.`,
    };
  c.inv.comp = ym;

  const txs: Tx[] = merged.map((t, i) => {
    const norm = normalize(t.memo);
    const isBuy = Math.sign(t.cents) === buySign;
    let kind: Kind = 'compra';
    if (!isBuy)
      kind = /PAGAMENTO/.test(norm) ? 'pagamento' : /ESTORNO/.test(norm) ? 'estorno' : 'credito';
    else if (/PAGAMENTO|ESTORNO|CREDITO DE|AJUSTE/.test(norm)) kind = 'suspeito';
    return {
      id: 't' + i,
      kind,
      fitid: t.fitid,
      memo: t.memo,
      norm,
      cents: buySign < 0 ? -t.cents : t.cents,
      date: t.date,
      parcela: parseParcela(t.memo),
      owners: [],
      split: { mode: 'igual' },
      auto: false,
      remember: true,
      excluded: kind !== 'compra',
      reason: kind === 'compra' ? '' : kind,
      sources: t.sources,
      dup: t.dup,
      fitidWarn: t.fitidWarn || '',
      acct,
      dataCompra: kind === 'compra' ? purchaseDateOf(t.memo) : '',
      tags: [],
    };
  });
  c.inv.txs = txs;
  // memória de donos por texto + valor
  c.hIdx = null;
  const hx = historyIndex(c),
    cnt = new Map<string, number>();
  txs.forEach((t) => {
    if (t.kind === 'compra') cnt.set(t.norm, (cnt.get(t.norm) || 0) + 1);
  });
  txs.forEach((t) => {
    if (t.kind !== 'compra' || c.d.ruleEach[t.norm]) return;
    const m = memoryFor(c, t, cnt.get(t.norm) || 1, hx);
    if (!m) return;
    if ('why' in m) {
      t.memNote = m.why;
      return;
    }
    t.owners = m.owners;
    t.split = m.split;
    t.auto = true;
    t.memKind = m.kind;
  });
  assignParcelKeys(c, txs);
  // tags lembradas pelo estabelecimento; PAGO nunca volta pela memória
  txs.forEach((t) => {
    if (t.kind === 'compra') t.tags = memTags(c, c.d.ruleTags[tagKey(t)!]);
  });
  applyParcelMemory(c); // antes de detectPaid: item já fora pela memória não consome um "Pagamento recebido"
  detectPaid(txs);
  applyEachRules(c);
  c.inv.txs = txs.concat(chargesForComp(c.d.charges, ym).map((ch) => chargeToTx(c, ch)));

  const keys = lines.map(itemKey).sort();
  c.inv.fileInfo = {
    lines,
    skipped,
    buySign,
    ledger: parsed ? parsed.ledger : null,
    keys,
    signature: keys.length ? cyrb53(keys.join('\n')) : '',
    name: name || '',
    acct,
  };
  return { ok: true };
}

export interface InstallmentCheck {
  /** Parcelas do mês anterior que não vieram. */
  missing: { memo: string; cur: number; tot: number; cents: number }[];
  prevLabel: string;
}

/** Sequência de parcelas comparada ao último mês fechado (marca t.seqWarn). */
export function checkInstallments(c: Ctx): InstallmentCheck {
  const res: InstallmentCheck = { missing: [], prevLabel: '' };
  const { txs, comp } = c.inv;
  txs.forEach((t) => delete t.seqWarn);
  if (!comp) return res;
  const h = c.d.history
    .filter((x) => x.comp < comp)
    .sort((a, b) => b.comp.localeCompare(a.comp))[0];
  if (!h) return res;
  const gap = monthsBetween(h.comp, comp);
  if (gap < 1 || gap > 12) return res;
  res.prevLabel = h.label;
  const prev = [...(h.items || []), ...(h.fora || [])]
    .filter((i) => i.parcela && !('fixa' in i && i.fixa))
    .map((i, ix) => ({
      ...i,
      parcela: i.parcela!,
      ix,
      norm: normalize(i.memo),
      abs: Math.abs(i.cents),
    }));
  const used = new Set<number>();
  txs
    .filter((t) => t.parcela && !t.charge && t.kind === 'compra')
    .sort(byDate)
    .forEach((t) => {
      const cands = prev.filter(
        (p) => !used.has(p.ix) && p.norm === t.norm && p.parcela.tot === t.parcela!.tot,
      );
      if (!cands.length) return;
      const score = (p: (typeof prev)[number]) =>
        (p.parcela.cur + gap === t.parcela!.cur ? 0 : 2) +
        (Math.abs(p.abs - Math.abs(t.cents)) <= 1 ? 0 : 1);
      const p = cands.sort((a, b) => score(a) - score(b) || a.ix - b.ix)[0]!;
      used.add(p.ix);
      if (p.parcela.cur >= p.parcela.tot)
        t.seqWarn = `já tinha terminado em ${h.label} (${p.parcela.cur}/${p.parcela.tot})`;
      else if (p.parcela.cur + gap !== t.parcela!.cur)
        t.seqWarn = `esperada ${p.parcela.cur + gap}/${p.parcela.tot} (em ${h.label} foi ${p.parcela.cur}/${p.parcela.tot})`;
    });
  res.missing = prev
    .filter((p) => !used.has(p.ix) && p.parcela.cur + gap <= p.parcela.tot)
    .map((p) => ({ memo: p.memo, cur: p.parcela.cur + gap, tot: p.parcela.tot, cents: p.abs }));
  return res;
}

/** Possível cobrança duplicada: mesma loja, valor e dia (marca t.maybeDup). */
export function markDuplicates(c: Ctx): void {
  const groups = new Map<string, Tx[]>();
  c.inv.txs.forEach((t) => delete t.maybeDup);
  c.inv.txs
    .filter(
      (t) => t.kind === 'compra' && !t.charge && !t.excluded && t.date && !c.d.ruleEach[t.norm],
    )
    .forEach((t) => {
      const k = t.norm + '|' + t.cents + '|' + t.date;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(t);
    });
  groups.forEach((g) => {
    if (g.length > 1) g.forEach((t) => (t.maybeDup = g.length));
  });
}

/** Tira dos itens as pessoas que não existem mais (o item volta a ficar sem dono). Devolve quantos mudaram. */
export function releaseMissingOwners(c: Ctx): number {
  let n = 0;
  c.inv.txs.forEach((t) => {
    const keep = (t.owners || []).filter((id) => personById(c, id));
    if (keep.length === t.owners.length) return;
    n++;
    t.owners = keep;
    t.auto = false;
    for (const m of [t.split?.w, t.split?.v])
      if (m)
        Object.keys(m).forEach((id) => {
          if (!personById(c, id)) delete m[id];
        });
    if (keep.length < 2) t.split = { mode: 'igual' };
  });
  return n;
}
