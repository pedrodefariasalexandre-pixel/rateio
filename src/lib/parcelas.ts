/**
 * Memória de parcelas: um registro por PARCELA (nunca pelo estabelecimento).
 * Série = FITID | total (o banco repete o FITID em todas as parcelas da compra). Parcela = série | n.
 * Sem FITID real: série alternativa cartão | estabelecimento | total. O valor nunca entra na chave.
 * Formato das chaves (p3|FITID|t|n, p2|conta|estab|t|n, sufixo #k) é CONTRATO com os dados salvos.
 */
import { nearValue } from './memory';
import type { Ctx, ParcelRecord, ParcelStatus, Tx } from './types';

export const PST = { pendente: 'pendente', pago: 'pago_antecipado', fora: 'fora_manual' } as const;

export const STATUS_TXT: Record<string, string> = {
  pago_antecipado: 'paga antecipadamente',
  fora_manual: 'tirada da divisão',
  pendente: 'sem decisão',
};

type Keyed = Pick<Tx, 'fitid' | 'acct' | 'norm'> & { parcela: { cur: number; tot: number } };

/** FITID real do banco ("sem-fitid-<posição>" é inventado pelo app e muda entre arquivos). */
export const realFitid = (t: Pick<Tx, 'fitid'>): string =>
  t.fitid && !/^sem-fitid-/.test(t.fitid) ? t.fitid : '';
const altSeriesKey = (t: Keyed) => ['p2', t.acct || '-', t.norm, t.parcela.tot].join('|');
const seriesKey = (t: Keyed) =>
  realFitid(t) ? ['p3', realFitid(t), t.parcela.tot].join('|') : altSeriesKey(t);
export const parcelKey = (t: Keyed, n = t.parcela.cur): string => seriesKey(t) + '|' + n;
const altParcelKey = (t: Keyed, n = t.parcela.cur) => altSeriesKey(t) + '|' + n;
export const keyBase = (k: string): string => String(k).replace(/#\d+$/, '');
const keySuffix = (k: string) => (/#\d+$/.exec(String(k)) || [''])[0];

/** Estabelecimento e cartão validam a série: se não batem com o registro, nada é aplicado sozinho. */
const sameOwner = (r: ParcelRecord, t: Tx) =>
  r.norm === t.norm && (r.acct || '') === (t.acct || '');

const freeKey = (c: Ctx, base: string, used: Set<string>) => {
  let k = 1,
    key: string;
  do {
    key = k === 1 ? base : `${base}#${k}`;
    k++;
  } while (used.has(key) || key in c.d.parcelas);
  return key;
};

export const recOf = (c: Ctx, t: Tx | undefined): ParcelRecord | null =>
  t?.pkey ? c.d.parcelas[t.pkey] || null : null;
export const isOutStatus = (r: ParcelRecord | null | undefined): boolean =>
  !!r && (r.status === PST.pago || r.status === PST.fora);

/** Registro antigo (sem FITID) que casou sem dúvida com um item com FITID: passa para a chave com FITID. */
function upgradeRecord(c: Ctx, r: ParcelRecord, t: Tx & Keyed, used = new Set<string>()): string {
  const base = parcelKey(t);
  if (!realFitid(t) || keyBase(r.key) === base) return r.key;
  const key = freeKey(c, base, used);
  delete c.d.parcelas[r.key];
  c.d.parcelas[key] = { ...r, key, fitid: realFitid(t), chaveAntiga: r.chaveAntiga || r.key };
  return key;
}

/** Dá a chave a cada compra parcelada do OFX e casa com o registro. */
export function assignParcelKeys(c: Ctx, list: Tx[]): void {
  const groups = new Map<string, (Tx & Keyed)[]>();
  list
    .filter((t) => t.kind === 'compra' && !t.charge && t.parcela && t.norm)
    .forEach((t) => {
      delete t.pkey;
      delete t.pcands;
      delete t.pconferir;
      delete t.pvalorDif;
      const k = t as Tx & Keyed;
      const b = parcelKey(k);
      if (!groups.has(b)) groups.set(b, []);
      groups.get(b)!.push(k);
    });
  for (const [base, G] of groups) {
    const order = (a: Tx, b: Tx) =>
      a.cents - b.cents || (a.date || '').localeCompare(b.date || '') || a.id.localeCompare(b.id);
    const free = G.slice().sort(order);
    const alt = realFitid(G[0]!) ? altParcelKey(G[0]!) : null; // registros antigos sem FITID também podem ser desta parcela
    const R = Object.values(c.d.parcelas)
      .filter((r) => r && (keyBase(r.key) === base || (alt && keyBase(r.key) === alt && !r.fitid)))
      .sort(
        (a, b) =>
          (keyBase(a.key) === base ? 0 : 1) - (keyBase(b.key) === base ? 0 : 1) ||
          a.key.localeCompare(b.key),
      );
    const used = new Set(R.map((r) => r.key));
    if (G.length > 1) {
      // mesma chave duas vezes no mesmo arquivo: nenhuma decisão automática; os dois ficam para conferir
      const rel = R.filter((r) => isOutStatus(r) || r.conferir).map((r) => r.key);
      free.forEach((t) => {
        if (rel.length) {
          t.pcands = rel.slice();
          t.pconferir = true;
        }
        const key = freeKey(c, base, used);
        used.add(key);
        t.pkey = key;
      });
      continue;
    }
    const unresolved: ParcelRecord[] = [];
    // 1ª passada: só casamentos sem dúvida (valor desempata; o FITID já está na chave)
    R.forEach((r) => {
      if (r.conferir) {
        unresolved.push(r);
        return;
      }
      let cand = free.filter((t) => nearValue(t.cents, r.cents)),
        dif = false;
      if (cand.length > 1 && r.fitid) {
        const f = cand.filter((t) => t.fitid === r.fitid);
        if (f.length) cand = f;
      }
      if (!cand.length && r.fitid) {
        cand = free.filter((t) => t.fitid === r.fitid);
        dif = cand.length > 0;
      }
      if (cand.length !== 1) {
        unresolved.push(r);
        return;
      }
      const t = cand[0]!;
      if (!sameOwner(r, t)) {
        unresolved.push(r);
        return;
      }
      const key = upgradeRecord(c, r, t, used);
      used.add(key);
      t.pkey = key;
      if (dif) t.pvalorDif = r.cents;
      free.splice(free.indexOf(t), 1);
    });
    // 2ª passada: o que sobrou e pode ser a parcela registrada fica para conferir
    unresolved.forEach((r) => {
      if (!isOutStatus(r) && !r.conferir) return;
      const cand = free.filter(
        (t) => nearValue(t.cents, r.cents) || (r.fitid && t.fitid === r.fitid),
      );
      (cand.length ? cand : free).forEach((t) => {
        t.pcands = [...(t.pcands || []), r.key];
        t.pconferir = true;
      });
    });
    free.forEach((t) => {
      const key = freeKey(c, base, used);
      used.add(key);
      t.pkey = key;
    });
  }
}

/** Aplica o registro aos itens recém-importados. */
export function applyParcelMemory(c: Ctx, list: Tx[] = c.inv.txs): void {
  const comp = c.inv.comp;
  list.forEach((t) => {
    delete t.voltou;
    delete t.pmem;
    if (t.pconferir) return; // colisão sem desempate: o usuário decide
    const r = recOf(c, t);
    if (!isOutStatus(r) || r!.conferir) return;
    t.pmem = true;
    if (r!.status === PST.pago) {
      if (r!.comp && comp && r!.comp !== comp) {
        // já paga e voltou cobrada nesta outra fatura: nunca some em silêncio
        const dec = r!.voltas?.[comp]?.decisao;
        t.voltou = dec || 'conferir';
        if (dec === 'incluir') {
          t.excluded = false;
          t.reason = '';
          return;
        }
      }
      t.excluded = true;
      t.reason = 'antecipado';
    } else {
      t.excluded = true;
      t.reason = 'manual';
    }
  });
}

/** Grava a decisão de uma parcela. */
export function setParcel(
  c: Ctx,
  t: Tx,
  status: ParcelStatus,
  extra: Partial<ParcelRecord> = {},
): ParcelRecord | null {
  if (!t?.pkey || !t.parcela) return null;
  const prev = c.d.parcelas[t.pkey];
  const rec: ParcelRecord = {
    key: t.pkey,
    memo: t.memo,
    norm: t.norm,
    acct: t.acct || '',
    parcela: { ...t.parcela },
    cents: t.cents,
    fitid: t.fitid || '',
    dataCompra: t.dataCompra || '',
    status,
    em: c.today,
    comp: c.inv.comp,
    valorPago: null,
    desconto: null,
    origem: 'manual',
    ...(prev?.voltas ? { voltas: prev.voltas } : {}),
    ...extra,
  };
  c.d.parcelas[t.pkey] = rec;
  delete t.pvalorDif;
  return rec;
}

export function setVolta(c: Ctx, t: Tx, decisao: 'incluir' | 'fora'): void {
  const r = recOf(c, t);
  if (!r) return;
  r.voltas = { ...(r.voltas || {}), [c.inv.comp]: { decisao, em: c.today } };
}

/** "Conferir parcela": o usuário confirma que este item é a parcela do registro `key`. */
export function confirmParcel(c: Ctx, t: Tx, key: string): void {
  const r = c.d.parcelas[key];
  if (!r) return;
  const txs = c.inv.txs;
  const old = t.pkey;
  txs.filter((x) => x !== t && x.pkey === key).forEach((x) => (x.pkey = old));
  t.pkey = key;
  delete t.pconferir;
  delete t.pcands;
  txs.forEach((x) => {
    if (x.pcands) {
      x.pcands = x.pcands.filter((k) => k !== key);
      if (!x.pcands.length) {
        delete x.pcands;
        delete x.pconferir;
      }
    }
  });
  // o registro passa a ter o FITID, o valor, o estabelecimento e o cartão deste item
  Object.assign(r, {
    cents: t.cents,
    fitid: realFitid(t),
    norm: t.norm,
    acct: t.acct || '',
    memo: t.memo,
  });
  delete r.conferir;
  const nk = upgradeRecord(
    c,
    r,
    t as Tx & Keyed,
    new Set(txs.map((x) => x.pkey).filter((k): k is string => !!k && k !== key)),
  );
  if (nk !== key)
    txs.forEach((x) => {
      if (x.pcands) x.pcands = x.pcands.map((k) => (k === key ? nk : k));
    });
  t.pkey = nk;
  applyParcelMemory(c, [t]);
}

/** Parcelas FUTURAS da mesma série que já estão fora pelo registro: saem da projeção. */
export function skippedFutureParcels(c: Ctx, t: Tx): number[] {
  if (!t?.pkey || !t.parcela) return [];
  const k = t as Tx & Keyed;
  const out: number[] = [],
    suf = keySuffix(t.pkey);
  for (let n = t.parcela.cur + 1; n <= t.parcela.tot; n++) {
    const r =
      c.d.parcelas[parcelKey(k, n) + suf] ||
      (realFitid(t) &&
        Object.values(c.d.parcelas).find((x) => !x.fitid && keyBase(x.key) === altParcelKey(k, n)));
    if (r && isOutStatus(r) && !r.conferir) out.push(n);
  }
  return out;
}
