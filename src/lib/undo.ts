/** Desfazer a última ação da revisão: retrato da fatura e da memória (até 40). */
import type { Ctx } from './types';

const KEYS = [
  'rules',
  'ruleSplits',
  'ruleEach',
  'ruleObs',
  'ruleTags',
  'tags',
  'parcelas',
] as const;
export const UNDO_LIMIT = 40;

export function pushUndo(c: Ctx, stack: string[]): void {
  const snap: Record<string, unknown> = { txs: c.inv.txs };
  KEYS.forEach((k) => (snap[k] = c.d[k]));
  stack.push(JSON.stringify(snap));
  if (stack.length > UNDO_LIMIT) stack.shift();
}

/** Volta o último retrato. false = nada para desfazer. */
export function undoLast(c: Ctx, stack: string[]): boolean {
  const s = stack.pop();
  if (!s) return false;
  const snap = JSON.parse(s);
  c.inv.txs = snap.txs;
  KEYS.forEach((k) => (c.d[k] = snap[k]));
  c.hIdx = null;
  return true;
}
