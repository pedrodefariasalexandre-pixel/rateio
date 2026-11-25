/**
 * Cobranças fixas (empréstimos, outros cartões, assinaturas fora do OFX).
 * Parcelada: parcAtual vale para a competência parcComp. Para outra competência X: n = parcAtual + meses(parcComp→X).
 * n fora de 1…total = não entra naquela fatura e aparece num aviso. Sem parcela, repete todo mês.
 */
import { YM_RE, addMonths, monthShort, monthsBetween } from './dates';
import { parseCents } from './money';
import { isActive, personOrder } from './state';
import { clean } from './text';
import { memTags } from './tags';
import type { Charge, Ctx, Split, Tx } from './types';

export type ChargeState =
  | { state: 'mensal' }
  | { state: 'semAncora' | 'ativa'; cur: number; tot: number }
  | { state: 'naoComecou'; cur: number; tot: number; start: string }
  | { state: 'terminou'; cur: number; tot: number; end: string };

export function chargeCur(
  c: Pick<Charge, 'parcTotal' | 'parcAtual' | 'parcComp'>,
  ym: string,
): ChargeState {
  const tot = +c.parcTotal,
    at = +c.parcAtual;
  if (!(tot >= 1 && at >= 1)) return { state: 'mensal' };
  if (!YM_RE.test(c.parcComp || '') || !YM_RE.test(ym || ''))
    return { state: 'semAncora', cur: at, tot };
  const n = at + monthsBetween(c.parcComp, ym);
  if (n < 1) return { state: 'naoComecou', cur: n, tot, start: addMonths(ym, 1 - n) };
  if (n > tot) return { state: 'terminou', cur: n, tot, end: addMonths(ym, tot - n) };
  return { state: 'ativa', cur: n, tot };
}

export const chargeInComp = (c: Charge, ym: string): boolean =>
  ['mensal', 'ativa', 'semAncora'].includes(chargeCur(c, ym).state);
export const chargeCents = (c: Charge): number | null => parseCents(String(c.valor));
export const hasCharges = (charges: Charge[]): boolean =>
  charges.some((c) => (chargeCents(c) ?? 0) > 0);
export const chargesForComp = (charges: Charge[], ym: string): Charge[] =>
  charges.filter((c) => (chargeCents(c) ?? 0) > 0 && chargeInComp(c, ym));

/** As que ficam de fora desta competência, com o motivo (nada some sem aviso). */
export function chargesOutside(charges: Charge[], ym: string): { nome: string; why: string }[] {
  return charges
    .filter((c) => (chargeCents(c) ?? 0) > 0 && !chargeInComp(c, ym))
    .map((c) => {
      const s = chargeCur(c, ym);
      return {
        nome: clean(c.nome) || '(cobrança)',
        why:
          s.state === 'terminou'
            ? `terminou em ${monthShort(s.end)}`
            : `só começa em ${monthShort((s as { start: string }).start)}`,
      };
    });
}

export function chargeSplit(ctx: Ctx, c: Charge): Split {
  const owners = (c.owners || []).filter((id) => isActive(ctx, id));
  if (owners.length < 2 || !c.w) return { mode: 'igual' };
  const ws = owners.map((id) => Number(c.w![id] ?? 1));
  if (ws.some((w) => !(w > 0)) || ws.every((w) => w === ws[0])) return { mode: 'igual' };
  const w: Record<string, number> = {};
  owners.forEach((id, i) => (w[id] = ws[i]!));
  return { mode: 'partes', w };
}

export function chargeToTx(ctx: Ctx, c: Charge): Tx {
  const pc = chargeCur(c, ctx.inv.comp);
  return {
    id: 'c' + c.id,
    kind: 'fixa',
    memo: clean(c.nome) || '(cobrança)',
    norm: '',
    cents: chargeCents(c) || 0,
    date: '',
    parcela: pc.state === 'ativa' || pc.state === 'semAncora' ? { cur: pc.cur, tot: pc.tot } : null,
    chargeNoAnchor: pc.state === 'semAncora',
    owners: (c.owners || []).filter((id) => isActive(ctx, id)),
    split: chargeSplit(ctx, c),
    auto: false,
    remember: false,
    excluded: false,
    reason: '',
    sources: null,
    dup: false,
    charge: true,
    tags: memTags(ctx, ctx.d.ruleTags['fixa:' + c.id]),
  };
}

/** Texto ao lado da parcela: em que mês cai a última. */
export function chargeHint(c: Charge): string {
  const tot = +c.parcTotal,
    at = +c.parcAtual;
  if (!(tot >= 1 && at >= 1)) return '(vazio = todo mês)';
  if (!YM_RE.test(c.parcComp || '')) return 'informe o mês a que esta parcela se refere';
  if (at > tot) return 'parcela atual maior que o total';
  return `última parcela em ${monthShort(addMonths(c.parcComp, tot - at))}`;
}

/** Fechar a competência X deixa parcAtual = parcela de X+1. Fechar de novo (ou mês anterior à âncora) não mexe. */
export function advanceCharges(charges: Charge[], comp: string, label: string): Charge[] {
  charges.forEach((c) => {
    if (!(+c.parcTotal >= 1 && +c.parcAtual >= 1)) return;
    if (!YM_RE.test(c.parcComp || '')) c.parcComp = comp; // sem âncora: o valor digitado vale para esta competência
    const k = monthsBetween(c.parcComp, comp);
    if (k >= 0) {
      c.parcAtual = +c.parcAtual + k + 1;
      c.parcComp = addMonths(comp, 1);
      c.lastMonth = label;
    }
  });
  return charges.filter((c) => !(+c.parcTotal >= 1) || +c.parcAtual <= +c.parcTotal); // total vazio = mensal, nunca apaga
}

/** Refaz as cobranças fixas da fatura aberta. keepOwners: troca de competência (mantém quem você marcou). */
export function syncChargesIntoTxs(ctx: Ctx, keepOwners = false): void {
  const prev = new Map(ctx.inv.txs.filter((t) => t.charge).map((t) => [t.id, t]));
  ctx.inv.txs = ctx.inv.txs
    .filter((t) => !t.charge)
    .concat(
      chargesForComp(ctx.d.charges, ctx.inv.comp)
        .map((c) => chargeToTx(ctx, c))
        .map((t) => {
          const old = prev.get(t.id);
          if (old) {
            t.excluded = old.excluded;
            t.reason = old.reason;
            if (old.split?.mode !== 'igual' && t.split.mode === 'igual') t.split = old.split;
            if (keepOwners) {
              t.owners = old.owners.filter((id) => isActive(ctx, id));
              t.tags = old.tags || t.tags;
            }
          }
          return t;
        }),
    );
}

export const newCharge = (): Charge => ({
  id: Date.now(),
  nome: '',
  valor: '',
  owners: [],
  parcAtual: '',
  parcTotal: '',
  parcComp: '',
  lastMonth: '',
});

/** Atualiza um campo da cobrança como a tela do v3 (valor digitado vira "12.34"; parcela nova ganha âncora). */
export function editCharge(
  ctx: Ctx,
  c: Charge,
  field: 'nome' | 'valor' | 'parcAtual' | 'parcTotal' | 'parcComp',
  value: string,
): void {
  if (field === 'nome') c.nome = value;
  if (field === 'valor') {
    const cents = parseCents(value);
    c.valor = cents == null ? value : (cents / 100).toFixed(2);
  }
  if (field === 'parcAtual') c.parcAtual = value;
  if (field === 'parcTotal') c.parcTotal = +value >= 1 ? value : ''; // 0 = sem total (mensal)
  if (field === 'parcComp') c.parcComp = YM_RE.test(value) ? value : '';
  if (
    (field === 'parcAtual' || field === 'parcTotal') &&
    +c.parcAtual >= 1 &&
    +c.parcTotal >= 1 &&
    !YM_RE.test(c.parcComp || '')
  )
    c.parcComp = ctx.inv.comp || ctx.today.slice(0, 7);
}

/** Donos ativos da cobrança na ordem da lista (para a proporção). */
export const chargeOwners = (ctx: Ctx, c: Charge): string[] =>
  (c.owners || [])
    .filter((id) => isActive(ctx, id))
    .sort((a, b) => personOrder(ctx, a) - personOrder(ctx, b));
