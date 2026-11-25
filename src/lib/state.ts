import type { Ctx, Data, Person, Settings, Tag } from './types';

export const DATA_VERSION = 7;

export const PALETTE = [
  '#3B5BDB',
  '#D6336C',
  '#E8890C',
  '#0CA678',
  '#7048E8',
  '#C92A2A',
  '#1098AD',
];

export const SETTINGS_DEFAULT: Settings = {
  pix: '',
  pixOwner: 'p1',
  lastBackup: '',
  msgPending: true,
  msgProjection: false,
  projRecurring: false,
};

/** Pessoas iniciais de uma conta nova (editáveis em Pessoas & memória). */
export const DEFAULT_PEOPLE: Person[] = [
  { id: 'p1', nome: 'Pessoa 1', cor: '#3B5BDB', fone: '' },
  { id: 'p2', nome: 'Pessoa 2', cor: '#D6336C', fone: '' },
];

export const emptyData = (): Data => ({
  people: DEFAULT_PEOPLE.map((p) => ({ ...p })),
  rules: {},
  ruleSplits: {},
  ruleEach: {},
  ruleObs: {},
  tags: [],
  ruleTags: {},
  settings: { ...SETTINGS_DEFAULT },
  charges: [],
  history: [],
  parcelas: {},
});

export const isPlainObj = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x);

export const personById = (c: Ctx, id: string | undefined): Person | undefined =>
  c.d.people.find((p) => p.id === id);
export const tagById = (c: Ctx, id: string | null | undefined): Tag | undefined =>
  c.d.tags.find((g) => g.id === id);
export const isActive = (c: Ctx, id: string): boolean => {
  const p = personById(c, id);
  return !!p && !p.archived;
};
export const activePeople = (c: Ctx): Person[] => c.d.people.filter((p) => !p.archived);
/** Ordem da lista de pessoas: define sobras de centavo e a ordem das mensagens. */
export const personOrder = (c: Ctx, id: string | undefined): number => {
  const i = c.d.people.findIndex((p) => p.id === id);
  return i < 0 ? 999 : i;
};

/** Cor segura para CSS (só #RRGGBB). */
export const safeColor = (cor: string | undefined): string =>
  /^#[0-9a-f]{6}$/i.test(cor || '') ? cor! : '#888888';

export const NEUTRAL = '#8A948F',
  OTHER = '#B4A99A';

/** Pessoa gravada no histórico: nome e cor atuais se ela existe; senão o que foi gravado. */
export function who(
  c: Ctx,
  x: { pid?: string; nome: string; cor?: string },
  h?: { people?: { nome: string; cor?: string }[] },
): { key: string; nome: string; cor: string } {
  const p = personById(c, x.pid);
  return {
    key: x.pid || 'nome:' + x.nome,
    nome: p?.nome || x.nome,
    cor: p?.cor || x.cor || (h?.people || []).find((q) => q.nome === x.nome)?.cor || NEUTRAL,
  };
}

/** Novo contexto com a fatura vazia. */
export const newCtx = (d: Data, today: string): Ctx => ({
  d,
  inv: { txs: [], fileInfo: null, comp: '' },
  today,
  hIdx: null,
});

export const hasSavedData = (d: Data): boolean =>
  d.history.length > 0 ||
  Object.keys(d.rules).length > 0 ||
  d.charges.length > 0 ||
  d.tags.length > 0 ||
  Object.keys(d.parcelas).length > 0;
