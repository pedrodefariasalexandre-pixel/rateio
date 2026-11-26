import { expect, test } from '@playwright/test';

test('abre direto, sem PIN, e mantém o app ao recarregar', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Seções' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Seções' })).toBeVisible();
  await expect(page.getByText('PIN')).toHaveCount(0);
  expect(errors).toEqual([]);
});
