/** Um lançamento da revisão (rowHTML do v3) com editores em linha: divisão, pago antecipadamente, uma para cada, tags. */
import { useState, type CSSProperties } from 'react';
import { useRateio } from '../../AppContext';
import { brDate, ddmm, ymToLabel } from '../../../lib/dates';
import { removeEachRule, repeatGroup, setEachRule } from '../../../lib/memory';
import { applyRule } from '../../../lib/memory';
import { fmtC, fmtV, fracLabel, sum } from '../../../lib/money';
import { PST, STATUS_TXT, recOf } from '../../../lib/parcelas';
import {
  applyPreset,
  confirmParcel,
  decideVolta,
  eachSuggestion,
  excludeTx,
  fillLast,
  includeTx,
  payInAdvance,
  pickPaid,
  setSplitMode,
  setValue,
  setWeight,
  toggleOwner,
} from '../../../lib/review';
import { activePeople, personById, personOrder, safeColor } from '../../../lib/state';
import { sharesOf, sortedOwners, splitSummary } from '../../../lib/split';
import { createTag, isPagoTag, rememberTags, setItemTags } from '../../../lib/tags';
import { ENCARGO } from '../../../lib/text';
import type { Ctx, SplitMode, Tx } from '../../../lib/types';
import { badgesOf, reasonText } from './reviewText';

export type Open = 'split' | 'antecip' | 'each' | 'tag';
export interface RowUi {
  isOpen: (id: string, k: Open) => boolean;
  toggle: (id: string, k: Open, on?: boolean) => void;
}

const cvar = (k: string, v: string) => ({ [k]: v }) as CSSProperties;

export function Row({ t, ui, eachBad }: { t: Tx; ui: RowUi; eachBad: Set<string> }) {
  const { ctx: c, commit, toast } = useRateio();
  const credit = t.cents < 0;
  const st = !t.excluded && t.owners.length ? sharesOf(c, t) : null;
  const pending = (!t.excluded && (!t.owners.length || (st && !st.ok))) || t.voltou === 'conferir';
  const act = (fn: (c: Ctx) => void | string, msg?: string) =>
    void commit(fn).then((ok) => ok && msg && toast(msg));

  let body;
  if (!t.excluded) {
    const showRemember = !(t.charge || t.kind !== 'compra' || c.d.ruleEach[t.norm]);
    body = (
      <>
        <div className="row-ctrl">
          <div className="chips" role="group" aria-label="Quem paga">
            {activePeople(c).map((p) => (
              <button
                key={p.id}
                className="chip"
                style={cvar('--c', safeColor(p.cor))}
                aria-pressed={t.owners.includes(p.id)}
                onClick={() => {
                  if (t.owners.includes(p.id) && t.owners.length <= 2)
                    ui.toggle(t.id, 'split', false);
                  act((c) => toggleOwner(c, t, p.id));
                }}
              >
                <span className="dot"></span>
                {p.nome}
              </button>
            ))}
          </div>
          {t.owners.length > 1 && (
            <button
              className={'btn small splitbtn ' + (t.split?.mode !== 'igual' ? 'custom' : '')}
              aria-expanded={ui.isOpen(t.id, 'split')}
              onClick={() => ui.toggle(t.id, 'split')}
            >
              {splitSummary(c, t)}
              {st && !st.ok ? ' ⚠' : ''}
            </button>
          )}
          <div className="ctrl-right">
            <EachButton t={t} ui={ui} />
            {showRemember && (
              <label className="toggle" title="Aplicar automaticamente nos próximos meses">
                <input
                  type="checkbox"
                  checked={t.remember}
                  onChange={(e) =>
                    act((c) => {
                      t.remember = e.target.checked;
                      applyRule(c, t);
                      rememberTags(c, t);
                    })
                  }
                />
                lembrar
              </label>
            )}
            {t.pkey && !t.voltou && (
              <button
                className="btn ghost small"
                aria-expanded={ui.isOpen(t.id, 'antecip')}
                onClick={() => ui.toggle(t.id, 'antecip')}
              >
                Pago antecipadamente
              </button>
            )}
            <button
              className="btn ghost small"
              onClick={() => {
                ui.toggle(t.id, 'split', false);
                ui.toggle(t.id, 'antecip', false);
                act((c) => excludeTx(c, t));
              }}
            >
              Tirar da divisão
            </button>
          </div>
        </div>
        {t.pconferir && <Conferir t={t} />}
        {ui.isOpen(t.id, 'antecip') && <Antecip t={t} ui={ui} />}
        {ui.isOpen(t.id, 'split') && t.owners.length > 1 && <SplitEditor t={t} />}
        {ui.isOpen(t.id, 'each') && <EachEditor t={t} ui={ui} />}
      </>
    );
  } else {
    const canInclude = t.kind !== 'pagamento';
    body = (
      <div className="outnote">
        <span className="grow">{reasonText(c, t)}</span>
        {t.voltou === 'conferir' ? (
          <>
            <button
              className="btn small"
              onClick={() => act((c) => decideVolta(c, t, 'fora'), 'Mantida fora da divisão')}
            >
              Manter fora (já conferi)
            </button>
            <button
              className="btn small"
              onClick={() => act((c) => decideVolta(c, t, 'incluir'), 'Incluída na divisão')}
            >
              Incluir na divisão (cobrança válida)
            </button>
          </>
        ) : (
          canInclude && (
            <button
              className="btn small"
              onClick={() => act((c) => includeTx(c, t), 'Incluído na divisão')}
            >
              Incluir na divisão
            </button>
          )
        )}
        {t.kind === 'pagamento' && t.payState === 'ambiguo' && (
          <div className="chips" style={{ width: '100%' }}>
            {(t.candidates || []).map((id) => {
              const d = c.inv.txs.find((x) => x.id === id);
              return (
                <button
                  key={id}
                  className="btn small"
                  onClick={() => act((c) => pickPaid(c, t.id, id), 'Compra marcada como já paga')}
                >
                  {d?.memo} · {ddmm(d?.date)}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <article
      className={'row ' + (t.excluded ? 'out ' : '') + (pending ? 'pending' : '')}
      id={'row-' + t.id}
    >
      <div className="row-main">
        <div className="row-text">
          <p className="desc">{t.memo}</p>
          <div className="meta">
            {badgesOf(c, t, eachBad).map((b, i) =>
              b.cls ? (
                <span key={i} className={b.cls} title={b.title}>
                  {b.text}
                </span>
              ) : (
                <span key={i}>{b.text}</span>
              ),
            )}
          </div>
        </div>
        <TagSlot t={t} ui={ui} />
        <div className={'amt num ' + (credit ? 'credit' : '')}>
          {fmtC(t.cents)}
          {t.sources && (
            <small>
              {t.sources
                .map((s) => `${ENCARGO.test(s.memo) ? 'encargo' : 'compra'} ${fmtV(s.cents)}`)
                .join(' + ')}
            </small>
          )}
        </div>
      </div>
      {ui.isOpen(t.id, 'tag') && <TagPicker t={t} ui={ui} />}
      {body}
    </article>
  );
}

function Conferir({ t }: { t: Tx }) {
  const { ctx: c, commit, toast } = useRateio();
  return (
    <div className="outnote">
      {(t.pcands || [])
        .map((k) => c.d.parcelas[k])
        .filter((r) => !!r)
        .map((r) => (
          <span key={r.key} style={{ display: 'contents' }}>
            <span className="grow">
              Pode ser a parcela registrada como <b>{STATUS_TXT[r.status] || r.status}</b> em{' '}
              {brDate(r.em)} ({fmtC(r.cents)}
              {r.comp ? `, fatura de ${ymToLabel(r.comp)}` : ''}). Nenhuma decisão foi aplicada.
            </span>
            <button
              className="btn small"
              onClick={() =>
                void commit((c) => confirmParcel(c, t, r.key)).then(
                  (ok) =>
                    ok && toast('Parcela confirmada: a decisão registrada vale para este item'),
                )
              }
            >
              É esta parcela
            </button>
          </span>
        ))}
    </div>
  );
}

function Antecip({ t, ui }: { t: Tx; ui: RowUi }) {
  const { commit, toast } = useRateio();
  const [val, setVal] = useState(fmtV(t.cents));
  const [desc, setDesc] = useState('');
  const ok = () => {
    let err = '';
    void commit((c) => {
      err = payInAdvance(c, t, val, desc);
      return err;
    }).then((saved) => {
      if (err) return;
      ui.toggle(t.id, 'antecip', false);
      ui.toggle(t.id, 'split', false);
      if (saved) toast(`Parcela ${t.parcela!.cur}/${t.parcela!.tot} paga antecipadamente (só ela)`);
    });
  };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      ok();
    }
    if (e.key === 'Escape') ui.toggle(t.id, 'antecip', false);
  };
  return (
    <div className="payform" onKeyDown={keys}>
      <label>
        Valor pago{' '}
        <input
          className="field"
          inputMode="decimal"
          value={val}
          autoFocus
          onFocus={(e) => e.target.select()}
          onChange={(e) => setVal(e.target.value)}
          aria-label="Valor pago"
        />
      </label>
      <label>
        Desconto (opcional){' '}
        <input
          className="field"
          inputMode="decimal"
          placeholder="0,00"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          aria-label="Desconto"
        />
      </label>
      <button className="btn small primary" onClick={ok}>
        Confirmar
      </button>
      <button className="btn ghost small" onClick={() => ui.toggle(t.id, 'antecip', false)}>
        Cancelar
      </button>
      <p className="help" style={{ width: '100%', margin: 0 }}>
        Vale só para esta parcela ({t.parcela?.cur}/{t.parcela?.tot}). Sai da divisão, das mensagens
        e dos compromissos futuros, e continua fora quando você importar de novo.
      </p>
    </div>
  );
}

const MODES: [SplitMode, string][] = [
  ['igual', 'Igual'],
  ['partes', 'Por partes'],
  ['valor', 'Por valor'],
];

function SplitEditor({ t }: { t: Tx }) {
  const { ctx: c, commit, bump } = useRateio();
  const owners = sortedOwners(c, t),
    mode = t.split?.mode || 'igual';
  const r = sharesOf(c, t);
  const nm = (i: number) => personById(c, owners[i])?.nome || '';
  const presets: number[][] =
    owners.length === 2
      ? [
          [1, 1],
          [1, 2],
          [2, 1],
          [1, 3],
          [3, 1],
        ]
      : owners.length === 3
        ? [
            [1, 1, 1],
            [2, 1, 1],
            [1, 2, 1],
            [1, 1, 2],
          ]
        : [];
  // digitação: muda o Ctx e redesenha sem gravar; grava ao sair do campo (o desfazer guarda o estado ao entrar)
  const typing = {
    onFocus: () => void commit(() => {}),
    onBlur: () => void commit(() => {}, { undo: false }),
  };
  return (
    <div className="split">
      <div className="seg" role="group" aria-label="Como dividir">
        {MODES.map(([m, l]) => (
          <button
            key={m}
            aria-pressed={mode === m}
            disabled={m === 'valor' && t.cents < 0}
            onClick={() => void commit((c) => setSplitMode(c, t, m))}
          >
            {l}
          </button>
        ))}
      </div>
      {presets.length > 0 && (
        <div className="presets">
          {presets.map((w) => (
            <button key={w.join()} onClick={() => void commit((c) => applyPreset(c, t, w))}>
              {w.map((x, i) => nm(i) + ' ' + fracLabel(x, sum(w))).join(' · ')}
            </button>
          ))}
        </div>
      )}
      <div>
        {owners.map((id) => {
          const p = personById(c, id)!;
          return (
            <div className="srow" key={id}>
              <span className="who">
                <span className="dot" style={{ background: safeColor(p.cor) }}></span>
                {p.nome}
              </span>
              {mode === 'partes' ? (
                <input
                  key={'w' + id}
                  inputMode="decimal"
                  defaultValue={String(t.split.w?.[id] ?? 1).replace('.', ',')}
                  aria-label={`Partes de ${p.nome}`}
                  {...typing}
                  onChange={(e) => {
                    setWeight(c, t, id, e.target.value);
                    bump();
                  }}
                />
              ) : mode === 'valor' ? (
                <input
                  key={'v' + id}
                  inputMode="decimal"
                  defaultValue={t.split.v?.[id] != null ? fmtV(t.split.v[id]) : ''}
                  placeholder="0,00"
                  aria-label={`Valor de ${p.nome}`}
                  {...typing}
                  onChange={(e) => {
                    setValue(t, id, e.target.value);
                    bump();
                  }}
                />
              ) : (
                <span className="num" style={{ textAlign: 'right', color: 'var(--ink-2)' }}>
                  —
                </span>
              )}
              <span className="res num">{r.shares[id] != null ? fmtC(r.shares[id]) : '—'}</span>
            </div>
          );
        })}
      </div>
      <div className="status">
        {r.ok ? (
          <span className="okmark">✓ soma {fmtC(t.cents)} = valor do item</span>
        ) : (
          <span className="badmark">⚠ {r.msg}</span>
        )}
      </div>
      <p className="hint">
        {mode === 'partes'
          ? 'Ex.: 3 camisas e 1 era da sua esposa → Pedro 2, Nega 1 (ela paga 1/3).'
          : mode === 'valor'
            ? 'Digite quanto cada um paga. A soma tem que dar o valor do item.'
            : 'Divide em partes iguais; centavo que sobra vai para a primeira pessoa.'}
      </p>
      {mode === 'valor' && <FillButton t={t} />}
    </div>
  );
}

function FillButton({ t }: { t: Tx }) {
  const { commit } = useRateio();
  const [n, setN] = useState(0);
  return (
    <button
      key={n}
      className="btn small"
      onClick={() => void commit((c) => fillLast(c, t)).then(() => setN(n + 1))}
    >
      Completar o último com o restante
    </button>
  );
}

function EachButton({ t, ui }: { t: Tx; ui: RowUi }) {
  const { ctx: c, commit, toast } = useRateio();
  if (t.kind !== 'compra' || t.charge) return null;
  if (c.d.ruleEach[t.norm])
    return (
      <button
        className="btn ghost small"
        onClick={() =>
          void commit((c) => {
            removeEachRule(c, t.norm);
          }).then((ok) => ok && toast('Regra “uma para cada” removida'))
        }
      >
        Desfazer “uma para cada”
      </button>
    );
  return repeatGroup(c, t).length > 1 ? (
    <button className="btn small" onClick={() => ui.toggle(t.id, 'each', true)}>
      Uma para cada pessoa
    </button>
  ) : null;
}

function EachEditor({ t, ui }: { t: Tx; ui: RowUi }) {
  const { ctx: c, commit, toast } = useRateio();
  const g = repeatGroup(c, t),
    n = g.length;
  const [pick, setPick] = useState<string[]>(() => eachSuggestion(c, t));
  return (
    <div className="split">
      <p style={{ fontSize: '.86rem' }}>
        <b>
          {n} cobranças de “{t.memo}”
        </b>{' '}
        nesta fatura ({g.map((x) => ddmm(x.date) + ' ' + fmtC(x.cents)).join(' · ')}).
      </p>
      <p className="hint">
        Escolha {n} pessoas. Cada cobrança vai para uma delas e nunca duas para a mesma pessoa. Vale
        para os próximos meses.
      </p>
      <div className="chips" style={{ margin: '10px 0' }}>
        {activePeople(c).map((p) => (
          <button
            key={p.id}
            className="chip"
            style={cvar('--c', safeColor(p.cor))}
            aria-pressed={pick.includes(p.id)}
            onClick={() =>
              setPick((a) =>
                a.includes(p.id) ? a.filter((x) => x !== p.id) : a.length < n ? [...a, p.id] : a,
              )
            }
          >
            <span className="dot"></span>
            {p.nome}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          className="btn small primary"
          disabled={pick.length !== n}
          onClick={() => {
            const ids = pick.slice().sort((a, b) => personOrder(c, a) - personOrder(c, b));
            void commit((c) => setEachRule(c, t, ids)).then((ok) => {
              ui.toggle(t.id, 'each', false);
              if (ok) toast('Regra criada: uma cobrança para cada pessoa');
            });
          }}
        >
          Aplicar ({pick.length}/{n})
        </button>
        <button className="btn ghost small" onClick={() => ui.toggle(t.id, 'each', false)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function TagSlot({ t, ui }: { t: Tx; ui: RowUi }) {
  const { ctx: c, commit } = useRateio();
  const pg = c.d.tags.find((g) => isPagoTag(c, g.id));
  const derived =
    recOf(c, t)?.status === PST.pago && !(t.tags || []).some((id) => isPagoTag(c, id));
  return (
    <div className="tagslot">
      {derived && (
        <span
          className="utag static"
          style={cvar('--tc', safeColor(pg?.cor || '#1098AD'))}
          title="Do registro da parcela"
        >
          PAGO
        </span>
      )}
      {(t.tags || []).map((id) => {
        const g = c.d.tags.find((x) => x.id === id);
        return g ? (
          <span key={id} className="utag" style={cvar('--tc', safeColor(g.cor))}>
            {g.nome}
            <button
              aria-label={`Tirar a tag ${g.nome}`}
              onClick={() =>
                void commit((c) =>
                  setItemTags(
                    c,
                    t,
                    (t.tags || []).filter((x) => x !== id),
                  ),
                )
              }
            >
              ×
            </button>
          </span>
        ) : null;
      })}
      <button
        className="addtag"
        aria-expanded={ui.isOpen(t.id, 'tag')}
        onClick={() => ui.toggle(t.id, 'tag')}
      >
        + tag
      </button>
    </div>
  );
}

function TagPicker({ t, ui }: { t: Tx; ui: RowUi }) {
  const { ctx: c, commit, toast } = useRateio();
  const [name, setName] = useState('');
  const remembers = t.charge || (t.kind === 'compra' && t.remember);
  const create = () => {
    let nome = '';
    void commit((c) => {
      const g = createTag(c, name);
      if (!g) return 'Digite o nome da tag';
      nome = g.nome;
      setItemTags(c, t, [...(t.tags || []), g.id]);
    }).then((ok) => {
      if (!nome) return;
      setName('');
      if (ok) toast(`Tag “${nome}” aplicada`);
    });
  };
  return (
    <div className="split">
      {c.d.tags.length ? (
        <div className="chips">
          {c.d.tags.map((g) => (
            <button
              key={g.id}
              className="chip"
              style={cvar('--c', safeColor(g.cor))}
              aria-pressed={(t.tags || []).includes(g.id)}
              onClick={() => {
                const cur = t.tags || [];
                void commit((c) =>
                  setItemTags(
                    c,
                    t,
                    cur.includes(g.id) ? cur.filter((x) => x !== g.id) : [...cur, g.id],
                  ),
                );
              }}
            >
              <span className="dot"></span>
              {g.nome}
            </button>
          ))}
        </div>
      ) : (
        <p className="hint" style={{ margin: 0 }}>
          Nenhuma tag ainda. Crie a primeira:
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <input
          className="field"
          style={{ flex: 1, minWidth: 160 }}
          maxLength={24}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              create();
            }
            if (e.key === 'Escape') ui.toggle(t.id, 'tag', false);
          }}
          placeholder="Nova tag (ex.: Casa, Pet, Viagem)"
          aria-label="Nome da nova tag"
        />
        <button className="btn small" onClick={create}>
          Criar e aplicar
        </button>
        <button className="btn ghost small" onClick={() => ui.toggle(t.id, 'tag', false)}>
          Fechar
        </button>
      </div>
      <p className="hint">
        {remembers
          ? 'Com “lembrar” marcado, a tag volta sozinha nos próximos meses (PAGO não: vale só neste lançamento).'
          : 'Tag só deste lançamento.'}
      </p>
    </div>
  );
}
