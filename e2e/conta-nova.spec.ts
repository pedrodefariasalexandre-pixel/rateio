import { expect, test } from '@playwright/test';

// Conta nova no Supabase exporta backup com `people: []`: o app deve abrir com as pessoas padrão.
test('conta nova (estado salvo sem pessoas) abre com o estado inicial', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem('rateio.local', JSON.stringify({ v: 7, people: [] })),
  );
  await page.goto('/');
  await page.getByLabel('PIN', { exact: true }).fill('1234');
  await page.getByLabel('Repita o PIN').fill('1234');
  await page.getByRole('button', { name: 'Criar PIN' }).click();
  await expect(page.getByRole('navigation', { name: 'Seções' })).toBeVisible();
  await expect(page.getByText('formato inesperado')).toHaveCount(0);
  expect(erros).toEqual([]);
});
