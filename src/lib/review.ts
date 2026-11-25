/** Ações da etapa Revisar (o que cada botão faz no item). Mudam o Ctx; a tela redesenha e salva. */
import { parseCents, sum } from './money';
import { applyRule, manualOwner, repeatGroup } from './memory';
import { markPaid } from './ofx';
import { PST, confirmParcel, isOutStatus, recOf, setParcel, setVolta } from './parcelas';
import { personById } from './state';
import { sharesOf, sortedOwners } from './split';
import type { Ctx, SplitMode, Tx } from './types';

export const findTx = (c: Ctx, id: string): Tx | undefined => c.inv.txs.find((x) => x.id === id);

export function toggleOwner(c: Ctx, t: Tx, pid: string): void {
  const i = t.owners.indexOf(pid);
  if (i >= 0) t.owners.splice(i, 1);
  else t.owners.push(pid);
  manualOwner(t);
  if (t.split?.mode === 'partes') {
    t.split.w = t.split.w || {};
    if (i < 0 && t.split.w[pid] == null) t.split.w[pid] = 1;
  }
  if (t.split?.mode === 'valor') {
    t.split.v = t.split.v || {};
    if (i >= 0) delete t.split.v[pid];
  }
  applyRule(c, t);
}

export function setSplitMode(c: Ctx, t: Tx, m: SplitMode): void {
  if (m === 'partes') {
    const w: Record<string, number> = {};
    t.owners.forEach((id) => (w[id] = Number(t.split.w?.[id] ?? 1)));
    t.split = { mode: 'partes', w };
  } else if (m === 'valor') {
    const r = sharesOf(c, t);
    const v: Record<string, number> = {};
    if (r.ok) t.owners.forEach((id) => (v[id] = r.shares[id]!));
    t.split = { mode: 'valor', v };
  } else t.split = { mode: 'igual' };
  applyRule(c, t);
}

export function applyPreset(c: Ctx, t: Tx, w: number[]): void {
  const obj: Record<string, number> = {};
  sortedOwners(c, t).forEach((id, i) => (obj[id] = w[i]!));
  t.split = { mode: 'partes', w: obj };
  applyRule(c, t);
}

/** Peso digitado ("1,5"). Grava a regra só quando a divisão fica válida. */
export function setWeight(c: Ctx, t: Tx, pid: string, raw: string): void {
  const v = Number(String(raw).replace(',', '.'));
  t.split.w = t.split.w || {};
  t.split.w[pid] = Number.isFinite(v) ? v : NaN;
  if (sharesOf(c, t).ok) applyRule(c, t);
}

export function setValue(t: Tx, pid: string, raw: string): void {
  const cents = parseCents(raw);
  t.split.v = t.split.v || {};
  if (cents == null) delete t.split.v[pid];
  else t.split.v[pid] = cents;
}

/** "Completar o último com o restante". */
export function fillLast(c: Ctx, t: Tx): void {
  const owners = sortedOwners(c, t),
    last = owners[owners.length - 1]!;
  const v = (t.split.v = t.split.v || {});
  const others = sum(owners.slice(0, -1).map((id) => v[id] || 0));
  owners.slice(0, -1).forEach((id) => {
    if (v[id] == null) v[id] = 0;
  });
  v[last] = t.cents - others;
}

export function excludeTx(c: Ctx, t: Tx): void {
  if (t.voltou === 'incluir') {
    setVolta(c, t, 'fora');
    t.voltou = 'fora';
    t.excluded = true;
    t.reason = 'antecipado'; // continua paga antecipadamente
    return;
  }
  t.excluded = true;
  t.reason = t.paidBy ? 'pago' : t.kind === 'compra' || t.charge ? 'manual' : t.kind;
  if (t.pkey && t.reason === 'manual') setParcel(c, t, PST.fora); // vale para esta parcela em toda reimportação
}

export function includeTx(c: Ctx, t: Tx): void {
  if (t.voltou) {
    setVolta(c, t, 'incluir');
    t.voltou = 'incluir';
  } else if (isOutStatus(recOf(c, t))) setParcel(c, t, PST.pendente);
  t.excluded = false;
  t.reason = '';
}

/** "Pago antecipadamente": só esta parcela. Devolve a mensagem de erro, ou "" se gravou. */
export function payInAdvance(c: Ctx, t: Tx, valRaw: string, descRaw: string): string {
  const pago = parseCents(valRaw),
    raw = descRaw.trim(),
    desc = raw ? parseCents(raw) : null;
  if (!(pago! > 0)) return 'Informe o valor pago';
  if (raw && !(desc! >= 0)) return 'Desconto inválido';
  setParcel(c, t, PST.pago, { valorPago: pago, desconto: desc || null });
  t.excluded = true;
  t.reason = 'antecipado';
  delete t.voltou;
  return '';
}

export function decideVolta(c: Ctx, t: Tx, decisao: 'incluir' | 'fora'): void {
  setVolta(c, t, decisao);
  t.voltou = decisao;
  if (decisao === 'incluir') {
    t.excluded = false;
    t.reason = '';
  }
}

export { confirmParcel };

/** Pagamento ambíguo: o usuário escolhe qual compra foi paga. */
export function pickPaid(c: Ctx, payId: string, debitId: string): void {
  const p = findTx(c, payId),
    d = findTx(c, debitId);
  if (p && d) markPaid(p, d);
}

/** Dos itens visíveis, os sem dono; os que têm regra "uma para cada" ficam de fora. */
export function splitBulk(c: Ctx, visible: Tx[]) {
  const list: Tx[] = [];
  let skipped = 0;
  visible.forEach((t) => {
    if (t.owners.length) return;
    if (c.d.ruleEach[t.norm]) skipped++;
    else list.push(t);
  });
  return { list, skipped };
}

export function bulkAssign(c: Ctx, visible: Tx[], pid: string): number {
  const p = personById(c, pid);
  const { list } = splitBulk(c, visible);
  if (!p) return 0;
  list.forEach((t) => {
    t.owners = [p.id];
    manualOwner(t);
    applyRule(c, t);
  });
  return list.length;
}

/** Pessoas sugeridas ao abrir "uma para cada": as que já estão no grupo. */
export const eachSuggestion = (c: Ctx, t: Tx): string[] => {
  const g = repeatGroup(c, t);
  return [...new Set(g.flatMap((x) => x.owners))]
    .filter((id) => personById(c, id))
    .slice(0, g.length);
};

/** "Gerar mensagens": grava na memória o que você marcou (nunca os palpites "pelo nome" sem você mexer). */
export function learnBeforeMessages(c: Ctx): void {
  c.inv.txs
    .filter(
      (t) => !t.excluded && t.owners.length && t.remember && !(t.auto && t.memKind === 'nome'),
    )
    .forEach((t) => applyRule(c, t));
}

export { PST };
