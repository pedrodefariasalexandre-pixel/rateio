/** Adaptador: contrato src/horizonte (motor + repo) → HorizonteFonte das telas. */
import { parseOFX } from '../../../lib/ofx';
import { engine, snapshotFromOfx } from '../../../horizonte/engine';
import type {
  HorizonData,
  HorizonRepo,
  HorizonResult,
  InvoiceSnapshot,
  WindowItem,
} from '../../../horizonte/types';
import type {
  Caixinha,
  HorizonteDados,
  HorizonteFonte,
  Item,
  Janela,
  ResultadoImport,
} from './modelo';

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];
const uid = () => globalThis.crypto.randomUUID();
const hoje = () => new Date().toISOString().slice(0, 10);
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const sigla = (s: string) =>
  s
    .replace(/[^\p{L}\p{N}]/gu, '')
    .slice(0, 2)
    .toUpperCase() || '•';

function item(w: WindowItem, pockets: Map<string, string>): Item {
  const tipo: Item['tipo'] =
    w.direction === 'entrada'
      ? 'entrada'
      : w.origin === 'parcela'
        ? 'parcela'
        : w.origin === 'assinatura'
          ? 'mensal'
          : w.origin === 'fixa'
            ? 'fixa'
            : w.origin === 'terceiro'
              ? 'terceiro'
              : 'avulso';
  const cx = w.sourcePocketId ? pockets.get(w.sourcePocketId) : undefined;
  return {
    id: w.key,
    nome: w.label,
    sigla: sigla(w.label),
    tipo,
    cents: w.cents,
    detalhe: `${w.status} · ${dm(w.date)}${w.endsHere ? ' · última' : ''}`,
    parcela: w.inst ? `${w.inst.cur}/${w.inst.tot}` : undefined,
    fonte: w.direction === 'entrada' ? undefined : cx ? 'caixinha' : 'salario',
    caixinha: cx,
    oculto: w.hidden,
    antecipavel: w.origin === 'parcela' && w.key.startsWith('s|'),
  };
}

export function paraTela(d: HorizonData, r: HorizonResult): HorizonteDados {
  const nomes = new Map(d.pockets.map((p) => [p.id, p.name]));
  const janelas: Janela[] = r.windows.map((w) => {
    const m = Number(w.window.comp.slice(5, 7)) - 1;
    const nome = MESES[m] ?? w.window.comp;
    const its = w.items.map((x) => item(x, nomes));
    return {
      id: w.window.comp,
      nome,
      abrev: nome.slice(0, 3).toLowerCase(),
      inicio: w.window.start,
      fim: w.window.end,
      adiantamento: dm(w.window.advanceDate),
      salario: dm(w.window.salaryDate),
      entradas: its.filter((x) => x.tipo === 'entrada'),
      fixas: its.filter((x) => x.tipo === 'fixa' && !x.caixinha),
      cartao: its.filter(
        (x) => x.tipo !== 'entrada' && x.tipo !== 'terceiro' && !(x.tipo === 'fixa' && !x.caixinha),
      ),
      terceiros: its.filter((x) => x.tipo === 'terceiro'),
      totalEntradas: w.entradas,
      totalSaidas: w.comprometido + w.previsto,
      comprometido: w.comprometido,
      previsto: w.previsto,
      sobra: w.saldo,
    };
  });
  const caixinhas: Caixinha[] = d.pockets
    .filter((p) => !p.archived)
    .map((p) => {
      const pj = r.pockets.find((x) => x.pocketId === p.id);
      return {
        id: p.id,
        nome: p.name,
        icone: p.isReserve ? '◎' : p.rule === 'piso' ? '🛟' : '◇',
        regra: p.rule,
        saldo: pj?.balanceNow ?? engine.pocketBalance(p.id, d.moves, d.today),
        meta: p.goalCents ?? undefined,
        aporte: p.monthlyCents || undefined,
        alerta: pj?.zeroedComp ? `Zera em ${pj.zeroedComp}.` : undefined,
      };
    });
  const w0 = r.windows[0];
  const income = d.incomes.find((i) => i.group === 'eu') ?? d.incomes[0];
  const semanas = w0
    ? engine.weeks(w0.window, d.weekly.capCents, []).map((s, i) => ({
        rotulo: `S${i + 1}`,
        periodo: `${dm(s.start)} – ${dm(s.end)}`,
        gasto: s.spent,
        disponivel: Math.max(0, s.allowance - s.spent),
        estouro: s.carry,
        pct: s.allowance ? Math.min(100, Math.round((s.spent / s.allowance) * 100)) : 0,
      }))
    : [];
  const terminam = r.windows
    .flatMap((w) => w.items.filter((x) => x.endsHere && x.inst).map((x) => ({ w, x })))
    .slice(0, 5)
    .map(({ w, x }) => ({
      id: x.key,
      nome: x.label,
      sigla: sigla(x.label),
      atual: x.inst!.cur,
      total: x.inst!.tot,
      termina: (MESES[Number(w.window.comp.slice(5, 7)) - 1] ?? '').slice(0, 3).toLowerCase(),
      libera: x.cents,
    }));
  const furoW = r.windows.find((w) => w.furo);
  const plan = (s: string) => furoW?.furo?.plan.find((p) => p.source === s);
  const reserva = d.pockets.find((p) => p.isReserve);
  const t13 = income ? engine.thirteenth(income) : null;
  const cap = r.capacity[0];
  const sobras = r.windows.map((w) => w.saldo);
  return {
    meses: d.settings.months,
    janelas,
    caixinhas,
    semanas,
    tetoSemanal: d.weekly.capCents,
    terminam,
    podeGuardar: cap ? cap.conservador : 0,
    sobraMedia: sobras.length ? Math.round(sobras.reduce((a, b) => a + b, 0) / sobras.length) : 0,
    guardado: caixinhas.reduce((a, c) => a + c.saldo, 0),
    metaReserva: {
      modo:
        d.settings.reserveMode === 'pct_salario' ? 'salario' : (d.settings.reserveMode ?? 'meta'),
      alvo: r.reserveTargetCents ?? 0,
      saldo: caixinhas.find((c) => c.regra === 'piso')?.saldo ?? 0,
    },
    decimo: {
      considerar: income?.thirteenth.considered ?? false,
      bruto: income?.grossCents ?? 0,
      avos: income?.thirteenth.avos ?? 0,
      adiantamento: t13?.first ?? 0,
      liquido: t13?.second ?? 0,
      primeira: income?.thirteenth.firstDate ? dm(income.thirteenth.firstDate) : '—',
      segunda: income?.thirteenth.secondDate ? dm(income.thirteenth.secondDate) : '—',
    },
    furo: furoW?.furo
      ? {
          janela: MESES[Number(furoW.window.comp.slice(5, 7)) - 1] ?? furoW.window.comp,
          valor: furoW.furo.cents,
          semanas: plan('semanas')?.cents ?? 0,
          reserva: plan('reserva')?.cents ?? 0,
          reservaSaldo: reserva ? engine.pocketBalance(reserva.id, d.moves, d.today) : 0,
        }
      : undefined,
    salvoEm: dm(hoje()),
  };
}

/** `getShare`: fração do Pedro por linha (RF14), recalculada a cada carga. Sem ela, item inteiro. */
export function fonteDoContrato(
  repo: HorizonRepo,
  getShare: () => HorizonData['myShare'] = () => () => 1,
): HorizonteFonte {
  let d: HorizonData | null = null;
  let pendentes: Omit<InvoiceSnapshot, 'id' | 'importedAt'>[] = [];
  const dados = async () => (d ??= { ...(await repo.load()), myShare: getShare(), today: hoje() });
  const recarregar = async () => {
    d = null;
    return dados();
  };
  return {
    async carregar(meses) {
      const x = await recarregar();
      const data = { ...x, settings: { ...x.settings, months: meses } };
      return paraTela(data, engine.project(data));
    },
    async conferirOfx(arquivos) {
      const x = await dados();
      pendentes = [];
      return arquivos.map<ResultadoImport>(({ nome, texto }) => {
        let p;
        try {
          p = parseOFX(texto);
        } catch {
          p = null;
        }
        if (!p || !/<OFX>/i.test(texto) || !p.lines.length)
          return {
            arquivo: nome,
            status: 'erro',
            lancamentos: 0,
            motivo: `"${nome}" não é um OFX.`,
          };
        const card = x.cards.find((c) => c.acct === p.acct);
        const ultimaData = p.lines.map((l) => l.date).filter(Boolean).sort().pop();
        const fechamento = p.dtEnd || ultimaData || hoje();
        const comp = engine.invoiceCompFromClosing(fechamento, card);
        const s = snapshotFromOfx(p, comp, null);
        const dup = x.snapshots.some((o) => o.contentHash === s.contentHash);
        if (!dup) pendentes.push(s);
        return { arquivo: nome, status: dup ? 'duplicada' : 'ok', lancamentos: s.lines.length };
      });
    },
    async salvarOfx() {
      let n = 0;
      for (const s of pendentes) {
        const r = await repo.saveSnapshot(s);
        if (r.status === 'created') n += s.lines.length;
      }
      pendentes = [];
      d = null;
      return n;
    },
    async transferir(t) {
      const x = await dados();
      const de = x.pockets.find((p) => p.id === t.de);
      if (!de || t.cents <= 0 || t.cents > engine.pocketBalance(de.id, x.moves, x.today))
        throw new Error('Saldo insuficiente na caixinha de origem.');
      const { moves, newPocket } = engine.planTransfer(
        t.de,
        t.para ? { id: t.para } : { newName: t.nova || 'Nova caixinha', rule: 'livre' },
        t.cents,
        x.today,
        t.motivo,
      );
      if (newPocket) await repo.upsertPocket(newPocket);
      await repo.addMoves(moves);
      d = null;
    },
    async simular(itemId, ultimas, pagoCents) {
      const x = await dados();
      const s = engine.simulateAnticipation(
        x,
        itemId,
        ultimas,
        pagoCents ?? 0,
        x.pockets.find((p) => p.isReserve)?.id ?? null,
      );
      const pago = pagoCents ?? s.fullCents;
      return {
        item: itemId,
        ultimas,
        valor: s.fullCents,
        comDesconto: pago,
        rendimento: s.yieldLostCents,
        vale: s.fullCents - pago > s.yieldLostCents,
        bloqueado: s.blocked === 'dividida',
      };
    },
    async set13(considerar) {
      const x = await dados();
      const i = x.incomes.find((v) => v.group === 'eu') ?? x.incomes[0];
      if (!i) throw new Error('Cadastre o salário primeiro.');
      await repo.upsertIncome({ ...i, thirteenth: { ...i.thirteenth, considered: considerar } });
      d = null;
    },
    async cobrirFuro() {
      const x = await dados();
      const r = engine.project(x);
      const w = r.windows.find((v) => v.furo);
      if (!w?.furo) return;
      const moves = w.furo.plan
        .filter((p) => p.pocketId && p.cents > 0 && !p.needsConfirm)
        .map((p) => ({
          id: uid(),
          pocketId: p.pocketId!,
          kind: 'retirada' as const,
          cents: p.cents,
          onDate: x.today,
          reason: `Cobrir furo ${w.window.comp}`,
          transferId: null,
          imprevisto: true,
          itemId: null,
        }));
      if (!moves.length)
        throw new Error('Crie as caixinhas Semanas e Reserva (com saldo) para cobrir o furo.');
      await repo.addMoves(moves);
      d = null;
    },
    async config() {
      const x = await dados();
      const i = x.incomes.find((v) => v.group === 'eu') ?? x.incomes[0];
      return {
        salario: i
          ? {
              bruto: i.grossCents,
              liquido: i.netCents,
              adiantamento: i.advanceCents,
              diaAdiantamento: i.advanceDay,
              diaUtil: i.salaryBusinessDay,
              avos: i.thirteenth.avos,
            }
          : null,
        fixas: x.fixed
          .filter((f) => !f.thirdParty)
          .map((f) => ({
            id: f.id,
            nome: f.alias ?? f.name,
            cents: f.amountCents,
            entrada: f.direction === 'entrada',
            dia: f.recurrence.kind === 'semanal' ? 1 : f.recurrence.day,
          })),
        tetoSemanal: x.weekly.capCents,
      };
    },
    async salvarSalario(s) {
      const x = await dados();
      const i = x.incomes.find((v) => v.group === 'eu') ?? x.incomes[0];
      if (s.liquido <= 0) throw new Error('Informe o salário líquido.');
      if (s.adiantamento > s.liquido) throw new Error('O adiantamento não pode passar do líquido.');
      await repo.upsertIncome({
        id: i?.id ?? uid(),
        name: i?.name ?? 'Salário',
        group: 'eu',
        grossCents: Math.max(s.bruto, s.liquido),
        deductions: i?.deductions ?? { inss: 0, irrf: 0, consignado: 0, outros: 0 },
        netCents: s.liquido,
        advanceDay: s.diaAdiantamento,
        advanceCents: s.adiantamento,
        salaryBusinessDay: s.diaUtil,
        thirteenth: {
          considered: i?.thirteenth.considered ?? false,
          avos: s.avos,
          firstDate: i?.thirteenth.firstDate ?? null,
          secondDate: i?.thirteenth.secondDate ?? null,
          firstNetCents: i?.thirteenth.firstNetCents ?? null,
          secondNetCents: i?.thirteenth.secondNetCents ?? null,
          secondDeductionsCents: i?.thirteenth.secondDeductionsCents ?? 0,
        },
      });
      d = null;
    },
    async salvarFixa(f) {
      if (!f.nome.trim()) throw new Error('Dê um nome à conta.');
      if (f.cents <= 0) throw new Error('Informe um valor maior que zero.');
      const x = await dados();
      const old = f.id ? x.fixed.find((v) => v.id === f.id) : undefined;
      await repo.upsertFixed({
        id: old?.id ?? uid(),
        name: f.nome.trim(),
        alias: null,
        hidden: old?.hidden ?? false,
        direction: f.entrada ? 'entrada' : 'saida',
        amountCents: f.cents,
        recurrence: { kind: 'mensal', day: Math.min(31, Math.max(1, f.dia)) },
        endComp: old?.endComp ?? null,
        isSubscription: old?.isSubscription ?? false,
        sourcePocketId: old?.sourcePocketId ?? null,
        thirdParty: null,
      });
      d = null;
    },
    async apagarFixa(id) {
      await repo.deleteFixed(id);
      d = null;
    },
    async criarCaixinha(c) {
      if (!c.nome.trim()) throw new Error('Dê um nome à caixinha.');
      const x = await dados();
      const id = uid();
      const reserva = c.reserva && !x.pockets.some((p) => p.isReserve && !p.archived);
      await repo.upsertPocket({
        id,
        name: c.nome.trim(),
        rule: c.regra,
        floorCents: c.regra === 'piso' ? (c.meta ?? 0) : 0,
        goalCents: c.meta && c.meta > 0 ? c.meta : null,
        goalComp: null,
        monthlyCents: c.aporte ?? 0,
        yieldPctMonth: 0,
        isReserve: reserva,
        isWeeks: false,
        archived: false,
      });
      if (c.saldo > 0)
        await repo.addMoves([
          {
            id: uid(),
            pocketId: id,
            kind: 'ajuste',
            cents: c.saldo,
            onDate: x.today,
            reason: 'Saldo inicial',
            transferId: null,
            imprevisto: false,
            itemId: null,
          },
        ]);
      d = null;
    },
    async movimentar(caixinha, tipo, cents, motivo) {
      const x = await dados();
      if (cents <= 0) throw new Error('Informe um valor maior que zero.');
      if (tipo === 'retirada' && cents > engine.pocketBalance(caixinha, x.moves, x.today))
        throw new Error('Saldo insuficiente na caixinha.');
      await repo.addMoves([
        {
          id: uid(),
          pocketId: caixinha,
          kind: tipo,
          cents,
          onDate: x.today,
          reason: motivo.slice(0, 120),
          transferId: null,
          imprevisto: false,
          itemId: null,
        },
      ]);
      d = null;
    },
    async salvarTeto(cents) {
      if (cents < 0) throw new Error('Valor inválido.');
      const x = await dados();
      await repo.saveSettings({}, { capCents: cents, weeksPocketId: x.weekly.weeksPocketId });
      d = null;
    },
  };
}
