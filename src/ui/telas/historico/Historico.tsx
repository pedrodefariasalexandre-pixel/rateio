import { useState, type ReactNode } from 'react';
import { csvHistory } from '../../../lib/csv';
import { brDate, dateBR, todayISO } from '../../../lib/dates';
import { fmtC, fmtV, parseCents } from '../../../lib/money';
import { buildProjection, historyProjItems, type Projection } from '../../../lib/projection';
import {
  deletePayment,
  isReceivable,
  openBalances,
  payStatus,
  remainingOf,
  savePayment,
} from '../../../lib/receivables';
import { latestClosed, removeMonth, undoClose } from '../../../lib/closeMonth';
import { safeColor, who } from '../../../lib/state';
import type { Month } from '../../../lib/types';
import type { Env } from '../env';
import './historico.css';
import { copyText, downloadText } from '../util';

interface Props {
  env: Env;
  /** Bloco de projeção (gráfico + "ver como tabela"), fornecido pela tela de relatórios. */
  renderProjecao?: (pr: Projection, context: string) => ReactNode;
}

function PayForm({
  rem,
  today,
  onSave,
  onCancel,
}: {
  rem: number;
  today: string;
  onSave: (valor: string, data: string) => void;
  onCancel: () => void;
}) {
  const [valor, setValor] = useState(fmtV(rem));
  const [data, setData] = useState(today);
  return (
    <div className="payform">
      <label>
        Valor recebido
        <input
          className="field"
          inputMode="decimal"
          value={valor}
          autoFocus
          onFocus={(e) => e.target.select()}
          onChange={(e) => setValor(e.target.value)}
        />
      </label>
      <label>
        Data
        <input
          className="field"
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
        />
      </label>
      <button className="btn small primary" onClick={() => onSave(valor, data)}>
        Salvar
      </button>
      <button className="btn ghost small" onClick={onCancel}>
        Cancelar
      </button>
    </div>
  );
}

export function Historico({ env, renderProjecao }: Props) {
  const { ctx } = env;
  const { history, settings } = ctx.d;
  const [openPay, setOpenPay] = useState<string | null>(null);
  const [openHist, setOpenHist] = useState<Set<string>>(new Set());
  const [openProj, setOpenProj] = useState<Set<string>>(new Set());
  const today = ctx.today || todayISO();

  const toggle = (set: Set<string>, id: string, fn: (s: Set<string>) => void) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    fn(n);
  };

  async function pay(key: string, valor: string, data: string) {
    let erro = '';
    const ok = await env.commit((c) => {
      erro = savePayment(c, key, parseCents(valor), data);
      return erro || undefined;
    });
    if (ok) {
      setOpenPay(null);
      env.toast('Pagamento registrado');
    } else if (erro) env.toast(erro, 'err');
  }

  async function delPay(h: Month, i: number, j: number) {
    const p = h.people[i]!.payments[j]!;
    if (
      !(await env.confirm(`Apagar o pagamento de ${fmtC(p.cents)} (${brDate(p.date)})?`, {
        danger: true,
      }))
    )
      return;
    await env.commit((c) => deletePayment(c, String(h.id), i, j));
  }

  async function undo(h: Month) {
    const nPay = (h.people || []).reduce((a, p) => a + (p.payments || []).length, 0);
    if (
      !(await env.confirm(
        `Desfazer o fechamento de ${h.label}? O registro sai do histórico e as cobranças fixas voltam a como estavam antes de fechar (mudanças feitas nelas depois disso se perdem).${nPay ? ` Os ${nPay} pagamento(s) registrado(s) neste mês também saem.` : ''}`,
        { danger: true },
      ))
    )
      return;
    if (
      await env.commit((c) =>
        undoClose(
          c,
          c.d.history.find((x) => x.id === h.id)!,
        ),
      )
    )
      env.toast(`Fechamento de ${h.label} desfeito`);
  }

  async function del(h: Month) {
    if (
      !(await env.confirm(
        `Remover o registro de ${h.label} do histórico? (As cobranças fixas e os pagamentos registrados nele saem juntos.)`,
        { danger: true },
      ))
    )
      return;
    await env.commit((c) =>
      removeMonth(
        c,
        c.d.history.find((x) => x.id === h.id)!,
      ),
    );
  }

  async function copyMsg(h: Month, i: number) {
    if (await copyText(h.people[i]!.text, env.prompt)) env.toast('Mensagem copiada');
  }

  function csv() {
    if (!history.length) return env.toast('Nenhum mês fechado ainda.');
    if (!downloadText(`rateio-historico-${today}.csv`, csvHistory(ctx), 'text/csv;charset=utf-8'))
      env.toast('Download bloqueado aqui.');
  }

  const ob = openBalances(ctx);
  const latest = latestClosed(ctx);

  return (
    <div className="tela-historico">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button className="btn small" onClick={csv}>
          Exportar histórico (CSV)
        </button>
      </div>

      {history.length > 0 && (
        <section className="opensum" aria-labelledby="osT">
          <h4 id="osT">
            Em aberto <span className="help">meses fechados ainda não pagos</span>
          </h4>
          {ob.length ? (
            ob.map((e) => {
              const k = 'sum:' + e.key;
              return (
                <div key={e.key}>
                  <div className="orow">
                    <span className="who">
                      <span className="dot" style={{ background: safeColor(e.cor) }} />
                      {e.nome}
                    </span>
                    <span className="help">
                      {e.months.map((m) => `${m.label} ${fmtC(m.remaining)}`).join(' · ')}
                    </span>
                    <b className="num">{fmtC(e.total)}</b>
                    <button
                      className="btn small"
                      onClick={() => setOpenPay(openPay === k ? null : k)}
                    >
                      Registrar pagamento
                    </button>
                  </div>
                  {openPay === k && (
                    <PayForm
                      rem={e.total}
                      today={today}
                      onSave={(v, d) => pay(k, v, d)}
                      onCancel={() => setOpenPay(null)}
                    />
                  )}
                </div>
              );
            })
          ) : (
            <p className="okmark" style={{ padding: '4px 0 2px' }}>
              Tudo recebido ✓
            </p>
          )}
        </section>
      )}

      {history.length ? (
        <>
          <h4 className="ph">Meses fechados</h4>
          {history.map((h) => {
            const id = String(h.id);
            const abertos = (h.people || []).filter((p) => remainingOf(ctx, p) > 0).length;
            return (
              <details
                className="hist"
                key={id}
                open={openHist.has(id)}
                onToggle={(e) => {
                  const o = (e.currentTarget as HTMLDetailsElement).open;
                  if (o !== openHist.has(id)) toggle(openHist, id, setOpenHist);
                }}
              >
                <summary>
                  <b>{h.label}</b>
                  <span className="num">{fmtC(h.totalCents)}</span>
                  {abertos ? (
                    <span className="tag warn">{abertos} em aberto</span>
                  ) : (h.people || []).some((p) => isReceivable(ctx, p)) ? (
                    <span className="tag mem">recebido ✓</span>
                  ) : null}
                  <span className="help" style={{ margin: 0 }}>
                    fechado em {dateBR(h.closedAt)}
                  </span>
                </summary>
                <div className="hbody">
                  <table className="htable">
                    <tbody>
                      {(h.people || []).map((p, i) => {
                        const st = payStatus(ctx, p),
                          key = `${h.id}:${i}`,
                          rem = remainingOf(ctx, p);
                        return (
                          <PessoaLinha
                            key={key}
                            cor={who(ctx, p, h).cor}
                            nome={p.nome}
                            total={p.total}
                            st={st}
                            rem={rem}
                            payments={p.payments || []}
                            formAberto={openPay === key}
                            today={today}
                            onToggle={() => setOpenPay(openPay === key ? null : key)}
                            onSave={(v, d) => pay(key, v, d)}
                            onDel={(j) => delPay(h, i, j)}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="help">
                    {(h.items || []).length} itens divididos · {(h.fora || []).length} fora da
                    divisão{h.file ? ` · ${h.file}` : ''}
                  </p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {(h.people || []).map((p, i) => (
                      <button key={i} className="btn small" onClick={() => copyMsg(h, i)}>
                        Copiar mensagem de {p.nome}
                      </button>
                    ))}
                    <button
                      className="btn small"
                      aria-expanded={openProj.has(id)}
                      onClick={() => toggle(openProj, id, setOpenProj)}
                    >
                      Ver compromissos deste mês em diante
                    </button>
                    {latest && h.id === latest.id && h.chargesBefore && (
                      <button className="btn small" onClick={() => undo(h)}>
                        Desfazer fechamento
                      </button>
                    )}
                    <button className="btn small danger" onClick={() => del(h)}>
                      Remover registro
                    </button>
                  </div>
                  {openProj.has(id) && renderProjecao && (
                    <div className="proj" style={{ marginTop: 12 }}>
                      {renderProjecao(
                        buildProjection(ctx, historyProjItems(ctx, h), h.comp, {
                          recurring: settings.projRecurring,
                        }),
                        'a partir deste mês',
                      )}
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </>
      ) : (
        <p className="empty">
          Nenhum mês fechado ainda. Ao terminar uma divisão, use “Fechar mês”.
        </p>
      )}
    </div>
  );
}

function PessoaLinha(p: {
  cor: string;
  nome: string;
  total: number;
  st: { cls: string; txt: string };
  rem: number;
  payments: { cents: number; date: string }[];
  formAberto: boolean;
  today: string;
  onToggle: () => void;
  onSave: (valor: string, data: string) => void;
  onDel: (j: number) => void;
}) {
  return (
    <>
      <tr>
        <td>
          <span className="who">
            <span className="dot" style={{ background: safeColor(p.cor) }} />
            {p.nome}
          </span>
        </td>
        <td className="num">{fmtC(p.total)}</td>
        <td>
          <span className={`tag ${p.st.cls}`}>{p.st.txt}</span>
        </td>
        <td className="act">
          {p.rem > 0 && (
            <button className="btn ghost small" onClick={p.onToggle}>
              Registrar pagamento
            </button>
          )}
        </td>
      </tr>
      {p.payments.length > 0 && (
        <tr className="payrow">
          <td colSpan={4}>
            <div className="paylist">
              {p.payments.map((x, j) => (
                <span className="tag" key={j}>
                  recebido {fmtC(x.cents)} em {brDate(x.date)}
                  <button
                    className="iconx"
                    aria-label="Apagar este pagamento"
                    onClick={() => p.onDel(j)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}
      {p.formAberto && (
        <tr>
          <td colSpan={4}>
            <PayForm rem={p.rem} today={p.today} onSave={p.onSave} onCancel={p.onToggle} />
          </td>
        </tr>
      )}
    </>
  );
}
