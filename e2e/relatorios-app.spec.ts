import { expect, test } from '@playwright/test';

/** Backup sintético (formato RATEIO-BACKUP v7) com 3 meses fechados, 2 pessoas e 2 tags. */
function backupSintetico(): string {
  const pessoas = [
    { id: 'p1', nome: 'Pessoa A', cor: '#3B5BDB', fone: '' },
    { id: 'p2', nome: 'Pessoa B', cor: '#D6336C', fone: '' },
  ];
  const item = (memo: string, a: number, b: number, tag: string, id: string) => ({
    memo,
    cents: a + b,
    parcela: null,
    fixa: false,
    tags: [tag],
    tagIds: [id],
    shares: [
      { pid: 'p1', nome: 'Pessoa A', cents: a },
      { pid: 'p2', nome: 'Pessoa B', cents: b },
    ],
  });
  const meses = [
    ['2026-08', 'Agosto/2026', 1],
    ['2026-09', 'Setembro/2026', 2],
    ['2026-10', 'Outubro/2026', 3],
  ] as const;
  const history = meses.map(([comp, label, k]) => ({
    id: Number(comp.replace('-', '')) * 1000 + 1,
    comp,
    label,
    closedAt: `${comp}-28T12:00:00.000Z`,
    signature: 'sig' + comp,
    keys: [],
    file: 'sintetico.ofx',
    chargesBefore: [],
    totalCents: 15000 * k + 2000 * k + 3000,
    people: pessoas.map((p) => ({
      pid: p.id,
      nome: p.nome,
      cor: p.cor,
      total: 1,
      text: 'msg',
      payments: [],
    })),
    items: [
      item('MERCADO FICTICIO SA', 10000 * k, 5000 * k, 'Mercado', 't1'),
      item('CINEMA INVENTADO', 2000 * k, 3000, 'Lazer', 't2'),
    ],
    fora: [],
  }));
  return (
    'RATEIO-BACKUP ' +
    JSON.stringify({
      v: 7,
      people: pessoas,
      rules: {},
      charges: [],
      ruleSplits: {},
      ruleEach: {},
      ruleObs: {},
      tags: [
        { id: 't1', nome: 'Mercado', cor: '#0CA678' },
        { id: 't2', nome: 'Lazer', cor: '#7048E8' },
      ],
      ruleTags: {},
      settings: {
        pix: '',
        pixOwner: 'p1',
        lastBackup: '',
        msgPending: true,
        msgProjection: false,
        projRecurring: false,
      },
      history,
      parcelas: {},
    })
  );
}

test.skip(!!process.env.E2E_BASE_URL, 'usa o modo local (localStorage) do build de teste');

test('aba Relatórios do app mostra os meses fechados salvos (dados sintéticos)', async ({
  page,
}) => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  const texto = backupSintetico();
  await page.addInitScript((t) => localStorage.setItem('rateio.local', t), texto);
  await page.goto('/');
  await page.getByLabel('PIN', { exact: true }).fill('1234');
  await page.getByLabel('Repita o PIN').fill('1234');
  await page.getByRole('button', { name: 'Criar PIN' }).click();
  await page
    .getByRole('navigation', { name: 'Seções' })
    .getByRole('button', { name: 'Relatórios' })
    .click();

  const rel = page.getByTestId('relatorios');
  await expect(rel.getByText('Último mês (Outubro/2026)')).toBeVisible();
  await expect(rel.locator('.hit')).toHaveCount(3);
  await rel.getByRole('button', { name: 'Por tag' }).click();
  await expect(rel.locator('.legend')).toContainText('Mercado');
  await rel.getByText('Ver como tabela').click();
  await expect(rel.locator('details.ctable table')).toBeVisible();
  expect(erros).toEqual([]);
});
