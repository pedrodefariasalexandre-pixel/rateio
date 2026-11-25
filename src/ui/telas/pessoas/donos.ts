import { fmtC, fracLabel, sum } from '../../../lib/money';
import { ownerKey } from '../../../lib/memory';
import { personById } from '../../../lib/state';
import type { Ctx } from '../../../lib/types';

export const nomeDe = (c: Ctx, id: string) => personById(c, id)?.nome ?? '?';

/** Texto "→ donos" de uma regra (frações, ou valores quando o dono depende do valor). */
export function donosDaRegra(c: Ctx, k: string): string {
  const ids = c.d.rules[k] ?? [];
  const w = c.d.ruleSplits[k]?.w;
  const W = w ? sum(ids.map((id) => w[id] ?? 0)) : 0;
  const nomes = ids
    .map((id) => {
      const p = personById(c, id);
      return p ? p.nome + (w && W ? ' ' + fracLabel(w[id] ?? 0, W) : '') : '?';
    })
    .join(', ');
  const ob = (Array.isArray(c.d.ruleObs[k]) ? c.d.ruleObs[k]! : []).filter(
    (o): o is typeof o & { o: string[] } => !!o && !!o.o,
  );
  if (new Set(ob.map((o) => ownerKey(o.o))).size > 1)
    return (
      ob
        .slice(0, 6)
        .map((o) => `${fmtC(o.c)} ${o.o.map((id) => nomeDe(c, id)).join('+')}`)
        .join(' · ') + ' (depende do valor)'
    );
  return nomes;
}
