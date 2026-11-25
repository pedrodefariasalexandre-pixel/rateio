import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Repo } from '../../../../data/repo';
import { data } from '../../../../test/fixtures';
import type { Data, Tx } from '../../../../lib/types';
import { RateioProvider, useRateio } from '../../../AppContext';
import { ConfirmProvider } from '../../../base/confirm';
import { FinalScreen } from './FinalScreen';

const tx = (over: Partial<Tx>): Tx => ({
  id: 't' + Math.random().toString(36).slice(2, 8),
  kind: 'compra',
  memo: 'LOJA TESTE',
  norm: 'LOJA TESTE',
  cents: 1000,
  date: '2026-11-10',
  parcela: null,
  owners: [],
  split: { mode: 'igual' },
  auto: false,
  remember: false,
  excluded: false,
  reason: '',
  sources: null,
  dup: false,
  tags: [],
  ...over,
});

/** Fatura sintética: A 120,00 sozinha · B e C dividem 60,00 · B tem uma parcela 2/10 de 300,00. */
const txs = () => [
  tx({ memo: 'MERCADO FICTICIO SA', cents: 12000, owners: ['p1'] }),
  tx({ memo: 'STREAMING EXEMPLO', cents: 6000, owners: ['p2', 'p3'] }),
  tx({ memo: 'LOJA MOVEIS FAKE', cents: 30000, owners: ['p2'], parcela: { cur: 2, tot: 10 } }),
];

function Seed({ items, children }: { items: Tx[]; children: ReactNode }) {
  const { ctx } = useRateio();
  useState(() => {
    Object.assign(ctx.inv, {
      txs: items,
      comp: '2026-11',
      fileInfo: { name: 'fatura.ofx', signature: 'sig-teste', keys: ['k1'] },
    });
  });
  return <>{children}</>;
}

function setup(items = txs(), d: Data = data()) {
  const saved: Data[] = [];
  const repo: Repo = {
    load: async () => d,
    save: async (x) => void saved.push(structuredClone(x)),
    importBackup: async () => ({ status: 'ok' }),
    inactivityMinutes: async () => 5,
  };
  const onBack = vi.fn(),
    onClosed = vi.fn();
  render(
    <ConfirmProvider>
      <RateioProvider repo={repo} initial={d}>
        <Seed items={items}>
          <FinalScreen onBack={onBack} onClosed={onClosed} />
        </Seed>
      </RateioProvider>
    </ConfirmProvider>,
  );
  return { saved, onBack, onClosed };
}

afterEach(() => vi.restoreAllMocks());

describe('FinalScreen', () => {
  it('gera uma mensagem por pessoa com o valor certo', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Mensagens prontas' })).toBeInTheDocument();
    const a = screen.getByLabelText('Mensagem para Pessoa A') as HTMLTextAreaElement;
    const b = screen.getByLabelText('Mensagem para Pessoa B') as HTMLTextAreaElement;
    const c = screen.getByLabelText('Mensagem para Pessoa C') as HTMLTextAreaElement;
    expect(a.value).toContain('120,00 — MERCADO FICTICIO SA');
    expect(a.value).toContain('Total: R$ 120,00');
    expect(b.value).toContain('Total: R$ 330,00');
    expect(b.value).toContain('(parc. 2/10)');
    expect(c.value).toContain('Total: R$ 30,00');
    expect(c.value).toContain('div. com Pessoa B');
    expect(screen.getByText(/R\$ 480,00 dividido entre 3 pessoa\(s\)/)).toBeInTheDocument();
  });

  it('edição manual vale e dá para voltar ao texto automático', async () => {
    setup();
    const a = screen.getByLabelText('Mensagem para Pessoa A') as HTMLTextAreaElement;
    fireEvent.change(a, { target: { value: 'oi' } });
    expect(a.value).toBe('oi');
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao texto automático' }));
    expect(a.value).toContain('Total: R$ 120,00');
  });

  it('copia o texto da pessoa e monta o link do WhatsApp', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    setup();
    const copyBtns = screen.getAllByRole('button', { name: 'Copiar texto' });
    fireEvent.click(copyBtns[0]!);
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Total: R$ 120,00'));
    expect(await screen.findByRole('button', { name: 'Copiado ✓' })).toBeInTheDocument();
    const wa = screen.getAllByRole('link', { name: /WhatsApp/ });
    expect(wa[0]).toHaveTextContent('WhatsApp (escolher contato)');
    expect(wa[0]!.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(wa[1]!.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/5548999990000\?text=/);
  });

  it('exporta o CSV do mês', async () => {
    let blob: Blob | null = null;
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => ((blob = b as Blob), 'blob:x'));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    expect(click).toHaveBeenCalled();
    const text = await new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.readAsText(blob!);
    });
    expect(text).toContain('Competência;Data;Descrição');
    expect(text).toContain('MERCADO FICTICIO SA');
    expect(text).toContain('Pessoa C');
  });

  it('fechar o mês grava no histórico e avisa o pai', async () => {
    const { saved, onClosed } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar mês' }));
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByText(/Fechar Novembro\/2026\?/)).toBeInTheDocument();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Fechar mês' }));
    await waitFor(() => expect(onClosed).toHaveBeenCalledTimes(1));
    const h = saved.at(-1)!.history;
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ comp: '2026-11', totalCents: 48000, file: 'fatura.ofx' });
    expect(h[0]!.people.map((p) => p.total)).toEqual([12000, 33000, 3000]);
    expect(await screen.findByText('Novembro/2026 fechado ✓')).toBeInTheDocument();
  });

  it('cancelar a confirmação não fecha nada', async () => {
    const { saved, onClosed } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar mês' }));
    const dlg = await screen.findByRole('dialog');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancelar' }));
    expect(onClosed).not.toHaveBeenCalled();
    expect(saved).toHaveLength(0);
  });

  it('não fecha com item sem dono', async () => {
    const { onClosed } = setup([...txs(), tx({ memo: 'SEM DONO', cents: 500 })]);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar mês' }));
    expect(await screen.findByText(/Há itens sem dono/)).toBeInTheDocument();
    expect(onClosed).not.toHaveBeenCalled();
  });

  it('opção de previsão acrescenta as parcelas na mensagem', async () => {
    setup();
    const b = screen.getByLabelText('Mensagem para Pessoa B') as HTMLTextAreaElement;
    expect(b.value).not.toContain('Parcelas já comprometidas');
    fireEvent.click(screen.getByLabelText('previsão das parcelas'));
    await waitFor(() => expect(b.value).toContain('Parcelas já comprometidas'));
  });

  it('Voltar chama onBack', async () => {
    const { onBack } = setup();
    fireEvent.click(screen.getByRole('button', { name: '← Voltar e ajustar' }));
    expect(onBack).toHaveBeenCalled();
  });
});
