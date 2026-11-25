/** Pessoas: arquivar some da divisão (histórico e memória continuam); excluir de vez tira da lista. */
import { PALETTE, personById } from './state';
import { clean } from './text';
import type { Ctx, Person } from './types';

export function addPerson(c: Ctx): Person {
  const p: Person = {
    id: 'p' + Date.now(),
    nome: 'Nova pessoa',
    cor: PALETTE[c.d.people.length % PALETTE.length]!,
    fone: '',
  };
  c.d.people.push(p);
  return p;
}

export function editPerson(
  c: Ctx,
  id: string,
  field: 'nome' | 'fone' | 'cor',
  value: string,
): void {
  const p = personById(c, id);
  if (!p) return;
  if (field === 'nome') p.nome = clean(value, 40);
  else p[field] = value;
}

export function archivePerson(c: Ctx, id: string): void {
  const p = personById(c, id);
  if (!p) return;
  p.archived = true;
  c.inv.txs.forEach((t) => (t.owners = t.owners.filter((x) => x !== id)));
}

export function unarchivePerson(c: Ctx, id: string): void {
  const p = personById(c, id);
  if (p) delete p.archived;
}

export function deletePerson(c: Ctx, id: string): void {
  c.d.people = c.d.people.filter((x) => x.id !== id);
}
