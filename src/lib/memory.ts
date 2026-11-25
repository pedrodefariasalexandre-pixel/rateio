/**
 * Memória de donos por texto + VALOR. Regra de ouro: a memória nunca chuta.
 *   1. valor igual (±R$ 0,10 ou 1%) a um já visto → aplica o dono DAQUELE valor;
 *   2. valor novo, todas as observações com o mesmo dono e o texto aparece 1× na fatura → aplica "pelo nome";
 *   3. qualquer dúvida → não aplica: o item fica sem dono, com o motivo.
 */
import { normalize } from './text';
import { isActive, personOrder } from './state';
import { sortedOwners } from './split';
import type { Ctx, Obs, Split, Tx, Weights } from './types';

/** Tolerância de valor: R$ 0,10 ou 1% do valor registrado, o que for maior. */
export const tolOf = (c: number): number => Math.max(10, Math.round(Math.abs(c) * 0.01));
export const nearValue = (a: number, b: number): boolean =>
  Math.abs(Math.abs(a) - Math.abs(b)) <= tolOf(b);
export const nearAbs = (a: number, b: number): boolean => nearValue(a, b) || nearValue(b, a);
export const ownerKey = (o: string[]): string => o.slice().sort().join(',');

/** Texto normalizado → observações vindas dos meses fechados (mais recente primeiro). */
export function historyIndex(c: Ctx): Map<string, Obs[]> {
  if (c.hIdx) return c.hIdx;
  const idx = new Map<string, Obs[]>();
  c.d.history.forEach((h) =>
    (h.items || []).forEach((i) => {
      if (i.fixa || !i.memo || !(i.cents > 0)) return;
      const sh = i.shares || [],
        ids = sh.map((s) => s.pid);
      if (!ids.length || ids.some((id) => !id)) return;
      const cs = sh.map((s) => s.cents),
        eq = Math.max(...cs) - Math.min(...cs) <= 1,
        N = normalize(i.memo);
      if (!N) return;
      const e: Obs = {
        c: i.cents,
        o: (ids as string[]).slice().sort((a, b) => personOrder(c, a) - personOrder(c, b)),
        at: h.comp,
      };
      if (ids.length > 1 && !eq && cs.every((x) => x > 0))
        e.w = Object.fromEntries(sh.map((s) => [s.pid!, s.cents]));
      if (!idx.has(N)) idx.set(N, []);
      idx.get(N)!.push(e);
    }),
  );
  c.hIdx = idx;
  return idx;
}

const asOwners = (
  c: Ctx,
  o: { o: unknown; w?: Weights },
): { owners: string[]; split: Split } | null => {
  const owners = (Array.isArray(o.o) ? (o.o as string[]) : []).filter((id) => isActive(c, id));
  if (!owners.length) return null;
  const w = o.w,
    ok = owners.length > 1 && w && owners.every((id) => (w[id] ?? 0) > 0);
  return {
    owners,
    split: ok
      ? { mode: 'partes', w: Object.fromEntries(owners.map((id) => [id, Number(w![id])])) }
      : { mode: 'igual' },
  };
};

export type MemoryResult =
  { owners: string[]; split: Split; kind: 'exato' | 'nome' } | { why: string } | null;

/** O que a memória pode preencher para o item t (n = vezes que o texto aparece na fatura). */
export function memoryFor(
  c: Ctx,
  t: Pick<Tx, 'norm' | 'cents'>,
  n: number,
  hx: Map<string, Obs[]>,
): MemoryResult {
  const N = t.norm,
    old = c.d.rules[N];
  const evRaw = Array.isArray(c.d.ruleObs[N])
    ? c.d.ruleObs[N]
    : Array.isArray(old)
      ? hx.get(N) || []
      : [];
  const ev = evRaw.filter((o) => o && Number.isFinite(o.c) && (o.o === null || Array.isArray(o.o)));
  const out = (r: ReturnType<typeof asOwners>, kind: 'exato' | 'nome') =>
    r ? { ...r, kind } : null;
  const near = ev.filter((o) => nearAbs(t.cents, o.c));
  if (near.length) {
    if (near.some((o) => !o.o))
      return {
        why: 'este valor está marcado para não lembrar, ou há duas cobranças iguais com donos diferentes',
      };
    if (new Set(near.map((o) => ownerKey(o.o!))).size > 1)
      return { why: 'este valor já foi de donos diferentes' };
    return out(asOwners(c, near[0]!), 'exato');
  }
  const known = ev.filter((o) => o.o),
    sets = new Set(known.map((o) => ownerKey(o.o!)));
  if (sets.size > 1) return { why: 'este texto já foi de pessoas diferentes e este valor é novo' };
  if (sets.size === 1)
    return n <= 1
      ? out(asOwners(c, known[0]!), 'nome')
      : { why: `texto repetido ${n}× nesta fatura e este valor é novo para a memória` };
  if (Array.isArray(old) && old.length)
    return n <= 1
      ? out(asOwners(c, { o: old, w: c.d.ruleSplits[N]?.w }), 'nome')
      : { why: `texto repetido ${n}× nesta fatura e a memória antiga não diz de qual é cada um` };
  return null;
}

/** rules[N] = dono da observação mais recente (formato antigo, lista de memória e backups antigos). */
function mirrorRule(c: Ctx, N: string) {
  const first = (c.d.ruleObs[N] || []).find((o) => o.o);
  if (!first) {
    delete c.d.rules[N];
    delete c.d.ruleSplits[N];
    return;
  }
  c.d.rules[N] = first.o!.slice();
  if (first.w) c.d.ruleSplits[N] = { w: { ...first.w } };
  else delete c.d.ruleSplits[N];
}

function recordObs(c: Ctx, t: Tx) {
  const N = t.norm,
    owners = sortedOwners(c, t);
  // duas cobranças do mesmo valor com donos diferentes na fatura: a memória não sabe qual é qual
  const clash = c.inv.txs.some(
    (x) =>
      x !== t &&
      x.kind === 'compra' &&
      !x.charge &&
      !x.excluded &&
      x.norm === N &&
      x.owners.length &&
      nearAbs(x.cents, t.cents) &&
      ownerKey(x.owners) !== ownerKey(owners),
  );
  const e: Obs = { c: Math.abs(t.cents), o: clash ? null : owners, at: c.today };
  if (!clash && owners.length > 1 && t.split?.mode === 'partes') {
    const w: Weights = {};
    owners.forEach((id) => (w[id] = Number(t.split.w?.[id] ?? 1)));
    e.w = w;
  }
  const base = Array.isArray(c.d.ruleObs[N])
    ? c.d.ruleObs[N]!
    : Array.isArray(c.d.rules[N])
      ? (historyIndex(c).get(N) || []).slice(0, 12)
      : [];
  c.d.ruleObs[N] = [e, ...base.filter((o) => !nearAbs(e.c, o.c))].slice(0, 12);
  mirrorRule(c, N);
}

/** Esquece este valor. explicit (desmarcou "lembrar"): grava um bloqueio para ele. */
function dropObs(c: Ctx, t: Tx, explicit: boolean) {
  const N = t.norm,
    cents = Math.abs(t.cents);
  const obs = c.d.ruleObs[N];
  if (Array.isArray(obs)) {
    const kept = obs.filter((o) => !nearAbs(cents, o.c));
    if (explicit) kept.unshift({ c: cents, o: null, at: c.today });
    if (kept.length) c.d.ruleObs[N] = kept;
    else delete c.d.ruleObs[N];
    mirrorRule(c, N);
  } else {
    delete c.d.rules[N];
    delete c.d.ruleSplits[N];
    if (explicit) c.d.ruleObs[N] = [{ c: cents, o: null, at: c.today }];
  }
}

/** Grava (ou esquece) o que o usuário marcou no item. */
export function applyRule(c: Ctx, t: Tx): void {
  if (!t.norm || t.charge || t.kind !== 'compra') return;
  if (c.d.ruleEach[t.norm]) return; // "uma para cada pessoa": a regra própria manda
  if (t.remember && t.owners.length) recordObs(c, t);
  else dropObs(c, t, !t.remember);
}

/** Você mexeu no item: a memória deixa de ter palavra nele. */
export const manualOwner = (t: Tx): void => {
  t.auto = false;
  delete t.memKind;
  delete t.memNote;
};

export function deleteRule(c: Ctx, k: string): void {
  delete c.d.rules[k];
  delete c.d.ruleSplits[k];
  delete c.d.ruleObs[k];
}

/* ---------------- "uma para cada pessoa" ---------------- */

export const byDate = (a: Tx, b: Tx): number =>
  (a.date || '').localeCompare(b.date || '') || a.id.localeCompare(b.id);

/** Cobranças iguais (mesmo texto) na fatura, na divisão. */
export const repeatGroup = (c: Ctx, t: Tx): Tx[] =>
  t.kind === 'compra' && !t.charge && t.norm
    ? c.inv.txs
        .filter((x) => x.kind === 'compra' && !x.charge && x.norm === t.norm && !x.excluded)
        .sort(byDate)
    : [];

export function applyEachRules(c: Ctx): void {
  for (const [norm, ids] of Object.entries(c.d.ruleEach)) {
    const owners = (ids || []).filter((id) => isActive(c, id));
    const group = c.inv.txs
      .filter((t) => t.kind === 'compra' && !t.charge && t.norm === norm && !t.excluded)
      .sort(byDate);
    group.forEach((t) => {
      t.split = { mode: 'igual' };
      delete t.eachMismatch;
    });
    if (!group.length) continue;
    if (group.length === owners.length)
      group.forEach((t, i) => {
        t.owners = [owners[i]!];
        t.auto = true;
      });
    else
      group.forEach((t) => {
        t.owners = [];
        t.auto = false;
        t.eachMismatch = { expected: owners.length, got: group.length };
      });
  }
}

/** Cria a regra "uma para cada" com as pessoas escolhidas (na ordem da lista). */
export function setEachRule(c: Ctx, t: Tx, ids: string[]): void {
  c.d.ruleEach[t.norm] = ids.slice().sort((a, b) => personOrder(c, a) - personOrder(c, b));
  deleteRule(c, t.norm);
  applyEachRules(c);
}

export function removeEachRule(c: Ctx, norm: string): void {
  delete c.d.ruleEach[norm];
  c.inv.txs.filter((x) => x.norm === norm).forEach((x) => delete x.eachMismatch);
}

export function clearAllMemory(c: Ctx): void {
  Object.assign(c.d, {
    rules: {},
    ruleSplits: {},
    ruleEach: {},
    ruleObs: {},
    ruleTags: {},
    parcelas: {},
  });
}
