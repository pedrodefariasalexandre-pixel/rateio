/** Fixtures sintéticas (nenhum dado real de fatura: lojas, valores, FITIDs e contas são inventados). */
import { emptyData, newCtx } from '../lib/state';
import type { Ctx, Data, Month } from '../lib/types';

export interface Trn {
  amt: string;
  memo?: string | null;
  fitid?: string | null;
  date?: string | null;
  name?: string;
  type?: string;
}

/** Gera um OFX de cartão (SGML ou XML). */
export function ofx({
  trns = [] as Trn[],
  dtStart = '20261011',
  dtEnd = '20261110',
  acct = '0000111122223333',
  balamt = null as string | null,
  style = 'sgml' as 'sgml' | 'xml',
  bom = false,
  crlf = false,
  noType = false,
} = {}): string {
  const nl = crlf ? '\r\n' : '\n';
  const bal =
    balamt ??
    (trns.reduce((a, t) => a + Math.round(parseFloat(t.amt) * 100 || 0), 0) / 100).toFixed(2);
  const close = (tag: string, v: string) =>
    style === 'xml' ? `<${tag}>${v}</${tag}>` : `<${tag}>${v}`;
  const head =
    style === 'xml'
      ? `<?xml version="1.0" encoding="UTF-8"?>${nl}<?OFX OFXHEADER="200" VERSION="220"?>${nl}`
      : `OFXHEADER:100${nl}DATA:OFXSGML${nl}VERSION:102${nl}CHARSET:1252${nl}${nl}`;
  const body = trns
    .map((t) =>
      [
        '<STMTTRN>',
        noType ? '' : close('TRNTYPE', t.type ?? (parseFloat(t.amt) < 0 ? 'DEBIT' : 'CREDIT')),
        t.date !== null ? close('DTPOSTED', (t.date || '20261015') + '000000[-3:BRT]') : '',
        close('TRNAMT', t.amt),
        t.fitid !== null
          ? close('FITID', t.fitid ?? 'F' + Math.random().toString(36).slice(2, 10))
          : '',
        t.memo !== null ? close('MEMO', t.memo ?? 'LOJA TESTE') : '',
        t.name ? close('NAME', t.name) : '',
        '</STMTTRN>',
      ]
        .filter(Boolean)
        .join(nl),
    )
    .join(nl);
  return (
    (bom ? '﻿' : '') +
    head +
    `<OFX>${nl}<CREDITCARDMSGSRSV1>${nl}<CCSTMTTRNRS>${nl}<CCSTMTRS>${nl}${close('CURDEF', 'BRL')}${nl}` +
    `<CCACCTFROM>${nl}${close('ACCTID', acct)}${nl}</CCACCTFROM>${nl}<BANKTRANLIST>${nl}` +
    `${close('DTSTART', dtStart)}${nl}${close('DTEND', dtEnd)}${nl}${body}${nl}</BANKTRANLIST>${nl}` +
    `<LEDGERBAL>${nl}${close('BALAMT', bal)}${nl}</LEDGERBAL>${nl}` +
    `</CCSTMTRS>${nl}</CCSTMTTRNRS>${nl}</CREDITCARDMSGSRSV1>${nl}</OFX>${nl}`
  );
}

/** Fatura "típica": compras, parcela, IOF, estorno e pagamento. */
export const faturaBase = (o: Partial<Parameters<typeof ofx>[0]> = {}) =>
  ofx({
    trns: [
      { amt: '-120.00', memo: 'MERCADO FICTICIO SA', fitid: 'A001', date: '20261012' },
      { amt: '-59.90', memo: 'STREAMING EXEMPLO', fitid: 'A002', date: '20261013' },
      { amt: '-300.00', memo: 'LOJA MOVEIS FAKE - Parcela 2/10', fitid: 'A003', date: '20261014' },
      { amt: '-15.50', memo: 'PADARIA INVENTADA', fitid: 'A004', date: '20261015' },
      { amt: '-80.00', memo: 'SITE INTERNACIONAL', fitid: 'A005', date: '20261016' },
      { amt: '-5.10', memo: 'IOF DE COMPRA INTERNACIONAL', fitid: 'A005', date: '20261016' },
      { amt: '45.00', memo: 'Estorno de compra', fitid: 'A006', date: '20261017' },
      { amt: '1000.00', memo: 'Pagamento recebido', fitid: 'A007', date: '20261018' },
    ],
    ...o,
  });

/** Dados com 3 pessoas sintéticas. */
export function data(over: Partial<Data> = {}): Data {
  return {
    ...emptyData(),
    people: [
      { id: 'p1', nome: 'Pessoa A', cor: '#3B5BDB', fone: '' },
      { id: 'p2', nome: 'Pessoa B', cor: '#D6336C', fone: '5548999990000' },
      { id: 'p3', nome: 'Pessoa C', cor: '#E8890C', fone: '' },
    ],
    ...over,
  };
}

export const ctx = (over: Partial<Data> = {}, today = '2026-11-20'): Ctx =>
  newCtx(data(over), today);

/** Mês fechado sintético. */
export function histEntry(comp: string, over: Partial<Month> = {}): Month {
  const [y, m] = comp.split('-');
  const MESES = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ];
  return {
    id: Number(y! + m!) * 1000 + 1,
    comp,
    label: MESES[+m! - 1] + '/' + y,
    closedAt: `${comp}-28T12:00:00.000Z`,
    signature: 'sig' + comp,
    keys: [],
    file: 'sintetico.ofx',
    chargesBefore: [],
    totalCents: 10000,
    people: [
      { pid: 'p1', nome: 'Pessoa A', cor: '#3B5BDB', total: 5000, text: 'msg', payments: [] },
      { pid: 'p2', nome: 'Pessoa B', cor: '#D6336C', total: 5000, text: 'msg', payments: [] },
    ],
    items: [
      {
        memo: 'MERCADO FICTICIO SA',
        cents: 10000,
        parcela: null,
        fixa: false,
        tags: [],
        tagIds: [],
        shares: [
          { pid: 'p1', nome: 'Pessoa A', cents: 5000 },
          { pid: 'p2', nome: 'Pessoa B', cents: 5000 },
        ],
      },
    ],
    fora: [],
    ...over,
  };
}
