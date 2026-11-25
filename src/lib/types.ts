/**
 * Formato dos dados do Rateio. É o mesmo JSON do backup "RATEIO-BACKUP" do rateio-v3.html (DATA_VERSION 7):
 * o banco importa/exporta exatamente isto (import_rateio_backup / export_rateio_backup).
 */

export type Id = string;
/** Ids vindos de backup podem ser número (Date.now() do v3). */
export type AnyId = string | number;

export interface Person {
  id: Id;
  nome: string;
  cor: string;
  fone: string;
  archived?: boolean;
}

export interface Tag {
  id: Id;
  nome: string;
  cor: string;
}

export interface Settings {
  pix: string;
  pixOwner: string;
  lastBackup: string;
  msgPending: boolean;
  msgProjection: boolean;
  projRecurring: boolean;
}

/** Peso por pessoa (divisão por partes). */
export type Weights = Record<string, number>;

/** Observação da memória por texto + valor. o:null = "não aplicar sozinho neste valor". */
export interface Obs {
  c: number;
  o: string[] | null;
  w?: Weights;
  at: string;
}

export interface Charge {
  id: AnyId;
  nome: string;
  /** Texto "12.34" (ou o que foi digitado, se ilegível). */
  valor: string;
  owners: string[];
  w?: Weights;
  parcAtual: string | number;
  parcTotal: string | number;
  parcComp: string;
  lastMonth: string;
}

export interface Parcela {
  cur: number;
  tot: number;
}

export type ParcelStatus = 'pendente' | 'pago_antecipado' | 'fora_manual';

export interface ParcelRecord {
  key: string;
  memo: string;
  norm: string;
  acct: string;
  parcela: Parcela;
  cents: number;
  fitid: string;
  dataCompra: string;
  status: ParcelStatus;
  em: string;
  comp: string;
  valorPago: number | null;
  desconto: number | null;
  origem: string;
  voltas?: Record<string, { decisao: 'incluir' | 'fora'; em: string }>;
  conferir?: string;
  chaveAntiga?: string;
}

export interface Payment {
  id: AnyId;
  cents: number;
  date: string;
}

export interface HistPerson {
  pid?: string;
  nome: string;
  cor?: string;
  total: number;
  text: string;
  payments: Payment[];
}

export interface HistShare {
  pid?: string;
  nome: string;
  cor?: string;
  cents: number;
}

export interface HistItem {
  memo: string;
  cents: number;
  parcela: Parcela | null;
  fixa: boolean;
  tags: string[];
  tagIds?: (string | null)[];
  shares: HistShare[];
}

export interface HistFora {
  memo: string;
  cents: number;
  motivo: string;
  parcela: Parcela | null;
  status?: ParcelStatus;
  chave?: string;
  em?: string;
  valorPago?: number | null;
  desconto?: number | null;
}

export interface Month {
  id: AnyId;
  comp: string;
  label: string;
  closedAt: string;
  signature: string;
  keys: string[];
  file: string;
  chargesBefore: Charge[] | null;
  totalCents: number;
  people: HistPerson[];
  items: HistItem[];
  fora: HistFora[];
}

/** Estado salvo (uma conta). */
export interface Data {
  people: Person[];
  rules: Record<string, string[]>;
  ruleSplits: Record<string, { w: Weights }>;
  ruleEach: Record<string, string[]>;
  ruleObs: Record<string, Obs[]>;
  tags: Tag[];
  ruleTags: Record<string, string[]>;
  settings: Settings;
  charges: Charge[];
  /** Mais recente primeiro. */
  history: Month[];
  parcelas: Record<string, ParcelRecord>;
}

export type Kind = 'compra' | 'pagamento' | 'estorno' | 'credito' | 'suspeito' | 'fixa';

export type SplitMode = 'igual' | 'partes' | 'valor';

export interface Split {
  mode: SplitMode;
  w?: Weights;
  v?: Record<string, number>;
}

export interface OfxLine {
  fitid: string;
  memo: string;
  cents: number;
  date: string;
  type: string;
}

/** Item da fatura em revisão (OFX ou cobrança fixa). */
export interface Tx {
  id: string;
  kind: Kind;
  fitid?: string;
  memo: string;
  norm: string;
  cents: number;
  date: string;
  parcela: Parcela | null;
  owners: string[];
  split: Split;
  auto: boolean;
  remember: boolean;
  excluded: boolean;
  reason: string;
  sources: OfxLine[] | null;
  dup: boolean;
  fitidWarn?: string;
  acct?: string;
  dataCompra?: string;
  tags: string[];
  charge?: boolean;
  chargeNoAnchor?: boolean;
  memKind?: 'exato' | 'nome';
  memNote?: string;
  payState?: 'quitou' | 'anterior' | 'ambiguo';
  pays?: string;
  paidBy?: string;
  candidates?: string[];
  pkey?: string;
  pcands?: string[];
  pconferir?: boolean;
  pvalorDif?: number;
  pmem?: boolean;
  voltou?: 'conferir' | 'incluir' | 'fora';
  eachMismatch?: { expected: number; got: number };
  seqWarn?: string;
  maybeDup?: number;
}

export interface FileInfo {
  lines: OfxLine[];
  skipped: { memo: string; raw: string }[];
  buySign: number;
  ledger: number | null;
  keys: string[];
  signature: string;
  name: string;
  acct: string;
}

/** Fatura aberta na tela (não é salva no banco). */
export interface Invoice {
  txs: Tx[];
  fileInfo: FileInfo | null;
  comp: string;
}

/** Contexto que as regras recebem no lugar das variáveis globais do v3. */
export interface Ctx {
  d: Data;
  inv: Invoice;
  /** Hoje (AAAA-MM-DD, fuso local). */
  today: string;
  /** Cache do índice do histórico (memória por texto); zere ao mudar o histórico. */
  hIdx?: Map<string, Obs[]> | null;
}
