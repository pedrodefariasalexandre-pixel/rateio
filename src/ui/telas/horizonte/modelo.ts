/**
 * Modelo de tela do Horizonte. É a única porta entre as telas e os dados.
 * Enquanto src/horizonte/types.ts não chega, `fonteFicticia` (ficticio.ts) implementa esta interface;
 * depois, um adaptador converte o contrato oficial para estes tipos sem tocar nas telas.
 * Todos os valores em centavos.
 */
export type Fonte = 'salario' | 'adiantamento' | 'caixinha';
export type TipoItem = 'fixa' | 'parcela' | 'mensal' | 'avulso' | 'terceiro' | 'entrada';
export type RegraCaixinha = 'piso' | 'acumula' | 'fonte' | 'livre';

export interface Item {
  id: string;
  nome: string;
  sigla: string;
  tipo: TipoItem;
  /** Sua parte, em centavos (saída positiva; entrada positiva com tipo 'entrada'). */
  cents: number;
  detalhe: string;
  /** "8/10" para parcelas. */
  parcela?: string;
  fonte?: Fonte;
  /** Nome da caixinha quando fonte = 'caixinha'. */
  caixinha?: string;
  oculto?: boolean;
  apelido?: string;
  /** Pode antecipar (não é dividido). */
  antecipavel?: boolean;
}

export interface Janela {
  id: string;
  /** "Dezembro" */
  nome: string;
  abrev: string;
  inicio: string; // ISO yyyy-mm-dd
  fim: string;
  adiantamento: string;
  salario: string;
  entradas: Item[];
  fixas: Item[];
  cartao: Item[];
  terceiros: Item[];
  totalEntradas: number;
  totalSaidas: number;
  comprometido: number;
  previsto: number;
  sobra: number;
}

export interface Caixinha {
  id: string;
  nome: string;
  icone: string;
  regra: RegraCaixinha;
  saldo: number;
  meta?: number;
  aporte?: number;
  alerta?: string;
}

export interface Semana {
  rotulo: string;
  periodo: string;
  gasto: number;
  disponivel: number;
  estouro: number;
  pct: number;
}

export interface Parcelamento {
  id: string;
  nome: string;
  sigla: string;
  atual: number;
  total: number;
  termina: string;
  libera: number;
}

export interface DecimoTerceiro {
  considerar: boolean;
  bruto: number;
  avos: number;
  adiantamento: number;
  liquido: number;
  primeira: string;
  segunda: string;
}

export interface Furo {
  janela: string;
  valor: number;
  semanas: number;
  reserva: number;
  reservaSaldo: number;
}

export interface HorizonteDados {
  meses: number;
  janelas: Janela[];
  caixinhas: Caixinha[];
  semanas: Semana[];
  tetoSemanal: number;
  terminam: Parcelamento[];
  podeGuardar: number;
  sobraMedia: number;
  guardado: number;
  metaReserva: { modo: 'manual' | 'meta' | 'salario'; alvo: number; saldo: number };
  decimo: DecimoTerceiro;
  furo?: Furo;
  salvoEm?: string;
}

export interface Simulacao {
  item: string;
  ultimas: number;
  valor: number;
  comDesconto: number;
  rendimento: number;
  vale: boolean;
  /** Item dividido: não pode antecipar. */
  bloqueado?: boolean;
}

export interface ResultadoImport {
  arquivo: string;
  status: 'ok' | 'duplicada' | 'erro';
  lancamentos: number;
  motivo?: string;
}

export interface Transferencia {
  de: string;
  para: string;
  /** Nome da caixinha nova quando `para` = '' */
  nova?: string;
  cents: number;
  motivo: string;
}

export interface HorizonteFonte extends HorizonteCadastro {
  carregar(meses: number): Promise<HorizonteDados>;
  conferirOfx(arquivos: { nome: string; texto: string }[]): Promise<ResultadoImport[]>;
  salvarOfx(r: ResultadoImport[]): Promise<number>;
  transferir(t: Transferencia): Promise<void>;
  /** `pagoCents`: valor à vista oferecido pelo banco; sem ele, preço cheio. */
  simular(itemId: string, ultimas: number, pagoCents?: number): Promise<Simulacao>;
  set13(considerar: boolean): Promise<void>;
  /** `emergencia`: inclui a caixinha de emergência (só com confirmação do usuário). */
  cobrirFuro(emergencia?: boolean): Promise<void>;
  /** Confirma a antecipação: as `ultimas` parcelas deixam de ser projetadas. */
  antecipar(itemId: string, ultimas: number): Promise<void>;
}

/** Cadastro do Horizonte (RF23/24/28/33/36/48): o que o usuário informa à mão. */
export interface SalarioForm {
  bruto: number;
  liquido: number;
  adiantamento: number;
  diaAdiantamento: number;
  diaUtil: number;
  avos: number;
}
export interface FixaForm {
  id?: string;
  nome: string;
  cents: number;
  entrada: boolean;
  dia: number;
}
export interface CaixinhaForm {
  nome: string;
  regra: 'piso' | 'acumula' | 'fonte' | 'livre';
  saldo: number;
  meta?: number;
  aporte?: number;
  reserva: boolean;
}
export interface HorizonteConfig {
  salario: SalarioForm | null;
  fixas: (FixaForm & { id: string })[];
  tetoSemanal: number;
}

export interface HorizonteCadastro {
  config(): Promise<HorizonteConfig>;
  salvarSalario(s: SalarioForm): Promise<void>;
  salvarFixa(f: FixaForm): Promise<void>;
  apagarFixa(id: string): Promise<void>;
  criarCaixinha(c: CaixinhaForm): Promise<void>;
  movimentar(
    caixinha: string,
    tipo: 'aporte' | 'retirada',
    cents: number,
    motivo: string,
  ): Promise<void>;
  salvarTeto(cents: number): Promise<void>;
}
