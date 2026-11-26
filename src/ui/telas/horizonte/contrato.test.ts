import { describe, expect, it, vi } from 'vitest';
import type { HorizonData, HorizonRepo, Pocket } from '../../../horizonte/types';
import { fonteDoContrato } from './contrato';

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

const base = (): Omit<HorizonData, 'myShare' | 'today'> => ({
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
  incomes: [
    {
      id: 'i1',
      name: 'Salário',
      group: 'eu',
      grossCents: 600000,
      deductions: { inss: 0, irrf: 0, consignado: 0, outros: 0 },
      netCents: 500000,
      advanceDay: 15,
      advanceCents: 200000,
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
    },
  ],
  holidays: [],
  overrides: [],
  fixed: [],
  planned: [],
  pockets: [
    pocket({ id: 'lz', name: 'Lazer' }),
    pocket({ id: 'rs', name: 'Reserva', rule: 'acumula', isReserve: true }),
  ],
  moves: [
    {
      id: 'm1',
      pocketId: 'lz',
      kind: 'ajuste',
      cents: 42000,
      onDate: '2020-01-01',
      reason: '',
      transferId: null,
      imprevisto: false,
      itemId: null,
    },
  ],
  weekly: { capCents: 35000, weeksPocketId: null },
  prefs: [],
});

function repo(over: Partial<HorizonRepo> = {}): HorizonRepo {
  const noop = vi.fn(async () => undefined);
  return new Proxy({ load: async () => base(), ...over } as HorizonRepo, {
    get: (t, k: string) => (k in t ? t[k as keyof HorizonRepo] : noop),
  });
}

const OFX = `<OFX><ACCTID>123</ACCTID>
<STMTTRN><TRNAMT>-100.00<FITID>A1<MEMO>LOJA X<DTPOSTED>20261110</STMTTRN>
<STMTTRN><TRNAMT>-50.00<FITID>A2<MEMO>LOJA Y PARC 2/5<DTPOSTED>20261112</STMTTRN></OFX>`;

describe('fonteDoContrato', () => {
  it('projeta janelas e caixinhas a partir do repo', async () => {
    const d = await fonteDoContrato(repo()).carregar(3);
    expect(d.janelas).toHaveLength(3);
    expect(d.janelas[0]!.totalEntradas).toBeGreaterThan(0);
    expect(d.caixinhas.find((c) => c.id === 'lz')?.saldo).toBe(42000);
    expect(d.tetoSemanal).toBe(35000);
  });

  it('transfere criando caixinha nova e bloqueia acima do saldo', async () => {
    const addMoves = vi.fn<(m: unknown[]) => Promise<void>>(async () => undefined);
    const upsertPocket = vi.fn(async () => undefined);
    const f = fonteDoContrato(repo({ addMoves, upsertPocket }));
    await f.transferir({ de: 'lz', para: '', nova: 'Fim de ano', cents: 20000, motivo: 'x' });
    expect(upsertPocket).toHaveBeenCalledOnce();
    expect(addMoves.mock.calls[0]![0]).toHaveLength(2);
    await expect(
      f.transferir({ de: 'lz', para: 'rs', cents: 99999999, motivo: '' }),
    ).rejects.toThrow(/Saldo/);
  });

  it('confere e salva OFX sem duplicar; recusa arquivo que não é OFX', async () => {
    const saveSnapshot = vi.fn(async () => ({ status: 'created' as const }));
    const f = fonteDoContrato(repo({ saveSnapshot }));
    const r = await f.conferirOfx([
      { nome: 'a.ofx', texto: OFX },
      { nome: 'b.pdf', texto: '%PDF' },
    ]);
    expect(r.map((x) => x.status)).toEqual(['ok', 'erro']);
    expect(await f.salvarOfx(r)).toBe(2);
    expect(saveSnapshot).toHaveBeenCalledOnce();
  });

  it('liga e desliga o 13º pelo salário', async () => {
    const upsertIncome = vi.fn<(i: unknown) => Promise<void>>(async () => undefined);
    await fonteDoContrato(repo({ upsertIncome })).set13(true);
    expect(upsertIncome.mock.calls[0]![0]).toMatchObject({ thirteenth: { considered: true } });
  });
});
