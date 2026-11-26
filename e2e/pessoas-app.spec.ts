import { expect, test } from '@playwright/test';

async function entrar(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Seções' })).toBeVisible();
}

test('Pessoas & memória pelo app: adicionar, renomear, arquivar com confirmação e persistir', async ({
  page,
}) => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await entrar(page);
  await page.getByRole('button', { name: 'Pessoas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pessoas & memória' })).toBeVisible();

  await page.getByRole('button', { name: '+ Adicionar pessoa' }).click();
  const nome = page.getByLabel('Nome de Nova pessoa');
  await nome.fill('Dani Teste');
  await nome.blur();
  await expect(page.getByLabel('Nome de Dani Teste')).toBeVisible();

  // cancelar não arquiva
  await page.getByRole('button', { name: 'Arquivar Dani Teste' }).click();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByLabel('Nome de Dani Teste')).toBeVisible();

  // a gravação tem pausa de 0,6 s; sair da aba grava na hora
  await page.getByRole('button', { name: 'Fatura', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Pessoas', exact: true }).click();
  await expect(page.getByLabel('Nome de Dani Teste')).toBeVisible();

  // arquivar de verdade
  await page.getByRole('button', { name: 'Arquivar Dani Teste' }).click();
  await page.getByRole('button', { name: 'Arquivar', exact: true }).last().click();
  await expect(page.getByTestId('arquivadas')).toContainText('Dani Teste');
  expect(erros).toEqual([]);
});
