import { expect, test } from '@playwright/test';

test('aba Horizonte abre pela navegação e mostra a visão geral', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Seções' })
    .getByRole('button', { name: 'Horizonte' })
    .click();
  await expect(page.getByRole('heading', { name: 'Horizonte' })).toBeVisible();
  await expect(page.getByText('Pode guardar por mês')).toBeVisible();
  await page.getByRole('button', { name: 'Caixinhas' }).click();
  await expect(page.getByRole('form', { name: 'Transferir entre caixinhas' })).toBeVisible();
  expect(erros).toEqual([]);
});
