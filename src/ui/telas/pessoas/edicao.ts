/** Edições simples de preferências e tags (mutam ctx.d; a tela só chama e avisa onChange). */
import { tagById } from '../../../lib/state';
import { clean } from '../../../lib/text';
import type { Ctx } from '../../../lib/types';

export function setPix(c: Ctx, valor: string): void {
  c.d.settings.pix = clean(valor, 77);
}

export function setPixOwner(c: Ctx, id: string): void {
  c.d.settings.pixOwner = id;
}

/** Nome vazio é ignorado (devolve false). */
export function renomearTag(c: Ctx, id: string, nome: string): boolean {
  const g = tagById(c, id);
  const v = clean(nome, 24);
  if (!g || !v) return false;
  g.nome = v;
  return true;
}

export function corDaTag(c: Ctx, id: string, cor: string): void {
  const g = tagById(c, id);
  if (g) g.cor = cor;
}
