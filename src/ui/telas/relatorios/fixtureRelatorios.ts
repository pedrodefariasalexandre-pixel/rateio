/** Dados sintéticos de relatórios (3 meses fechados, 2 pessoas, 2 tags) para testes e para a página de E2E. */
import { ctx, histEntry } from '../../../test/fixtures';
import type { Ctx, HistItem } from '../../../lib/types';

const item = (memo: string, a: number, b: number, tag: string, tagId: string): HistItem => ({
  memo,
  cents: a + b,
  parcela: null,
  fixa: false,
  tags: [tag],
  tagIds: [tagId],
  shares: [
    { pid: 'p1', nome: 'Pessoa A', cents: a },
    { pid: 'p2', nome: 'Pessoa B', cents: b },
  ],
});

export function ctxRelatorios(): Ctx {
  const meses: [string, number][] = [
    ['2026-08', 1],
    ['2026-09', 2],
    ['2026-10', 3],
  ];
  return ctx({
    tags: [
      { id: 't1', nome: 'Mercado', cor: '#0CA678' },
      { id: 't2', nome: 'Lazer', cor: '#7048E8' },
    ],
    history: meses.map(([comp, k]) =>
      histEntry(comp, {
        items: [
          item('MERCADO FICTICIO SA', 10000 * k, 5000 * k, 'Mercado', 't1'),
          item('CINEMA INVENTADO', 2000 * k, 3000, 'Lazer', 't2'),
        ],
      }),
    ),
  });
}
