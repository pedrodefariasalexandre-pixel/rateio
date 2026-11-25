import { expect, test, type Page } from '@playwright/test';

// Ocultar a página (trocar de app/aba) só pede o PIN após 60s.
async function ocultar(page: Page, oculta: boolean) {
  const estado = oculta ? 'hidden' : 'visible';
  await page.evaluate(`(() => {
    Object.defineProperty(document, 'visibilityState', { value: '${estado}', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  })()`);
}

async function abrir(page: Page) {
  await page.clock.install();
  await page.goto('/');
  await page.getByLabel('PIN', { exact: true }).fill('1234');
  await page.getByLabel('Repita o PIN').fill('1234');
  await page.getByRole('button', { name: 'Criar PIN' }).click();
  await expect(page.getByRole('navigation', { name: 'Seções' })).toBeVisible();
}

test('volta em menos de 60s sem pedir o PIN', async ({ page }) => {
  await abrir(page);
  await ocultar(page, true);
  await page.clock.fastForward(5_000);
  await ocultar(page, false);
  await expect(page.getByRole('navigation', { name: 'Seções' })).toBeVisible();
});

test('volta após 60s ou mais pede o PIN', async ({ page }) => {
  await abrir(page);
  await ocultar(page, true);
  await page.clock.fastForward(61_000);
  await ocultar(page, false);
  await expect(page.getByLabel('PIN', { exact: true })).toBeVisible();
});
