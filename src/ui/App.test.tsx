import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('sem sessão configurada abre no modo local pedindo o PIN', async () => {
    localStorage.clear();
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Crie seu PIN' })).toBeInTheDocument();
  });
});
