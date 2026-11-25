import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ctx as mkCtx, histEntry } from '../../../test/fixtures';
import { newSpy, TestEnv } from '../testEnv';
import { Historico } from './Historico';

function montar(over = {}) {
  const c = mkCtx({
    history: [histEntry('2026-10'), histEntry('2026-09')],
    settings: {
      pix: '',
      pixOwner: 'p1',
      lastBackup: '',
      msgPending: true,
      msgProjection: false,
      projRecurring: false,
    },
    ...over,
  });
  const spy = newSpy();
  render(
    <TestEnv ctx={c} spy={spy}>
      {(env) => <Historico env={env} />}
    </TestEnv>,
  );
  return { c, spy };
}

describe('Historico', () => {
  it('mostra vazio sem meses', () => {
    montar({ history: [] });
    expect(screen.getByText(/Nenhum mês fechado ainda/)).toBeInTheDocument();
  });

  it('resume o que está em aberto (dono do cartão fora) e registra pagamento parcial', async () => {
    const { c, spy } = montar();
    const sec = screen.getByRole('region', { name: /Em aberto/ });
    // só a Pessoa B deve (p1 é dono do cartão): 2 meses de R$ 50,00
    expect(within(sec).getByText('R$ 100,00')).toBeInTheDocument();
    fireEvent.click(within(sec).getByRole('button', { name: 'Registrar pagamento' }));
    const val = screen.getByLabelText('Valor recebido');
    fireEvent.change(val, { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(spy.toasts).toContain('Pagamento registrado'));
    const antigo = c.d.history.find((h) => h.comp === '2026-09')!;
    const recente = c.d.history.find((h) => h.comp === '2026-10')!;
    expect(antigo.people[1]!.payments[0]!.cents).toBe(5000);
    expect(recente.people[1]!.payments[0]!.cents).toBe(1000);
  });

  it('recusa valor maior que o em aberto e não grava', async () => {
    const { c, spy } = montar();
    const sec = screen.getByRole('region', { name: /Em aberto/ });
    fireEvent.click(within(sec).getByRole('button', { name: 'Registrar pagamento' }));
    const val = screen.getByLabelText('Valor recebido');
    fireEvent.change(val, { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(spy.toasts.at(-1)).toMatch(/Maior que o total em aberto/));
    expect(c.d.history.every((h) => h.people.every((p) => p.payments.length === 0))).toBe(true);
  });

  it('apaga pagamento só depois de confirmar', async () => {
    const h = histEntry('2026-10');
    h.people[1]!.payments = [{ id: 'x', cents: 2000, date: '2026-11-02' }];
    const { c, spy } = montar({ history: [h] });
    fireEvent.click(screen.getByText('Outubro/2026'));
    spy.answer = false;
    fireEvent.click(screen.getByRole('button', { name: 'Apagar este pagamento' }));
    await waitFor(() =>
      expect(spy.confirms[0]).toMatch(/Apagar o pagamento de R\$ 20,00 \(02\/11\/2026\)/),
    );
    expect(c.d.history[0]!.people[1]!.payments).toHaveLength(1);
    spy.answer = true;
    fireEvent.click(screen.getByRole('button', { name: 'Apagar este pagamento' }));
    await waitFor(() => expect(c.d.history[0]!.people[1]!.payments).toHaveLength(0));
  });

  it('remove o registro de um mês depois de confirmar', async () => {
    const { c } = montar();
    fireEvent.click(screen.getByText('Outubro/2026'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Remover registro' })[0]!);
    await waitFor(() => expect(c.d.history.map((x) => x.comp)).toEqual(['2026-09']));
  });
});
