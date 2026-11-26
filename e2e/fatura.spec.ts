import { expect, test, type Page } from '@playwright/test';
import { ofx } from '../src/test/fixtures';

// Fatura sintética: lojas, valores e FITIDs inventados.
const FATURA = ofx({
  trns: [
    { amt: '-120.00', memo: 'MERCADO FICTICIO', fitid: 'F1', date: '20261020' },
    { amt: '-45.50', memo: 'FARMACIA EXEMPLO', fitid: 'F2', date: '20261022' },
    { amt: '-90.00', memo: 'LOJA TESTE PARCELA 1/3', fitid: 'F3', date: '20261025' },
    { amt: '300.00', memo: 'PAGAMENTO RECEBIDO', fitid: 'F4', date: '20261101' },
  ],
});

async function entrar(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Divida a fatura/ })).toBeVisible();
}

const row = (page: Page, memo: string) =>
  page.locator('article.row').filter({ has: page.getByText(memo, { exact: true }) });

test('importa o OFX, divide, gera as mensagens e fecha o mês', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await entrar(page);

  await page.getByTestId('ofx-input').setInputFiles({
    name: 'fatura-teste.ofx',
    mimeType: 'application/x-ofx',
    buffer: Buffer.from(FATURA),
  });
  await expect(page.locator('#reviewTitle')).toHaveText('Fatura Novembro/2026');
  await expect(page.locator('#reviewSub')).toHaveText('fatura-teste.ofx · 4 lançamentos');
  await expect(page.locator('#ledgerSum')).toContainText('✓ confere');
  await expect(page.locator('#footState')).toHaveText('3 sem dono');
  await expect(page.locator('#btnFinish')).toBeDisabled();

  // atribuir: mercado dividido por partes 2:1, farmácia e loja para a Pessoa 1
  const mercado = row(page, 'MERCADO FICTICIO');
  await mercado.getByRole('button', { name: 'Pessoa 1' }).click();
  await mercado.getByRole('button', { name: 'Pessoa 2' }).click();
  await mercado.getByRole('button', { name: '÷ igual' }).click();
  await mercado.getByRole('button', { name: 'Por partes' }).click();
  await mercado.getByLabel('Partes de Pessoa 1').fill('2');
  await expect(mercado.locator('.status')).toContainText('✓ soma R$ 120,00');
  await mercado.getByLabel('Partes de Pessoa 1').blur();

  await page.getByRole('button', { name: 'Sem dono' }).click();
  await page.locator('.bulk').getByRole('button', { name: 'Pessoa 1' }).click();
  await expect(page.getByText('Tudo atribuído ✓')).toBeVisible();
  await expect(page.locator('#footState')).toHaveText('✓ R$ 255,50 dividido');
  await expect(page.locator('#totals')).toContainText('Pessoa 1 R$ 215,50');
  await expect(page.locator('#totals')).toContainText('Pessoa 2 R$ 40,00');

  // desfazer volta a atribuição em massa
  await page.getByRole('button', { name: '↶ Desfazer' }).click();
  await expect(page.locator('#footState')).toHaveText('2 sem dono');
  await page.locator('.bulk').getByRole('button', { name: 'Pessoa 1' }).click();

  await page.getByRole('button', { name: 'Gerar mensagens →' }).click();
  await expect(page.getByRole('heading', { name: 'Mensagens prontas' })).toBeVisible();
  await expect(page.locator('#finalCards')).toContainText('R$ 40,00');

  page.on('dialog', (d) => void d.accept());
  await page.locator('#btnCloseMonth').click();
  await page.getByRole('dialog').getByRole('button').last().click();
  await expect(page.getByRole('heading', { name: /Divida a fatura/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile 375px: revisão sem rolagem horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await entrar(page);
  await page.getByTestId('ofx-input').setInputFiles({
    name: 'f.ofx',
    mimeType: 'application/x-ofx',
    buffer: Buffer.from(FATURA),
  });
  await expect(page.locator('#reviewTitle')).toBeVisible();
  const over = await page.evaluate('document.documentElement.scrollWidth - window.innerWidth');
  expect(over).toBeLessThanOrEqual(0);
});
