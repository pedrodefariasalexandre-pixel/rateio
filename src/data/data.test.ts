import { describe, expect, it } from 'vitest';
import { backupText } from '../lib/backup';
import { data } from '../test/fixtures';
import { localAuth } from './auth';
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

describe('localAuth', () => {
  it('cria, confere e reseta o PIN', async () => {
    const a = localAuth(mem());
    expect(await a.setPin('12')).toBe('invalid_format');
    expect(await a.setPin('1234')).toBe('ok');
    expect(await a.setPin('5678')).toBe('already_configured');
    expect((await a.verifyPin('0000')).result).toBe('invalid');
    expect((await a.verifyPin('1234')).result).toBe('ok');
    await a.resetPin();
    expect((await a.pinStatus()).configured).toBe(false);
  });
});
describe('conta nova', () => {
  it('estado salvo sem pessoas abre com as pessoas padrão', () => {
    expect(fromBackupText(JSON.stringify({ v: 7, people: [] })).people.length).toBeGreaterThan(0);
  });
});
