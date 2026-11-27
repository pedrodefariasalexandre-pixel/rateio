/**
 * Motor do Horizonte: cálculo local, puro e determinístico (RNF02), em centavos (RNF03).
 * Contrato em ./types.ts. Regras: requisitos v5 (§8B > §8A > demais).
 */
import { addMonths } from '../lib/dates';
import { ENCARGO, cyrb53, normalize, parseParcela } from '../lib/text';
import type {
  AlertDecision,
  AnticipationSim,
  Capacity,
  Card,
  Cents,
  Comp,
  FixedItem,
  Furo,
  Group,
  Holiday,
  HorizonAlert,
  HorizonData,
  HorizonEngine,
  HorizonResult,
  IncomeSource,
  InvoiceLine,
  InvoiceSnapshot,
  ISODate,
  PayWindow,
  PayWindowOverride,
  Pocket,
  PocketMove,
  PocketProjection,
  PocketRule,
  WeekSlice,
  WindowItem,
  WindowResult,
} from './types';

// ---------------------------------------------------------------- datas (UTC, sem fuso)
const DAY = 86400000;
const toMs = (d: ISODate) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const fromMs = (ms: number): ISODate => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d: ISODate, k: number): ISODate => fromMs(toMs(d) + k * DAY);
export const daysBetween = (a: ISODate, b: ISODate) => Math.round((toMs(b) - toMs(a)) / DAY);
export const weekday = (d: ISODate) => new Date(toMs(d)).getUTCDay();
const lastDay = (comp: Comp) =>
  new Date(Date.UTC(+comp.slice(0, 4), +comp.slice(5, 7), 0)).getUTCDate();
const dateIn = (comp: Comp, day: number): ISODate =>
  `${comp}-${String(Math.min(day, lastDay(comp))).padStart(2, '0')}`;
const compOf = (d: ISODate): Comp => d.slice(0, 7);
const TOL = 5; // R$ 0,05

/** N-ésimo dia útil do mês (seg–sex, sem feriados). */
export function businessDay(comp: Comp, n: number, holidays: Holiday[]): ISODate {
  const hol = new Set(holidays.map((h) => h.date));
  let d = `${comp}-01`;
  let count = 0;
  for (;;) {
    const w = weekday(d);
    if (w !== 0 && w !== 6 && !hol.has(d) && ++count === n) return d;
    d = addDays(d, 1);
  }
}

/** RF33/§8B: janela M = adiantamento do dia 15 de M-1 até a véspera do adiantamento de M; salário no 5º dia útil de M. */
export function payWindow(
  comp: Comp,
  income: IncomeSource,
  holidays: Holiday[],
  overrides: PayWindowOverride[],
): PayWindow {
  const advanceDate = dateIn(addMonths(comp, -1), income.advanceDay);
  const ov = overrides.find((o) => o.comp === comp);
  const salaryDate = ov?.salaryDate ?? businessDay(comp, income.salaryBusinessDay, holidays);
  const end = addDays(dateIn(comp, income.advanceDay), -1);
  return {
    comp,
    advanceDate,
    salaryDate,
    start: advanceDate,
    end,
    days: daysBetween(advanceDate, end) + 1,
  };
}

/** Janela que contém a data (pela regra do dia do adiantamento). */
const windowOf = (d: ISODate, advanceDay: number): Comp =>
  +d.slice(8, 10) >= advanceDay ? addMonths(compOf(d), 1) : compOf(d);

/** RF38: compra depois do fechamento vai para a fatura seguinte. Devolve o mês do vencimento. */
export function firstInvoiceComp(postedOn: ISODate, card: Card): Comp {
  let closeComp = compOf(postedOn);
  if (+postedOn.slice(8, 10) > card.closingDay) closeComp = addMonths(closeComp, 1);
  return card.dueDay < card.closingDay ? addMonths(closeComp, 1) : closeComp;
}

/**
 * Mês do vencimento a partir do fechamento do extrato (DTEND do OFX).
 * Não usa as datas das compras: parcelas trazem a data da compra original e a ordem das linhas varia.
 */
export function invoiceCompFromClosing(closingDate: ISODate, card: Card | undefined): Comp {
  const closeComp = compOf(closingDate);
  const closingDay = card?.closingDay ?? +closingDate.slice(8, 10);
  const dueDay = card?.dueDay;
  // sem cartão cadastrado: fechamento no início do mês vence no mesmo mês; no fim, no seguinte
  const nextMonth = dueDay != null ? dueDay < closingDay : closingDay > 15;
  return nextMonth ? addMonths(closeComp, 1) : closeComp;
}

/** Saldo da caixinha pelos movimentos ('ajuste' = saldo informado manualmente). */
export function pocketBalance(pocketId: string, moves: PocketMove[], upTo?: ISODate): Cents {
  let bal = 0;
  for (const m of sortMoves(moves)) {
    if (m.pocketId !== pocketId || (upTo && m.onDate > upTo)) continue;
    bal = applyMove(bal, m);
  }
  return bal;
}
const sortMoves = (moves: PocketMove[]) =>
  [...moves].sort((a, b) =>
    a.onDate < b.onDate ? -1 : a.onDate > b.onDate ? 1 : a.id < b.id ? -1 : 1,
  );
const applyMove = (bal: Cents, m: PocketMove): Cents =>
  m.kind === 'ajuste' ? m.cents : m.kind === 'aporte' ? bal + m.cents : bal - m.cents;

/** RF48/§8B: holerite vence; sem holerite, previsto pelos avos (1ª = 50% sem descontos; 2ª = resto − INSS/IRRF). */
export function thirteenth(income: IncomeSource): {
  first: Cents;
  second: Cents;
  source: 'holerite' | 'previsto';
} {
  const t = income.thirteenth;
  const full = Math.round((income.grossCents * t.avos) / 12);
  const firstPrev = Math.round(full / 2);
  const first = t.firstNetCents ?? firstPrev;
  const second = t.secondNetCents ?? full - firstPrev - t.secondDeductionsCents;
  const source = t.firstNetCents != null && t.secondNetCents != null ? 'holerite' : 'previsto';
  return { first, second: Math.max(0, second), source };
}

/** RF36/§8B: semanas seg–dom recortadas pela janela; teto proporcional aos dias; estouro sai da semana seguinte. */
export function weeks(window: PayWindow, capCents: Cents, spentByWeek: Cents[]): WeekSlice[] {
  const out: WeekSlice[] = [];
  let start = window.start;
  let carry = 0;
  while (start <= window.end) {
    const toSunday = (7 - weekday(start)) % 7;
    const end = addDays(start, toSunday) > window.end ? window.end : addDays(start, toSunday);
    const days = daysBetween(start, end) + 1;
    const allowance = Math.round((capCents * days) / 7) - carry;
    const spent = spentByWeek[out.length] ?? 0;
    carry = Math.max(0, spent - allowance);
    out.push({ start, end, days, allowance, spent, carry });
    start = addDays(end, 1);
  }
  return out;
}

/** RF49: transferência = retirada + aporte vinculados; pode criar a caixinha de destino. */
export function planTransfer(
  fromId: string,
  to: { id: string } | { newName: string; rule: PocketRule },
  cents: Cents,
  onDate: ISODate,
  reason: string,
): { moves: PocketMove[]; newPocket: Pocket | null } {
  if (!(cents > 0) || !Number.isInteger(cents)) throw new Error('valor inválido');
  const newPocket: Pocket | null =
    'newName' in to
      ? {
          id: uid(),
          name: to.newName.trim().slice(0, 60),
          rule: to.rule,
          floorCents: 0,
          goalCents: null,
          goalComp: null,
          monthlyCents: 0,
          yieldPctMonth: 0,
          isReserve: false,
          isWeeks: false,
          archived: false,
        }
      : null;
  const toId = newPocket ? newPocket.id : (to as { id: string }).id;
  if (toId === fromId) throw new Error('origem e destino iguais');
  const transferId = uid();
  const base = { onDate, reason, transferId, imprevisto: false, itemId: null };
  return {
    newPocket,
    moves: [
      { ...base, id: uid(), pocketId: fromId, kind: 'retirada', cents },
      { ...base, id: uid(), pocketId: toId, kind: 'aporte', cents },
    ],
  };
}
const uid = () => globalThis.crypto.randomUUID();

// ---------------------------------------------------------------- projeção

const decisionOf = (ds: AlertDecision[], seriesKey: string) =>
  ds.find((d) => d.alertKey === `serie|${seriesKey}`);

/** Último snapshot de cada cartão (RN01). */
function latestByCard(snaps: InvoiceSnapshot[]): InvoiceSnapshot[] {
  const m = new Map<string, InvoiceSnapshot>();
  for (const s of snaps) {
    const cur = m.get(s.acct);
    if (!cur || s.comp > cur.comp) m.set(s.acct, s);
  }
  return [...m.values()].sort((a, b) => (a.acct < b.acct ? -1 : 1));
}

/** Parcelas restantes projetadas (RF07, RN02, RF09, CA19). */
interface ProjParcel {
  seriesKey: string;
  line: InvoiceLine;
  acct: string;
  inst: number;
  tot: number;
  invoiceComp: Comp;
  due: ISODate;
  cents: Cents; // cheio
}
/**
 * Parcelas de uma fatura: uma linha por série (a de menor n/t). Linhas da mesma série com n maior
 * no mesmo arquivo são parcelas já antecipadas e pagas (ex.: 7/12 normal + 8..12/12 antecipadas):
 * não geram cobrança nem projeção, e a série termina na parcela anterior à primeira antecipada.
 */
interface RegParcel {
  line: InvoiceLine;
  key: string;
  cur: number;
  tot: number;
  lastInst: number;
}
function regularParcels(s: InvoiceSnapshot): RegParcel[] {
  const by = new Map<string, InvoiceLine[]>();
  for (const l of s.lines) {
    if (l.kind !== 'compra' || !l.seriesKey || !l.instCur || !l.instTot || l.cents <= 0) continue;
    by.set(l.seriesKey, [...(by.get(l.seriesKey) ?? []), l]);
  }
  const out: RegParcel[] = [];
  for (const ls of by.values()) {
    const sorted = [...ls].sort((a, b) => (a.instCur ?? 0) - (b.instCur ?? 0));
    const first = sorted[0]!;
    const cur = first.instCur ?? 0;
    const tot = first.instTot ?? 0;
    const ant = sorted.find((l) => (l.instCur ?? 0) > cur);
    out.push({
      line: first,
      key: first.seriesKey ?? '',
      cur,
      tot,
      lastInst: ant ? (ant.instCur ?? 0) - 1 : tot,
    });
  }
  return out;
}

function projectParcels(d: HorizonData): ProjParcel[] {
  const out: ProjParcel[] = [];
  for (const s of latestByCard(d.snapshots)) {
    const card = d.cards.find((c) => c.acct === s.acct);
    const dueDay = card?.dueDay ?? (s.dueDate ? +s.dueDate.slice(8, 10) : 10);
    for (const { line: l, key, cur, tot, lastInst } of regularParcels(s)) {
      const dec = decisionOf(d.decisions, key);
      if (dec?.decision === 'fora_manual') continue;
      const cut = dec?.decision === 'pago_antecipado' ? tot - (dec.anticipatedLast ?? tot) : tot;
      for (let n = cur + 1; n <= Math.min(cut, lastInst); n++) {
        const invoiceComp = addMonths(s.comp, n - cur);
        out.push({
          seriesKey: key,
          line: l,
          acct: s.acct,
          inst: n,
          tot,
          invoiceComp,
          due: dateIn(invoiceComp, dueDay),
          cents: l.cents,
        });
      }
    }
  }
  return out;
}

const share = (cents: Cents, f: number) => Math.round(cents * f);

function fixedOccurrences(f: FixedItem, w: PayWindow): ISODate[] {
  const out: ISODate[] = [];
  const r = f.recurrence;
  for (let d = w.start; d <= w.end; d = addDays(d, 1)) {
    if (f.endComp && compOf(d) > f.endComp) continue;
    if (r.kind === 'semanal') {
      if (weekday(d) === r.weekday) out.push(d);
    } else if (d === dateIn(compOf(d), r.day)) {
      if (r.kind === 'parcelas') {
        const idx = monthsDiff(r.startComp, compOf(d));
        if (idx < 0 || idx >= r.total) continue;
      }
      out.push(d);
    }
  }
  return out;
}
const monthsDiff = (a: Comp, b: Comp) =>
  (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));

function isLastFixed(f: FixedItem, d: ISODate): boolean {
  const r = f.recurrence;
  if (r.kind === 'parcelas') return monthsDiff(r.startComp, compOf(d)) === r.total - 1;
  return !!f.endComp && compOf(addDays(d, r.kind === 'semanal' ? 7 : 31)) > f.endComp;
}

/** Média e máximo dos avulsos (compras à vista, não fixas) dos 3 últimos meses (RF26, RF31). */
function avulsos(d: HorizonData): { avg: Cents; max: Cents } {
  const fixedNorms = new Set(d.fixed.map((f) => normalize(f.name)));
  const byComp = new Map<Comp, Cents>();
  for (const s of d.snapshots)
    for (const l of s.lines)
      if (l.kind === 'compra' && !l.instTot && l.cents > 0 && !fixedNorms.has(l.norm))
        byComp.set(s.comp, (byComp.get(s.comp) ?? 0) + share(l.cents, d.myShare(l)));
  const last = [...byComp.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 3)
    .map((e) => e[1]);
  if (!last.length) return { avg: 0, max: 0 };
  return { avg: Math.round(last.reduce((a, b) => a + b, 0) / last.length), max: Math.max(...last) };
}

const prefOf = (d: HorizonData, key: string) => d.prefs.find((p) => p.itemKey === key);

export function project(d: HorizonData): HorizonResult {
  const income = d.incomes.find((i) => i.group === 'eu') ?? d.incomes[0];
  const advDay = income?.advanceDay ?? 15;
  const firstComp = windowOf(d.today, advDay);
  const comps = Array.from({ length: d.settings.months }, (_, k) => addMonths(firstComp, k));
  const parcels = projectParcels(d);
  const av = d.settings.avulsosOn ? avulsos(d) : { avg: 0, max: 0 };
  const alerts: HorizonAlert[] = validate(d, parcels);

  // saldos atuais das caixinhas
  const bal = new Map(d.pockets.map((p) => [p.id, pocketBalance(p.id, d.moves, d.today)]));
  const pocketProj = new Map<string, PocketProjection>(
    d.pockets.map((p) => [
      p.id,
      {
        pocketId: p.id,
        balanceNow: bal.get(p.id)!,
        byComp: [],
        goalReachedComp: null,
        zeroedComp: null,
      },
    ]),
  );
  const reserve = d.pockets.find((p) => p.isReserve && !p.archived);
  const emergency = d.pockets.find((p) => p.rule === 'piso' && !p.archived);
  const weeksPocketId = d.weekly.weeksPocketId ?? d.pockets.find((p) => p.isWeeks)?.id ?? null;

  const windows: WindowResult[] = [];
  const capacity: Capacity[] = [];

  for (const comp of comps) {
    const w: PayWindow = income
      ? payWindow(comp, income, d.holidays, d.overrides)
      : (() => {
          const start = dateIn(addMonths(comp, -1), 15);
          const end = addDays(dateIn(comp, 15), -1);
          return {
            comp,
            advanceDate: start,
            salaryDate: dateIn(comp, 5),
            start,
            end,
            days: daysBetween(start, end) + 1,
          };
        })();
    const items: WindowItem[] = [];
    const push = (it: Omit<WindowItem, 'hidden' | 'endsHere' | 'group'> & Partial<WindowItem>) =>
      items.push({ hidden: false, endsHere: false, group: 'eu', ...it });

    // entradas: salário (adiantamento + resto) — RF23/RF33
    for (const inc of d.incomes) {
      const pw = payWindow(comp, inc, d.holidays, d.overrides);
      if (inc.advanceCents > 0)
        push({
          key: `sal|${inc.id}|adv|${comp}`,
          label: `${inc.name} (adiantamento)`,
          origin: 'salario',
          status: 'comprometido',
          direction: 'entrada',
          cents: inc.advanceCents,
          date: pw.advanceDate,
          sourcePocketId: null,
          group: inc.group,
        });
      push({
        key: `sal|${inc.id}|sal|${comp}`,
        label: inc.name,
        origin: 'salario',
        status: 'comprometido',
        direction: 'entrada',
        cents: inc.netCents - inc.advanceCents,
        date: pw.salaryDate,
        sourcePocketId: null,
        group: inc.group,
      });
      // 13º (RF48, RN13)
      if (inc.thirteenth.considered) {
        const t = thirteenth(inc);
        for (const [n, date, cents] of [
          [1, inc.thirteenth.firstDate, t.first],
          [2, inc.thirteenth.secondDate, t.second],
        ] as const)
          if (date && cents > 0 && windowOf(date, advDay) === comp)
            push({
              key: `13|${inc.id}|${n}`,
              label: `13º ${n}ª parcela${t.source === 'previsto' ? ' (previsto)' : ''}`,
              origin: '13o',
              status: 'previsto',
              direction: 'entrada',
              cents,
              date,
              sourcePocketId: null,
              group: inc.group,
            });
      }
    }

    // parcelas na janela em que vencem (§8A)
    for (const p of parcels) {
      if (windowOf(p.due, advDay) !== comp) continue;
      const pref = prefOf(d, p.seriesKey);
      push({
        key: `parc|${p.seriesKey}|${p.inst}`,
        label: pref?.alias ?? p.line.memo,
        origin: 'parcela',
        status: 'comprometido',
        direction: 'saida',
        cents: share(p.cents, d.myShare(p.line)),
        date: p.due,
        sourcePocketId: null,
        inst: { cur: p.inst, tot: p.tot },
        endsHere: p.inst === p.tot,
        hidden: !!pref?.hidden,
      });
    }

    // a própria fatura importada (ex.: fatura de dezembro, vence em dezembro): parcelas dela + à vista
    for (const s of latestByCard(d.snapshots)) {
      const card = d.cards.find((c) => c.acct === s.acct);
      const dueDay = card?.dueDay ?? (s.dueDate ? +s.dueDate.slice(8, 10) : 10);
      const due = dateIn(s.comp, dueDay);
      if (windowOf(due, advDay) !== comp) continue;
      const fixedNorms = new Set(d.fixed.map((f) => normalize(f.name)));
      const reg = regularParcels(s);
      const regLines = new Set(reg.map((r) => r.line));
      for (const { line: l, key, cur, tot, lastInst } of reg) {
        const pref = prefOf(d, key);
        push({
          key: `parc|${key}|${cur}`,
          label: pref?.alias ?? l.memo,
          origin: 'parcela',
          status: 'comprometido',
          direction: 'saida',
          cents: share(l.cents, d.myShare(l)),
          date: due,
          sourcePocketId: null,
          inst: { cur, tot },
          endsHere: cur === lastInst,
          hidden: !!pref?.hidden,
        });
      }
      // à vista: compras sem parcela menos estornos (pagamentos e descontos de antecipação ficam fora)
      let avista = 0;
      for (const l of s.lines) {
        if (regLines.has(l) || l.instTot || fixedNorms.has(l.norm)) continue;
        if (l.kind === 'compra' || l.kind === 'encargo') avista += share(l.cents, d.myShare(l));
        else if (l.kind === 'estorno' && !/ANTECIPA/i.test(l.norm))
          avista += share(l.cents, d.myShare(l));
      }
      if (avista > 0)
        push({
          key: `avista|${s.acct}|${s.comp}`,
          label: 'Compras à vista da fatura',
          origin: 'avulso',
          status: 'comprometido',
          direction: 'saida',
          cents: avista,
          date: due,
          sourcePocketId: null,
        });
    }

    // fixas, assinaturas, terceiros (RF08, RF37, RF39, RF40)
    for (const f of d.fixed) {
      for (const date of fixedOccurrences(f, w)) {
        const label = f.alias ?? f.name;
        const base = {
          label,
          date,
          sourcePocketId: f.sourcePocketId,
          hidden: f.hidden,
          endsHere: isLastFixed(f, date),
        };
        if (f.thirdParty) {
          const g: Group = f.thirdParty;
          const full = f.fullCents ?? f.amountCents;
          push({
            ...base,
            key: `fix|${f.id}|${date}|out`,
            origin: 'terceiro',
            status: 'previsto',
            direction: 'saida',
            cents: full,
            group: g,
          });
          push({
            ...base,
            key: `fix|${f.id}|${date}|in`,
            origin: 'terceiro',
            status: 'previsto',
            direction: 'entrada',
            cents: full,
            group: g,
            sourcePocketId: null,
          });
        } else {
          push({
            ...base,
            key: `fix|${f.id}|${date}`,
            origin: f.isSubscription ? 'assinatura' : 'fixa',
            status: 'previsto',
            direction: f.direction,
            cents: f.amountCents,
          });
        }
      }
    }

    // pontuais (RF25, RN13)
    for (const p of d.planned) {
      if (p.comp !== comp || (p.kind === 'pontual_previsto' && !p.considered)) continue;
      push({
        key: `plan|${p.id}`,
        label: p.kind === 'pontual_previsto' ? `${p.name} (previsto)` : p.name,
        origin: p.thirdParty ? 'terceiro' : 'pontual',
        status: p.kind === 'real' ? 'comprometido' : 'previsto',
        direction: p.direction,
        cents: p.amountCents,
        date: p.receivedOn ?? w.salaryDate,
        sourcePocketId: null,
        group: p.thirdParty ?? p.group,
      });
    }

    // aportes planejados (RN08) em caixinhas que não sejam a Reserva (ela recebe a sobra)
    for (const p of d.pockets)
      if (!p.archived && !p.isReserve && !p.isWeeks && p.monthlyCents > 0)
        push({
          key: `apo|${p.id}|${comp}`,
          label: `Aporte ${p.name}`,
          origin: 'aporte',
          status: 'previsto',
          direction: 'saida',
          cents: p.monthlyCents,
          date: w.salaryDate,
          sourcePocketId: null,
        });

    // fonte por saída (RF34, RN10): caixinha paga até zerar; depois volta ao salário
    for (const it of [...items]) {
      if (!it.sourcePocketId || it.direction !== 'saida') continue;
      const pid = it.sourcePocketId;
      const b = bal.get(pid) ?? 0;
      if (b >= it.cents) {
        bal.set(pid, b - it.cents);
      } else {
        bal.set(pid, 0);
        const pp = pocketProj.get(pid);
        if (pp && !pp.zeroedComp) {
          pp.zeroedComp = comp;
          alerts.push({
            key: `fonte_zerou|${pid}|${comp}`,
            type: 'fonte_zerou',
            text: 'A caixinha que paga este item zerou; o restante volta para o salário.',
            comp,
            seriesKey: null,
          });
        }
        it.cents -= b; // restante sai do salário
        it.sourcePocketId = null;
        if (b > 0) items.push({ ...it, key: it.key + '|cx', cents: b, sourcePocketId: pid });
      }
    }

    // Semanas (RF36) e avulsos (RF26 só sem teto)
    const cap = d.weekly.capCents;
    const semanasCents = cap > 0 ? Math.round((w.days * cap) / 7) : 0;
    if (semanasCents > 0)
      push({
        key: `sem|${comp}`,
        label: 'Semanas',
        origin: 'semanas',
        status: 'previsto',
        direction: 'saida',
        cents: semanasCents,
        date: w.start,
        sourcePocketId: null,
      });
    else if (av.avg > 0 && !items.some((i) => i.key.startsWith('avista|')))
      push({
        key: `avu|${comp}`,
        label: 'Gastos avulsos (média 3 meses)',
        origin: 'avulso',
        status: 'previsto',
        direction: 'saida',
        cents: av.avg,
        date: w.start,
        sourcePocketId: null,
      });

    // totais: só o que passa pelo salário (fonte = caixinha não conta)
    let entradas = 0,
      comprometido = 0,
      previsto = 0;
    for (const it of items) {
      if (it.direction === 'entrada') entradas += it.cents;
      else if (!it.sourcePocketId)
        if (it.status === 'comprometido') comprometido += it.cents;
        else previsto += it.cents;
    }
    const saldo = entradas - comprometido - previsto;
    if (semanasCents > 0 && saldo + semanasCents < semanasCents)
      alerts.push({
        key: `semanas_sem_cobertura||${comp}`,
        type: 'semanas_sem_cobertura',
        text: 'A sobra da janela não cobre a transferência para Semanas.',
        comp,
        seriesKey: null,
        diffCents: -saldo,
      });

    // furo (RF43, §8B: Semanas → Reserva → Emergência só com confirmação)
    let furo: Furo | null = null;
    if (saldo < 0) {
      let left = -saldo;
      const plan: Furo['plan'] = [];
      for (const src of d.settings.furoOrder) {
        if (left <= 0) break;
        let avail = 0;
        let pocketId: string | null = null;
        if (src === 'semanas') {
          avail = semanasCents;
          pocketId = weeksPocketId;
        } else if (src === 'reserva' && reserve) {
          avail = bal.get(reserve.id) ?? 0;
          pocketId = reserve.id;
        } else if (src === 'emergencia' && emergency) {
          avail = (bal.get(emergency.id) ?? 0) - emergency.floorCents;
          pocketId = emergency.id;
        }
        const use = Math.max(0, Math.min(avail, left));
        if (use > 0) {
          plan.push({ source: src, pocketId, cents: use, needsConfirm: src === 'emergencia' });
          left -= use;
          if (src === 'reserva' && pocketId) bal.set(pocketId, (bal.get(pocketId) ?? 0) - use);
        }
      }
      furo = { cents: -saldo, plan, uncovered: left };
    }
    const sobraParaReserva = Math.max(0, saldo);
    if (reserve) bal.set(reserve.id, (bal.get(reserve.id) ?? 0) + sobraParaReserva);
    for (const p of d.pockets)
      if (!p.archived && !p.isReserve && !p.isWeeks && p.monthlyCents > 0)
        bal.set(p.id, (bal.get(p.id) ?? 0) + p.monthlyCents);

    for (const p of d.pockets) {
      const pp = pocketProj.get(p.id)!;
      const b = bal.get(p.id) ?? 0;
      pp.byComp.push({ comp, balance: b });
      if (p.goalCents && !pp.goalReachedComp && b >= p.goalCents) pp.goalReachedComp = comp;
    }

    const liberaNaSeguinte = items
      .filter((i) => i.endsHere && i.direction === 'saida' && !i.sourcePocketId)
      .reduce((a, i) => a + i.cents, 0);
    windows.push({
      window: w,
      items,
      entradas,
      comprometido,
      previsto,
      saldo,
      semanasCents,
      sobraParaReserva,
      furo,
      liberaNaSeguinte,
    });

    const extra = cap > 0 ? 0 : Math.max(0, av.max - av.avg);
    capacity.push({
      comp,
      base: saldo,
      conservador: saldo - extra,
      formula: `entradas ${entradas} − comprometido ${comprometido} − previsto ${previsto}${extra ? ` (conservador: − ${extra} de avulso máximo)` : ''}`,
    });
  }

  // metas de caixinhas (RF30)
  for (const p of d.pockets) {
    const pp = pocketProj.get(p.id)!;
    if (p.goalCents && p.goalComp && (!pp.goalReachedComp || pp.goalReachedComp > p.goalComp))
      alerts.push({
        key: `caixinha_meta|${p.id}|${p.goalComp}`,
        type: 'caixinha_meta',
        text: `A meta de ${p.name} não é atingida no prazo.`,
        comp: p.goalComp,
        seriesKey: null,
      });
  }

  const s = d.settings;
  const reserveTargetCents =
    s.reserveMode === 'pct_salario' && s.reservePct && income
      ? Math.round((income.netCents * s.reservePct) / 100)
      : s.reserveMode
        ? s.reserveValueCents
        : null;

  const ignored = new Set(
    d.decisions.filter((x) => x.decision === 'ignorado').map((x) => x.alertKey),
  );
  return {
    windows,
    pockets: [...pocketProj.values()],
    alerts: alerts.filter((a) => !ignored.has(a.key)),
    capacity,
    reserveTargetCents,
  };
}

// ---------------------------------------------------------------- validações (RF16–RF20, RF30, RF45)
function validate(d: HorizonData, parcels: ProjParcel[]): HorizonAlert[] {
  const out: HorizonAlert[] = [];
  const add = (
    type: HorizonAlert['type'],
    seriesKey: string | null,
    comp: Comp | null,
    text: string,
    diffCents?: Cents,
  ) => {
    const key = `${type}|${seriesKey ?? ''}|${comp ?? ''}`;
    if (!out.some((a) => a.key === key))
      out.push({ key, type, text, comp, seriesKey, ...(diffCents != null ? { diffCents } : {}) });
  };
  const decided = (k: string) => {
    const dec = decisionOf(d.decisions, k);
    return dec && dec.decision !== 'ignorado' ? dec : null;
  };
  const byCard = new Map<string, InvoiceSnapshot[]>();
  for (const s of d.snapshots) byCard.set(s.acct, [...(byCard.get(s.acct) ?? []), s]);

  for (const list of byCard.values()) {
    list.sort((a, b) => (a.comp < b.comp ? -1 : 1));
    const comps = new Set(list.map((s) => s.comp));
    for (let i = 0; i < list.length; i++) {
      const s = list[i]!;
      // RF19
      if (comps.has(addMonths(s.comp, 2)) && !comps.has(addMonths(s.comp, 1)))
        add(
          'mes_sem_fatura',
          null,
          addMonths(s.comp, 1),
          'Falta a fatura deste mês entre duas importadas.',
        );
      const next = list.find((x) => x.comp === addMonths(s.comp, 1));
      for (const l of s.lines) {
        if (!l.seriesKey || !l.instCur || !l.instTot) continue;
        // RF16 (respeita antecipação: parcelas cortadas não são cobradas)
        const dec = decided(l.seriesKey);
        const cut =
          dec?.decision === 'pago_antecipado'
            ? l.instTot - (dec.anticipatedLast ?? l.instTot)
            : dec
              ? 0
              : l.instTot;
        if (
          next &&
          l.instCur < cut &&
          !next.lines.some((x) => x.seriesKey === l.seriesKey && x.instCur === l.instCur! + 1)
        )
          add(
            'parcela_sumiu',
            l.seriesKey,
            next.comp,
            `A parcela ${l.instCur + 1}/${l.instTot} não veio na fatura.`,
          );
      }
    }
  }
  // RF17 / RF20 entre todas as faturas
  const seen = new Map<string, { cents: Cents; insts: Map<number, number> }>();
  for (const s of [...d.snapshots].sort((a, b) => (a.comp < b.comp ? -1 : 1)))
    for (const l of s.lines) {
      if (!l.seriesKey || !l.instCur) continue;
      const e = seen.get(l.seriesKey) ?? { cents: l.cents, insts: new Map() };
      if (Math.abs(l.cents - e.cents) > TOL)
        add(
          'valor_divergente',
          l.seriesKey,
          s.comp,
          'Parcela com valor diferente das anteriores.',
          l.cents - e.cents,
        );
      e.insts.set(l.instCur, (e.insts.get(l.instCur) ?? 0) + 1);
      if (e.insts.get(l.instCur)! > 1)
        add('duplicada', l.seriesKey, s.comp, `Parcela ${l.instCur} aparece duas vezes.`);
      seen.set(l.seriesKey, e);
    }
  // RF18: real x projetado da fatura mais recente vs a anterior
  for (const list of byCard.values()) {
    const last = list[list.length - 1];
    const prev = list.find((x) => last && x.comp === addMonths(last.comp, -1));
    if (!last || !prev) continue;
    const expected = prev.lines
      .filter(
        (l) =>
          l.seriesKey && l.instCur && l.instTot && l.instCur < l.instTot && !decided(l.seriesKey),
      )
      .reduce((a, l) => a + l.cents, 0);
    const real = last.lines
      .filter((l) => l.seriesKey && l.instCur && l.instCur > 1)
      .reduce((a, l) => a + l.cents, 0);
    if (Math.abs(real - expected) > TOL)
      add(
        'real_x_projetado',
        null,
        last.comp,
        'O total de parcelas da fatura difere do projetado.',
        real - expected,
      );
  }
  // RF45: fixa/assinatura com valor mudado
  const latest = latestByCard(d.snapshots);
  for (const f of d.fixed) {
    const n = normalize(f.name);
    for (const s of latest)
      for (const l of s.lines)
        if (l.norm === n && Math.abs(l.cents - (f.fullCents ?? f.amountCents)) > TOL)
          add(
            'fixa_mudou',
            f.id,
            s.comp,
            'O valor da fixa mudou. Atualizar?',
            l.cents - (f.fullCents ?? f.amountCents),
          );
  }
  // RF30: saldo informado x calculado
  for (const p of d.pockets) {
    let bal = 0;
    for (const m of sortMoves(d.moves.filter((x) => x.pocketId === p.id))) {
      if (m.kind === 'ajuste' && bal !== 0 && Math.abs(m.cents - bal) > TOL)
        add(
          'caixinha_divergente',
          p.id,
          compOf(m.onDate),
          `Saldo informado de ${p.name} difere do calculado.`,
          m.cents - bal,
        );
      bal = applyMove(bal, m);
    }
  }
  void parcels;
  return out;
}

// ---------------------------------------------------------------- antecipação (RF42, CA19)
export function simulateAnticipation(
  d: HorizonData,
  seriesKey: string,
  count: number,
  paidCents: Cents,
  pocketId: string | null,
): AnticipationSim {
  const parcels = projectParcels({
    ...d,
    decisions: d.decisions.filter((x) => x.alertKey !== `serie|${seriesKey}`),
  })
    .filter((p) => p.seriesKey === seriesKey)
    .sort((a, b) => a.inst - b.inst);
  const removedP = parcels.slice(Math.max(0, parcels.length - count));
  const fullCents = removedP.reduce((a, p) => a + p.cents, 0);
  const y = (d.pockets.find((p) => p.id === pocketId)?.yieldPctMonth ?? 0) / 100;
  const start = windowOf(d.today, d.incomes[0]?.advanceDay ?? 15);
  const yieldLostCents = Math.round(
    removedP.reduce(
      (a, p) =>
        a +
        (fullCents ? (paidCents * p.cents) / fullCents : 0) *
          ((1 + y) ** Math.max(0, monthsDiff(start, p.invoiceComp)) - 1),
      0,
    ),
  );
  const discountCents = fullCents - paidCents;
  const line = removedP[0]?.line;
  return {
    seriesKey,
    removed: removedP.map((p) => ({ inst: p.inst, comp: p.invoiceComp, cents: p.cents })),
    fullCents,
    paidCents,
    discountCents,
    yieldLostCents,
    worth: discountCents > yieldLostCents,
    blocked: line && d.myShare(line) < 1 ? 'dividida' : null,
    alertFullPrice: paidCents >= fullCents,
  };
}

// ---------------------------------------------------------------- CSV (RF22, CA27: só o rótulo, nunca o memo com apelido)
export function exportCsv(r: HorizonResult): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const money = (c: Cents) => (c / 100).toFixed(2).replace('.', ',');
  const rows = ['janela;data;item;origem;status;direcao;valor'];
  for (const w of r.windows) {
    for (const i of w.items)
      if (!i.hidden)
        rows.push(
          [w.window.comp, i.date, q(i.label), i.origin, i.status, i.direction, money(i.cents)].join(
            ';',
          ),
        );
    rows.push([w.window.comp, '', q('SALDO'), '', '', '', money(w.saldo)].join(';'));
  }
  return rows.join('\n');
}

export const engine: HorizonEngine = {
  payWindow,
  project,
  simulateAnticipation,
  planTransfer,
  pocketBalance,
  thirteenth,
  exportCsv,
  weeks,
  firstInvoiceComp,
  invoiceCompFromClosing,
};

// ---------------------------------------------------------------- OFX -> snapshot (RF02, RF04, RF05)
/** Chave da série (igual em todos os meses): cartão + texto sem "n/t" + total de parcelas. */
export function seriesKeyOf(acct: string, memo: string, tot: number): string {
  return `s|${acct}|${normalize(memo.replace(/\b(?:PARC(?:ELA)?\s*)?\d{1,2}\s*(?:\/|DE)\s*\d{1,2}\b/gi, ' '))}|${tot}`;
}

/** Converte o OFX já lido pelo parser atual em snapshot. Não guarda o arquivo bruto. */
export function snapshotFromOfx(
  parsed: { lines: { fitid: string; memo: string; cents: number; date: string }[]; acct: string },
  comp: Comp,
  dueDate: ISODate | null,
): Omit<InvoiceSnapshot, 'id' | 'importedAt'> {
  // mesmo critério do parser: o sinal da maioria das linhas é o das compras
  const neg = parsed.lines.filter((l) => l.cents < 0).length;
  const sign = neg >= parsed.lines.length - neg ? -1 : 1;
  const lines: InvoiceLine[] = parsed.lines.map((l, pos) => {
    const p = parseParcela(l.memo);
    const cents = sign * l.cents; // aqui positivo = gasto
    const kind: InvoiceLine['kind'] = ENCARGO.test(l.memo)
      ? 'encargo'
      : cents > 0
        ? 'compra'
        : /PAGAMENTO|PGTO/i.test(l.memo)
          ? 'pagamento'
          : 'estorno';
    return {
      pos,
      fitid: l.fitid.slice(0, 120),
      postedOn: /^\d{4}-\d{2}-\d{2}$/.test(l.date) ? l.date : null,
      memo: l.memo.slice(0, 300),
      norm: normalize(l.memo).slice(0, 300),
      cents,
      kind,
      instCur: p?.cur ?? null,
      instTot: p?.tot ?? null,
      seriesKey: p ? seriesKeyOf(parsed.acct, l.memo, p.tot) : null,
    };
  });
  const totalCents = lines.reduce((a, l) => a + l.cents, 0);
  const contentHash = cyrb53(
    lines.map((l) => `${l.fitid}|${l.postedOn}|${l.norm}|${l.cents}`).join('\n'),
  );
  return { acct: parsed.acct, comp, dueDate, totalCents, contentHash, lines };
}
