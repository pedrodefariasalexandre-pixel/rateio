/** Etapa 2 do v3 (#sReview): avisos, conferência, filtros, atribuição em massa, lista e rodapé com totais. */
import { useState } from 'react';
import { useRateio } from '../../AppContext';
import { useConfirm } from '../../base/confirm';
import { syncChargesIntoTxs } from '../../../lib/charges';
import { YM_RE } from '../../../lib/dates';
import { checkInstallments, markDuplicates } from '../../../lib/invoice';
import { fmtC, sum } from '../../../lib/money';
import { monthLabel } from '../../../lib/message';
import { bulkAssign, learnBeforeMessages, splitBulk } from '../../../lib/review';
import { activePeople, safeColor, tagById } from '../../../lib/state';
import { computeTotals, eachViolations, included, stateOf } from '../../../lib/split';
import type { Tx } from '../../../lib/types';
import { Ledger, Notices } from './Notices';
import { Row, type Open, type RowUi } from './Row';

type Filter = 'all' | 'todo' | 'shared' | 'out';
const order = (a: Tx, b: Tx) =>
  Number(!!a.charge) - Number(!!b.charge) || (b.date || '').localeCompare(a.date || '');

export function ReviewScreen({
  onRestart,
  onFinish,
}: {
  onRestart: () => void;
  onFinish: () => void;
}) {
  const { ctx: c, commit, bump, undo, toast } = useRateio();
  const confirm = useConfirm();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [compDraft, setCompDraft] = useState<string | null>(null);

  const ui: RowUi = {
    isOpen: (id, k) => open.has(k + ':' + id),
    toggle: (id, k: Open, on) =>
      setOpen((s) => {
        const n = new Set(s),
          key = k + ':' + id;
        const want = on ?? !n.has(key);
        // pago antecipadamente, uma para cada e tag: um aberto por vez (como no v3)
        if (want && k !== 'split')
          [...n].filter((x) => x.startsWith(k + ':')).forEach((x) => n.delete(x));
        if (want) n.add(key);
        else n.delete(key);
        return n;
      }),
  };

  const { txs, fileInfo, comp } = c.inv;
  const eachBad = eachViolations(c);
  const seq = checkInstallments(c);
  markDuplicates(c);
  const tf = tagFilter && tagFilter !== '__none' && !tagById(c, tagFilter) ? '' : tagFilter;
  const q = query.trim().toLowerCase();
  const matches = (t: Tx) => {
    if (tf === '__none' && (t.tags || []).length) return false;
    if (tf && tf !== '__none' && !(t.tags || []).includes(tf)) return false;
    if (q && !t.memo.toLowerCase().includes(q)) return false;
    if (filter === 'todo') return !t.excluded && !t.owners.length;
    if (filter === 'shared') return !t.excluded && t.owners.length > 1;
    if (filter === 'out') return t.excluded;
    return true;
  };
  const st = stateOf(c);
  const inList = included(c).filter(matches).sort(order),
    outList = txs.filter((t) => t.excluded).filter(matches);
  const ofxN = txs.filter((t) => !t.charge).length,
    fixN = txs.filter((t) => t.charge).length;
  const bulk = splitBulk(c, inList);
  const scope = q
    ? 'desta busca'
    : tf
      ? 'deste filtro de tag'
      : filter === 'todo'
        ? 'da fatura'
        : 'da lista';
  const groups: [string, (t: Tx) => boolean][] = [
    ['Parcelas cobradas de novo — conferir no banco', (t) => t.voltou === 'conferir'],
    ['Pagas antecipadamente', (t) => t.reason === 'antecipado' && t.voltou !== 'conferir'],
    ['Já pagos', (t) => t.reason === 'pago'],
    ['Pagamentos recebidos', (t) => t.kind === 'pagamento'],
    ['Estornos e créditos', (t) => t.kind === 'estorno' || t.kind === 'credito'],
    [
      'Outros fora da divisão',
      (t) =>
        !['pago', 'antecipado'].includes(t.reason) &&
        !['pagamento', 'estorno', 'credito'].includes(t.kind),
    ],
  ];
  const FILTERS: [Filter, string, number | null][] = [
    ['all', 'Todos', null],
    ['todo', 'Sem dono', st.todo],
    ['shared', 'Divididos', included(c).filter((t) => t.owners.length > 1).length],
    ['out', 'Fora da divisão', txs.filter((t) => t.excluded).length],
  ];

  return (
    <>
      <section id="sReview">
        <div className="rhead">
          <div>
            <h2 id="reviewTitle">Fatura {monthLabel(c)}</h2>
            <div className="sub" id="reviewSub">
              {(fileInfo?.name ? fileInfo.name + ' · ' : '') + `${ofxN} lançamentos`}
              {fixN ? ` + ${fixN} cobrança(s) fixa(s)` : ''}
            </div>
          </div>
          <label className="comp" style={{ marginLeft: 'auto' }}>
            Competência
            <input
              type="month"
              id="compInput"
              aria-label="Competência da fatura"
              value={compDraft ?? comp}
              onChange={(e) => setCompDraft(e.target.value)}
              onBlur={() => {
                const v = compDraft;
                setCompDraft(null);
                if (v == null || v === comp) return;
                if (YM_RE.test(v))
                  // trocar a competência recalcula as parcelas das cobranças fixas
                  void commit((c) => {
                    c.inv.comp = v;
                    syncChargesIntoTxs(c, true);
                  });
                else
                  toast(
                    'Competência inválida: use um mês de 01 a 12. Mantida ' + monthLabel(c) + '.',
                    'err',
                  );
              }}
            />
          </label>
          <button
            className="btn ghost small"
            id="btnRestart"
            onClick={async () => {
              if (await confirm('Descartar esta fatura e importar outra?', { ok: 'Descartar' }))
                onRestart();
            }}
          >
            Trocar arquivo
          </button>
        </div>

        <Notices c={c} seq={seq} eachBad={eachBad} />
        <Ledger c={c} />

        <div className="tools">
          <div className="search">
            <label className="sr" htmlFor="q">
              Buscar lançamento
            </label>
            <input
              type="search"
              id="q"
              placeholder="Buscar lançamento…"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <label className="sr" htmlFor="tagFilter">
            Filtrar por tag
          </label>
          <select
            id="tagFilter"
            className="field"
            style={{ width: 'auto', minWidth: 150 }}
            value={tf}
            onChange={(e) => setTagFilter(e.target.value)}
          >
            <option value="">Todas as tags</option>
            {c.d.tags.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
            <option value="__none">Sem tag</option>
          </select>
          <div className="seg" id="filters" role="group" aria-label="Filtrar">
            {FILTERS.map(([f, l, n]) => (
              <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {l}
                {n != null && <span className="ct">{n}</span>}
              </button>
            ))}
          </div>
        </div>

        <div id="bulkBar">
          {bulk.list.length >= 2 && filter !== 'out' && (
            <div className="bulk">
              <span>
                Atribuir os <b>{bulk.list.length}</b> sem dono {scope} a:
              </span>
              <div className="chips">
                {activePeople(c).map((p) => (
                  <button
                    key={p.id}
                    className="chip"
                    style={{ ['--c' as string]: safeColor(p.cor) }}
                    onClick={() => {
                      let n = 0;
                      void commit((c) => {
                        n = bulkAssign(c, inList, p.id);
                      }).then(
                        (ok) => ok && toast(`${n} itens atribuídos a ${p.nome} (dá para desfazer)`),
                      );
                    }}
                  >
                    <span className="dot"></span>
                    {p.nome}
                  </button>
                ))}
              </div>
              {bulk.skipped > 0 && (
                <span className="help" style={{ margin: 0 }}>
                  {bulk.skipped} com “uma para cada” ficam de fora
                </span>
              )}
            </div>
          )}
        </div>

        <div id="lists">
          {filter !== 'out' && (
            <>
              <div className="group-h">
                <h3>Na divisão</h3>
                <small>{inList.length} item(ns)</small>
                <span className="sum num">{fmtC(sum(inList.map((t) => t.cents)))}</span>
              </div>
              {inList.length ? (
                <div className="list">
                  {inList.map((t) => (
                    <Row key={t.id} t={t} ui={ui} eachBad={eachBad} />
                  ))}
                </div>
              ) : (
                <p className="empty">
                  {filter === 'todo' ? 'Tudo atribuído ✓' : 'Nenhum item aqui.'}
                </p>
              )}
            </>
          )}
          {(filter === 'all' || filter === 'out') && outList.length > 0 && (
            <>
              <div className="group-h">
                <h3>Fora da divisão</h3>
                <small>{outList.length} item(ns) · nada é escondido</small>
              </div>
              {groups.map(([name, f]) => {
                const a = outList.filter(f).sort(order);
                return a.length ? (
                  <div key={name}>
                    <p className="subgroup">
                      {name} ({a.length})
                    </p>
                    <div className="list">
                      {a.map((t) => (
                        <Row key={t.id} t={t} ui={ui} eachBad={eachBad} />
                      ))}
                    </div>
                  </div>
                ) : null;
              })}
            </>
          )}
          {filter === 'out' && !outList.length && <p className="empty">Nada fora da divisão.</p>}
        </div>
      </section>
      <Footer
        onUndo={undo}
        onFinish={() => {
          void commit((c) => learnBeforeMessages(c), { undo: false }).then(() => {
            bump();
            onFinish();
          });
        }}
      />
    </>
  );
}

function Footer({ onUndo, onFinish }: { onUndo: () => void; onFinish: () => void }) {
  const { ctx: c } = useRateio();
  const { tot, check } = computeTotals(c);
  const st = stateOf(c);
  const totalAll = sum(Object.values(tot));
  const blockers = st.todo + st.invalid + st.viol;
  const shown = c.d.people.filter((p) => tot[p.id] !== 0);
  let cls = 'tag mem',
    txt = `✓ ${fmtC(totalAll)} dividido`;
  if (blockers) {
    cls = 'tag warn';
    txt = [
      st.todo ? `${st.todo} sem dono` : '',
      st.invalid ? `${st.invalid} divisão inválida` : '',
      st.viol ? 'mesma pessoa em cobranças iguais' : '',
    ]
      .filter(Boolean)
      .join(' · ');
  } else if (!check) {
    cls = 'tag warn';
    txt = 'soma por pessoa não fecha';
  }
  return (
    <div id="footer">
      <div className="wrap">
        <div id="stack" aria-hidden="true">
          {c.d.people
            .filter((p) => (tot[p.id] || 0) > 0)
            .map((p) => (
              <div
                key={p.id}
                style={{ flexGrow: tot[p.id], background: safeColor(p.cor) }}
                title={p.nome}
              ></div>
            ))}
        </div>
        <div className="frow">
          <div id="totals" className="frow">
            {shown.length ? (
              shown.map((p) => (
                <span className="tot" key={p.id}>
                  <span className="dot" style={{ background: safeColor(p.cor) }}></span>
                  {p.nome} <b className="num">{fmtC(tot[p.id]!)}</b>
                </span>
              ))
            ) : (
              <span className="tot" style={{ color: 'var(--ink-2)' }}>
                Toque nos nomes para atribuir cada item.
              </span>
            )}
          </div>
          <div className="grow"></div>
          <button
            className="btn ghost small"
            id="btnUndo"
            title="Desfazer a última ação (Ctrl+Z)"
            onClick={onUndo}
          >
            ↶ Desfazer
          </button>
          <span id="footState" className={cls}>
            {txt}
          </span>
          <button
            className="btn primary"
            id="btnFinish"
            disabled={blockers > 0 || !check || !st.inc.length}
            onClick={onFinish}
          >
            Gerar mensagens →
          </button>
        </div>
      </div>
    </div>
  );
}
