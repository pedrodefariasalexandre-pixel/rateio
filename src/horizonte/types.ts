/**
 * Horizonte — contrato entre dados/motor e telas (requisitos v5; §8B > §8A > resto).
 * Dinheiro sempre em centavos (inteiro). Datas 'YYYY-MM-DD'. Competência/janela 'YYYY-MM'.
 * Tudo aqui é puro e determinístico: mesmo dado -> mesmo resultado (RNF02).
 */

export type Cents = number;
export type ISODate = string; // 'YYYY-MM-DD'
export type Comp = string; // 'YYYY-MM' = janela de pagamento (salário daquele mês)

// ---------------------------------------------------------------- dados persistidos

/** Fatura importada (RF02). Sem número do cartão, sem OFX bruto. */
export interface InvoiceSnapshot {
  id: string;
  acct: string; // hash do cartão
  comp: Comp; // competência da fatura (mês do vencimento)
  dueDate: ISODate | null;
  totalCents: Cents;
  contentHash: string;
  importedAt: string;
  lines: InvoiceLine[];
}

export type LineKind = 'compra' | 'estorno' | 'credito' | 'pagamento' | 'encargo';

export interface InvoiceLine {
  pos: number;
  fitid: string;
  postedOn: ISODate | null;
  memo: string; // nunca exibir se houver apelido (RF46)
  norm: string;
  cents: Cents; // positivo = gasto
  kind: LineKind;
  instCur: number | null;
  instTot: number | null;
  seriesKey: string | null; // mesma chave de lib/parcelas.ts
}

/** Cartão: fechamento/vencimento decidem a janela da 1ª parcela (RF38). */
export interface Card {
  acct: string;
  name: string;
  closingDay: number; // 1..31
  dueDay: number; // 1..31
}

/** Decisão do usuário sobre série/alerta (RF21, RN04, RN12). */
export type SeriesDecision = 'ignorado' | 'pago_antecipado' | 'fora_manual';
export interface AlertDecision {
  alertKey: string; // tipo|seriesKey|comp
  decision: SeriesDecision;
  /** Antecipação: quantas ÚLTIMAS parcelas saem (RF42/CA19). */
  anticipatedLast?: number;
}

export type Group = 'eu' | 'pai' | 'mae';
export type Direction = 'entrada' | 'saida';

/** Salário (RF48). */
export interface IncomeSource {
  id: string;
  name: string;
  group: Group;
  grossCents: Cents;
  deductions: { inss: Cents; irrf: Cents; consignado: Cents; outros: Cents };
  netCents: Cents; // líquido do mês
  advanceDay: number; // dia do adiantamento (15)
  advanceCents: Cents; // valor do adiantamento (parte do líquido)
  salaryBusinessDay: number; // 5 = 5º dia útil
  thirteenth: Thirteenth;
}

/** 13º (RF48 + §8B): valores do holerite vencem os previstos. */
export interface Thirteenth {
  considered: boolean;
  avos: number; // 0..12
  firstDate: ISODate | null;
  secondDate: ISODate | null;
  firstNetCents: Cents | null; // do holerite
  secondNetCents: Cents | null; // do holerite
  secondDeductionsCents: Cents; // INSS+IRRF previstos da 2ª
}

export interface Holiday {
  date: ISODate;
  description: string;
}
export interface PayWindowOverride {
  comp: Comp;
  salaryDate: ISODate;
}

/** Recorrência de conta fixa / item. */
export type Recurrence =
  | { kind: 'mensal'; day: number }
  | { kind: 'semanal'; weekday: number } // 0=dom..6=sáb (RF37)
  | { kind: 'parcelas'; startComp: Comp; total: number; day: number };

/** Conta fixa, assinatura, terceiro "entra e sai" (RF08, RF39, RF40). */
export interface FixedItem {
  id: string;
  name: string;
  alias: string | null;
  hidden: boolean;
  direction: Direction;
  amountCents: Cents; // valor da parte do Pedro (RF14)
  fullCents?: Cents; // valor cheio pago (fluxo do dia)
  recurrence: Recurrence;
  endComp: Comp | null;
  isSubscription: boolean;
  sourcePocketId: string | null; // RN10: null = salário
  thirdParty: Group | null; // RF40: gera +X e −X
}

export type PlannedKind = 'real' | 'pontual_previsto';
export interface PlannedEntry {
  id: string;
  comp: Comp;
  direction: Direction;
  name: string;
  amountCents: Cents;
  kind: PlannedKind;
  considered: boolean; // RN13
  receivedOn: ISODate | null;
  thirdParty: Group | null;
  group: Group;
}

export type PocketRule = 'piso' | 'acumula' | 'fonte' | 'livre';
export interface Pocket {
  id: string;
  name: string;
  rule: PocketRule;
  floorCents: Cents; // só piso
  goalCents: Cents | null;
  goalComp: Comp | null;
  monthlyCents: Cents;
  yieldPctMonth: number; // rendimento % a.m. (RF42)
  isReserve: boolean; // a "Reserva" que recebe a sobra (§8B)
  isWeeks: boolean; // a conta "Semanas" (RF36)
  archived: boolean;
}

export type PocketMoveKind = 'aporte' | 'retirada' | 'pagamento' | 'ajuste';
export interface PocketMove {
  id: string;
  pocketId: string;
  kind: PocketMoveKind;
  cents: Cents; // sempre > 0; sinal vem do kind ('ajuste' = saldo informado)
  onDate: ISODate;
  reason: string;
  transferId: string | null; // RF49: retirada+aporte vinculados
  imprevisto: boolean; // RN11
  itemId: string | null;
}

export interface WeeklyBudget {
  capCents: Cents;
  weeksPocketId: string | null;
}

export type ReserveMode = 'manual' | 'meta' | 'pct_salario';
export interface HorizonSettings {
  months: number; // 1..12
  reserveMode: ReserveMode | null;
  reserveValueCents: Cents | null;
  reservePct: number | null;
  reserveGoalComp: Comp | null;
  furoOrder: FuroSource[]; // padrão: semanas, reserva, emergencia
  avulsosOn: boolean;
}

/** Tudo que o motor precisa. */
export interface HorizonData {
  settings: HorizonSettings;
  snapshots: InvoiceSnapshot[];
  cards: Card[];
  decisions: AlertDecision[];
  incomes: IncomeSource[];
  holidays: Holiday[];
  overrides: PayWindowOverride[];
  fixed: FixedItem[];
  planned: PlannedEntry[];
  pockets: Pocket[];
  moves: PocketMove[];
  weekly: WeeklyBudget;
  /** fração do Pedro por seriesKey/norm (0..1), vinda de owner_memory (RF14). */
  myShare: (line: InvoiceLine) => number;
  /** Apelido/ocultar por chave do item (seriesKey ou norm) — RF46. */
  prefs: ItemPref[];
  /** comp de hoje (início da projeção). */
  today: ISODate;
}

export interface ItemPref {
  itemKey: string;
  alias: string | null;
  hidden: boolean;
}

// ---------------------------------------------------------------- saída do motor

/** Semana financeira seg–dom dentro da janela (§8B). */
export interface WeekSlice {
  start: ISODate;
  end: ISODate;
  days: number;
  allowance: Cents; // teto proporcional − estouro da semana anterior
  spent: Cents;
  carry: Cents; // estouro que passa para a próxima
}

export interface PayWindow {
  comp: Comp;
  advanceDate: ISODate; // 15 do mês anterior
  salaryDate: ISODate; // 5º dia útil (ou override)
  start: ISODate; // = advanceDate
  end: ISODate; // véspera do próximo adiantamento
  days: number;
}

export type ItemOrigin =
  | 'parcela'
  | 'fixa'
  | 'assinatura'
  | 'pontual'
  | 'avulso'
  | 'semanas'
  | 'terceiro'
  | '13o'
  | 'salario'
  | 'aporte';
export type ItemStatus = 'comprometido' | 'previsto';

export interface WindowItem {
  key: string;
  label: string; // apelido se houver; nunca memo quando há apelido
  origin: ItemOrigin;
  status: ItemStatus;
  direction: Direction;
  cents: Cents; // parte do Pedro
  date: ISODate;
  sourcePocketId: string | null;
  inst?: { cur: number; tot: number };
  endsHere: boolean; // RF44
  group: Group;
  hidden: boolean;
}

export interface WindowResult {
  window: PayWindow;
  items: WindowItem[];
  entradas: Cents;
  comprometido: Cents; // saídas pagas pelo salário, comprometidas
  previsto: Cents; // saídas previstas (fixas/avulsos/semanas)
  saldo: Cents; // entradas − comprometido − previsto (nunca inclui saldo em conta, RF47)
  semanasCents: Cents; // RF36
  sobraParaReserva: Cents; // §8B: max(saldo, 0)
  furo: Furo | null; // RF43
  liberaNaSeguinte: Cents; // RF44
}

export type FuroSource = 'semanas' | 'reserva' | 'emergencia';
export interface Furo {
  cents: Cents;
  plan: { source: FuroSource; pocketId: string | null; cents: Cents; needsConfirm: boolean }[];
  uncovered: Cents;
}

export interface PocketProjection {
  pocketId: string;
  balanceNow: Cents;
  byComp: { comp: Comp; balance: Cents }[];
  goalReachedComp: Comp | null;
  zeroedComp: Comp | null; // fonte que zera
}

export type AlertType =
  | 'parcela_sumiu'
  | 'valor_divergente'
  | 'duplicada'
  | 'mes_sem_fatura'
  | 'real_x_projetado'
  | 'caixinha_divergente'
  | 'caixinha_meta'
  | 'fonte_zerou'
  | 'fixa_mudou'
  | 'antecipacao_preco_cheio'
  | 'semanas_sem_cobertura';

export interface HorizonAlert {
  key: string; // tipo|seriesKey|comp
  type: AlertType;
  text: string;
  comp: Comp | null;
  seriesKey: string | null;
  diffCents?: Cents;
}

export interface Capacity {
  comp: Comp;
  base: Cents;
  conservador: Cents;
  formula: string;
}

export interface HorizonResult {
  windows: WindowResult[];
  pockets: PocketProjection[];
  alerts: HorizonAlert[]; // já sem os decididos
  capacity: Capacity[];
  reserveTargetCents: Cents | null;
}

export interface AnticipationSim {
  seriesKey: string;
  removed: { inst: number; comp: Comp; cents: Cents }[];
  fullCents: Cents;
  paidCents: Cents;
  discountCents: Cents;
  yieldLostCents: Cents;
  worth: boolean; // desconto > rendimento
  blocked: 'dividida' | null;
  alertFullPrice: boolean;
}

// ---------------------------------------------------------------- assinaturas

export interface HorizonEngine {
  payWindow(
    comp: Comp,
    income: IncomeSource,
    holidays: Holiday[],
    overrides: PayWindowOverride[],
  ): PayWindow;
  project(data: HorizonData): HorizonResult;
  simulateAnticipation(
    data: HorizonData,
    seriesKey: string,
    count: number,
    paidCents: Cents,
    pocketId: string | null,
  ): AnticipationSim;
  planTransfer(
    fromId: string,
    to: { id: string } | { newName: string; rule: PocketRule },
    cents: Cents,
    onDate: ISODate,
    reason: string,
  ): { moves: PocketMove[]; newPocket: Pocket | null };
  pocketBalance(pocketId: string, moves: PocketMove[], upTo?: ISODate): Cents;
  thirteenth(income: IncomeSource): {
    first: Cents;
    second: Cents;
    source: 'holerite' | 'previsto';
  };
  exportCsv(result: HorizonResult): string;
  weeks(window: PayWindow, capCents: Cents, spentByWeek: Cents[]): WeekSlice[];
  firstInvoiceComp(postedOn: ISODate, card: Card): Comp;
}

export type SaveSnapshotOutcome =
  { status: 'created' | 'unchanged' } | { status: 'conflict'; existingId: string };

export interface HorizonRepo {
  load(): Promise<Omit<HorizonData, 'myShare' | 'today'>>;
  saveSnapshot(
    s: Omit<InvoiceSnapshot, 'id' | 'importedAt'>,
    replace?: boolean,
  ): Promise<SaveSnapshotOutcome>;
  deleteSnapshot(id: string): Promise<void>;
  saveDecision(d: AlertDecision): Promise<void>;
  removeDecision(alertKey: string): Promise<void>;
  upsertIncome(i: IncomeSource): Promise<void>;
  upsertFixed(f: FixedItem): Promise<void>;
  deleteFixed(id: string): Promise<void>;
  upsertPlanned(p: PlannedEntry): Promise<void>;
  deletePlanned(id: string): Promise<void>;
  upsertPocket(p: Pocket): Promise<void>;
  addMoves(m: PocketMove[]): Promise<void>; // transferência = 2 moves numa transação
  undoTransfer(transferId: string): Promise<void>;
  upsertCard(c: Card): Promise<void>;
  setPref(p: ItemPref): Promise<void>;
  setHolidays(h: Holiday[]): Promise<void>;
  setOverride(o: PayWindowOverride | { comp: Comp; salaryDate: null }): Promise<void>;
  saveSettings(s: Partial<HorizonSettings>, weekly?: WeeklyBudget): Promise<void>;
  exportAll(): Promise<string>; // JSON
  deleteAll(): Promise<void>; // CA16
}
