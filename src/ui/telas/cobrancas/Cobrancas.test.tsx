import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ctx as mkCtx } from '../../../test/fixtures';
import type { Charge } from '../../../lib/types';
import { newSpy, TestEnv } from '../testEnv';
import { Cobrancas } from './Cobrancas';

const base = (o: Partial<Charge> = {}): Charge => ({
  id: 1,
  nome: 'Empréstimo teste',
  valor: '100.00',
  owners: ['p1', 'p2'],
  parcAtual: '',
  parcTotal: '',
  parcComp: '',
  lastMonth: '',
  ...o,
});

function montar(charges: Charge[]) {
  const c = mkCtx({ charges });
  const spy = newSpy();
  render(
    <TestEnv ctx={c} spy={spy}>
      {(env) => <Cobrancas env={env} />}
    </TestEnv>,
  );
  return { c, spy };
}

describe('Cobrancas', () => {
  it('lista vazia e adiciona', async () => {
    const { c } = montar([]);
    expect(screen.getByText('Nenhuma cobrança cadastrada.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar cobrança' }));
    await waitFor(() => expect(c.d.charges).toHaveLength(1));
  });

  it('valor digitado vira texto com ponto e parcela nova ganha o mês da âncora', async () => {
    const { c } = montar([base()]);
    const val = screen.getByLabelText('Valor');
    fireEvent.change(val, { target: { value: '1.234,50' } });
    fireEvent.blur(val);
    await waitFor(() => expect(c.d.charges[0]!.valor).toBe('1234.50'));
    const at = screen.getByLabelText('Parcela atual');
    fireEvent.change(at, { target: { value: '2' } });
    fireEvent.blur(at);
    const tot = screen.getByLabelText('Total de parcelas');
    fireEvent.change(tot, { target: { value: '5' } });
    fireEvent.blur(tot);
    await waitFor(() => expect(c.d.charges[0]!.parcComp).toBe('2026-11'));
    expect(screen.getByText('última parcela em fev/27')).toBeInTheDocument();
  });

  it('alterna dono e mostra proporção só com 2+ donos', async () => {
    const { c } = montar([base({ owners: ['p1'] })]);
    expect(screen.queryByText(/Proporção:/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Pessoa B' }));
    await waitFor(() => expect(c.d.charges[0]!.owners).toEqual(['p1', 'p2']));
    expect(screen.getByText(/Proporção:/)).toBeInTheDocument();
    const pesoB = screen.getByLabelText('Partes de Pessoa B');
    fireEvent.change(pesoB, { target: { value: '2' } });
    fireEvent.blur(pesoB);
    await waitFor(() => expect(c.d.charges[0]!.w).toEqual({ p2: 2 }));
  });

  it('remove só depois de confirmar', async () => {
    const { c, spy } = montar([base()]);
    spy.answer = false;
    fireEvent.click(screen.getByRole('button', { name: 'Remover cobrança' }));
    await waitFor(() => expect(spy.confirms[0]).toMatch(/Remover a cobrança “Empréstimo teste”/));
    expect(c.d.charges).toHaveLength(1);
    spy.answer = true;
    fireEvent.click(screen.getByRole('button', { name: 'Remover cobrança' }));
    await waitFor(() => expect(c.d.charges).toHaveLength(0));
  });
});
