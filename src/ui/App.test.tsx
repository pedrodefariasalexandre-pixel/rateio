import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('sem sessão configurada abre direto no modo local, sem PIN', async () => {
    localStorage.clear();
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Sair' })).toBeInTheDocument();
    expect(screen.queryByText(/PIN/)).toBeNull();
  });
});
