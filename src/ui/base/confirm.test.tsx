import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { ConfirmProvider, useConfirm, usePrompt } from './confirm';

const h: { ask?: ReturnType<typeof useConfirm>; askText?: ReturnType<typeof usePrompt> } = {};
function Probe() {
  const ask = useConfirm();
  const askText = usePrompt();
  useEffect(() => {
    h.ask = ask;
    h.askText = askText;
  });
  return null;
}

describe('confirm/prompt', () => {
  it('confirma, cancela e pede texto', async () => {
    render(
      <ConfirmProvider>
        <Probe />
      </ConfirmProvider>,
    );
    let p!: Promise<boolean>;
    act(() => void (p = h.ask!('Fechar o mês?', { ok: 'Fechar' })));
    fireEvent.click(await screen.findByRole('button', { name: 'Fechar' }));
    await expect(p).resolves.toBe(true);

    act(() => void (p = h.ask!('Apagar?')));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await expect(p).resolves.toBe(false);

    let t!: Promise<string | null>;
    act(() => void (t = h.askText!('Nome da tag', 'Casa')));
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'Mercado' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await expect(t).resolves.toBe('Mercado');
  });
});
