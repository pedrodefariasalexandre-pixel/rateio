import { newCtx, emptyData } from '../../../lib/state';
import type { Ctx } from '../../../lib/types';

/** Dados 100% sintéticos para testes e para o harness do E2E. */
export function ctxSintetico(): Ctx {
  const d = emptyData();
  d.people = [
    { id: 'p1', nome: 'Ana', cor: '#3B5BDB', fone: '' },
    { id: 'p2', nome: 'Beto', cor: '#D6336C', fone: '5548999990000' },
    { id: 'p3', nome: 'Caio', cor: '#E8890C', fone: '', archived: true },
  ];
  d.tags = [{ id: 'g1', nome: 'Mercado', cor: '#2F9E44' }];
  d.rules = { 'LOJA UM': ['p1'], 'LOJA DOIS': ['p1', 'p2'], 'LOJA TRES': ['p2'] };
  d.ruleSplits = { 'LOJA DOIS': { w: { p1: 1, p2: 3 } } };
  d.ruleEach = { 'PLANO TESTE': ['p1', 'p2'] };
  d.ruleTags = { 'LOJA UM': ['g1'] };
  d.parcelas = {
    'p3|F1|3|2': {
      key: 'p3|F1|3|2',
      memo: 'LOJA UM 2/3',
      norm: 'LOJA UM',
      acct: 'k1',
      parcela: { cur: 2, tot: 3 },
      cents: 1000,
      fitid: 'F1',
      dataCompra: '',
      status: 'fora_manual',
      em: '2026-11-01',
      comp: '2026-11',
      valorPago: null,
      desconto: null,
      origem: 'manual',
    },
  };
  return newCtx(d, '2026-11-20');
}
