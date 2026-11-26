/**
 * Repositório do Horizonte no Supabase (RLS por user_id; migration 0005_horizonte.sql).
 * Só grava linhas já interpretadas do OFX (nunca o arquivo nem o número do cartão).
 * Erros vão ao monitoramento só com o nome da operação e o código (sem valores/descrições).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { reportRpcError } from '../lib/monitoring';
import type {
  AlertDecision,
  Card,
  FixedItem,
  HorizonData,
  HorizonRepo,
  HorizonSettings,
  IncomeSource,
  InvoiceSnapshot,
  ItemPref,
  PlannedEntry,
  Pocket,
  PocketMove,
  SaveSnapshotOutcome,
  WeeklyBudget,
} from './types';

type Row = Record<string, unknown>;

const DEFAULT_SETTINGS: HorizonSettings = {
  months: 6,
  reserveMode: null,
  reserveValueCents: null,
  reservePct: null,
  reserveGoalComp: null,
  furoOrder: ['semanas', 'reserva', 'emergencia'],
  avulsosOn: true,
};

// ---------------------------------------------------------------- mapeamento linha <-> tipo
const n = (v: unknown) => (v == null ? null : Number(v));
export const map = {
  pocketTo: (p: Pocket): Row => ({
    id: p.id,
    name: p.name,
    rule: p.rule,
    floor_cents: p.floorCents,
    goal_cents: p.goalCents,
    goal_comp: p.goalComp,
    monthly_cents: p.monthlyCents,
    yield_pct_month: p.yieldPctMonth,
    is_reserve: p.isReserve,
    is_weeks: p.isWeeks,
    archived: p.archived,
  }),
  pocketFrom: (r: Row): Pocket => ({
    id: String(r.id),
    name: String(r.name),
    rule: r.rule as Pocket['rule'],
    floorCents: Number(r.floor_cents),
    goalCents: n(r.goal_cents),
    goalComp: (r.goal_comp as string) ?? null,
    monthlyCents: Number(r.monthly_cents),
    yieldPctMonth: Number(r.yield_pct_month),
    isReserve: !!r.is_reserve,
    isWeeks: !!r.is_weeks,
    archived: !!r.archived,
  }),
  moveTo: (m: PocketMove): Row => ({
    id: m.id,
    pocket_id: m.pocketId,
    kind: m.kind,
    cents: m.cents,
    on_date: m.onDate,
    reason: m.reason,
    transfer_id: m.transferId,
    imprevisto: m.imprevisto,
    item_id: m.itemId,
  }),
  moveFrom: (r: Row): PocketMove => ({
    id: String(r.id),
    pocketId: String(r.pocket_id),
    kind: r.kind as PocketMove['kind'],
    cents: Number(r.cents),
    onDate: String(r.on_date),
    reason: String(r.reason ?? ''),
    transferId: (r.transfer_id as string) ?? null,
    imprevisto: !!r.imprevisto,
    itemId: (r.item_id as string) ?? null,
  }),
  fixedTo: (f: FixedItem): Row => ({
    id: f.id,
    name: f.name,
    alias: f.alias,
    hidden: f.hidden,
    direction: f.direction,
    amount_cents: f.amountCents,
    full_cents: f.fullCents ?? null,
    recurrence: f.recurrence,
    end_comp: f.endComp,
    is_subscription: f.isSubscription,
    source_pocket_id: f.sourcePocketId,
    third_party: f.thirdParty,
  }),
  fixedFrom: (r: Row): FixedItem => ({
    id: String(r.id),
    name: String(r.name),
    alias: (r.alias as string) ?? null,
    hidden: !!r.hidden,
    direction: r.direction as FixedItem['direction'],
    amountCents: Number(r.amount_cents),
    ...(r.full_cents != null ? { fullCents: Number(r.full_cents) } : {}),
    recurrence: r.recurrence as FixedItem['recurrence'],
    endComp: (r.end_comp as string) ?? null,
    isSubscription: !!r.is_subscription,
    sourcePocketId: (r.source_pocket_id as string) ?? null,
    thirdParty: (r.third_party as FixedItem['thirdParty']) ?? null,
  }),
  plannedTo: (p: PlannedEntry): Row => ({
    id: p.id,
    comp: p.comp,
    direction: p.direction,
    name: p.name,
    amount_cents: p.amountCents,
    kind: p.kind,
    considered: p.considered,
    received_on: p.receivedOn,
    third_party: p.thirdParty,
    grp: p.group,
  }),
  plannedFrom: (r: Row): PlannedEntry => ({
    id: String(r.id),
    comp: String(r.comp),
    direction: r.direction as PlannedEntry['direction'],
    name: String(r.name),
    amountCents: Number(r.amount_cents),
    kind: r.kind as PlannedEntry['kind'],
    considered: !!r.considered,
    receivedOn: (r.received_on as string) ?? null,
    thirdParty: (r.third_party as PlannedEntry['thirdParty']) ?? null,
    group: r.grp as PlannedEntry['group'],
  }),
  incomeTo: (i: IncomeSource): Row => ({
    id: i.id,
    name: i.name,
    grp: i.group,
    gross_cents: i.grossCents,
    deductions: i.deductions,
    net_cents: i.netCents,
    advance_day: i.advanceDay,
    advance_cents: i.advanceCents,
    salary_business_day: i.salaryBusinessDay,
    thirteenth: i.thirteenth,
  }),
  incomeFrom: (r: Row): IncomeSource => ({
    id: String(r.id),
    name: String(r.name),
    group: r.grp as IncomeSource['group'],
    grossCents: Number(r.gross_cents),
    deductions: { inss: 0, irrf: 0, consignado: 0, outros: 0, ...(r.deductions as object) },
    netCents: Number(r.net_cents),
    advanceDay: Number(r.advance_day),
    advanceCents: Number(r.advance_cents),
    salaryBusinessDay: Number(r.salary_business_day),
    thirteenth: {
      considered: false,
      avos: 12,
      firstDate: null,
      secondDate: null,
      firstNetCents: null,
      secondNetCents: null,
      secondDeductionsCents: 0,
      ...(r.thirteenth as object),
    },
  }),
  snapshotFrom: (r: Row, lines: Row[]): InvoiceSnapshot => ({
    id: String(r.id),
    acct: String(r.acct),
    comp: String(r.comp),
    dueDate: (r.due_date as string) ?? null,
    totalCents: Number(r.total_cents),
    contentHash: String(r.content_hash),
    importedAt: String(r.imported_at),
    lines: lines
      .filter((l) => l.snapshot_id === r.id)
      .sort((a, b) => Number(a.pos) - Number(b.pos))
      .map((l) => ({
        pos: Number(l.pos),
        fitid: String(l.fitid ?? ''),
        postedOn: (l.posted_on as string) ?? null,
        memo: String(l.memo),
        norm: String(l.norm),
        cents: Number(l.cents),
        kind: l.kind as InvoiceSnapshot['lines'][number]['kind'],
        instCur: n(l.inst_cur),
        instTot: n(l.inst_tot),
        seriesKey: (l.series_key as string) ?? null,
      })),
  }),
};

export function supabaseHorizonRepo(sb: SupabaseClient): HorizonRepo {
  const fail = (op: string, error: { code?: string; message?: string } | null) => {
    if (!error) return;
    reportRpcError(`horizonte.${op}`, error);
    throw new Error('Não foi possível salvar no Horizonte. Tente de novo.');
  };
  const all = async (t: string): Promise<Row[]> => {
    const { data, error } = await sb.from(t).select('*');
    fail(`load.${t}`, error);
    return (data ?? []) as Row[];
  };
  const upsert = async (t: string, row: Row, onConflict?: string) => {
    const { error } = await sb.from(t).upsert(row, onConflict ? { onConflict } : undefined);
    fail(`upsert.${t}`, error);
  };
  const del = async (t: string, col: string, v: string) => {
    const { error } = await sb.from(t).delete().eq(col, v);
    fail(`delete.${t}`, error);
  };

  const load: HorizonRepo['load'] = async () => {
    const [st, snaps, lines, dec, cards, inc, hol, ov, pk, mv, items, pl, prefs] =
      (await Promise.all(
        [
          'hz_settings',
          'invoice_snapshots',
          'invoice_lines',
          'hz_decisions',
          'hz_cards',
          'income_sources',
          'hz_holidays',
          'pay_window_overrides',
          'pockets',
          'pocket_moves',
          'hz_items',
          'planned_entries',
          'hz_item_prefs',
        ].map(all),
      )) as Row[][];
    const s = st![0];
    const settings: HorizonSettings = s
      ? {
          months: Number(s.months),
          reserveMode: (s.reserve_mode as HorizonSettings['reserveMode']) ?? null,
          reserveValueCents: n(s.reserve_value_cents),
          reservePct: n(s.reserve_pct),
          reserveGoalComp: (s.reserve_goal_comp as string) ?? null,
          furoOrder: s.furo_order as HorizonSettings['furoOrder'],
          avulsosOn: !!s.avulsos_on,
        }
      : DEFAULT_SETTINGS;
    return {
      settings,
      weekly: {
        capCents: Number(s?.weekly_cap_cents ?? 0),
        weeksPocketId: (s?.weeks_pocket_id as string) ?? null,
      },
      snapshots: snaps!.map((r) => map.snapshotFrom(r, lines!)),
      decisions: dec!.map((r) => ({
        alertKey: String(r.alert_key),
        decision: r.decision as AlertDecision['decision'],
        ...(r.anticipated_last != null ? { anticipatedLast: Number(r.anticipated_last) } : {}),
      })),
      cards: cards!.map((r) => ({
        acct: String(r.acct),
        name: String(r.name),
        closingDay: Number(r.closing_day),
        dueDay: Number(r.due_day),
      })),
      incomes: inc!.map(map.incomeFrom),
      holidays: hol!.map((r) => ({ date: String(r.on_date), description: String(r.description) })),
      overrides: ov!.map((r) => ({ comp: String(r.comp), salaryDate: String(r.salary_date) })),
      pockets: pk!.map(map.pocketFrom),
      moves: mv!.map(map.moveFrom),
      fixed: items!.map(map.fixedFrom),
      planned: pl!.map(map.plannedFrom),
      prefs: prefs!.map((r) => ({
        itemKey: String(r.item_key),
        alias: (r.alias as string) ?? null,
        hidden: !!r.hidden,
      })),
    };
  };

  return {
    load,
    async saveSnapshot(s, replace = false): Promise<SaveSnapshotOutcome> {
      const { data, error } = await sb.rpc('save_invoice_snapshot', { p: s, p_replace: replace });
      fail('save_invoice_snapshot', error);
      const r = data as { status: string; existingId?: string };
      return r.status === 'conflict'
        ? { status: 'conflict', existingId: r.existingId! }
        : { status: r.status as 'created' | 'unchanged' };
    },
    deleteSnapshot: (id) => del('invoice_snapshots', 'id', id),
    saveDecision: (d) =>
      upsert(
        'hz_decisions',
        {
          alert_key: d.alertKey,
          decision: d.decision,
          anticipated_last: d.anticipatedLast ?? null,
        },
        'user_id,alert_key',
      ),
    removeDecision: (k) => del('hz_decisions', 'alert_key', k),
    upsertIncome: (i) => upsert('income_sources', map.incomeTo(i), 'user_id,id'),
    upsertFixed: (f) => upsert('hz_items', map.fixedTo(f), 'user_id,id'),
    deleteFixed: (id) => del('hz_items', 'id', id),
    upsertPlanned: (p) => upsert('planned_entries', map.plannedTo(p), 'user_id,id'),
    deletePlanned: (id) => del('planned_entries', 'id', id),
    upsertPocket: (p) => upsert('pockets', map.pocketTo(p), 'user_id,id'),
    async addMoves(m) {
      const { error } = await sb.from('pocket_moves').insert(m.map(map.moveTo)); // um insert = uma transação
      fail('addMoves', error);
    },
    undoTransfer: (tid) => del('pocket_moves', 'transfer_id', tid),
    upsertCard: (c: Card) =>
      upsert(
        'hz_cards',
        { acct: c.acct, name: c.name, closing_day: c.closingDay, due_day: c.dueDay },
        'user_id,acct',
      ),
    setPref: (p: ItemPref) =>
      upsert(
        'hz_item_prefs',
        { item_key: p.itemKey, alias: p.alias, hidden: p.hidden },
        'user_id,item_key',
      ),
    async setHolidays(h) {
      const { error } = await sb.from('hz_holidays').delete().gte('on_date', '1900-01-01');
      fail('holidays.clear', error);
      if (h.length) {
        const r = await sb
          .from('hz_holidays')
          .insert(h.map((x) => ({ on_date: x.date, description: x.description })));
        fail('holidays.insert', r.error);
      }
    },
    async setOverride(o) {
      if (o.salaryDate)
        await upsert(
          'pay_window_overrides',
          { comp: o.comp, salary_date: o.salaryDate },
          'user_id,comp',
        );
      else await del('pay_window_overrides', 'comp', o.comp);
    },
    async saveSettings(s: Partial<HorizonSettings>, weekly?: WeeklyBudget) {
      const row: Row = {};
      if (s.months != null) row.months = s.months;
      if ('reserveMode' in s) row.reserve_mode = s.reserveMode;
      if ('reserveValueCents' in s) row.reserve_value_cents = s.reserveValueCents;
      if ('reservePct' in s) row.reserve_pct = s.reservePct;
      if ('reserveGoalComp' in s) row.reserve_goal_comp = s.reserveGoalComp;
      if (s.furoOrder) row.furo_order = s.furoOrder;
      if (s.avulsosOn != null) row.avulsos_on = s.avulsosOn;
      if (weekly)
        Object.assign(row, {
          weekly_cap_cents: weekly.capCents,
          weeks_pocket_id: weekly.weeksPocketId,
        });
      row.updated_at = new Date().toISOString();
      await upsert('hz_settings', row, 'user_id');
    },
    async exportAll() {
      const d: Omit<HorizonData, 'myShare' | 'today'> = await load();
      return JSON.stringify({
        format: 'RATEIO-HORIZONTE',
        version: 1,
        exportedAt: new Date().toISOString(),
        ...d,
      });
    },
    async deleteAll() {
      const { error } = await sb.rpc('delete_horizon_data');
      fail('delete_horizon_data', error);
    },
  };
}
