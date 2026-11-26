/** Aba Horizonte: linha do tempo das janelas de pagamento, caixinhas, semanas, OFX, antecipação e 13º. */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import './horizonte.css';
import { fmtC, parseCents } from '../../../lib/money';
import type {
  Caixinha,
  HorizonteDados,
  HorizonteFonte,
  Item,
  Janela,
  ResultadoImport,
  Simulacao,
} from './modelo';

type Vista = 'geral' | 'janela' | 'caixinhas' | 'semanas' | 'decimo' | 'importar' | 'antecipar';
const ABAS: [Vista, string][] = [
  ['geral', 'Visão geral'],
  ['janela', 'Janela'],
  ['caixinhas', 'Caixinhas'],
  ['semanas', 'Semanas'],
  ['decimo', '13º'],
];
const FONTE = {
  salario: ['Salário', 's1'],
  adiantamento: ['Adiantamento', 's2'],
  caixinha: ['Caixinha', 's3'],
} as const;
const REGRA = {
  piso: ['piso', 'tn'],
  acumula: ['acumula', 'tp'],
  fonte: ['fonte', 'tr'],
  livre: ['livre', 'tf'],
} as const;
const TIPO: Record<Item['tipo'], [string, string] | null> = {
  fixa: ['fixa', 'tf'],
  mensal: ['mensal', 'tr'],
  parcela: null,
  avulso: null,
  terceiro: null,
  entrada: null,
};

const sinal = (c: number) => (c < 0 ? '−' : '+') + ' ' + fmtC(Math.abs(c));
const curto = (c: number) => (c < 0 ? '−' : '+') + Math.round(Math.abs(c) / 100);

function Estado(p: {
  ic: string;
  tom: string;
  titulo: string;
  children: ReactNode;
  erro?: boolean;
}) {
  return (
    <div className={'hz-g hz-state' + (p.erro ? ' err' : '')} role={p.erro ? 'alert' : 'status'}>
      <div className={'ic ' + p.tom} aria-hidden="true">
        {p.ic}
      </div>
      <h3>{p.titulo}</h3>
      {p.children}
    </div>
  );
}

export function Horizonte({ fonte }: { fonte: HorizonteFonte }) {
  const [meses, setMeses] = useState(6);
  const [d, setD] = useState<HorizonteDados | null>(null);
  const [erro, setErro] = useState('');
  const [vista, setVista] = useState<Vista>('geral');
  const [sel, setSel] = useState(0);
  const [antecipar, setAntecipar] = useState<Item | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);

  const carregar = useCallback(() => {
    fonte.carregar(meses).then(
      (x) => (setErro(''), setD(x)),
      (e: unknown) => setErro(e instanceof Error ? e.message : String(e)),
    );
  }, [fonte, meses]);
  useEffect(carregar, [carregar]);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    addEventListener('online', on);
    addEventListener('offline', off);
    return () => {
      removeEventListener('online', on);
      removeEventListener('offline', off);
    };
  }, []);

  const head = (
    <div className="hz-top">
      <div>
        <h1>Horizonte</h1>
        <p className="hz-sub">Quanto entra, quanto sai e quanto sobra nos próximos meses.</p>
      </div>
      <div className="hz-acts">
        <button className="hz-btn pri" onClick={() => setVista('importar')} disabled={!online}>
          ＋ Importar OFX
        </button>
      </div>
    </div>
  );

  if (erro)
    return (
      <section className="tela-horizonte">
        {head}
        <Estado ic="!" tom="danger" titulo="Não conseguimos carregar o Horizonte" erro>
          <p>{erro}</p>
          <button className="hz-btn" onClick={carregar}>
            Tentar de novo
          </button>
        </Estado>
      </section>
    );
  if (!d)
    return (
      <section className="tela-horizonte" aria-busy="true">
        {head}
        <p className="hz-sub" role="status">
          Carregando o Horizonte…
        </p>
      </section>
    );

  const janela = d.janelas[sel];
  const vazio = d.janelas.length === 0;
  const recarregar = () => fonte.carregar(meses).then(setD);

  return (
    <section className="tela-horizonte">
      {head}
      {!online && (
        <Estado ic="⟳" tom="warn" titulo="Sem conexão">
          <p>
            Mostrando o horizonte salvo{d.salvoEm ? ` em ${d.salvoEm}` : ''}. A importação volta
            quando a internet voltar.
          </p>
          <button className="hz-btn" onClick={() => setOnline(navigator.onLine)}>
            Tentar de novo
          </button>
        </Estado>
      )}
      {vista === 'importar' ? (
        <Importar
          fonte={fonte}
          onFim={() => (recarregar(), setVista('geral'))}
          onVoltar={() => setVista('geral')}
        />
      ) : vista === 'antecipar' && antecipar ? (
        <Antecipar fonte={fonte} item={antecipar} onVoltar={() => setVista('janela')} />
      ) : vazio ? (
        <Estado ic="◐" tom="info" titulo="Seu horizonte está vazio">
          <p>Cadastre seu salário e importe a fatura para ver quanto sobra nos próximos meses.</p>
          <button className="hz-btn pri" onClick={() => setVista('importar')}>
            Começar
          </button>
        </Estado>
      ) : (
        <>
          <nav className="hz-seg hz-abas" aria-label="Partes do Horizonte">
            {ABAS.map(([v, l]) => (
              <button
                key={v}
                aria-current={vista === v ? 'page' : undefined}
                onClick={() => setVista(v)}
              >
                {l}
              </button>
            ))}
          </nav>
          {vista === 'geral' && (
            <Geral
              d={d}
              meses={meses}
              setMeses={setMeses}
              sel={sel}
              abrir={(i) => (setSel(i), setVista('janela'))}
              setSel={setSel}
              fonte={fonte}
              recarregar={recarregar}
            />
          )}
          {vista === 'janela' && janela && (
            <DetalheJanela
              j={janela}
              caixinhas={d.caixinhas}
              onAntecipar={(x) => (setAntecipar(x), setVista('antecipar'))}
            />
          )}
          {vista === 'caixinhas' && <Caixinhas d={d} fonte={fonte} recarregar={recarregar} />}
          {vista === 'semanas' && <Semanas d={d} />}
          {vista === 'decimo' && <Decimo d={d} fonte={fonte} recarregar={recarregar} />}
        </>
      )}
    </section>
  );
}

function Geral(p: {
  d: HorizonteDados;
  meses: number;
  setMeses: (n: number) => void;
  sel: number;
  setSel: (n: number) => void;
  abrir: (n: number) => void;
  fonte: HorizonteFonte;
  recarregar: () => void;
}) {
  const { d } = p;
  const ent = d.janelas.reduce((a, j) => a + j.totalEntradas, 0);
  const sai = d.janelas.reduce((a, j) => a + j.totalSaidas, 0);
  const max = Math.max(1, ...d.janelas.flatMap((j) => [j.totalEntradas, j.totalSaidas]));
  const neg = d.janelas.find((j) => j.sobra < 0);
  return (
    <>
      <div className="hz-grid two">
        <div className="hz-g hz-hero">
          <div className="hz-top">
            <div>
              <div className="hz-k">Sobra prevista nos próximos {d.meses} meses</div>
              <div className={'hz-v' + (ent - sai < 0 ? ' neg' : ' pos')}>{sinal(ent - sai)}</div>
            </div>
            <div className="hz-seg" role="group" aria-label="Período">
              {[3, 6, 12].map((n) => (
                <button key={n} aria-pressed={p.meses === n} onClick={() => p.setMeses(n)}>
                  {n}m
                </button>
              ))}
            </div>
          </div>
          <div className="hz-kpis">
            <div className="hz-p">
              <small>Entradas</small>
              <b className="ok">{fmtC(ent)}</b>
            </div>
            <div className="hz-p">
              <small>Saídas</small>
              <b>{fmtC(sai)}</b>
            </div>
            <div className="hz-p safe">
              <small>Pode guardar por mês</small>
              <b>{fmtC(d.podeGuardar)}</b>
              <em>sobra → Reserva</em>
            </div>
          </div>
          <div className="hz-bars" role="list" aria-label="Entradas e saídas por janela">
            {d.janelas.map((j, i) => (
              <button
                key={j.id}
                role="listitem"
                className={'col' + (i === p.sel ? ' sel' : '')}
                aria-label={`${j.nome}: sobra ${fmtC(j.sobra)}`}
                onClick={() => p.setSel(i)}
              >
                <span className="pair">
                  <i className="in" style={{ height: `${(j.totalEntradas / max) * 100}%` }} />
                  <i className="out" style={{ height: `${(j.totalSaidas / max) * 100}%` }} />
                </span>
                <s className={j.sobra < 0 ? 'neg' : ''}>{curto(j.sobra)}</s>
                <span className="ax">{j.abrev}</span>
              </button>
            ))}
          </div>
          <div className="hz-leg">
            <span>
              <i className="in" />
              Entradas
            </span>
            <span>
              <i className="out" />
              Saídas (comprometido + previsto)
            </span>
            <span>Número = sobra</span>
          </div>
          {neg && (
            <div className="hz-alert" role="note">
              ⚠︎ {neg.nome} fecha negativo em {fmtC(-neg.sobra)}. Veja a ordem de recurso abaixo.
            </div>
          )}
        </div>
        <div className="hz-g hz-list">
          <div className="hz-lbl">Terminam em breve</div>
          {d.terminam.map((t) => (
            <div className="hz-it" key={t.id}>
              <div className="av">{t.sigla}</div>
              <div className="n">
                <b>{t.nome}</b>
                <small>
                  {t.atual}/{t.total} · termina {t.termina} · libera {fmtC(t.libera)}
                </small>
                <div className="prog">
                  <i style={{ width: `${(t.atual / t.total) * 100}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="hz-months">
        {d.janelas.map((j, i) => (
          <button
            key={j.id}
            className={'hz-g hz-m' + (i === p.sel ? ' cur' : '')}
            onClick={() => p.abrir(i)}
          >
            <h3>{j.nome}</h3>
            <div className={'t' + (j.sobra < 0 ? ' neg' : '')}>{sinal(j.sobra)}</div>
            <Row k="Entradas">
              <b className="ok">{fmtC(j.totalEntradas)}</b>
            </Row>
            <Row k="Comprometido">
              <b>{fmtC(j.comprometido)}</b>
            </Row>
            <Row k="Previsto">
              <b>{fmtC(j.previsto)}</b>
            </Row>
          </button>
        ))}
      </div>
      {d.furo && <FuroCard furo={d.furo} fonte={p.fonte} recarregar={p.recarregar} />}
    </>
  );
}

const Row = ({ k, children }: { k: string; children: ReactNode }) => (
  <div className="hz-row">
    {k}
    {children}
  </div>
);

function FuroCard({
  furo,
  fonte,
  recarregar,
}: {
  furo: NonNullable<HorizonteDados['furo']>;
  fonte: HorizonteFonte;
  recarregar: () => void;
}) {
  const [emg, setEmg] = useState(false);
  return (
    <div className="hz-g hz-card err" role="alert">
      <div className="hz-top">
        <h3>Janela de {furo.janela.toLowerCase()} fecha negativa</h3>
        <b className="neg">Furo − {fmtC(furo.valor)}</b>
      </div>
      <p className="hz-sub">Ordem de recurso sugerida:</p>
      <Row k="1. Semanas (folga do teto)">
        <b>{fmtC(furo.semanas)}</b>
      </Row>
      <Row k="2. Reserva">
        <b>
          {fmtC(furo.reserva)} de {fmtC(furo.reservaSaldo)}
        </b>
      </Row>
      <label className="hz-row">
        3. Emergência
        <span>
          <input type="checkbox" checked={emg} onChange={(e) => setEmg(e.target.checked)} /> é uma
          emergência
        </span>
      </label>
      <button className="hz-btn pri" onClick={() => fonte.cobrirFuro().then(recarregar)}>
        Cobrir com Semanas + Reserva{emg ? ' + Emergência' : ''}
      </button>
    </div>
  );
}

function LinhaItem({ x, onAntecipar }: { x: Item; onAntecipar?: (x: Item) => void }) {
  const [ver, setVer] = useState(!x.oculto);
  const tag = TIPO[x.tipo];
  const entrada = x.tipo === 'entrada';
  return (
    <div className="hz-it">
      <div className={'av' + (entrada || x.fonte === 'caixinha' ? ' in' : '')}>{x.sigla}</div>
      <div className="n">
        <b>
          {ver ? x.nome : 'Item oculto'}
          {tag && <span className={'tag ' + tag[1]}>{tag[0]}</span>}
          {x.parcela && <span className="tag tp">{x.parcela}</span>}
          {x.apelido && !ver && <span className="tag tf">apelido: “{x.apelido}”</span>}
        </b>
        <small>
          {x.oculto ? (
            <button className="hz-link" onClick={() => setVer(!ver)}>
              {ver ? 'ocultar' : 'toque para mostrar'}
            </button>
          ) : x.fonte ? (
            <>
              paga:{' '}
              <span className={'src ' + FONTE[x.fonte][1]}>
                {x.caixinha ? `Caixinha ${x.caixinha}` : FONTE[x.fonte][0]}
              </span>
            </>
          ) : (
            x.detalhe
          )}
          {x.antecipavel && onAntecipar && (
            <>
              {' · '}
              <button className="hz-link" onClick={() => onAntecipar(x)}>
                simular antecipação
              </button>
            </>
          )}
        </small>
      </div>
      <div className={'val' + (entrada ? ' ok' : '')}>
        {entrada ? sinal(x.cents) : fmtC(x.cents)}
      </div>
    </div>
  );
}

function DetalheJanela({
  j,
  caixinhas,
  onAntecipar,
}: {
  j: Janela;
  caixinhas: Caixinha[];
  onAntecipar: (x: Item) => void;
}) {
  const alertas = caixinhas.filter((c) => c.alerta && j.cartao.some((x) => x.caixinha === c.nome));
  const soma = (xs: Item[]) => xs.reduce((a, x) => a + x.cents, 0);
  return (
    <div className="hz-grid two">
      <div className="hz-g hz-list">
        <div className="hz-top hz-pad">
          <div>
            <div className="hz-k">Janela de {j.nome.toLowerCase()}</div>
            <h3>
              {j.inicio.slice(8)}/{j.inicio.slice(5, 7)} → {j.fim.slice(8)}/{j.fim.slice(5, 7)}
            </h3>
          </div>
          <div className="hz-chips">
            <span className="hz-chip">Adiant. {j.adiantamento}</span>
            <span className="hz-chip">Salário {j.salario}</span>
          </div>
        </div>
        <div className="hz-sec">Entradas · {fmtC(j.totalEntradas)}</div>
        {j.entradas.map((x) => (
          <LinhaItem key={x.id} x={x} />
        ))}
        <div className="hz-sec">Contas fixas · {fmtC(soma(j.fixas))}</div>
        {j.fixas.map((x) => (
          <LinhaItem key={x.id} x={x} />
        ))}
        <div className="hz-sec">Cartão e caixinhas · {fmtC(soma(j.cartao))}</div>
        {j.cartao.map((x) => (
          <LinhaItem key={x.id} x={x} onAntecipar={onAntecipar} />
        ))}
        {alertas.map((c) => (
          <div key={c.id} className="hz-alert danger">
            ● Caixinha {c.nome}: {c.alerta}
          </div>
        ))}
        {j.terceiros.length > 0 && (
          <div className="hz-sec">Itens de terceiros · líquido R$ 0,00</div>
        )}
        {j.terceiros.map((x) => (
          <LinhaItem key={x.id} x={x} />
        ))}
      </div>
      <div className="hz-g hz-card">
        <div className="hz-k">Resumo da janela</div>
        <div className={'hz-v' + (j.sobra < 0 ? ' neg' : ' pos')}>{sinal(j.sobra)}</div>
        <Row k="Entradas">
          <b className="ok">{fmtC(j.totalEntradas)}</b>
        </Row>
        <Row k="Comprometido (parcelas e fixas)">
          <b>{fmtC(j.comprometido)}</b>
        </Row>
        <Row k="Previsto (avulsos estimados)">
          <b>{fmtC(j.previsto)}</b>
        </Row>
        <p className="hz-sub small">
          Comprometido e previsto aparecem separados. Só a sua parte de cada item entra; saldo em
          conta não conta como dinheiro do mês.
        </p>
      </div>
    </div>
  );
}

function Caixinhas({
  d,
  fonte,
  recarregar,
}: {
  d: HorizonteDados;
  fonte: HorizonteFonte;
  recarregar: () => void;
}) {
  const cx = d.caixinhas;
  const [de, setDe] = useState(cx[cx.length - 1]?.id ?? '');
  const [para, setPara] = useState('');
  const [nova, setNova] = useState('');
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const enviar = () => {
    const cents = parseCents(valor);
    if (!cents || cents <= 0) return setMsg({ ok: false, t: 'Informe um valor maior que zero.' });
    if (de === para) return setMsg({ ok: false, t: 'Escolha caixinhas diferentes.' });
    if (!para && !nova.trim()) return setMsg({ ok: false, t: 'Dê um nome à caixinha nova.' });
    fonte.transferir({ de, para, nova: nova.trim(), cents, motivo }).then(
      () => {
        setMsg({ ok: true, t: `${fmtC(cents)} transferidos. Não conta como gasto.` });
        setValor('');
        setMotivo('');
        recarregar();
      },
      (e: unknown) => setMsg({ ok: false, t: e instanceof Error ? e.message : String(e) }),
    );
  };
  return (
    <div className="hz-grid two">
      <div className="hz-g hz-list">
        {cx.map((c) => (
          <div className="hz-it" key={c.id}>
            <div className="av in" aria-hidden="true">
              {c.icone}
            </div>
            <div className="n">
              <b>
                {c.nome}
                <span className={'tag ' + REGRA[c.regra][1]}>{REGRA[c.regra][0]}</span>
              </b>
              <small>
                {fmtC(c.saldo)}
                {c.meta ? ` de ${fmtC(c.meta)}` : ''}
                {c.aporte ? ` · +${fmtC(c.aporte)}/mês` : ''}
              </small>
              {c.meta ? (
                <div className="prog">
                  <i style={{ width: `${Math.min(100, (c.saldo / c.meta) * 100)}%` }} />
                </div>
              ) : null}
            </div>
            <div className="val">
              {c.meta ? `${Math.round((c.saldo / c.meta) * 100)}%` : fmtC(c.saldo)}
            </div>
          </div>
        ))}
        <div className="hz-card hz-guardar">
          <div className="hz-k">Quanto dá para guardar com segurança</div>
          <div className="hz-v">{fmtC(d.podeGuardar)} / mês</div>
          <Row k="Sobra média">
            <b>{fmtC(d.sobraMedia)}</b>
          </Row>
          <Row k="Destino da sobra">
            <b>Reserva (sem folga)</b>
          </Row>
          <Row k="Meta da emergência">
            <b>{fmtC(d.metaReserva.alvo)}</b>
          </Row>
          <Row k="Guardado hoje">
            <b className="ok">{fmtC(d.guardado)}</b>
          </Row>
          <p className="hz-sub small">
            Por quê: o mês mais apertado define o limite. A sobra de cada janela vai para a Reserva.
          </p>
        </div>
      </div>
      <form
        className="hz-g hz-card"
        aria-label="Transferir entre caixinhas"
        onSubmit={(e) => (e.preventDefault(), enviar())}
      >
        <div className="hz-k">Transferir entre caixinhas</div>
        <label className="hz-fld">
          <small>De</small>
          <select value={de} onChange={(e) => setDe(e.target.value)}>
            {cx.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} · {fmtC(c.saldo)}
              </option>
            ))}
          </select>
        </label>
        <label className="hz-fld">
          <small>Para</small>
          <select value={para} onChange={(e) => setPara(e.target.value)}>
            <option value="">＋ Nova caixinha</option>
            {cx.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        {!para && (
          <label className="hz-fld">
            <small>Nome da caixinha nova</small>
            <input
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              placeholder="Ex.: Fim de ano"
            />
          </label>
        )}
        <label className="hz-fld">
          <small>Valor</small>
          <input
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0,00"
          />
        </label>
        <label className="hz-fld">
          <small>Motivo</small>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Opcional"
          />
        </label>
        {msg && (
          <div className={'hz-alert' + (msg.ok ? ' good' : ' danger')} role="status">
            {msg.t}
          </div>
        )}
        <button className="hz-btn pri full" type="submit">
          Transferir
        </button>
      </form>
    </div>
  );
}

function Semanas({ d }: { d: HorizonteDados }) {
  return (
    <div className="hz-g hz-card">
      <div className="hz-top">
        <div className="hz-k">Teto semanal</div>
        <b>{fmtC(d.tetoSemanal)}</b>
      </div>
      <div className="hz-wk">
        {d.semanas.map((s) => (
          <div key={s.rotulo} className="hz-p">
            <small>
              {s.rotulo} · {s.periodo}
            </small>
            <div className="prog">
              <i className={s.estouro ? 'over' : ''} style={{ width: `${s.pct}%` }} />
            </div>
            {s.estouro ? (
              <b className="neg">
                {fmtC(s.gasto)} · +{Math.round(s.estouro / 100)}
              </b>
            ) : (
              <b>{fmtC(s.disponivel)} disp.</b>
            )}
          </div>
        ))}
      </div>
      <p className="hz-sub small">
        Semana de segunda a domingo. Semanas = dias × teto ÷ 7. Estouro sai da semana seguinte.
        Sobra da janela vai para a Reserva.
      </p>
    </div>
  );
}

function Decimo({
  d,
  fonte,
  recarregar,
}: {
  d: HorizonteDados;
  fonte: HorizonteFonte;
  recarregar: () => void;
}) {
  const t = d.decimo;
  return (
    <div className="hz-g hz-card">
      <div className="hz-top">
        <div className="hz-k">13º salário</div>
        <label className="hz-tog">
          <input
            type="checkbox"
            role="switch"
            checked={t.considerar}
            onChange={(e) => fonte.set13(e.target.checked).then(recarregar)}
          />
          {t.considerar ? 'considerar' : 'não considerar'}
        </label>
      </div>
      <div className="hz-f4">
        <div className="hz-fld">
          <small>Bruto</small>
          <b>{fmtC(t.bruto)}</b>
        </div>
        <div className="hz-fld">
          <small>Avos</small>
          <b>{t.avos}/12</b>
        </div>
        <div className="hz-fld">
          <small>Adiantamento (1ª parcela · {t.primeira})</small>
          <b>{fmtC(t.adiantamento)}</b>
        </div>
        <div className="hz-fld">
          <small>Líquido do holerite (2ª · {t.segunda})</small>
          <b>{fmtC(t.liquido)}</b>
        </div>
      </div>
      <p className="hz-sub small">
        {t.considerar
          ? 'O 13º entra no Horizonte como pontual previsto nas datas acima.'
          : 'O 13º não entra nas contas até você ligar a chave.'}
      </p>
    </div>
  );
}

function Antecipar({
  fonte,
  item,
  onVoltar,
}: {
  fonte: HorizonteFonte;
  item: Item;
  onVoltar: () => void;
}) {
  const [n, setN] = useState(3);
  const [pago, setPago] = useState('');
  const [s, setS] = useState<Simulacao | null>(null);
  useEffect(() => {
    fonte.simular(item.id, n, parseCents(pago) ?? undefined).then(setS);
  }, [fonte, item.id, n, pago]);
  return (
    <div className="hz-g hz-card hz-narrow">
      <div className="hz-k">
        Simular antecipação · {item.nome} ({n} últimas)
      </div>
      <label className="hz-fld">
        <small>Quantas parcelas antecipar (saem as últimas)</small>
        <input
          type="number"
          min={1}
          max={12}
          value={n}
          onChange={(e) => setN(Math.max(1, Number(e.target.value) || 1))}
        />
      </label>
      <label className="hz-fld">
        <small>Valor à vista oferecido</small>
        <input
          inputMode="decimal"
          value={pago}
          onChange={(e) => setPago(e.target.value)}
          placeholder="0,00"
        />
      </label>
      {s?.bloqueado ? (
        <div className="hz-alert danger" role="status">
          🔒 Item dividido: não pode ser antecipado.
        </div>
      ) : (
        s && (
          <>
            <Row k="Valor das parcelas">
              <b>{fmtC(s.valor)}</b>
            </Row>
            <Row k="Com desconto">
              <b className="ok">{fmtC(s.comDesconto)}</b>
            </Row>
            <Row k="Rendimento da caixinha no período">
              <b>{fmtC(s.rendimento)}</b>
            </Row>
            <div className={'hz-alert' + (s.vale ? ' good' : '')} role="status">
              {s.vale ? '✓ Vale a pena' : '✗ Não compensa'}: desconto{' '}
              {fmtC(s.valor - s.comDesconto)} {s.vale ? '>' : '≤'} rendimento {fmtC(s.rendimento)}.
            </div>
          </>
        )
      )}
      <p className="hz-sub small">
        🔒 Itens divididos não podem ser antecipados. Reimportar não traz as parcelas de volta.
      </p>
      <button className="hz-btn" onClick={onVoltar}>
        Voltar
      </button>
    </div>
  );
}

function Importar({
  fonte,
  onFim,
  onVoltar,
}: {
  fonte: HorizonteFonte;
  onFim: () => void;
  onVoltar: () => void;
}) {
  const [passo, setPasso] = useState<1 | 2 | 3>(1);
  const [res, setRes] = useState<ResultadoImport[]>([]);
  const [salvos, setSalvos] = useState(0);
  const ler = async (files: FileList | null) => {
    if (!files?.length) return;
    const arquivos = await Promise.all(
      [...files].map(async (f) => ({ nome: f.name, texto: await f.text() })),
    );
    setRes(await fonte.conferirOfx(arquivos));
    setPasso(2);
  };
  const erros = res.filter((r) => r.status === 'erro');
  const steps = (
    <div className="hz-steps" aria-label={`Passo ${passo} de 3`}>
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= passo ? 'on' : ''} />
      ))}
    </div>
  );
  if (passo === 2 && erros.length === res.length)
    return (
      <Estado ic="!" tom="danger" titulo="Não conseguimos ler o arquivo" erro>
        <p>{erros[0]?.motivo} Baixe a fatura em formato OFX no app do banco.</p>
        <button className="hz-btn" onClick={() => setPasso(1)}>
          Tentar outro arquivo
        </button>
      </Estado>
    );
  return (
    <div className="hz-g hz-card hz-narrow">
      {steps}
      {passo === 1 && (
        <>
          <h3>Escolher faturas</h3>
          <label className="hz-drop">
            <span className="ic" aria-hidden="true">
              ⇪
            </span>
            <b>Escolha os arquivos .ofx</b>
            <span className="hz-btn">Escolher arquivos</span>
            <input
              type="file"
              accept=".ofx"
              multiple
              data-testid="hz-ofx"
              onChange={(e) => void ler(e.target.files)}
            />
          </label>
          <button className="hz-btn" onClick={onVoltar}>
            Cancelar
          </button>
        </>
      )}
      {passo === 2 && (
        <>
          <h3>Conferir</h3>
          {res.map((r) => (
            <div className="hz-file" key={r.arquivo}>
              📄<b>{r.arquivo}</b>
              {r.status === 'ok' ? (
                <span className="ok">✓ {r.lancamentos}</span>
              ) : r.status === 'duplicada' ? (
                <span className="warn">já importada</span>
              ) : (
                <span className="neg">não é OFX</span>
              )}
            </div>
          ))}
          <div className="hz-acts">
            <button className="hz-btn" onClick={() => setPasso(1)}>
              Voltar
            </button>
            <button
              className="hz-btn pri grow"
              disabled={!res.some((r) => r.status === 'ok')}
              onClick={() => fonte.salvarOfx(res).then((n) => (setSalvos(n), setPasso(3)))}
            >
              Salvar no Horizonte
            </button>
          </div>
        </>
      )}
      {passo === 3 && (
        <div className="hz-state">
          <div className="ic accent" aria-hidden="true">
            ✓
          </div>
          <h3>Horizonte atualizado</h3>
          <p>
            {salvos} lançamentos salvos. O arquivo bruto e o número do cartão não ficam guardados.
          </p>
          <button className="hz-btn pri" onClick={onFim}>
            Ver meses
          </button>
        </div>
      )}
    </div>
  );
}
