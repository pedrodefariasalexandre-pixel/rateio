/**
 * Onde os dados moram. No site: Supabase (RPCs import/export do backup, que rodam numa transação só e
 * passam pela RLS). Em desenvolvimento e nos testes E2E (VITE_LOCAL_MODE=1): o navegador.
 * O contrato do v3 vale: gravação devolve sucesso ou erro e nunca falha em silêncio.
 */
import {
  applyBackup,
  backupText,
  parseBackup,
  parcelasConflict,
  type ParcelasMode,
} from '../lib/backup';
import { SETTINGS_DEFAULT, emptyData } from '../lib/state';
import type { Data } from '../lib/types';
import { supabase } from './supabase';

export type ImportOutcome =
  | { status: 'ok' }
  | { status: 'needs_decision'; theirs: number; mine: number; lost: number }
  | { status: 'invalid'; problem: string };

export interface Repo {
  load(): Promise<Data>;
  /** Grava o estado inteiro (tudo ou nada). */
  save(d: Data): Promise<void>;
  /** "Restaurar backup". Sem modo e com conflito de parcelas, devolve needs_decision sem mudar nada. */
  importBackup(text: string, mode?: ParcelasMode): Promise<ImportOutcome>;
  /** Minutos sem uso até travar com o PIN. */
  inactivityMinutes(): Promise<number>;
}

/** Completa o que falta (conta nova, backup antigo) para o app abrir sempre. */
export function fromBackupText(text: string): Data {
  const p = parseBackup(text);
  if (!p.ok) throw new Error('Os dados salvos estão em formato inesperado: ' + p.problem);
  const d = applyBackup(emptyData(), p.d, 'substituir');
  d.settings = { ...SETTINGS_DEFAULT, ...d.settings };
  if (!d.people.length) d.people = emptyData().people;
  return d;
}

const problemOf = (e: { message?: string } | null) =>
  (e?.message || 'erro desconhecido').replace(/^.*?:\s*/, '');

export const supabaseRepo = (): Repo => {
  const sb = supabase!;
  return {
    async load() {
      const { data, error } = await sb.rpc('export_rateio_backup');
      if (error) throw new Error('Não consegui carregar seus dados: ' + error.message);
      return fromBackupText(String(data));
    },
    async save(d) {
      const { error } = await sb.rpc('import_rateio_backup', {
        p_backup: backupText(d),
        p_parcelas_mode: 'substituir',
      });
      if (error) throw new Error(error.message);
    },
    async importBackup(text, mode) {
      const { data, error } = await sb.rpc('import_rateio_backup', {
        p_backup: text,
        p_parcelas_mode: mode ?? null,
      });
      if (error) return { status: 'invalid', problem: problemOf(error) };
      const r = data as {
        status: string;
        backup_parcelas?: number;
        local_parcelas?: number;
        diferentes?: number;
      };
      if (r.status === 'needs_decision')
        return {
          status: 'needs_decision',
          theirs: r.backup_parcelas ?? 0,
          mine: r.local_parcelas ?? 0,
          lost: r.diferentes ?? 0,
        };
      return { status: 'ok' };
    },
    async inactivityMinutes() {
      const { data } = await sb.from('settings').select('inactivity_minutes').maybeSingle();
      return (data as { inactivity_minutes?: number } | null)?.inactivity_minutes ?? 5;
    },
  };
};

/** Modo local (só desenvolvimento/testes): o estado fica no localStorage, no mesmo formato do backup. */
export const localRepo = (storage: Storage = localStorage): Repo => {
  const KEY = 'rateio.local';
  const read = () => {
    const raw = storage.getItem(KEY);
    return raw ? fromBackupText(raw) : emptyData();
  };
  return {
    async load() {
      return read();
    },
    async save(d) {
      storage.setItem(KEY, backupText(d));
    },
    async importBackup(text, mode) {
      const p = parseBackup(text);
      if (!p.ok) return { status: 'invalid', problem: p.problem };
      const cur = read();
      const c = parcelasConflict(cur.parcelas, p.d.parcelas);
      if (p.d.parcelas && c.lost && !mode) return { status: 'needs_decision', ...c };
      storage.setItem(KEY, backupText(applyBackup(cur, p.d, mode ?? null)));
      return { status: 'ok' };
    },
    async inactivityMinutes() {
      return 5;
    },
  };
};
