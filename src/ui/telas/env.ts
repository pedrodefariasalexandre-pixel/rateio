import type { Ctx } from '../../lib/types';

/**
 * O que as telas precisam do shell. O shell (AppContext) monta isto; os testes montam com um estado local.
 * `ctx` é mutável: a tela altera dentro de `commit`, que grava e re-renderiza.
 * `commit` devolve false se o mutador devolveu texto (erro, nada gravado) ou se a gravação falhou.
 */
export interface Env {
  ctx: Ctx;
  commit(fn: (c: Ctx) => void | string, opts?: { undo?: boolean }): Promise<boolean>;
  toast(msg: string, kind?: 'ok' | 'erro'): void;
  confirm(msg: string, opts?: { ok?: string; danger?: boolean }): Promise<boolean>;
  prompt(msg: string, def?: string): Promise<string | null>;
}
