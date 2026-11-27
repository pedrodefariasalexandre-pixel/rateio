/** Dados fictícios atrás de HorizonteFonte, até o contrato src/horizonte/types.ts chegar. */
import type {
  Caixinha,
  HorizonteDados,
  FixaForm,
  HorizonteFonte,
  SalarioForm,
  Item,
  Janela,
  ResultadoImport,
} from './modelo';

const it = (o: Partial<Item> & Pick<Item, 'id' | 'nome' | 'cents'>): Item => ({
  sigla: o.nome.slice(0, 2).toUpperCase(),
  tipo: 'avulso',
  detalhe: '',
  ...o,
});

const NOMES = ['Dezembro', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio'];
const SOBRAS = [
  -31000, 19000, 82000, 123000, 215000, 174000, 160000, 150000, 170000, 180000, 190000, 200000,
];
const CARTAO = [518000, 468000, 405000, 364000, 290000, 251000];

function janela(i: number): Janela {
  const nome = NOMES[i % 6] ?? 'Mês';
  const entradas = [
    it({
      id: `sal${i}`,
      nome: 'Salário',
      sigla: '$',
      tipo: 'entrada',
      cents: 620000,
      detalhe: 'Pedro · 5º dia útil',
    }),
    it({
      id: `rb${i}`,
      nome: 'Reembolso Ana',
      sigla: '↩',
      tipo: 'entrada',
      cents: 90000,
      detalhe: 'Rateio do mês anterior',
    }),
  ];
  const fixas = [
    it({
      id: `al${i}`,
      nome: 'Aluguel',
      sigla: 'AL',
      tipo: 'fixa',
      cents: 185000,
      detalhe: 'Dia 10',
      fonte: 'salario',
    }),
    it({
      id: `lz${i}`,
      nome: 'Luz + internet',
      sigla: 'LZ',
      tipo: 'fixa',
      cents: 38000,
      detalhe: 'Valor médio',
      fonte: 'salario',
    }),
  ];
  const cartao = [
    it({
      id: 'nb',
      nome: 'Notebook Dell',
      sigla: 'NB',
      tipo: 'parcela',
      parcela: '10/10',
      cents: 41200,
      detalhe: 'Pedro · última parcela',
      fonte: 'adiantamento',
      antecipavel: true,
    }),
    it({
      id: 'gl',
      nome: 'Geladeira Brastemp',
      sigla: 'GL',
      tipo: 'parcela',
      parcela: '8/10',
      cents: 38990,
      detalhe: 'Pedro · 3 restantes',
      fonte: 'adiantamento',
      antecipavel: true,
    }),
    it({
      id: 'nf',
      nome: 'Netflix',
      sigla: 'NF',
      tipo: 'mensal',
      cents: 5990,
      detalhe: 'Sua parte · 3 pessoas',
      fonte: 'salario',
    }),
    it({
      id: 'ip',
      nome: 'IPVA 2027',
      sigla: 'IP',
      tipo: 'fixa',
      cents: 240000,
      detalhe: 'Pago pela caixinha',
      fonte: 'caixinha',
      caixinha: 'IPVA',
    }),
    it({
      id: 'pr',
      nome: 'Presente de Natal',
      sigla: '●',
      tipo: 'avulso',
      cents: 18000,
      detalhe: 'toque para mostrar',
      oculto: true,
      apelido: 'presente',
    }),
  ];
  const terceiros = [
    it({
      id: 'tv',
      nome: 'Mãe · TV Samsung',
      sigla: 'MÃ',
      tipo: 'terceiro',
      parcela: '4/12',
      cents: 21000,
      detalhe: 'no seu cartão · grupo Mãe · líquido R$ 0,00',
    }),
  ];
  const totalEntradas = 710000;
  const comprometido = 185000 + (CARTAO[i] ?? 250000) - 50000;
  const previsto = 38000 + 50000;
  return {
    id: `j${i}`,
    nome,
    abrev: nome.slice(0, 3).toLowerCase(),
    inicio: '2026-12-15',
    fim: '2027-01-07',
    adiantamento: '15/12',
    salario: '05/01',
    entradas,
    fixas,
    cartao,
    terceiros,
    totalEntradas,
    totalSaidas: totalEntradas - (SOBRAS[i] ?? 0),
    comprometido,
    previsto,
    sobra: SOBRAS[i] ?? 0,
  };
}

const CAIXINHAS: Caixinha[] = [
  {
    id: 'emg',
    nome: 'Reserva de emergência',
    icone: '🛟',
    regra: 'piso',
    saldo: 1840000,
    meta: 3000000,
    aporte: 60000,
  },
  { id: 'res', nome: 'Reserva', icone: '◎', regra: 'acumula', saldo: 315000 },
  {
    id: 'ipva',
    nome: 'IPVA',
    icone: '🚗',
    regra: 'fonte',
    saldo: 190000,
    meta: 240000,
    aporte: 25000,
    alerta: 'Zera nesta janela (faltam R$ 500,00).',
  },
  { id: 'lzr', nome: 'Lazer', icone: '✈︎', regra: 'livre', saldo: 42000 },
];

export function dadosFicticios(meses = 6): HorizonteDados {
  return {
    meses,
    janelas: Array.from({ length: meses }, (_, i) => janela(i)),
    caixinhas: CAIXINHAS.map((c) => ({ ...c })),
    tetoSemanal: 35000,
    semanas: [
      {
        rotulo: 'S1',
        periodo: 'seg 15 – dom 21',
        gasto: 41000,
        disponivel: 0,
        estouro: 6000,
        pct: 100,
      },
      {
        rotulo: 'S2',
        periodo: 'seg 22 – dom 28',
        gasto: 0,
        disponivel: 29000,
        estouro: 0,
        pct: 40,
      },
      { rotulo: 'S3', periodo: 'seg 29 – dom 04', gasto: 0, disponivel: 35000, estouro: 0, pct: 0 },
      { rotulo: 'S4', periodo: 'seg 05 – qua 07', gasto: 0, disponivel: 15000, estouro: 0, pct: 0 },
    ],
    terminam: [
      {
        id: 'nb',
        nome: 'Notebook Dell',
        sigla: 'NB',
        atual: 10,
        total: 10,
        termina: 'dez',
        libera: 41200,
      },
      {
        id: 'gl',
        nome: 'Geladeira Brastemp',
        sigla: 'GL',
        atual: 8,
        total: 10,
        termina: 'fev',
        libera: 38990,
      },
      {
        id: 'ps',
        nome: 'Passagem POA–SP',
        sigla: 'PS',
        atual: 3,
        total: 6,
        termina: 'mai',
        libera: 21000,
      },
    ],
    podeGuardar: 125000,
    sobraMedia: 157000,
    guardado: 2345000,
    metaReserva: { modo: 'meta', alvo: 3000000, saldo: 1840000 },
    decimo: {
      considerar: true,
      bruto: 680000,
      avos: 12,
      adiantamento: 340000,
      liquido: 291000,
      primeira: '30/11',
      segunda: '20/12',
    },
    furo: {
      janela: 'Dezembro',
      valor: 31000,
      semanas: 15000,
      reserva: 16000,
      reservaSaldo: 315000,
    },
    salvoEm: '25/11',
  };
}

export function fonteFicticia(): HorizonteFonte {
  let d = dadosFicticios();
  let sal: SalarioForm | null = null;
  let fixas: (FixaForm & { id: string })[] = [];
  return {
    async carregar(meses) {
      d = {
        ...dadosFicticios(meses),
        caixinhas: d.caixinhas,
        decimo: d.decimo,
        tetoSemanal: d.tetoSemanal,
      };
      return d;
    },
    async conferirOfx(arquivos) {
      return arquivos.map<ResultadoImport>(({ nome, texto }) => {
        if (!/<OFX>/i.test(texto))
          return {
            arquivo: nome,
            status: 'erro',
            lancamentos: 0,
            motivo: `"${nome}" não é um OFX.`,
          };
        const n = (texto.match(/<STMTTRN>/gi) ?? []).length;
        return {
          arquivo: nome,
          status: /10\.ofx$/.test(nome) ? 'duplicada' : 'ok',
          lancamentos: n,
        };
      });
    },
    async salvarOfx(r) {
      return r.filter((x) => x.status === 'ok').reduce((a, x) => a + x.lancamentos, 0);
    },
    async transferir(t) {
      const de = d.caixinhas.find((c) => c.id === t.de);
      if (!de || t.cents <= 0 || t.cents > de.saldo)
        throw new Error('Saldo insuficiente na caixinha de origem.');
      let para = d.caixinhas.find((c) => c.id === t.para);
      if (!para) {
        para = {
          id: `cx${Date.now()}`,
          nome: t.nova || 'Nova caixinha',
          icone: '◇',
          regra: 'livre',
          saldo: 0,
        };
        d.caixinhas.push(para);
      }
      de.saldo -= t.cents;
      para.saldo += t.cents;
    },
    async simular(itemId, ultimas, pagoCents) {
      const item = d.janelas[0]?.cartao.find((x) => x.id === itemId);
      const valor = (item?.cents ?? 0) * ultimas;
      const comDesconto = pagoCents ?? Math.round(valor * 0.925);
      const rendimento = Math.round(valor * 0.0206);
      return {
        item: item?.nome ?? '',
        ultimas,
        valor,
        comDesconto,
        rendimento,
        vale: valor - comDesconto > rendimento,
      };
    },
    async set13(considerar) {
      d.decimo = { ...d.decimo, considerar };
    },
    async antecipar() {},
    async cobrirFuro() {
      d.furo = undefined;
    },
    async config() {
      return { salario: sal, fixas, tetoSemanal: d.tetoSemanal };
    },
    async salvarSalario(s) {
      sal = s;
    },
    async salvarFixa(f) {
      const id = f.id ?? `fx${fixas.length + 1}`;
      fixas = [...fixas.filter((x) => x.id !== id), { ...f, id }];
    },
    async apagarFixa(id) {
      fixas = fixas.filter((x) => x.id !== id);
    },
    async criarCaixinha(c) {
      d.caixinhas.push({
        id: `cx${d.caixinhas.length + 1}`,
        nome: c.nome,
        icone: '◇',
        regra: c.regra,
        saldo: c.saldo,
        meta: c.meta,
        aporte: c.aporte,
      });
    },
    async movimentar(id, tipo, cents) {
      const c = d.caixinhas.find((x) => x.id === id);
      if (!c) throw new Error('Caixinha não encontrada.');
      if (tipo === 'retirada' && cents > c.saldo)
        throw new Error('Saldo insuficiente na caixinha.');
      c.saldo += tipo === 'aporte' ? cents : -cents;
    },
    async salvarTeto(cents) {
      d.tetoSemanal = cents;
    },
  };
}
