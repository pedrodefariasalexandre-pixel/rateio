import { expect, test, type Page } from '@playwright/test';
import { data, histEntry } from '../src/test/fixtures';

// Backup sintético: pessoas inventadas, dois meses fechados e uma cobrança fixa.
const dados = data({
  history: [histEntry('2026-10'), histEntry('2026-09')],
  charges: [
    {
      id: 1,
      nome: 'Assinatura teste',
      valor: '30.00',
      owners: ['p1', 'p2'],
      parcAtual: '',
      parcTotal: '',
      parcComp: '',
      lastMonth: '',
    },
  ],
});
dados.settings.pixOwner = 'p1';
// mesmo formato do backup do app (RATEIO-BACKUP + JSON, v7), montado sem importar src/lib/backup (que usa tipos de DOM)
const BACKUP = 'RATEIO-BACKUP ' + JSON.stringify({ v: 7, ...dados });

async function entrar(page: Page) {
  await page.goto('/');
  await page.getByLabel('PIN', { exact: true }).fill('1234');
  await page.getByLabel('Repita o PIN').fill('1234');
  await page.getByRole('button', { name: 'Criar PIN' }).click();
  await expect(page.getByRole('heading', { name: /Divida a fatura/ })).toBeVisible();
}

const aba = (page: Page, nome: string) =>
  page.getByRole('navigation', { name: 'Seções' }).getByRole('button', { name: nome });

test('restaura um backup, registra pagamento no histórico e edita cobranças e PIX', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await entrar(page);

  // Config: restaurar .json
  await aba(page, 'Config').click();
  await page.getByTestId('bk-input').setInputFiles({
    name: 'backup-teste.json',
    mimeType: 'application/json',
    buffer: Buffer.from(BACKUP),
  });
  await expect(page.getByRole('status')).toContainText('Backup restaurado: 3 pessoa(s)');

  // PIX
  await page.getByLabel('Chave PIX', { exact: true }).fill('pix@exemplo.com');
  await page.getByLabel('Chave PIX', { exact: true }).blur();
  await expect(page.getByLabel('Dono da chave PIX')).toHaveValue('p1');

  // Histórico: só a Pessoa B deve (a A é dona do cartão): 2 meses de R$ 50,00
  await aba(page, 'Histórico').click();
  const aberto = page.getByRole('region', { name: /Em aberto/ });
  await expect(aberto).toContainText('R$ 100,00');
  await aberto.getByRole('button', { name: 'Registrar pagamento' }).click();
  await page.getByLabel('Valor recebido').fill('60');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(aberto).toContainText('R$ 40,00');
  await page.getByText('Setembro/2026').click();
  await expect(page.getByText('pago ✓')).toBeVisible();

  // Cobranças: edita o valor e acrescenta uma nova
  await aba(page, 'Cobranças').click();
  const valor = page.getByLabel('Valor', { exact: true }).first();
  await expect(valor).toHaveValue('30,00');
  await valor.fill('45,5');
  await valor.blur();
  await page.getByRole('button', { name: '+ Adicionar cobrança' }).click();
  await expect(page.getByLabel('Descrição')).toHaveCount(2);
  await page.getByLabel('Descrição').last().fill('Empréstimo exemplo');
  await page.getByLabel('Descrição').last().blur();
  await aba(page, 'Config').click();
  await aba(page, 'Cobranças').click();
  await expect(page.getByLabel('Valor', { exact: true }).first()).toHaveValue('45,50');
  await expect(page.getByLabel('Descrição').last()).toHaveValue('Empréstimo exemplo');

  expect(errors).toEqual([]);
});
