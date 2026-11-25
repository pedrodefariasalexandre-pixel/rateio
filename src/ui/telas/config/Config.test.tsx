import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ImportOutcome } from '../../../data/repo';
import { ctx as mkCtx } from '../../../test/fixtures';
import { newSpy, TestEnv } from '../testEnv';
import { Config, type BackupApi } from './Config';

function montar(respostas: ImportOutcome[], over = {}) {
  const c = mkCtx(over);
  const spy = newSpy();
  const chamadas: (string | undefined)[] = [];
  const backup: BackupApi = {
    importar: async (_t, mode) => (chamadas.push(mode), respostas.shift()!),
    recarregar: vi.fn(async () => {}),
  };
  render(
    <TestEnv ctx={c} spy={spy}>
      {(env) => <Config env={env} backup={backup} />}
    </TestEnv>,
  );
  return { c, spy, backup, chamadas };
}

const colar = (spy: ReturnType<typeof newSpy>, texto: string) => {
  spy.promptAnswer = texto;
  fireEvent.click(screen.getByRole('button', { name: 'Restaurar de texto' }));
};

describe('Config', () => {
  it('salva a chave PIX ao sair do campo (cortando em 77) e o dono do cartão', async () => {
    const { c } = montar([]);
    const campo = screen.getByLabelText('Chave PIX');
    fireEvent.change(campo, { target: { value: 'pix@exemplo.com' } });
    fireEvent.blur(campo);
    await waitFor(() => expect(c.d.settings.pix).toBe('pix@exemplo.com'));
    fireEvent.change(screen.getByLabelText('Dono da chave PIX'), { target: { value: 'p2' } });
    await waitFor(() => expect(c.d.settings.pixOwner).toBe('p2'));
  });

  it('copia o backup e marca a data do último backup', async () => {
    const escrever = vi.fn<(t: string) => Promise<void>>(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: escrever },
      configurable: true,
    });
    const { c, spy } = montar([]);
    fireEvent.click(screen.getByRole('button', { name: 'Copiar backup (texto)' }));
    await waitFor(() => expect(spy.toasts).toContain('Backup copiado'));
    expect(escrever.mock.calls[0]![0]).toMatch(/^RATEIO-BACKUP \{/);
    expect(c.d.settings.lastBackup).not.toBe('');
  });

  it('restaura: recarrega e avisa com as contagens', async () => {
    const { spy, backup } = montar([{ status: 'ok' }]);
    colar(spy, 'RATEIO-BACKUP {}');
    await waitFor(() => expect(spy.toasts.at(-1)).toMatch(/^Backup restaurado: 3 pessoa\(s\)/));
    expect(backup.recarregar).toHaveBeenCalled();
  });

  it('backup inválido: avisa o motivo e não recarrega', async () => {
    const { spy, backup } = montar([{ status: 'invalid', problem: 'versão do backup inválida' }]);
    colar(spy, 'lixo');
    await waitFor(() =>
      expect(spy.toasts.at(-1)).toMatch(
        /Backup inválido: versão do backup inválida\. Nada foi alterado/,
      ),
    );
    expect(backup.recarregar).not.toHaveBeenCalled();
  });

  it('conflito de parcelas: pergunta e repete com o modo escolhido', async () => {
    const { spy, chamadas } = montar([
      { status: 'needs_decision', theirs: 5, mine: 4, lost: 2 },
      { status: 'ok' },
    ]);
    spy.answer = false;
    colar(spy, 'RATEIO-BACKUP {}');
    await waitFor(() => expect(chamadas).toEqual([undefined, 'juntar']));
    expect(spy.confirms[0]).toMatch(/O backup tem 5 parcela\(s\).*Aqui há 4, e 2 delas/s);
  });
});
