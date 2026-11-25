import { expect, test } from '@playwright/test';

test('a página inicial abre sem erros de script', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Rateio' })).toBeVisible();
  await expect(page.getByText('R$')).toBeVisible();
  expect(errors).toEqual([]);
});
