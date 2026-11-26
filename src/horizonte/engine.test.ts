import { parseOFX } from '../lib/ofx';
import { describe, expect, it } from 'vitest';
import {
  engine,
  seriesKeyOf,
  snapshotFromOfx,
  firstInvoiceComp,
  invoiceCompFromClosing,
  payWindow,
  planTransfer,
  pocketBalance,
  project,
  simulateAnticipation,
  thirteenth,
  weeks,
} from './engine';
import type {
  FixedItem,
  HorizonData,
  IncomeSource,
  InvoiceLine,
  InvoiceSnapshot,
  Pocket,
  PocketMove,
} from './types';

// Fixtures sintéticas (nunca a fatura real).
const line = (p: Partial<InvoiceLine>): InvoiceLine => ({
  pos: 0,
  fitid: '',
  postedOn: null,
  memo: 'LOJA',
  norm: 'LOJA',
  cents: 10000,
  kind: 'compra',
  instCur: null,
  instTot: null,
  seriesKey: null,
  ...p,
});
const snap = (comp: string, lines: InvoiceLine[], acct = 'kA'): InvoiceSnapshot => ({
  id: `${acct}${comp}`,
  acct,
  comp,
  dueDate: `${comp}-07`,
  totalCents: 0,
  contentHash: comp,
  importedAt: '',
  lines,
});
const income = (p: Partial<IncomeSource> = {}): IncomeSource => ({
  id: 'i1',
  name: 'Salário',
  group: 'eu',
  grossCents: 600000,
  deductions: { inss: 0, irrf: 0, consignado: 0, outros: 0 },
  netCents: 500000,
  advanceDay: 15,
  advanceCents: 0,
  salaryBusinessDay: 5,
  thirteenth: {
    considered: false,
    avos: 11,
    firstDate: null,
    secondDate: null,
    firstNetCents: null,
    secondNetCents: null,
    secondDeductionsCents: 0,
  },
  ...p,
});
const pocket = (p: Partial<Pocket>): Pocket => ({
  id: 'p',
  name: 'Cx',
  rule: 'livre',
  floorCents: 0,
  goalCents: null,
  goalComp: null,
  monthlyCents: 0,
  yieldPctMonth: 0,
  isReserve: false,
  isWeeks: false,
  archived: false,
  ...p,
});
const move = (p: Partial<PocketMove>): PocketMove => ({
  id: Math.random().toString(36),
  pocketId: 'p',
  kind: 'ajuste',
  cents: 0,
  onDate: '2026-11-01',
  reason: '',
  transferId: null,
  imprevisto: false,
  itemId: null,
  ...p,
});
const data = (p: Partial<HorizonData> = {}): HorizonData => ({
  settings: {
    months: 6,
    reserveMode: null,
    reserveValueCents: null,
    reservePct: null,
    reserveGoalComp: null,
    furoOrder: ['semanas', 'reserva', 'emergencia'],
    avulsosOn: false,
  },
  snapshots: [],
  cards: [],
  decisions: [],
  incomes: [],
  holidays: [],
  overrides: [],
  fixed: [],
  planned: [],
  pockets: [],
  moves: [],
  weekly: { capCents: 0, weeksPocketId: null },
  prefs: [],
  myShare: () => 1,
  today: '2026-12-01',
  ...p,
});
const parcelas = (r: ReturnType<typeof project>) =>
  r.windows.flatMap((w) =>
    w.items.filter((i) => i.origin === 'parcela').map((i) => [w.window.comp, i.inst!.cur, i.cents]),
  );

const S = 'p2|kA|LOJA|10';
const compra310 = snap('2026-12', [line({ instCur: 3, instTot: 10, seriesKey: S })]);

describe('janela de pagamento (RF33, CA20)', () => {
  it('dez/26 = adiantamento 15/11 + salário no 5º dia útil de dez, com feriado', () => {
    const w = payWindow('2026-12', income(), [{ date: '2026-12-03', description: 'x' }], []);
    expect(w.advanceDate).toBe('2026-11-15');
    expect(w.salaryDate).toBe('2026-12-08'); // 1,2,(3 feriado),4,7,8
    expect(w.end).toBe('2026-12-14');
    expect(w.days).toBe(30);
  });
  it('override manual vence o cálculo', () => {
    expect(
      payWindow('2026-12', income(), [], [{ comp: '2026-12', salaryDate: '2026-12-09' }])
        .salaryDate,
    ).toBe('2026-12-09');
  });
});

describe('parcelas (CA02, CA03, CA19, RN12, CA18)', () => {
  it('3/10 de R$100 gera 7 parcelas e nenhuma depois', () => {
    const r = project(
      data({
        snapshots: [compra310],
        settings: { ...data().settings, months: 12 },
        today: '2026-11-20',
      }),
    );
    const p = parcelas(r);
    expect(p).toHaveLength(7);
    expect(p[0]).toEqual(['2027-01', 4, 10000]);
    expect(p.at(-1)).toEqual(['2027-07', 10, 10000]);
  });
  it('antecipar as 2 últimas tira 9/10 e 10/10; reimportar não traz de volta', () => {
    const decisions = [
      { alertKey: `serie|${S}`, decision: 'pago_antecipado' as const, anticipatedLast: 2 },
    ];
    const d = data({
      snapshots: [compra310],
      decisions,
      settings: { ...data().settings, months: 12 },
      today: '2026-11-20',
    });
    expect(parcelas(project(d)).map((x) => x[1])).toEqual([4, 5, 6, 7, 8]);
    const reimport = { ...compra310, id: 'novo', contentHash: 'outro' };
    expect(parcelas(project({ ...d, snapshots: [reimport] })).map((x) => x[1])).toEqual([
      4, 5, 6, 7, 8,
    ]);
  });
  it('pago antecipado inteiro some de todos os meses', () => {
    const r = project(
      data({
        snapshots: [compra310],
        decisions: [{ alertKey: `serie|${S}`, decision: 'pago_antecipado' }],
      }),
    );
    expect(parcelas(r)).toHaveLength(0);
  });
  it('compra 50/50 entra só com a metade', () => {
    const r = project(data({ snapshots: [compra310], myShare: () => 0.5, today: '2026-11-20' }));
    expect(parcelas(r)[0]![2]).toBe(5000);
  });
  it('compra depois do fechamento vai para a fatura seguinte (CA21)', () => {
    expect(firstInvoiceComp('2026-12-03', { acct: 'kA', name: '', closingDay: 2, dueDay: 7 })).toBe(
      '2027-01',
    );
    expect(firstInvoiceComp('2026-12-02', { acct: 'kA', name: '', closingDay: 2, dueDay: 7 })).toBe(
      '2026-12',
    );
  });
});

describe('saldo, recorrências e terceiros', () => {
  it('entrada 5.000 e comprometido 3.000 → saldo 2.000 (CA11, CA14)', () => {
    const r = project(
      data({
        incomes: [income()],
        planned: [
          {
            id: 'x',
            comp: '2026-12',
            direction: 'saida',
            name: 'IPVA',
            amountCents: 300000,
            kind: 'real',
            considered: true,
            receivedOn: null,
            thirdParty: null,
            group: 'eu',
          },
        ],
        today: '2026-11-20',
      }),
    );
    const w = r.windows[0]!;
    expect([w.window.comp, w.entradas, w.comprometido, w.saldo]).toEqual([
      '2026-12',
      500000,
      300000,
      200000,
    ]);
    expect(r.capacity[0]!.base).toBe(200000);
  });
  it('fixa mensal é previsto, nunca comprometido (CA09)', () => {
    const f: FixedItem = {
      id: 'f',
      name: 'Internet',
      alias: null,
      hidden: false,
      direction: 'saida',
      amountCents: 10000,
      recurrence: { kind: 'mensal', day: 10 },
      endComp: null,
      isSubscription: false,
      sourcePocketId: null,
      thirdParty: null,
    };
    const w = project(data({ fixed: [f] })).windows[0]!;
    expect([w.previsto, w.comprometido]).toEqual([10000, 0]);
  });
  it('gasolina toda terça: janela com 5 terças soma 5 (CA22)', () => {
    const f: FixedItem = {
      id: 'g',
      name: 'Gasolina',
      alias: null,
      hidden: false,
      direction: 'saida',
      amountCents: 5000,
      recurrence: { kind: 'semanal', weekday: 2 },
      endComp: null,
      isSubscription: false,
      sourcePocketId: null,
      thirdParty: null,
    };
    const r = project(data({ fixed: [f], today: '2026-11-20' }));
    const w = r.windows.find((x) => x.items.filter((i) => i.origin === 'fixa').length === 5);
    expect(w).toBeTruthy();
    expect(w!.previsto).toBe(25000);
  });
  it('consignado de terceiro aparece como +X e −X, líquido 0 (CA24)', () => {
    const f: FixedItem = {
      id: 'c',
      name: 'Consignado pai',
      alias: null,
      hidden: false,
      direction: 'saida',
      amountCents: 30000,
      recurrence: { kind: 'mensal', day: 5 },
      endComp: null,
      isSubscription: false,
      sourcePocketId: null,
      thirdParty: 'pai',
    };
    const w = project(data({ fixed: [f] })).windows[0]!;
    expect(w.items.map((i) => [i.direction, i.cents, i.group])).toEqual([
      ['saida', 30000, 'pai'],
      ['entrada', 30000, 'pai'],
    ]);
    expect(w.saldo).toBe(0);
  });
  it('apelido esconde o memo real na tela e no CSV (CA27)', () => {
    const r = project(
      data({
        snapshots: [
          snap('2026-12', [
            line({ memo: 'FARMACIA SECRETA 03/10', instCur: 3, instTot: 10, seriesKey: S }),
          ]),
        ],
        prefs: [{ itemKey: S, alias: 'Saúde', hidden: false }],
        today: '2026-11-20',
      }),
    );
    const csv = engine.exportCsv(r);
    expect(csv).toContain('Saúde');
    expect(csv).not.toContain('FARMACIA');
    expect(JSON.stringify(r.windows.map((w) => w.items))).not.toContain('FARMACIA');
  });
});

describe('Semanas (RF36, CA23)', () => {
  it('30 dias com teto R$350 → R$1.500; estouro de R$50 reduz a semana seguinte', () => {
    const r = project(
      data({
        incomes: [income()],
        weekly: { capCents: 35000, weeksPocketId: null },
        today: '2026-11-20',
      }),
    );
    expect(r.windows[0]!.semanasCents).toBe(150000);
    const ws = weeks(r.windows[0]!.window, 35000, [Math.round((35000 * 1) / 7) + 5000]);
    // 15/11/26 é domingo: 1ª semana = 1 dia
    expect(ws[0]!.days).toBe(1);
    expect(ws[0]!.carry).toBe(5000);
    expect(ws[1]!.allowance).toBe(35000 - 5000);
    expect(ws.reduce((a, w) => a + w.days, 0)).toBe(30);
  });
});

describe('caixinhas, furo e transferência', () => {
  it('meta: saldo 1.000 + 200/mês atinge 2.000 em 5 meses (CA13)', () => {
    const r = project(
      data({
        pockets: [pocket({ id: 'p', goalCents: 200000, monthlyCents: 20000 })],
        moves: [move({ cents: 100000 })],
      }),
    );
    const pp = r.pockets[0]!;
    expect(pp.byComp.findIndex((x) => x.comp === pp.goalReachedComp)).toBe(4);
  });
  it('sobra vai inteira para a Reserva (§8B)', () => {
    const r = project(
      data({
        incomes: [income()],
        pockets: [pocket({ id: 'r', isReserve: true, rule: 'acumula' })],
      }),
    );
    expect(r.pockets[0]!.byComp[0]!.balance).toBe(500000);
  });
  it('furo 400 com Semanas 250: 250 Semanas + 150 Reserva, emergência intocada (CA29, CA26)', () => {
    const d = data({
      incomes: [income({ netCents: 0 })],
      weekly: { capCents: Math.round((25000 * 7) / 30), weeksPocketId: null },
      pockets: [
        pocket({ id: 'r', isReserve: true, rule: 'acumula' }),
        pocket({ id: 'e', rule: 'piso', floorCents: 100000 }),
      ],
      moves: [move({ pocketId: 'r', cents: 100000 }), move({ pocketId: 'e', cents: 150000 })],
      planned: [
        {
          id: 'x',
          comp: '2026-12',
          direction: 'saida',
          name: 'Conserto',
          amountCents: 15000,
          kind: 'real',
          considered: true,
          receivedOn: null,
          thirdParty: null,
          group: 'eu',
        },
      ],
      today: '2026-11-20',
    });
    const w = project(d).windows[0]!;
    const sem = w.semanasCents; // ≈ R$ 250 (arredondamento de dias × teto ÷ 7)
    expect(Math.abs(sem - 25000)).toBeLessThanOrEqual(1);
    expect(w.furo!.cents).toBe(sem + 15000);
    expect(w.furo!.plan.map((p) => [p.source, p.cents])).toEqual([
      ['semanas', sem],
      ['reserva', 15000],
    ]);
    expect(w.furo!.plan.some((p) => p.source === 'emergencia')).toBe(false);
  });
  it('emergência só acima do piso e com confirmação', () => {
    const d = data({
      pockets: [pocket({ id: 'e', rule: 'piso', floorCents: 100000 })],
      moves: [move({ pocketId: 'e', cents: 120000 })],
      planned: [
        {
          id: 'x',
          comp: '2026-12',
          direction: 'saida',
          name: 'X',
          amountCents: 50000,
          kind: 'real',
          considered: true,
          receivedOn: null,
          thirdParty: null,
          group: 'eu',
        },
      ],
      today: '2026-11-20',
    });
    const f = project(d).windows[0]!.furo!;
    expect(f.plan).toEqual([
      { source: 'emergencia', pocketId: 'e', cents: 20000, needsConfirm: true },
    ]);
    expect(f.uncovered).toBe(30000);
  });
  it('transferir 600 da Reserva para caixinha nova (CA28)', () => {
    const { moves, newPocket } = planTransfer(
      'r',
      { newName: 'Fim de ano', rule: 'livre' },
      60000,
      '2026-11-26',
      'viagem',
    );
    const all = [move({ pocketId: 'r', cents: 200000 }), ...moves];
    expect(pocketBalance('r', all)).toBe(140000);
    expect(pocketBalance(newPocket!.id, all)).toBe(60000);
    expect(moves[0]!.transferId).toBe(moves[1]!.transferId);
    const before = project(data({ incomes: [income()] })).windows[0]!.saldo;
    const after = project(
      data({
        incomes: [income()],
        pockets: [pocket({ id: 'r', isReserve: true }), newPocket!],
        moves: all,
      }),
    ).windows[0]!.saldo;
    expect(after).toBe(before);
  });
  it('caixinha fonte paga até zerar e alerta (RF34)', () => {
    const f: FixedItem = {
      id: 'e',
      name: 'Empréstimo',
      alias: null,
      hidden: false,
      direction: 'saida',
      amountCents: 30000,
      recurrence: { kind: 'mensal', day: 10 },
      endComp: null,
      isSubscription: false,
      sourcePocketId: 'p',
      thirdParty: null,
    };
    const r = project(
      data({
        fixed: [f],
        pockets: [pocket({ id: 'p', rule: 'fonte' })],
        moves: [move({ cents: 50000 })],
      }),
    );
    expect(r.windows[0]!.previsto).toBe(0);
    expect(r.windows[1]!.previsto).toBe(10000);
    expect(r.windows[2]!.previsto).toBe(30000);
    expect(r.alerts.some((a) => a.type === 'fonte_zerou')).toBe(true);
  });
});

describe('13º (RF48, CA25)', () => {
  const inc = income({
    thirteenth: {
      considered: true,
      avos: 11,
      firstDate: '2026-11-30',
      secondDate: '2026-12-18',
      firstNetCents: null,
      secondNetCents: null,
      secondDeductionsCents: 40000,
    },
  });
  it('1ª = 50% de 6.000×11/12; 2ª = resto − descontos', () => {
    expect(thirteenth(inc)).toEqual({ first: 275000, second: 235000, source: 'previsto' });
  });
  it('desligar remove de todas as janelas', () => {
    const on = project(data({ incomes: [inc], today: '2026-11-20' }));
    expect(on.windows.flatMap((w) => w.items).filter((i) => i.origin === '13o')).toHaveLength(2);
    const off = project(
      data({
        incomes: [{ ...inc, thirteenth: { ...inc.thirteenth, considered: false } }],
        today: '2026-11-20',
      }),
    );
    expect(off.windows.flatMap((w) => w.items).filter((i) => i.origin === '13o')).toHaveLength(0);
  });
});

describe('validações (RF16–RF20)', () => {
  it('parcela sumiu (CA05)', () => {
    const r = project(data({ snapshots: [compra310, snap('2027-01', [])] }));
    expect(r.alerts.map((a) => a.type)).toContain('parcela_sumiu');
  });
  it('valor divergente: +10 centavos alerta, +4 não (CA06)', () => {
    const mk = (c: number) =>
      project(
        data({
          snapshots: [
            compra310,
            snap('2027-01', [line({ instCur: 4, instTot: 10, seriesKey: S, cents: c })]),
          ],
        }),
      ).alerts.map((a) => a.type);
    expect(mk(10010)).toContain('valor_divergente');
    expect(mk(10004)).not.toContain('valor_divergente');
  });
  it('duplicada, mês sem fatura e ignorar', () => {
    const r = project(
      data({
        snapshots: [compra310, snap('2027-02', [line({ instCur: 3, instTot: 10, seriesKey: S })])],
      }),
    );
    expect(r.alerts.map((a) => a.type)).toEqual(
      expect.arrayContaining(['duplicada', 'mes_sem_fatura']),
    );
    const key = r.alerts.find((a) => a.type === 'mes_sem_fatura')!.key;
    const r2 = project(
      data({
        snapshots: [compra310, snap('2027-02', [])],
        decisions: [{ alertKey: key, decision: 'ignorado' }],
      }),
    );
    expect(r2.alerts.map((a) => a.type)).not.toContain('mes_sem_fatura');
  });
});

describe('antecipação (RF42)', () => {
  it('mostra as últimas parcelas, o desconto e se vale', () => {
    const d = data({
      snapshots: [compra310],
      pockets: [pocket({ id: 'p', yieldPctMonth: 1 })],
      today: '2026-11-20',
    });
    const s = simulateAnticipation(d, S, 2, 18000, 'p');
    expect(s.removed.map((x) => x.inst)).toEqual([9, 10]);
    expect([s.fullCents, s.discountCents, s.worth, s.blocked]).toEqual([20000, 2000, true, null]);
    expect(simulateAnticipation({ ...d, myShare: () => 0.5 }, S, 2, 20000, 'p')).toMatchObject({
      blocked: 'dividida',
      alertFullPrice: true,
    });
  });
});

describe('desempenho (RNF04)', () => {
  it('12 meses com 24 snapshots em < 300 ms', () => {
    const snaps = Array.from({ length: 24 }, (_, k) =>
      snap(
        `20${25 + Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`,
        Array.from({ length: 60 }, (_, i) =>
          line({ pos: i, instCur: 1 + (i % 9), instTot: 10, seriesKey: `s${i}` }),
        ),
      ),
    );
    const t = performance.now();
    project(data({ snapshots: snaps, settings: { ...data().settings, months: 12 } }));
    expect(performance.now() - t).toBeLessThan(300);
  });
});

describe('OFX -> snapshot (RF02–RF04)', () => {
  it('mesma série em meses diferentes tem a mesma chave; mesmo conteúdo = mesmo hash', () => {
    expect(seriesKeyOf('kA', 'LOJA X 03/10', 10)).toBe(seriesKeyOf('kA', 'LOJA X 04/10', 10));
    const parsed = {
      acct: 'kA',
      lines: [
        { fitid: 'f', memo: 'LOJA X PARC 03/10', cents: -10000, date: '2026-11-03' },
        { fitid: 'g', memo: 'PADARIA', cents: -500, date: '2026-11-04' },
      ],
    };
    const s = snapshotFromOfx(parsed, '2026-12', '2026-12-07');
    expect(s.lines[0]).toMatchObject({ cents: 10000, kind: 'compra', instCur: 3, instTot: 10 });
    expect(s.totalCents).toBe(10500);
    expect(snapshotFromOfx(parsed, '2026-12', null).contentHash).toBe(s.contentHash);
    expect(JSON.stringify(s)).not.toMatch(/OFXHEADER|<STMTTRN>/);
  });
});

describe('mês da fatura pelo fechamento do OFX (formato Nubank, fixtures inventadas)', () => {
  const ofx = (dtStart: string, dtEnd: string, memos: [string, string][]) =>
    `<OFX><BANKTRANLIST><DTSTART>${dtStart}000000[-3:BRT]</DTSTART><DTEND>${dtEnd}000000[-3:BRT]</DTEND>` +
    memos
      .map(
        ([d, m], i) =>
          `<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>${d}000000[-3:BRT]</DTPOSTED><TRNAMT>-10.00</TRNAMT><FITID>f${i}${d}</FITID><MEMO>${m}</MEMO></STMTTRN>`,
      )
      .join('') +
    `</BANKTRANLIST><ACCTID>x</ACCTID></OFX>`;
  const card = { acct: 'kA', name: '', closingDay: 2, dueDay: 9 };
  const casos: [string, string, string][] = [
    ['20261102', '20261202', '2026-12'],
    ['20261202', '20270102', '2027-01'],
    ['20270102', '20270202', '2027-02'],
    ['20270202', '20270302', '2027-03'],
  ];
  it.each(casos)('DTEND %s→%s vence em %s, com ou sem cartão cadastrado', (ini, fim, esperado) => {
    // compras antigas de parcelas não podem puxar o mês
    const p = parseOFX(ofx(ini, fim, [['20260801', 'Loja - Parcela 4/6']]));
    expect(invoiceCompFromClosing(p.dtEnd, card)).toBe(esperado);
    expect(invoiceCompFromClosing(p.dtEnd, undefined)).toBe(esperado);
  });
  it('parcelas futuras caem a partir do mês seguinte à fatura', () => {
    const S = 'ser';
    const s = snap('2026-12', [line({ instCur: 4, instTot: 6, seriesKey: S })]);
    const r = project(data({ snapshots: [s], cards: [card], today: '2026-11-26' }));
    const meses = r.windows
      .filter((w) => w.items.some((i) => i.origin === 'parcela'))
      .map((w) => w.window.comp);
    expect(meses).toEqual(['2027-01', '2027-02']);
  });
});
