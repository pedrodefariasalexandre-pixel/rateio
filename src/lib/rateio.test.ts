/**
 * Regras do rateio-v3 portadas da bateria de estresse (rateio-v3-testes/, ids entre parênteses).
 * Cada teste descreve o comportamento CORRETO. Só dados sintéticos.
 */
import {
  applyBackup,
  backupProblem,
  backupText,
  decryptText,
  encryptText,
  parcelasConflict,
  parseBackup,
} from './backup';
import { chargeCur, chargesOutside } from './charges';
import { canClose, closeMonth, undoClose } from './closeMonth';
import { csvMonth } from './csv';
import { addMonths, isRealDate } from './dates';
import {
  checkInstallments,
  importStatement,
  markDuplicates,
  releaseMissingOwners,
} from './invoice';
import { buildMessage, waLink } from './message';
import { memoryFor, setEachRule } from './memory';
import { decodeOfx, parseOFX } from './ofx';
import { parcelKey } from './parcelas';
import { buildProjection, currentProjItems } from './projection';
import { openBalances, savePayment } from './receivables';
import { reportData } from './reports';
import {
  bulkAssign,
  excludeTx,
  findTx,
  includeTx,
  learnBeforeMessages,
  payInAdvance,
  setSplitMode,
  setWeight,
  toggleOwner,
} from './review';
import { computeTotals, sharesOf, stateOf } from './split';
import { createTag, setItemTags } from './tags';
import { normalize, parseParcela, pixLabel } from './text';
import { pushUndo, undoLast } from './undo';
import type { Ctx } from './types';
import { ctx, faturaBase, histEntry, ofx } from '../test/fixtures';

const imp = (c: Ctx, text: string, name = 'f.ofx') => importStatement(c, parseOFX(text), name);
const tx = (c: Ctx, fitid: string) => c.inv.txs.find((t) => t.fitid === fitid)!;
const assignAll = (c: Ctx, pid: string) =>
  c.inv.txs.filter((t) => !t.excluded && !t.owners.length).forEach((t) => toggleOwner(c, t, pid));
/** Gerar mensagens + fechar mês, como na tela. */
const finishAndClose = (c: Ctx) => {
  learnBeforeMessages(c);
  expect(canClose(c)).toBe(true);
  return closeMonth(c, new Map());
};

describe('contrato do texto (chave da memória)', () => {
  // valores gerados com o normalize()/parseParcela() do próprio rateio-v3.html
  it.each([
    ['Pão de Açúcar 12/03 PARC 2/5', 'PAO DE ACUCAR', { cur: 2, tot: 5 }],
    ['UBER *TRIP 1234567', 'UBER TRIP', null],
    ['LOJA MOVEIS FAKE - Parcela 2/10', 'LOJA MOVEIS FAKE', { cur: 2, tot: 10 }],
    ['Apple.Com/Bill', 'APPLE COM/BILL', null],
    ['Café-Bar (Centro) 05.11.2026', 'CAFE BAR CENTRO', null],
    ['IFOOD *Restaurante, Ltda.', 'IFOOD RESTAURANTE LTDA', null],
    ['AMAZON MKTPLC 3/12', 'AMAZON MKTPLC', { cur: 3, tot: 12 }],
  ])('%s', (memo, norm, parc) => {
    expect(normalize(memo)).toBe(norm);
    expect(parseParcela(memo)).toEqual(parc);
  });

  it('chave da parcela: p3|FITID|t|n com FITID, p2|cartão|estab|t|n sem', () => {
    const t = { fitid: 'F9', acct: 'kabc', norm: 'LOJA', parcela: { cur: 2, tot: 5 } };
    expect(parcelKey(t)).toBe('p3|F9|5|2');
    expect(parcelKey({ ...t, fitid: 'sem-fitid-3' })).toBe('p2|kabc|LOJA|5|2');
  });
});

describe('OFX', () => {
  it('SGML típico: compra + IOF viram um item e a conferência fecha (B01)', () => {
    const c = ctx();
    expect(imp(c, faturaBase())).toEqual({ ok: true });
    expect(c.inv.comp).toBe('2026-11');
    expect(tx(c, 'A005').cents).toBe(8510);
    expect(c.inv.txs).toHaveLength(7);
  });

  it('XML com BOM e CRLF é lido igual (B02)', () => {
    const c = ctx();
    imp(c, faturaBase({ style: 'xml', bom: true, crlf: true }));
    expect(c.inv.txs).toHaveLength(7);
    expect(c.inv.txs[0]!.memo).toBe('MERCADO FICTICIO SA');
  });

  it('Windows-1252 e UTF-8 com acentos (B03, B04)', () => {
    const txt = ofx({ trns: [{ amt: '-10.00', memo: 'AÇÚCAR E CAFÉ LTDA', fitid: 'W1' }] });
    const latin1 = Uint8Array.from([...txt].map((ch) => ch.charCodeAt(0)));
    expect(parseOFX(decodeOfx(latin1)).lines[0]!.memo).toBe('AÇÚCAR E CAFÉ LTDA');
    const utf8 = new TextEncoder().encode(txt.replace('CHARSET:1252', 'CHARSET:NONE'));
    expect(parseOFX(decodeOfx(utf8)).lines[0]!.memo).toBe('AÇÚCAR E CAFÉ LTDA');
  });

  it('arquivo vazio ou lixo não abre a revisão (B05)', () => {
    const c = ctx();
    expect(imp(c, '').ok).toBe(false);
    expect(imp(c, '<html><body>oi</body></html>').ok).toBe(false);
  });

  it('valor ilegível não some em silêncio (B06)', () => {
    const p = parseOFX(
      ofx({
        trns: [
          { amt: '-20.00', memo: 'LOJA OK', fitid: 'V1' },
          { amt: '(10.00)', memo: 'LOJA PARENTESES', fitid: 'V2' },
          { amt: '30.00-', memo: 'LOJA SINAL NO FIM', fitid: 'V3' },
        ],
      }),
    );
    expect(p.lines).toHaveLength(1);
    expect(p.skipped.map((s) => s.raw)).toEqual(['(10.00)', '30.00-']);
  });

  it('DTEND com mês 13 não vira competência inválida (B07)', () => {
    const c = ctx();
    imp(
      c,
      ofx({
        dtEnd: '20261399',
        dtStart: '20261301',
        trns: [{ amt: '-10.00', memo: 'LOJA', fitid: 'D1', date: '20261015' }],
      }),
    );
    expect(c.inv.comp).toBe('2026-10');
  });

  it('mais créditos que compras não inverte o que é compra (B08)', () => {
    const c = ctx();
    imp(
      c,
      ofx({
        trns: [
          { amt: '-100.00', memo: 'LOJA GRANDE', fitid: 'S1' },
          { amt: '-50.00', memo: 'LOJA PEQUENA', fitid: 'S2' },
          { amt: '10.00', memo: 'ESTORNO PARCIAL', fitid: 'S3' },
          { amt: '20.00', memo: 'CASHBACK', fitid: 'S4' },
          { amt: '30.00', memo: 'CREDITO PROMOCIONAL', fitid: 'S5' },
        ],
      }),
    );
    expect(c.inv.txs.filter((t) => /^LOJA/.test(t.memo)).every((t) => t.kind === 'compra')).toBe(
      true,
    );
  });

  it('sem TRNTYPE e compras positivas: vale a maioria (G02)', () => {
    const c = ctx();
    imp(
      c,
      ofx({
        noType: true,
        trns: [
          { amt: '100.00', memo: 'LOJA A', fitid: 'G1' },
          { amt: '50.00', memo: 'LOJA B', fitid: 'G2' },
          { amt: '-30.00', memo: 'Pagamento recebido', fitid: 'G3' },
        ],
      }),
    );
    expect(tx(c, 'G1').kind).toBe('compra');
    expect(tx(c, 'G1').cents).toBe(10000);
    expect(tx(c, 'G3').kind).toBe('pagamento');
  });

  it('mesmo FITID: lojas diferentes não somam; 4+ marcam; parcelas diferentes separadas (B09–B11, H02)', () => {
    const c = ctx();
    imp(
      c,
      ofx({
        trns: [
          { amt: '-10.00', memo: 'LOJA A', fitid: 'DUP' },
          { amt: '-20.00', memo: 'LOJA B', fitid: 'DUP' },
        ],
      }),
    );
    expect(c.inv.txs.map((t) => t.cents)).toEqual([1000, 2000]);
    expect(c.inv.txs.every((t) => t.fitidWarn)).toBe(true);
    imp(
      c,
      ofx({ trns: [1, 2, 3, 4].map((i) => ({ amt: `-1${i}.00`, memo: 'LOJA ' + i, fitid: 'Q' })) }),
    );
    expect(c.inv.txs.every((t) => t.dup && t.fitidWarn)).toBe(true);
    imp(
      c,
      ofx({
        trns: [
          { amt: '-50.00', memo: 'LOJA X Parcela 2/3', fitid: 'P' },
          { amt: '-50.00', memo: 'LOJA X Parcela 3/3', fitid: 'P' },
        ],
      }),
    );
    expect(c.inv.txs).toHaveLength(2);
  });

  it('pagamento recebido do mesmo valor marca a compra como já paga; empate não decide (B16)', () => {
    const c = ctx();
    imp(
      c,
      ofx({
        trns: [
          { amt: '-40.00', memo: 'LOJA PAGA', fitid: 'K1', date: '20261010' },
          { amt: '40.00', memo: 'Pagamento recebido', fitid: 'K2', date: '20261011' },
          { amt: '-25.00', memo: 'LOJA X', fitid: 'K3', date: '20261012' },
          { amt: '-25.00', memo: 'LOJA Y', fitid: 'K4', date: '20261012' },
          { amt: '25.00', memo: 'Pagamento recebido', fitid: 'K5', date: '20261012' },
        ],
      }),
    );
    expect(tx(c, 'K1').reason).toBe('pago');
    expect(tx(c, 'K5').payState).toBe('ambiguo');
    expect(tx(c, 'K3').excluded).toBe(false);
  });

  it('possível cobrança duplicada é sinalizada (B17)', () => {
    const c = ctx();
    imp(
      c,
      ofx({
        trns: [
          { amt: '-9.90', memo: 'CAFE', fitid: 'X1', date: '20261010' },
          { amt: '-9.90', memo: 'CAFE', fitid: 'X2', date: '20261010' },
        ],
      }),
    );
    markDuplicates(c);
    expect(c.inv.txs.every((t) => t.maybeDup === 2)).toBe(true);
  });

  it('OFX lê ponto como decimal; data inexistente fica vazia (H01, H09)', () => {
    const p = parseOFX(ofx({ trns: [{ amt: '-1.500', memo: 'X', fitid: 'H', date: '20260230' }] }));
    expect(p.lines[0]!.cents).toBe(-150);
    expect(p.lines[0]!.date).toBe('');
    expect(isRealDate('2026-02-29')).toBe(false);
    expect(isRealDate('2028-02-29')).toBe(true);
  });
});

describe('divisão', () => {
  it('totais por pessoa fecham com o atribuído (A07)', () => {
    const c = ctx();
    imp(c, faturaBase());
    const t0 = tx(c, 'A001'),
      t1 = tx(c, 'A003');
    toggleOwner(c, t0, 'p1');
    toggleOwner(c, t0, 'p2');
    toggleOwner(c, t0, 'p3');
    toggleOwner(c, t1, 'p1');
    toggleOwner(c, t1, 'p2');
    setSplitMode(c, t1, 'partes');
    setWeight(c, t1, 'p1', '2');
    assignAll(c, 'p3');
    const tot = computeTotals(c);
    expect(tot.check).toBe(true);
    expect(sharesOf(c, t1).shares).toEqual({ p1: 20000, p2: 10000 });
    expect(sharesOf(c, t0).shares).toEqual({ p1: 4000, p2: 4000, p3: 4000 });
  });

  it('peso inválido deixa a divisão inválida, sem NaN (A06)', () => {
    const c = ctx();
    imp(c, faturaBase());
    const t = tx(c, 'A001');
    toggleOwner(c, t, 'p1');
    toggleOwner(c, t, 'p2');
    setSplitMode(c, t, 'partes');
    setWeight(c, t, 'p1', 'abc');
    expect(sharesOf(c, t).ok).toBe(false);
    expect(stateOf(c).invalid).toBe(1);
  });

  it('atribuir em massa só pega os sem dono', () => {
    const c = ctx();
    imp(c, faturaBase());
    toggleOwner(c, tx(c, 'A001'), 'p2');
    const n = bulkAssign(
      c,
      c.inv.txs.filter((t) => !t.excluded),
      'p1',
    );
    expect(n).toBe(4);
    expect(tx(c, 'A001').owners).toEqual(['p2']);
  });
});

describe('memória', () => {
  it('texto + valor: donos diferentes por valor; valor novo fica sem dono com motivo (F04)', () => {
    const c = ctx();
    imp(
      c,
      ofx({
        dtEnd: '20261010',
        trns: [
          { amt: '-10.00', memo: 'APP STORE FICTICIA', fitid: 'M1' },
          { amt: '-30.00', memo: 'APP STORE FICTICIA', fitid: 'M2' },
        ],
      }),
    );
    toggleOwner(c, tx(c, 'M1'), 'p1');
    toggleOwner(c, tx(c, 'M2'), 'p2');
    finishAndClose(c);
    imp(
      c,
      ofx({
        trns: [
          { amt: '-10.00', memo: 'APP STORE FICTICIA', fitid: 'N1' },
          { amt: '-30.00', memo: 'APP STORE FICTICIA', fitid: 'N2' },
          { amt: '-20.00', memo: 'APP STORE FICTICIA', fitid: 'N3' },
        ],
      }),
    );
    expect(tx(c, 'N1').owners).toEqual(['p1']);
    expect(tx(c, 'N2').owners).toEqual(['p2']);
    expect(tx(c, 'N3').owners).toEqual([]);
    expect(tx(c, 'N3').memNote).toBeTruthy();
  });

  it('valor novo com um dono só e texto 1× na fatura: aplica "pelo nome"', () => {
    const c = ctx({
      ruleObs: { LOJA: [{ c: 1000, o: ['p2'], at: '2026-10-01' }] },
      rules: { LOJA: ['p2'] },
    });
    expect(memoryFor(c, { norm: 'LOJA', cents: 5000 }, 1, new Map())).toMatchObject({
      owners: ['p2'],
      kind: 'nome',
    });
    expect(memoryFor(c, { norm: 'LOJA', cents: 5000 }, 2, new Map())).toHaveProperty('why');
  });

  it('"uma para cada": quantidade diferente não preenche nada (F05)', () => {
    const c = ctx({ ruleEach: { 'ACADEMIA FICTICIA': ['p1', 'p2'] } });
    imp(
      c,
      ofx({
        trns: [1, 2, 3].map((i) => ({
          amt: '-89.90',
          memo: 'ACADEMIA FICTICIA',
          fitid: 'E' + i,
          date: '2026101' + i,
        })),
      }),
    );
    expect(c.inv.txs.every((t) => !t.owners.length && t.eachMismatch)).toBe(true);
  });

  it('"uma para cada": cada cobrança vai para uma pessoa', () => {
    const c = ctx();
    imp(
      c,
      ofx({
        trns: [1, 2].map((i) => ({
          amt: '-89.90',
          memo: 'ACADEMIA FICTICIA',
          fitid: 'E' + i,
          date: '2026101' + i,
        })),
      }),
    );
    setEachRule(c, c.inv.txs[0]!, ['p2', 'p1']);
    expect(c.inv.txs.map((t) => t.owners)).toEqual([['p1'], ['p2']]);
  });
});

describe('parcelas', () => {
  it('paga antecipadamente: continua fora ao reimportar; em outra fatura pede conferência (F08)', () => {
    const c = ctx();
    imp(c, faturaBase());
    expect(payInAdvance(c, tx(c, 'A003'), '300,00', '')).toBe('');
    imp(c, faturaBase());
    expect([tx(c, 'A003').excluded, tx(c, 'A003').reason]).toEqual([true, 'antecipado']);
    imp(c, faturaBase({ dtEnd: '20261210', dtStart: '20261111' }));
    expect([tx(c, 'A003').excluded, tx(c, 'A003').voltou]).toEqual([true, 'conferir']);
    includeTx(c, tx(c, 'A003'));
    expect(tx(c, 'A003').excluded).toBe(false);
  });

  it('tirar da divisão grava a parcela; incluir volta a pendente', () => {
    const c = ctx();
    imp(c, faturaBase());
    excludeTx(c, tx(c, 'A003'));
    expect(Object.values(c.d.parcelas)[0]!.status).toBe('fora_manual');
    imp(c, faturaBase());
    expect(tx(c, 'A003').reason).toBe('manual');
    includeTx(c, tx(c, 'A003'));
    expect(Object.values(c.d.parcelas)[0]!.status).toBe('pendente');
  });

  it('projeção repete a parcela e pula as já pagas', () => {
    const c = ctx();
    imp(c, faturaBase());
    toggleOwner(c, tx(c, 'A003'), 'p1');
    const pr = buildProjection(c, currentProjItems(c), c.inv.comp);
    expect(pr.months).toHaveLength(8);
    expect(pr.totalOf('p1')).toBe(8 * 30000);
  });

  it('sequência comparada ao mês fechado anterior', () => {
    const prev = histEntry('2026-10', {
      items: [
        {
          memo: 'LOJA MOVEIS FAKE - Parcela 3/10',
          cents: 30000,
          parcela: { cur: 3, tot: 10 },
          fixa: false,
          tags: [],
          shares: [{ pid: 'p1', nome: 'A', cents: 30000 }],
        },
      ],
    });
    const c = ctx({ history: [prev] });
    imp(c, faturaBase());
    checkInstallments(c);
    expect(tx(c, 'A003').seqWarn).toMatch(/esperada 4\/10/);
  });
});

describe('cobranças fixas', () => {
  const charge = (o = {}) => ({
    id: 1,
    nome: 'EMPRESTIMO FICTICIO',
    valor: '100.00',
    owners: ['p1'],
    parcAtual: '3',
    parcTotal: '10',
    parcComp: '2026-11',
    lastMonth: '',
    ...o,
  });

  it('fechar 2× o mesmo mês não avança 2×; desfazer volta o contador (F02)', () => {
    const c = ctx({ charges: [charge()] });
    imp(c, faturaBase());
    assignAll(c, 'p1');
    expect(c.inv.txs.find((t) => t.charge)!.parcela).toEqual({ cur: 3, tot: 10 });
    finishAndClose(c);
    expect([c.d.charges[0]!.parcAtual, c.d.charges[0]!.parcComp]).toEqual([4, '2026-12']);
    const h = closeMonth(c, new Map());
    expect(c.d.charges[0]!.parcAtual).toBe(4);
    undoClose(c, h);
    expect([
      String(c.d.charges[0]!.parcAtual),
      c.d.charges[0]!.parcComp,
      c.d.history.length,
    ]).toEqual(['3', '2026-11', 0]);
  });

  it('"parcela 1 de 0" é mensal e não some ao fechar (F03, H08)', () => {
    const c = ctx({ charges: [charge({ parcAtual: '1', parcTotal: '0', parcComp: '' })] });
    imp(c, faturaBase());
    assignAll(c, 'p1');
    expect(c.inv.txs.some((t) => t.charge)).toBe(true);
    finishAndClose(c);
    expect(c.d.charges).toHaveLength(1);
  });

  it('fora da competência aparece no aviso', () => {
    const ch = charge({ parcAtual: '1', parcTotal: '2', parcComp: '2026-01' });
    expect(chargeCur(ch, '2026-11').state).toBe('terminou');
    expect(chargesOutside([ch], '2026-11')[0]!.why).toBe('terminou em fev/26');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
  });

  it('só cobranças fixas, sem OFX', () => {
    const c = ctx({ charges: [charge()] });
    expect(importStatement(c, null)).toEqual({ ok: true });
    expect(c.inv.txs).toHaveLength(1);
  });
});

describe('fechar mês, mensagens e recebimentos', () => {
  it('ciclo: fechar e reimportar o mesmo arquivo avisa (F01)', () => {
    const c = ctx();
    imp(c, faturaBase());
    assignAll(c, 'p2');
    const h = finishAndClose(c);
    imp(c, faturaBase());
    expect(c.d.history.find((x) => x.signature === c.inv.fileInfo!.signature)).toBe(h);
  });

  it('registrar pagamento: maior, zero, negativo e data inválida são recusados (F06)', () => {
    const c = ctx({ history: [histEntry('2026-10')] });
    const id = `${c.d.history[0]!.id}:1`;
    expect(savePayment(c, id, 6000, '2026-11-01')).not.toBe('');
    expect(savePayment(c, id, 0, '2026-11-01')).not.toBe('');
    expect(savePayment(c, id, -5, '2026-11-01')).not.toBe('');
    expect(savePayment(c, id, 100, '2026-99-99')).not.toBe('');
    expect(savePayment(c, id, 100, '2026-11-01')).toBe('');
    expect(openBalances(c)[0]!.total).toBe(4900); // dono do cartão (p1) fica fora
  });

  it('pagamento "sum:" distribui do mês mais antigo', () => {
    const c = ctx({ history: [histEntry('2026-10'), histEntry('2026-09')] });
    expect(savePayment(c, 'sum:p2', 7000, '2026-11-01')).toBe('');
    expect(c.d.history.find((h) => h.comp === '2026-09')!.people[1]!.payments[0]!.cents).toBe(5000);
    expect(c.d.history.find((h) => h.comp === '2026-10')!.people[1]!.payments[0]!.cents).toBe(2000);
  });

  it('PIX vai para quem deve e não para o dono do cartão; link do WhatsApp codifica (F09)', () => {
    const c = ctx();
    c.d.settings.pix = 'chave-ficticia@exemplo.com';
    imp(c, faturaBase());
    c.inv.txs
      .filter((t) => !t.excluded)
      .forEach((t) => (toggleOwner(c, t, 'p1'), toggleOwner(c, t, 'p2')));
    expect(buildMessage(c, 'p1')!.text).not.toMatch(/PIX/);
    const b = buildMessage(c, 'p2')!.text;
    expect(b).toMatch(/PIX \(e-mail\): chave-ficticia@exemplo.com/);
    const href = waLink('55 (48) 0000-0000', b);
    expect(href.startsWith('https://wa.me/554800000000?text=')).toBe(true);
    expect(href).not.toMatch(/[\n ]/);
    expect(pixLabel('123.456.789-00')).toBe('CPF');
  });

  it('CSV não vira fórmula (F07)', () => {
    const c = ctx();
    const memos = ['=HYPERLINK("x";"y")', '+1+1', '-2+3', '@SUM(1;1)'];
    imp(c, ofx({ trns: memos.map((m, i) => ({ amt: `-1${i}.00`, memo: m, fitid: 'C' + i })) }));
    assignAll(c, 'p1');
    const cells = csvMonth(c)
      .split(/\r\n/)
      .slice(1)
      .map((l) => l.split(';')[2]!.replace(/^"|"$/g, ''));
    expect(cells.filter((x) => /^[=+\-@]/.test(x))).toEqual([]);
  });

  it('relatório por tag agrupa e respeita a pessoa', () => {
    const c = ctx();
    const g = createTag(c, 'Casa')!;
    imp(c, faturaBase());
    setItemTags(c, tx(c, 'A001'), [g.id]);
    assignAll(c, 'p2');
    finishAndClose(c);
    const r = reportData(c, 'tag', 'all');
    expect(r.series.map((s) => s.nome)).toContain('Casa');
    expect(r.value('2026-11', 't:' + g.id)).toBe(12000);
  });
});

describe('desfazer', () => {
  it('40 níveis e volta a atribuição (F10)', () => {
    const c = ctx();
    imp(c, faturaBase());
    const stack: string[] = [];
    for (let i = 0; i < 60; i++) {
      pushUndo(c, stack);
      toggleOwner(c, findTx(c, 't0')!, i % 2 ? 'p1' : 'p2');
    }
    expect(stack).toHaveLength(40);
    const before = findTx(c, 't0')!.owners.join();
    undoLast(c, stack);
    expect(findTx(c, 't0')!.owners.join()).not.toBe(before);
  });
});

describe('backup', () => {
  it('ida e volta sem perda (D01)', () => {
    const c = ctx({ history: [histEntry('2026-10')] });
    const p = parseBackup(backupText(c.d));
    expect(p.ok).toBe(true);
    if (p.ok) expect(applyBackup(ctx().d, p.d, null)).toEqual(c.d);
  });

  it('texto que não é backup é recusado (D02, D07, D08, H05)', () => {
    expect(parseBackup('RATEIO-BACKUP {quebrado').ok).toBe(false);
    expect(backupProblem(null)).toBeTruthy();
    expect(backupProblem({ v: 999 })).toMatch(/versão mais nova/);
    expect(backupProblem({ people: [] })).toMatch(/nenhuma pessoa/);
    expect(backupProblem({ people: [{ id: 'x"><img src=x>' }] })).toMatch(/identificador inválido/);
    expect(
      backupProblem({
        history: [{ comp: '2026-10', people: [{ payments: [{ date: '2026-02-30' }] }] }],
      }),
    ).toMatch(/pagamentos/);
  });

  it('conflito de parcelas: juntar mantém as atuais, substituir troca (D11)', () => {
    const cur = ctx().d;
    cur.parcelas = {
      a: { key: 'a', status: 'pago_antecipado' } as never,
      b: { key: 'b' } as never,
    };
    const bk = { parcelas: { a: { key: 'a', status: 'pendente' }, c: { key: 'c' } } };
    expect(parcelasConflict(cur.parcelas, bk.parcelas).lost).toBe(2);
    expect(Object.keys(applyBackup(cur, bk, 'juntar').parcelas).sort()).toEqual(['a', 'b', 'c']);
    expect(applyBackup(cur, bk, 'juntar').parcelas.a!.status).toBe('pago_antecipado');
    expect(Object.keys(applyBackup(cur, bk, 'substituir').parcelas).sort()).toEqual(['a', 'c']);
  });

  it('backup antigo (sem ruleObs) volta a memória ao modo cauteloso (G03)', () => {
    const cur = ctx({ ruleObs: { X: [{ c: 1, o: ['p1'], at: '' }] } }).d;
    expect(applyBackup(cur, { rules: { Y: ['p1'] } }, null).ruleObs).toEqual({});
  });

  it('item de pessoa que sumiu volta para sem dono (D09, H06)', () => {
    const c = ctx();
    imp(c, faturaBase());
    toggleOwner(c, tx(c, 'A001'), 'p3');
    toggleOwner(c, tx(c, 'A002'), 'p1');
    c.d.people = c.d.people.filter((p) => p.id !== 'p3');
    expect(releaseMissingOwners(c)).toBe(1);
    expect(tx(c, 'A001').owners).toEqual([]);
    expect(tx(c, 'A002').owners).toEqual(['p1']);
  });

  it('com senha: ida e volta e senha errada dão mensagem clara (D10)', async () => {
    const enc = await encryptText('RATEIO-BACKUP {}', 'segredo123');
    expect(await decryptText(enc, 'segredo123')).toBe('RATEIO-BACKUP {}');
    await expect(decryptText(enc, 'errada')).rejects.toThrow('Senha incorreta');
    await expect(decryptText('RATEIO-BACKUP-ENC1 %%%', 'x')).rejects.toThrow('Senha incorreta');
  });
});
