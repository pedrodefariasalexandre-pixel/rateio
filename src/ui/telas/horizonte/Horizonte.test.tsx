import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { dadosFicticios, fonteFicticia } from './ficticio';
import { Horizonte } from './Horizonte';
import type { HorizonteFonte } from './modelo';

const OFX = '<OFX><STMTTRN>a</STMTTRN><STMTTRN>b</STMTTRN></OFX>';
const arquivo = (nome: string, texto: string) => {
  const f = new File([texto], nome);
  Object.defineProperty(f, 'text', { value: () => Promise.resolve(texto) });
  return f;
};

describe('Horizonte', () => {
  it('mostra a visão geral com sobra, furo e meses', async () => {
    render(<Horizonte fonte={fonteFicticia()} />);
    expect(await screen.findByText(/Sobra prevista nos próximos 6 meses/)).toBeInTheDocument();
    expect(screen.getByText('Pode guardar por mês')).toBeInTheDocument();
    expect(screen.getByText(/Furo − R\$ 310,00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '12m' }));
    expect(await screen.findByText(/próximos 12 meses/)).toBeInTheDocument();
  });

  it('abre o detalhe da janela e separa comprometido de previsto', async () => {
    render(<Horizonte fonte={fonteFicticia()} />);
    fireEvent.click(await screen.findByRole('button', { name: /^Dezembro/ }));
    expect(screen.getByText('Janela de dezembro')).toBeInTheDocument();
    expect(screen.getByText('Comprometido (parcelas e fixas)')).toBeInTheDocument();
    expect(screen.getByText('Previsto (avulsos estimados)')).toBeInTheDocument();
    expect(screen.getByText(/Caixinha IPVA: Zera/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'toque para mostrar' }));
    expect(screen.getByText(/Presente de Natal/)).toBeInTheDocument();
  });

  it('simula antecipação', async () => {
    render(<Horizonte fonte={fonteFicticia()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Janela' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'simular antecipação' })[1]!);
    expect(await screen.findByText(/Vale a pena/)).toBeInTheDocument();
  });

  it('transfere entre caixinhas criando uma nova', async () => {
    render(<Horizonte fonte={fonteFicticia()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Caixinhas' }));
    fireEvent.change(screen.getByLabelText('Nome da caixinha nova'), {
      target: { value: 'Fim de ano' },
    });
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '200,00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Transferir' }));
    expect(await screen.findByText(/R\$ 200,00 transferidos/)).toBeInTheDocument();
    expect((await screen.findAllByText(/Fim de ano/)).length).toBeGreaterThan(0);
  });

  it('bloqueia transferência acima do saldo', async () => {
    render(<Horizonte fonte={fonteFicticia()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Caixinhas' }));
    fireEvent.change(screen.getByLabelText('Nome da caixinha nova'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '99999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Transferir' }));
    expect(
      await screen.findByText('Saldo insuficiente na caixinha de origem.'),
    ).toBeInTheDocument();
  });

  it('semanas e 13º com chave', async () => {
    render(<Horizonte fonte={fonteFicticia()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Semanas' }));
    expect(screen.getByText('Teto semanal')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '13º' }));
    fireEvent.click(screen.getByRole('switch'));
    expect(await screen.findByText('não considerar')).toBeInTheDocument();
  });

  it('importa OFX: válido, repetido e inválido', async () => {
    const { container } = render(<Horizonte fonte={fonteFicticia()} />);
    fireEvent.click(await screen.findByRole('button', { name: '＋ Importar OFX' }));
    const input = container.querySelector('input[type=file]')!;
    fireEvent.change(input, {
      target: { files: [arquivo('nu-11.ofx', OFX), arquivo('nu-10.ofx', OFX)] },
    });
    expect(await screen.findByText('já importada')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar no Horizonte' }));
    expect(await screen.findByText('2 lançamentos salvos.', { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver meses' }));
    fireEvent.click(await screen.findByRole('button', { name: '＋ Importar OFX' }));
    fireEvent.change(container.querySelector('input[type=file]')!, {
      target: { files: [arquivo('fatura.pdf', '%PDF')] },
    });
    expect(await screen.findByText('Não conseguimos ler o arquivo')).toBeInTheDocument();
  });

  it('estados vazio e erro', async () => {
    const vazia: HorizonteFonte = {
      ...fonteFicticia(),
      carregar: async () => ({ ...dadosFicticios(), janelas: [] }),
    };
    const { unmount } = render(<Horizonte fonte={vazia} />);
    expect(await screen.findByText('Seu horizonte está vazio')).toBeInTheDocument();
    unmount();
    let falhar = true;
    const ruim: HorizonteFonte = {
      ...fonteFicticia(),
      carregar: async () => {
        if (falhar) throw new Error('Falha de rede');
        return dadosFicticios();
      },
    };
    render(<Horizonte fonte={ruim} />);
    expect(await screen.findByText('Falha de rede')).toBeInTheDocument();
    falhar = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(screen.getByText('Pode guardar por mês')).toBeInTheDocument());
  });
});

describe('Cadastro do Horizonte', () => {
  it('vazio leva ao cadastro; salva salário, conta fixa e teto', async () => {
    const f = fonteFicticia();
    const vazia: HorizonteFonte = {
      ...f,
      carregar: async () => ({ ...dadosFicticios(), janelas: [] }),
    };
    render(<Horizonte fonte={vazia} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cadastrar salário e contas' }));
    fireEvent.change(await screen.findByLabelText('Salário líquido do mês'), {
      target: { value: '5000' },
    });
    fireEvent.change(screen.getByLabelText('Valor do adiantamento (parte do líquido)'), {
      target: { value: '2000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar salário' }));
    expect(await screen.findByText('Salário salvo.')).toBeInTheDocument();
    expect((await f.config()).salario?.liquido).toBe(500000);

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Aluguel' } });
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '1200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar conta fixa' }));
    expect(await screen.findByText('"Aluguel" salva.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Apagar Aluguel' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apagar Aluguel' }));
    await waitFor(() => expect(screen.queryByText('Apagar Aluguel')).toBeNull());

    fireEvent.change(screen.getByRole('textbox', { name: 'Teto semanal' }), {
      target: { value: '350' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar teto' }));
    expect(await screen.findByText('Teto semanal salvo.')).toBeInTheDocument();
  });

  it('cria caixinha e aporta/retira', async () => {
    const f = fonteFicticia();
    render(<Horizonte fonte={f} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Caixinhas' }));
    const nova = screen.getByRole('form', { name: 'Nova caixinha' });
    fireEvent.change(within(nova).getByLabelText('Nome'), { target: { value: 'Viagem' } });
    fireEvent.change(within(nova).getByLabelText('Saldo atual'), { target: { value: '100' } });
    fireEvent.click(within(nova).getByRole('button', { name: 'Criar caixinha' }));
    expect(await screen.findByText('Caixinha "Viagem" criada.')).toBeInTheDocument();
    const mov = screen.getByRole('form', { name: 'Aportar ou retirar' });
    fireEvent.change(within(mov).getByLabelText('Movimento'), { target: { value: 'retirada' } });
    fireEvent.change(within(mov).getByLabelText('Valor do movimento'), {
      target: { value: '999999' },
    });
    fireEvent.click(within(mov).getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Saldo insuficiente na caixinha.')).toBeInTheDocument();
  });
});
