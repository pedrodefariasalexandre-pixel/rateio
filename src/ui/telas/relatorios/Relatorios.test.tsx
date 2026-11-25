import { fireEvent, render, screen } from '@testing-library/react';
import { ctx } from '../../../test/fixtures';
import { ctxRelatorios } from './fixtureRelatorios';
import { Relatorios } from './Relatorios';

describe('Relatorios', () => {
  it('sem meses fechados mostra o vazio', () => {
    render(<Relatorios ctx={ctx()} />);
    expect(screen.getByText(/Feche pelo menos um mês/)).toBeInTheDocument();
  });

  it('resume último mês, variação e média', () => {
    render(<Relatorios ctx={ctxRelatorios()} />);
    expect(screen.getByText(/Último mês \(Outubro\/2026\)/)).toBeInTheDocument();
    expect(screen.getByText(/vs\. anterior/)).toBeInTheDocument();
    expect(screen.getByText(/Média por mês/)).toBeInTheDocument();
  });

  it('por tag mostra o seletor de pessoa e a nota de tags duplicadas', () => {
    render(<Relatorios ctx={ctxRelatorios()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Por tag' }));
    expect(screen.getByLabelText('Pessoa')).toBeInTheDocument();
    expect(screen.getByText(/soma das tags pode passar/)).toBeInTheDocument();
  });

  it('dica da coluna aparece ao focar', () => {
    const { container } = render(<Relatorios ctx={ctxRelatorios()} />);
    fireEvent.focus(container.querySelector('.hit')!);
    expect(container.querySelector('.chart-tip')).not.toHaveAttribute('hidden');
    expect(container.querySelector('.chart-tip')).toHaveTextContent('Total');
  });
});
