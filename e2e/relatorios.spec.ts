import { expect, test } from '@playwright/test';

const URL = 'http://localhost:4174/e2e/harness/relatorios.html';
test.skip(!!process.env.E2E_BASE_URL, 'harness só existe no servidor local de desenvolvimento');

test.describe('Relatórios e gráfico (dados sintéticos)', () => {
  test('mostra resumo, gráfico, dica por coluna e tabela', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL);
    const rel = page.getByTestId('relatorios');
    await expect(rel.getByText('Último mês')).toBeVisible();
    await expect(rel.getByText('Média por mês')).toBeVisible();
    const svg = rel.getByRole('img', { name: 'Valor por pessoa em cada mês fechado' });
    await expect(svg).toBeVisible();
    // legenda com as duas pessoas
    await expect(rel.locator('.legend')).toContainText('Pessoa A');
    await expect(rel.locator('.legend')).toContainText('Pessoa B');
    // dica ao focar uma coluna (teclado)
    const col = rel.locator('.hit').first();
    await col.focus();
    await expect(rel.locator('.chart-tip')).toBeVisible();
    await expect(rel.locator('.chart-tip')).toContainText('Total');
    // tabela
    await rel.getByText('Ver como tabela').click();
    await expect(rel.locator('details.ctable table')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('alterna para "Por tag" e muda o período', async ({ page }) => {
    await page.goto(URL);
    const rel = page.getByTestId('relatorios');
    await rel.getByRole('button', { name: 'Por tag' }).click();
    await expect(rel.locator('.legend')).toContainText('Mercado');
    await expect(rel.locator('.legend')).toContainText('Lazer');
    await expect(rel.getByLabel('Pessoa')).toBeVisible();
    await rel.getByLabel('Período').selectOption('3');
    await expect(rel.locator('.hit')).toHaveCount(3);
    await rel.getByLabel('Período').selectOption('all');
    await expect(rel.locator('.hit')).toHaveCount(3);
  });

  test('projeção mostra parcelas em andamento e gráfico', async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByText('Parcelas em andamento')).toBeVisible();
    await expect(
      page.getByRole('img', { name: 'Valor comprometido por mês, por pessoa' }),
    ).toBeVisible();
  });
});
