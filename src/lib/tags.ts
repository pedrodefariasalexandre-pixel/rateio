/** Tags do usuário. Memória pelo estabelecimento normalizado (vale para todas as parcelas). PAGO é reservada. */
import { PALETTE, tagById } from './state';
import { clean } from './text';
import type { Ctx, Tag, Tx } from './types';

export const tagKey = (t: Tx): string | null =>
  t.charge ? 'fixa:' + t.id.slice(1) : t.kind === 'compra' ? t.norm : null;

/** "PAGO" nunca é gravada na memória de tags nem propaga. */
export const isPagoTag = (c: Ctx, id: string): boolean => {
  const g = tagById(c, id);
  return (
    !!g &&
    g.nome
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase() === 'PAGO'
  );
};

export const memTags = (c: Ctx, list: string[] | undefined): string[] =>
  (list || []).filter((id) => tagById(c, id) && !isPagoTag(c, id));

export function rememberTags(c: Ctx, t: Tx): void {
  const k = tagKey(t);
  if (!k) return;
  const keep = memTags(c, t.tags);
  if ((t.charge || t.remember) && keep.length) c.d.ruleTags[k] = keep;
  else delete c.d.ruleTags[k];
}

export function setItemTags(c: Ctx, t: Tx, list: string[]): void {
  const before = memTags(c, t.tags);
  t.tags = [...new Set(list)].filter((id) => tagById(c, id));
  rememberTags(c, t);
  // compra parcelada com "lembrar": as outras compras do estabelecimento recebem/perdem a tag (menos PAGO)
  if (t.parcela && t.kind === 'compra' && !t.charge && t.remember && t.norm) {
    const after = memTags(c, t.tags),
      add = after.filter((id) => !before.includes(id)),
      rm = before.filter((id) => !after.includes(id));
    if (add.length || rm.length)
      c.inv.txs.forEach((x) => {
        if (x === t || x.charge || x.kind !== 'compra' || x.norm !== t.norm) return;
        x.tags = [...new Set([...(x.tags || []).filter((id) => !rm.includes(id)), ...add])];
      });
  }
}

export function createTag(c: Ctx, name: string): Tag | null {
  const nome = clean(name, 24);
  if (!nome) return null;
  const found = c.d.tags.find((g) => g.nome.toLowerCase() === nome.toLowerCase());
  if (found) return found;
  const g: Tag = {
    id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    nome,
    cor: PALETTE[c.d.tags.length % PALETTE.length]!,
  };
  c.d.tags.push(g);
  return g;
}

/** Apaga a tag de todos os lançamentos e da memória. */
export function deleteTag(c: Ctx, id: string): void {
  c.d.tags = c.d.tags.filter((x) => x.id !== id);
  c.inv.txs.forEach((t) => {
    if (t.tags) t.tags = t.tags.filter((x) => x !== id);
  });
  Object.keys(c.d.ruleTags).forEach((k) => {
    const left = c.d.ruleTags[k]!.filter((x) => x !== id);
    if (left.length) c.d.ruleTags[k] = left;
    else delete c.d.ruleTags[k];
  });
}
