/** RF14: fração do Pedro (titular do cartão = settings.pixOwner) em cada linha, pela memória de donos. */
import { historyIndex, memoryFor } from '../../../lib/memory';
import type { Ctx } from '../../../lib/types';
import type { InvoiceLine } from '../../../horizonte/types';

export function minhaParte(c: Ctx): (l: InvoiceLine) => number {
  const me = c.d.settings.pixOwner;
  const hx = historyIndex(c);
  const cache = new Map<string, number>();
  return (l) => {
    const k = `${l.norm}|${l.cents}`;
    const hit = cache.get(k);
    if (hit !== undefined) return hit;
    const m = memoryFor(c, { norm: l.norm, cents: l.cents }, 1, hx);
    let f = 1; // sem memória: conta inteiro (conservador)
    if (m && 'owners' in m && m.owners.length) {
      if (!m.owners.includes(me)) f = 0;
      else {
        const w = m.split.w;
        const tot = w ? m.owners.reduce((a, o) => a + (w[o] ?? 0), 0) : 0;
        f = w && tot > 0 ? (w[me] ?? 0) / tot : 1 / m.owners.length;
      }
    }
    cache.set(k, f);
    return f;
  };
}
