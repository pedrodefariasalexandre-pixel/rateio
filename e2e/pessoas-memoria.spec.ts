import { expect, test } from '@playwright/test';

const URL = 'http://localhost:4174/e2e/harness/pessoas.html';
test.skip(!!process.env.E2E_BASE_URL, 'harness só existe no servidor local de desenvolvimento');

test('Pessoas & memória: apagar regra, arquivar e apagar tudo só com confirmação', async ({
  page,
}) => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto(URL);
  await expect(page.getByRole('heading', { name: 'Pessoas & memória' })).toBeVisible();
  await expect(page.getByTestId('contagem-regras')).toContainText('4 regra(s)');
  await expect(page.getByText('LOJA DOIS')).toContainText('Ana 1/4, Beto 3/4');

  // cancelar não apaga nada
  await page.getByRole('button', { name: 'Apagar regra LOJA UM' }).click();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByText('LOJA UM')).toBeVisible();

  // confirmar apaga só aquela regra
  await page.getByRole('button', { name: 'Apagar regra LOJA UM' }).click();
  await page.getByRole('button', { name: 'Apagar regra', exact: true }).click();
  await expect(page.getByText('LOJA UM')).toHaveCount(0);
  await expect(page.getByText('LOJA TRES')).toBeVisible();

  // arquivar pessoa move para "Arquivadas"
  await page.getByRole('button', { name: 'Arquivar Ana' }).click();
  await page.getByRole('button', { name: 'Arquivar', exact: true }).last().click();
  await expect(page.getByTestId('arquivadas')).toContainText('Ana');

  // apagar toda a memória: confirmação avisa das parcelas
  await page.getByRole('button', { name: 'Apagar toda a memória' }).click();
  await expect(page.getByLabel('Confirmação')).toContainText('1 parcela(s)');
  await page.getByRole('button', { name: 'Apagar tudo' }).click();
  await expect(page.getByText('Nenhuma regra.')).toBeVisible();
  expect(erros).toEqual([]);
});
