import { fireEvent, render, screen, within } from '@testing-library/react';
import { PessoasMemoria } from './PessoasMemoria';
import { ctxSintetico } from './fixture';

const abrir = () => {
  const ctx = ctxSintetico();
  const onChange = vi.fn();
  render(<PessoasMemoria ctx={ctx} onChange={onChange} />);
  return { ctx, onChange };
};

describe('Pessoas & memória', () => {
  it('lista regras com frações, uma para cada e contador com parcelas', () => {
    abrir();
    expect(screen.getByText(/LOJA DOIS/).parentElement).toHaveTextContent('Ana 1/4, Beto 3/4');
    expect(screen.getByText(/PLANO TESTE/).parentElement).toHaveTextContent(
      'uma para cada: Ana, Beto',
    );
    expect(screen.getByTestId('contagem-regras')).toHaveTextContent(
      '4 regra(s) · 1 parcela(s) na memória de parcelas',
    );
  });

  it('apaga uma regra só depois de confirmar', () => {
    const { ctx, onChange } = abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Apagar regra LOJA UM' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(ctx.d.rules['LOJA UM']).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Apagar regra LOJA UM' }));
    fireEvent.click(within(screen.getByLabelText('Confirmação')).getByText('Apagar regra'));
    expect(ctx.d.rules['LOJA UM']).toBeUndefined();
    expect(ctx.d.rules['LOJA DOIS']).toBeDefined();
    expect(onChange).toHaveBeenCalledWith('regras');
  });

  it('apagar toda a memória pede confirmação e limpa também a memória de parcelas', () => {
    const { ctx } = abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Apagar toda a memória' }));
    expect(screen.getByLabelText('Confirmação')).toHaveTextContent('1 parcela(s)');
    expect(Object.keys(ctx.d.rules)).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Apagar tudo' }));
    expect(ctx.d.rules).toEqual({});
    expect(ctx.d.parcelas).toEqual({});
    expect(ctx.d.ruleEach).toEqual({});
  });

  it('arquiva, reativa e exclui pessoa; arquivar tira o dono dos itens abertos', () => {
    const { ctx } = abrir();
    ctx.inv.txs.push({ id: 't1', owners: ['p1', 'p2'] } as never);
    fireEvent.click(screen.getByRole('button', { name: 'Arquivar Ana' }));
    fireEvent.click(within(screen.getByLabelText('Confirmação')).getByText('Arquivar'));
    expect(ctx.d.people[0]!.archived).toBe(true);
    expect(ctx.inv.txs[0]!.owners).toEqual(['p2']);
    fireEvent.click(screen.getAllByRole('button', { name: 'Reativar' })[0]!);
    expect(ctx.d.people[0]!.archived).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir de vez' }));
    fireEvent.click(within(screen.getByLabelText('Confirmação')).getByText('Excluir de vez'));
    expect(ctx.d.people.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('renomeia e apaga tag', () => {
    const { ctx } = abrir();
    fireEvent.change(screen.getByLabelText('Nome da tag Mercado'), { target: { value: 'Feira' } });
    fireEvent.blur(screen.getByLabelText('Nome da tag Mercado'));
    expect(ctx.d.tags[0]!.nome).toBe('Feira');
    fireEvent.click(screen.getByRole('button', { name: 'Apagar tag Feira' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apagar tag' }));
    expect(ctx.d.tags).toEqual([]);
    expect(ctx.d.ruleTags['LOJA UM']).toBeUndefined();
  });

  it('filtra regras', () => {
    abrir();
    fireEvent.change(screen.getByLabelText('Filtrar regras da memória'), {
      target: { value: 'tres' },
    });
    expect(screen.queryByText(/LOJA UM/)).toBeNull();
    expect(screen.getByText(/LOJA TRES/)).toBeInTheDocument();
  });
});
