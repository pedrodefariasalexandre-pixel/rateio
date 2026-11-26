import { describe, expect, it } from 'vitest';
import { backupText } from '../lib/backup';
import { data } from '../test/fixtures';
import { fromBackupText, localRepo } from './repo';

const mem = (): Storage => {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
};

describe('localRepo', () => {
  it('grava e carrega o estado', async () => {
    const r = localRepo(mem());
    const d = data();
    await r.save(d);
    expect((await r.load()).people.map((p) => p.nome)).toEqual([
      'Pessoa A',
      'Pessoa B',
      'Pessoa C',
    ]);
  });
  it('restaura backup e recusa texto inválido', async () => {
    const r = localRepo(mem());
    expect(await r.importBackup(backupText(data()))).toEqual({ status: 'ok' });
    expect((await r.importBackup('lixo')).status).toBe('invalid');
  });
});

describe('conta nova', () => {
  it('export com people vazio abre com as pessoas padrão', () => {
    const d = fromBackupText('RATEIO-BACKUP ' + JSON.stringify({ v: 7, people: [], history: [] }));
    expect(d.people.length).toBeGreaterThan(0);
  });
});
