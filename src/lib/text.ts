import type { Parcela } from './types';

/** Tira caracteres de controle, junta espaços e corta. */
export const clean = (s: unknown, max = 200): string =>
  String(s ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

/** n/t escrito no texto ("PARC 2/5", "LOJA 2/5"), sem conferir limites. */
export function rawParcela(memo: string): Parcela | null {
  const m =
    memo.match(/parc(?:ela)?\.?\s*(\d{1,2})\s*\/\s*(\d{1,2})\b/i) ||
    memo.trim().match(/[\s\-–]([1-9]\d?)\s*\/\s*(\d{1,2})$/);
  return m ? { cur: +m[1]!, tot: +m[2]! } : null;
}

/** Parcela válida: 1 ≤ n ≤ t, 2 ≤ t ≤ 48. */
export function parseParcela(memo: string): Parcela | null {
  const p = rawParcela(memo);
  return p && p.tot >= 2 && p.tot <= 48 && p.cur >= 1 && p.cur <= p.tot ? p : null;
}

/** Chave da memória por texto. CONTRATO com os dados salvos: não mudar nem uma vírgula. */
export function normalize(memo: string): string {
  return memo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/(?:PARC(?:ELA)?\.?\s*)?\d{1,2}\s*\/\s*\d{1,2}\b/g, ' ')
    .replace(/\d{2}[/\-.]\d{2}(?:[/\-.]\d{2,4})?/g, ' ')
    .replace(/\b\d{4,}\b/g, ' ')
    .replace(/[*#\-–_.,:;()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const ENCARGO = /\bIOF\b|JUROS|MULTA|ENCARGO/i;

/** Data da compra escrita no texto ("LOJA 12/03 PARC 2/5"). Só informação. */
export function purchaseDateOf(memo: string): string {
  let s = memo;
  if (parseParcela(memo))
    s = s
      .replace(/parc(?:ela)?\.?\s*\d{1,2}\s*\/\s*\d{1,2}\b/gi, ' ')
      .replace(/[\s\-–]\d{1,2}\s*\/\s*\d{1,2}\s*$/, ' ');
  const m = /(?:^|\D)(\d{2})[/.-](\d{2})(?:[/.-](\d{2,4}))?(?!\d)/.exec(s);
  if (!m || +m[1]! < 1 || +m[1]! > 31 || +m[2]! < 1 || +m[2]! > 12) return '';
  return m[3] ? `${m[1]}/${m[2]}/${m[3].slice(-2)}` : `${m[1]}/${m[2]}`;
}

/** Tipo da chave PIX, para o rótulo da mensagem. */
export function pixLabel(k: string): string {
  const s = String(k || '').trim(),
    d = s.replace(/\D/g, '');
  if (/@/.test(s)) return 'e-mail';
  if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(s)) return 'CPF';
  if (d.length === 14 && /^[\d./-]+$/.test(s)) return 'CNPJ';
  if (/^\+?[\d\s()-]{10,}$/.test(s) && d.length >= 10 && d.length <= 13 && /[\s()+-]/.test(s))
    return 'telefone';
  return 'chave';
}

/** Hash curto (assinatura do arquivo e hash do cartão). */
export function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed,
    h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
