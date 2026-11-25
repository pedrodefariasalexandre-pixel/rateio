import { expect, test } from '@playwright/test';

test('cria o PIN, entra, trava ao recarregar e confere o PIN', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Crie seu PIN' })).toBeVisible();
  await page.getByLabel('PIN', { exact: true }).fill('1234');
  await page.getByLabel('Repita o PIN').fill('4321');
  await page.getByRole('button', { name: 'Criar PIN' }).click();
  await expect(page.getByRole('alert')).toHaveText('Os dois PINs não são iguais.');
  await page.getByLabel('Repita o PIN').fill('1234');
  await page.getByRole('button', { name: 'Criar PIN' }).click();
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Seções' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Digite o PIN' })).toBeVisible();
  await page.getByLabel('PIN', { exact: true }).fill('9999');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toHaveText('PIN incorreto.');
  await page.getByLabel('PIN', { exact: true }).fill('1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('navigation', { name: 'Seções' })).toBeVisible();
  expect(errors).toEqual([]);
});
