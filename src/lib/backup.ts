/**
 * Backup "RATEIO-BACKUP {json}" (o mesmo do rateio-v3.html) e "RATEIO-BACKUP-ENC1 …" (com senha).
 * No site, quem grava o backup é o banco (import_rateio_backup, tudo ou nada, com as migrações 3–7).
 * Aqui ficam o texto, a validação completa (backupProblem), a mesclagem usada no modo local e a criptografia.
 */
import { isRealDate } from './dates';
import { DATA_VERSION, SETTINGS_DEFAULT, isPlainObj } from './state';
import { clean } from './text';
import type { Data } from './types';

export const BACKUP_PREFIX = 'RATEIO-BACKUP ';
export const ENC_PREFIX = 'RATEIO-BACKUP-ENC1 ';
/** Backup com senha: pronto e desligado, como no v3 (restaurar já funciona). */
export const FEATURES = { encryptedBackup: false };

export const backupText = (d: Data): string =>
  BACKUP_PREFIX +
  JSON.stringify({
    v: DATA_VERSION,
    people: d.people,
    rules: d.rules,
    charges: d.charges,
    ruleSplits: d.ruleSplits,
    ruleEach: d.ruleEach,
    ruleObs: d.ruleObs,
    tags: d.tags,
    ruleTags: d.ruleTags,
    settings: d.settings,
    history: d.history,
    parcelas: d.parcelas,
  });

export const isEncrypted = (raw: string): boolean => /^\s*RATEIO-BACKUP-ENC1\s/.test(raw || '');

const ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const okId = (x: unknown) =>
  (typeof x === 'string' || (typeof x === 'number' && Number.isFinite(x))) && ID_RE.test(String(x));

/** Confere o backup INTEIRO antes de mexer em qualquer coisa. Devolve o motivo do problema, ou "". */
export function backupProblem(d: unknown): string {
  if (!isPlainObj(d)) return 'o conteúdo não é um backup do Rateio';
  if (d.v != null && !(Number.isInteger(Number(d.v)) && Number(d.v) >= 1))
    return 'versão do backup inválida';
  if (Number(d.v) > DATA_VERSION)
    return `o backup é de uma versão mais nova do app (formato ${clean(String(d.v), 10)}; este app lê até ${DATA_VERSION}). Abra o arquivo mais recente do Rateio`;
  if (Array.isArray(d.people) && !d.people.length)
    return 'o backup não tem nenhuma pessoa (sem pessoas não há como dividir)';
  const list = (k: string, f: (x: unknown) => string) => {
    const v = d[k];
    if (v == null) return '';
    if (!Array.isArray(v)) return `“${k}” não é uma lista`;
    for (let i = 0; i < v.length; i++) {
      const e = f(v[i]);
      if (e) return `${k} nº ${i + 1}: ${e}`;
    }
    return '';
  };
  const map = (k: string, f: (x: unknown) => string) => {
    const v = d[k];
    if (v == null) return '';
    if (!isPlainObj(v)) return `“${k}” não é um objeto`;
    for (const [n, x] of Object.entries(v)) {
      const e = f(x);
      if (e) return `${k} “${clean(n, 40)}”: ${e}`;
    }
    return '';
  };
  const ids = (v: unknown) =>
    Array.isArray(v) && v.every(okId) ? '' : 'deveria ser uma lista de identificadores';
  const hist = (h: unknown) => {
    if (!isPlainObj(h)) return 'mês vazio';
    if (!/^\d{4}-\d{2}$/.test(String(h.comp || ''))) return 'mês sem competência (AAAA-MM)';
    if (h.id != null && !okId(h.id)) return 'identificador inválido';
    for (const f of ['people', 'items', 'fora', 'keys'])
      if (h[f] != null && !Array.isArray(h[f])) return `“${f}” não é uma lista`;
    for (const p of (h.people as unknown[]) || []) {
      if (!isPlainObj(p)) return 'pessoa vazia';
      if (p.pid != null && !okId(p.pid)) return 'pessoa com identificador inválido';
      if (
        p.payments != null &&
        !(
          Array.isArray(p.payments) &&
          p.payments.every(
            (x) => isPlainObj(x) && isRealDate(x.date) && (x.id == null || okId(x.id)),
          )
        )
      )
        return 'pagamentos em formato inválido';
    }
    if (
      [...((h.items as unknown[]) || []), ...((h.fora as unknown[]) || [])].some(
        (i) => !isPlainObj(i),
      )
    )
      return 'item vazio';
    return '';
  };
  return (
    [
      list('people', (p) =>
        !isPlainObj(p) ? 'pessoa vazia' : !okId(p.id) ? 'identificador inválido' : '',
      ),
      list('tags', (g) =>
        !isPlainObj(g) ? 'tag vazia' : !okId(g.id) ? 'identificador inválido' : '',
      ),
      list('charges', (c) =>
        !isPlainObj(c)
          ? 'cobrança vazia'
          : !okId(c.id)
            ? 'identificador inválido'
            : c.owners != null && ids(c.owners)
              ? 'donos inválidos'
              : '',
      ),
      list('history', hist),
      map('rules', ids),
      map('ruleEach', ids),
      map('ruleTags', ids),
      map('ruleSplits', (v) => (isPlainObj(v) ? '' : 'formato inválido')),
      map('ruleObs', (v) =>
        Array.isArray(v) && v.every((o) => isPlainObj(o) && (o.o == null || !ids(o.o)))
          ? ''
          : 'formato inválido',
      ),
      map('parcelas', (r) =>
        !isPlainObj(r)
          ? 'registro vazio'
          : r.em && !isRealDate(r.em)
            ? 'data inválida'
            : r.comp && !/^\d{4}-\d{2}$/.test(String(r.comp))
              ? 'competência inválida'
              : '',
      ),
      d.settings != null && !isPlainObj(d.settings) ? '“settings” não é um objeto' : '',
    ].find(Boolean) || ''
  );
}

/** Lê o texto colado/arquivo. Devolve o objeto ou o motivo da recusa. */
export function parseBackup(
  raw: string,
): { ok: true; d: Record<string, unknown> } | { ok: false; problem: string } {
  let d: unknown;
  try {
    d = JSON.parse(
      String(raw ?? '')
        .replace(/^\s*RATEIO-BACKUP\s*/, '')
        .trim(),
    );
  } catch {
    return { ok: false, problem: 'o texto não é um backup completo' };
  }
  const problem = backupProblem(d);
  return problem ? { ok: false, problem } : { ok: true, d: d as Record<string, unknown> };
}

/** Quantas parcelas da memória atual não estão iguais no backup (conflito = a tela pergunta). */
export function parcelasConflict(
  cur: Data['parcelas'],
  bk: unknown,
): { lost: number; mine: number; theirs: number } {
  if (!isPlainObj(bk)) return { lost: 0, mine: Object.keys(cur).length, theirs: 0 };
  const mine = Object.keys(cur);
  const lost = mine.filter(
    (k) => !(k in bk) || JSON.stringify(bk[k]) !== JSON.stringify(cur[k]),
  ).length;
  return { lost, mine: mine.length, theirs: Object.keys(bk).length };
}

export type ParcelasMode = 'substituir' | 'juntar';

/**
 * Aplica um backup já validado sobre os dados atuais (substitui cada parte PRESENTE no backup).
 * Usado no modo local (sem banco). No site, o banco faz isto (com as migrações de backup antigo).
 */
export function applyBackup(
  cur: Data,
  bk: Record<string, unknown>,
  mode: ParcelasMode | null,
): Data {
  const d = structuredClone(cur);
  const b = structuredClone(bk) as Partial<Record<keyof Data, unknown>>;
  if (Array.isArray(b.people)) d.people = b.people as Data['people'];
  if (isPlainObj(b.rules)) d.rules = b.rules as Data['rules'];
  if (Array.isArray(b.charges)) d.charges = b.charges as Data['charges'];
  if (isPlainObj(b.ruleSplits)) d.ruleSplits = b.ruleSplits as Data['ruleSplits'];
  if (isPlainObj(b.ruleEach)) d.ruleEach = b.ruleEach as Data['ruleEach'];
  // backup antigo (sem observações): a memória volta ao modo cauteloso
  if (isPlainObj(b.rules)) d.ruleObs = (isPlainObj(b.ruleObs) ? b.ruleObs : {}) as Data['ruleObs'];
  if (Array.isArray(b.tags)) d.tags = b.tags as Data['tags'];
  if (isPlainObj(b.ruleTags)) d.ruleTags = b.ruleTags as Data['ruleTags'];
  if (isPlainObj(b.settings)) d.settings = { ...SETTINGS_DEFAULT, ...(b.settings as object) };
  if (Array.isArray(b.history))
    d.history = (b.history as Data['history']).sort((x, y) => y.comp.localeCompare(x.comp));
  if (isPlainObj(b.parcelas)) {
    const bp = b.parcelas as Data['parcelas'];
    const { lost } = parcelasConflict(cur.parcelas, bp);
    d.parcelas = !lost
      ? { ...d.parcelas, ...bp }
      : mode === 'substituir'
        ? { ...bp }
        : { ...bp, ...d.parcelas };
  }
  return d;
}

/* ---------- backup com senha: AES-GCM 256, chave PBKDF2-SHA256 (310 mil iterações). A senha nunca é guardada. ---------- */

const b64 = (u8: Uint8Array) => {
  let s = '';
  u8.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

async function deriveKey(pass: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pass),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 310000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptText(plain: string, pass: string): Promise<string> {
  if (!pass || pass.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await deriveKey(pass, salt),
      new TextEncoder().encode(plain),
    ),
  );
  const all = new Uint8Array(salt.length + iv.length + ct.length);
  all.set(salt, 0);
  all.set(iv, 16);
  all.set(ct, 28);
  return ENC_PREFIX + b64(all);
}

export async function decryptText(txt: string, pass: string): Promise<string> {
  try {
    const raw = unb64(
      String(txt)
        .replace(/^\s*RATEIO-BACKUP-ENC1\s*/, '')
        .trim(),
    );
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: raw.slice(16, 28) },
      await deriveKey(pass, raw.slice(0, 16)),
      raw.slice(28),
    );
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error('Senha incorreta ou backup corrompido.');
  }
}
