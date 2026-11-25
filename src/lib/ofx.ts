import { dayDiff, isRealDate } from './dates';
import { parseOfxCents, sum } from './money';
import { ENCARGO, clean, cyrb53, normalize, parseParcela, rawParcela } from './text';
import type { OfxLine, Tx } from './types';

export interface ParsedOfx {
  lines: OfxLine[];
  skipped: { memo: string; raw: string }[];
  dtStart: string;
  dtEnd: string;
  ledger: number | null;
  /** Hash do cartão ("k…"), nunca o número. */
  acct: string;
}

export interface MergedLine extends OfxLine {
  sources: OfxLine[] | null;
  dup: boolean;
  fitidWarn?: string;
}

/** Lê o arquivo em UTF-8 ou Windows-1252. */
export function decodeOfx(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 600));
  if (/CHARSET:\s*1252|ENCODING:\s*USASCII|encoding="?windows-1252/i.test(head))
    return new TextDecoder('windows-1252').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Parser OFX (SGML sem fechamento, XML, BOM, CRLF). */
export function parseOFX(input: string): ParsedOfx {
  const text = input.replace(/^\uFEFF/, '');
  const grab = (b: string, tag: string) => {
    const m = b.match(new RegExp('<' + tag + '>([^<\\r\\n]*)', 'i'));
    return m ? m[1]!.trim() : '';
  };
  const isoOf = (raw: string) => {
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(raw || '');
    const iso = m ? `${m[1]}-${m[2]}-${m[3]}` : '';
    return isRealDate(iso) ? iso : '';
  };
  const lines: OfxLine[] = [],
    skipped: ParsedOfx['skipped'] = [];
  text
    .split(/<STMTTRN>/i)
    .slice(1)
    .forEach((raw, i) => {
      const b = raw.split(/<\/STMTTRN>/i)[0]!;
      const amt = grab(b, 'TRNAMT'),
        cents = parseOfxCents(amt);
      const memo = clean(grab(b, 'MEMO') || grab(b, 'NAME') || '(sem descrição)');
      // valor que o app não entende não some em silêncio: vai para o aviso e trava o "✓ confere"
      if (cents === null) {
        skipped.push({ memo: clean(memo, 80), raw: clean(amt, 30) || '(vazio)' });
        return;
      }
      if (cents === 0) return;
      lines.push({
        fitid: clean(grab(b, 'FITID'), 120) || 'sem-fitid-' + i,
        memo,
        cents,
        date: isoOf(grab(b, 'DTPOSTED')),
        type: clean(grab(b, 'TRNTYPE'), 12).toUpperCase(),
      });
    });
  const acctRaw = clean(grab(text, 'ACCTID'), 120);
  return {
    lines,
    skipped,
    dtStart: isoOf(grab(text, 'DTSTART')),
    dtEnd: isoOf(grab(text, 'DTEND')),
    ledger: parseOfxCents(grab(text, 'BALAMT')),
    acct: acctRaw ? 'k' + cyrb53(acctRaw) : '',
  };
}

/** Sinal das compras: o arquivo diz (TRNTYPE); só se não disser de forma coerente, vale a maioria. */
export function buySignOf(lines: OfxLine[]): number {
  const signOf = (type: string) => {
    const a = lines.filter((l) => l.type === type);
    if (!a.length) return 0;
    const n = a.filter((l) => l.cents < 0).length;
    return n === a.length ? -1 : n === 0 ? 1 : null;
  };
  const d = signOf('DEBIT'),
    c = signOf('CREDIT');
  if (d && (c === 0 || c === -d)) return d;
  if (d === 0 && c) return -c;
  const neg = lines.filter((l) => l.cents < 0).length;
  return neg >= lines.length - neg ? -1 : 1;
}

/** Aviso por grupo de mesmo FITID (não muda soma, chave nem totais). */
export function fitidWarning(g: OfxLine[]): string {
  if (g.length < 2) return '';
  const P = g
    .map((l, i) => {
      const p = rawParcela(l.memo);
      return p && { ...p, norm: normalize(g[i]!.memo) };
    })
    .filter((p): p is NonNullable<typeof p> => !!p);
  if (!P.length) return g.length >= 4 ? 'identificador repetido 4+ vezes' : '';
  const why: string[] = [];
  if (new Set(P.map((p) => p.tot)).size > 1) why.push('total de parcelas diferente');
  if (new Set(P.map((p) => p.norm)).size > 1) why.push('estabelecimento diferente');
  if (P.some((p) => p.cur < 1 || p.cur > p.tot)) why.push('parcela fora de 1 a t');
  if (new Set(P.map((p) => p.cur + '/' + p.tot)).size < P.length)
    why.push('mesma parcela repetida');
  return why.join(', ');
}

/** Soma por FITID: 2–3 linhas de mesmo sinal = compra + IOF; sinais opostos separados; 4+ não somam (dup). */
function mergeGroup(fitid: string, g: OfxLine[], out: MergedLine[]) {
  if (g.length === 1) {
    out.push({ ...g[0]!, fitid, sources: null, dup: false });
    return;
  }
  if (g.length >= 4) {
    g.forEach((l) => out.push({ ...l, fitid, sources: null, dup: true }));
    return;
  }
  for (const part of [g.filter((l) => l.cents < 0), g.filter((l) => l.cents > 0)]) {
    if (!part.length) continue;
    if (part.length === 1) {
      out.push({ ...part[0]!, fitid, sources: null, dup: false });
      continue;
    }
    // parcelas diferentes da mesma compra (ex.: 2/3 e 3/3 antecipadas) não se somam
    if (new Set(part.map((l) => parseParcela(l.memo)?.cur).filter(Boolean)).size > 1) {
      part.forEach((l) => out.push({ ...l, fitid, sources: null, dup: false }));
      continue;
    }
    // lojas diferentes com o mesmo FITID ficam separadas e marcadas
    if (new Set(part.filter((l) => !ENCARGO.test(l.memo)).map((l) => normalize(l.memo))).size > 1) {
      part.forEach((l) =>
        out.push({
          ...l,
          fitid,
          sources: null,
          dup: false,
          fitidWarn: 'descrições diferentes, não somadas',
        }),
      );
      continue;
    }
    const main = part.find((l) => !ENCARGO.test(l.memo)) || part[0]!;
    out.push({
      fitid,
      memo: main.memo,
      date: main.date,
      type: main.type,
      cents: sum(part.map((l) => l.cents)),
      sources: part,
      dup: false,
    });
  }
}

export function mergeByFitid(lines: OfxLine[]): MergedLine[] {
  const groups = new Map<string, OfxLine[]>();
  lines.forEach((l) => {
    if (!groups.has(l.fitid)) groups.set(l.fitid, []);
    groups.get(l.fitid)!.push(l);
  });
  const out: MergedLine[] = [];
  for (const [fitid, g] of groups) {
    const from = out.length,
      warn = fitidWarning(g);
    mergeGroup(fitid, g, out);
    if (warn)
      for (let i = from; i < out.length; i++)
        out[i]!.fitidWarn = out[i]!.fitidWarn ? out[i]!.fitidWarn + ', ' + warn : warn;
  }
  return out;
}

/** Só para a assinatura do arquivo (bloqueio de reimportação). */
export const itemKey = (l: OfxLine): string => `${l.fitid}|${l.cents}|${l.memo}`;

/** "Pagamento recebido" de mesmo valor de uma compra, ±1 dia = compra já paga. 1 para 1; empate não decide. */
export function detectPaid(items: Tx[]): void {
  const credits = items
    .filter((t) => t.kind === 'pagamento' && t.date)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        Math.abs(a.cents) - Math.abs(b.cents) ||
        a.id.localeCompare(b.id),
    );
  const used = new Set<string>();
  for (const c of credits) {
    const cands = items.filter(
      (d) =>
        d.kind === 'compra' &&
        !d.dup &&
        !d.excluded &&
        d.date &&
        !used.has(d.id) &&
        d.cents === -c.cents &&
        Math.abs(dayDiff(c.date, d.date)) <= 1,
    );
    if (!cands.length) {
      c.payState = 'anterior';
      continue;
    }
    const minD = Math.min(...cands.map((d) => Math.abs(dayDiff(c.date, d.date))));
    const best = cands.filter((d) => Math.abs(dayDiff(c.date, d.date)) === minD);
    if (best.length === 1) {
      markPaid(c, best[0]!);
      used.add(best[0]!.id);
    } else {
      c.payState = 'ambiguo';
      c.candidates = best.map((d) => d.id);
    }
  }
}

/** Liga um pagamento a uma compra (a compra sai da divisão como "já paga"). */
export function markPaid(c: Tx, d: Tx): void {
  c.payState = 'quitou';
  c.pays = d.id;
  delete c.candidates;
  d.paidBy = c.id;
  d.excluded = true;
  d.reason = 'pago';
}
